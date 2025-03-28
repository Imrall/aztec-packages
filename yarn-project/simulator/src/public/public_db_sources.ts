import { MerkleTreeId, NullifierMembershipWitness, type Tx } from '@aztec/circuit-types';
import { type PublicDBAccessStats } from '@aztec/circuit-types/stats';
import {
  type AztecAddress,
  ContractClassRegisteredEvent,
  ContractInstanceDeployedEvent,
  Fr,
  FunctionSelector,
  type L1_TO_L2_MSG_TREE_HEIGHT,
  type NULLIFIER_TREE_HEIGHT,
  type NullifierLeafPreimage,
  type PublicDataTreeLeafPreimage,
} from '@aztec/circuits.js';
import { computeL1ToL2MessageNullifier, computePublicDataTreeLeafSlot } from '@aztec/circuits.js/hash';
import { createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { ClassRegistererAddress } from '@aztec/protocol-contracts/class-registerer';
import {
  type CommitmentsDB,
  MessageLoadOracleInputs,
  type PublicContractsDB,
  type PublicStateDB,
} from '@aztec/simulator';
import {
  type ContractClassPublic,
  type ContractDataSource,
  type ContractInstanceWithAddress,
} from '@aztec/types/contracts';
import { type MerkleTreeOperations } from '@aztec/world-state';

/**
 * Implements the PublicContractsDB using a ContractDataSource.
 * Progressively records contracts in transaction as they are processed in a block.
 */
export class ContractsDataSourcePublicDB implements PublicContractsDB {
  private instanceCache = new Map<string, ContractInstanceWithAddress>();
  private classCache = new Map<string, ContractClassPublic>();

  private log = createDebugLogger('aztec:sequencer:contracts-data-source');

  constructor(private dataSource: ContractDataSource) {}

  /**
   * Add new contracts from a transaction
   * @param tx - The transaction to add contracts from.
   */
  public addNewContracts(tx: Tx): Promise<void> {
    // Extract contract class and instance data from logs and add to cache for this block
    const logs = tx.unencryptedLogs.unrollLogs();
    ContractClassRegisteredEvent.fromLogs(logs, ClassRegistererAddress).forEach(e => {
      this.log.debug(`Adding class ${e.contractClassId.toString()} to public execution contract cache`);
      this.classCache.set(e.contractClassId.toString(), e.toContractClassPublic());
    });
    ContractInstanceDeployedEvent.fromLogs(logs).forEach(e => {
      this.log.debug(
        `Adding instance ${e.address.toString()} with class ${e.contractClassId.toString()} to public execution contract cache`,
      );
      this.instanceCache.set(e.address.toString(), e.toContractInstance());
    });

    return Promise.resolve();
  }

  /**
   * Removes new contracts added from transactions
   * @param tx - The tx's contracts to be removed
   */
  public removeNewContracts(tx: Tx): Promise<void> {
    // TODO(@spalladino): Can this inadvertently delete a valid contract added by another tx?
    // Let's say we have two txs adding the same contract on the same block. If the 2nd one reverts,
    // wouldn't that accidentally remove the contract added on the first one?
    const logs = tx.unencryptedLogs.unrollLogs();
    ContractClassRegisteredEvent.fromLogs(logs, ClassRegistererAddress).forEach(e =>
      this.classCache.delete(e.contractClassId.toString()),
    );
    ContractInstanceDeployedEvent.fromLogs(logs).forEach(e => this.instanceCache.delete(e.address.toString()));
    return Promise.resolve();
  }

  public async getContractInstance(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    return this.instanceCache.get(address.toString()) ?? (await this.dataSource.getContract(address));
  }

  public async getContractClass(contractClassId: Fr): Promise<ContractClassPublic | undefined> {
    return this.classCache.get(contractClassId.toString()) ?? (await this.dataSource.getContractClass(contractClassId));
  }

  async getBytecode(address: AztecAddress, selector: FunctionSelector): Promise<Buffer | undefined> {
    const instance = await this.getContractInstance(address);
    if (!instance) {
      throw new Error(`Contract ${address.toString()} not found`);
    }
    const contractClass = await this.getContractClass(instance.contractClassId);
    if (!contractClass) {
      throw new Error(`Contract class ${instance.contractClassId.toString()} for ${address.toString()} not found`);
    }
    return contractClass.publicFunctions.find(f => f.selector.equals(selector))?.bytecode;
  }

  public async getDebugFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    const artifact = await this.dataSource.getContractArtifact(address);
    if (!artifact) {
      return Promise.resolve(undefined);
    }

    const f = artifact.functions.find(f =>
      FunctionSelector.fromNameAndParameters(f.name, f.parameters).equals(selector),
    );
    if (!f) {
      return Promise.resolve(undefined);
    }

    return Promise.resolve(`${artifact.name}:${f.name}`);
  }
}

/**
 * A public state DB that reads and writes to the world state.
 */
export class WorldStateDB extends ContractsDataSourcePublicDB implements PublicStateDB, CommitmentsDB {
  private logger = createDebugLogger('aztec:sequencer:world-state-db');

  private publicCommittedWriteCache: Map<bigint, Fr> = new Map();
  private publicCheckpointedWriteCache: Map<bigint, Fr> = new Map();
  private publicUncommittedWriteCache: Map<bigint, Fr> = new Map();

  constructor(private db: MerkleTreeOperations, dataSource: ContractDataSource) {
    super(dataSource);
  }

  /**
   * Reads a value from public storage, returning zero if none.
   * @param contract - Owner of the storage.
   * @param slot - Slot to read in the contract storage.
   * @returns The current value in the storage slot.
   */
  public async storageRead(contract: AztecAddress, slot: Fr): Promise<Fr> {
    const leafSlot = computePublicDataTreeLeafSlot(contract, slot).value;
    const uncommitted = this.publicUncommittedWriteCache.get(leafSlot);
    if (uncommitted !== undefined) {
      return uncommitted;
    }
    const checkpointed = this.publicCheckpointedWriteCache.get(leafSlot);
    if (checkpointed !== undefined) {
      return checkpointed;
    }
    const committed = this.publicCommittedWriteCache.get(leafSlot);
    if (committed !== undefined) {
      return committed;
    }

    const lowLeafResult = await this.db.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot);
    if (!lowLeafResult || !lowLeafResult.alreadyPresent) {
      return Fr.ZERO;
    }

    const preimage = (await this.db.getLeafPreimage(
      MerkleTreeId.PUBLIC_DATA_TREE,
      lowLeafResult.index,
    )) as PublicDataTreeLeafPreimage;

    return preimage.value;
  }

  /**
   * Records a write to public storage.
   * @param contract - Owner of the storage.
   * @param slot - Slot to read in the contract storage.
   * @param newValue - The new value to store.
   * @returns The slot of the written leaf in the public data tree.
   */
  public storageWrite(contract: AztecAddress, slot: Fr, newValue: Fr): Promise<bigint> {
    const index = computePublicDataTreeLeafSlot(contract, slot).value;
    this.publicUncommittedWriteCache.set(index, newValue);
    return Promise.resolve(index);
  }

  public async getNullifierMembershipWitnessAtLatestBlock(
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    const timer = new Timer();
    const index = await this.db.findLeafIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBuffer());
    if (!index) {
      return undefined;
    }

    const leafPreimagePromise = this.db.getLeafPreimage(MerkleTreeId.NULLIFIER_TREE, index);
    const siblingPathPromise = this.db.getSiblingPath<typeof NULLIFIER_TREE_HEIGHT>(
      MerkleTreeId.NULLIFIER_TREE,
      BigInt(index),
    );

    const [leafPreimage, siblingPath] = await Promise.all([leafPreimagePromise, siblingPathPromise]);

    if (!leafPreimage) {
      return undefined;
    }

    this.logger.debug(`[DB] Fetched nullifier membership`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-nullifier-membership-witness-at-latest-block',
    } satisfies PublicDBAccessStats);

    return new NullifierMembershipWitness(BigInt(index), leafPreimage as NullifierLeafPreimage, siblingPath);
  }

  public async getL1ToL2MembershipWitness(
    contractAddress: AztecAddress,
    messageHash: Fr,
    secret: Fr,
  ): Promise<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>> {
    let nullifierIndex: bigint | undefined;
    let messageIndex: bigint | undefined;
    let startIndex = 0n;

    // We iterate over messages until we find one whose nullifier is not in the nullifier tree --> we need to check
    // for nullifiers because messages can have duplicates.
    const timer = new Timer();
    do {
      messageIndex = (await this.db.findLeafIndexAfter(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, messageHash, startIndex))!;
      if (messageIndex === undefined) {
        throw new Error(`No non-nullified L1 to L2 message found for message hash ${messageHash.toString()}`);
      }

      const messageNullifier = computeL1ToL2MessageNullifier(contractAddress, messageHash, secret, messageIndex);
      nullifierIndex = await this.getNullifierIndex(messageNullifier);

      startIndex = messageIndex + 1n;
    } while (nullifierIndex !== undefined);

    const siblingPath = await this.db.getSiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>(
      MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
      messageIndex,
    );

    this.logger.debug(`[DB] Fetched L1 to L2 message membership`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-l1-to-l2-message-membership-witness',
    } satisfies PublicDBAccessStats);

    return new MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>(messageIndex, siblingPath);
  }

  public async getL1ToL2LeafValue(leafIndex: bigint): Promise<Fr | undefined> {
    const timer = new Timer();
    const leafValue = await this.db.getLeafValue(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, leafIndex);
    this.logger.debug(`[DB] Fetched L1 to L2 message leaf value`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-l1-to-l2-message-leaf-value',
    } satisfies PublicDBAccessStats);
    return leafValue;
  }

  public async getCommitmentIndex(commitment: Fr): Promise<bigint | undefined> {
    const timer = new Timer();
    const index = await this.db.findLeafIndex(MerkleTreeId.NOTE_HASH_TREE, commitment);
    this.logger.debug(`[DB] Fetched commitment index`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-commitment-index',
    } satisfies PublicDBAccessStats);
    return index;
  }

  public async getCommitmentValue(leafIndex: bigint): Promise<Fr | undefined> {
    const timer = new Timer();
    const leafValue = await this.db.getLeafValue(MerkleTreeId.NOTE_HASH_TREE, leafIndex);
    this.logger.debug(`[DB] Fetched commitment leaf value`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-commitment-leaf-value',
    } satisfies PublicDBAccessStats);
    return leafValue;
  }

  public async getNullifierIndex(nullifier: Fr): Promise<bigint | undefined> {
    const timer = new Timer();
    const index = await this.db.findLeafIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBuffer());
    this.logger.debug(`[DB] Fetched nullifier index`, {
      eventName: 'public-db-access',
      duration: timer.ms(),
      operation: 'get-nullifier-index',
    } satisfies PublicDBAccessStats);
    return index;
  }

  /**
   * Commit the pending public changes to the DB.
   * @returns Nothing.
   */
  commit(): Promise<void> {
    for (const [k, v] of this.publicCheckpointedWriteCache) {
      this.publicCommittedWriteCache.set(k, v);
    }
    // uncommitted writes take precedence over checkpointed writes
    // since they are the most recent
    for (const [k, v] of this.publicUncommittedWriteCache) {
      this.publicCommittedWriteCache.set(k, v);
    }
    return this.rollbackToCommit();
  }

  /**
   * Rollback the pending public changes.
   * @returns Nothing.
   */
  async rollbackToCommit(): Promise<void> {
    await this.rollbackToCheckpoint();
    this.publicCheckpointedWriteCache = new Map<bigint, Fr>();
    return Promise.resolve();
  }

  checkpoint(): Promise<void> {
    for (const [k, v] of this.publicUncommittedWriteCache) {
      this.publicCheckpointedWriteCache.set(k, v);
    }
    return this.rollbackToCheckpoint();
  }

  rollbackToCheckpoint(): Promise<void> {
    this.publicUncommittedWriteCache = new Map<bigint, Fr>();
    return Promise.resolve();
  }
}
