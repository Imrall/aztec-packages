import {
  type FromLogType,
  type GetUnencryptedLogsResponse,
  type InboxLeaf,
  type L2Block,
  type L2BlockL2Logs,
  type LogFilter,
  type LogType,
  type TxEffect,
  type TxHash,
  type TxReceipt,
} from '@aztec/circuit-types';
import { type Fr, type Header } from '@aztec/circuits.js';
import { type ContractArtifact } from '@aztec/foundation/abi';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { createDebugLogger } from '@aztec/foundation/log';
import { type AztecKVStore } from '@aztec/kv-store';
import {
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  type ExecutablePrivateFunctionWithMembershipProof,
  type UnconstrainedFunctionWithMembershipProof,
} from '@aztec/types/contracts';

import { type ArchiverDataStore, type ArchiverL1SynchPoint } from '../archiver_store.js';
import { type DataRetrieval } from '../structs/data_retrieval.js';
import { type L1Published } from '../structs/published.js';
import { BlockStore } from './block_store.js';
import { ContractArtifactsStore } from './contract_artifacts_store.js';
import { ContractClassStore } from './contract_class_store.js';
import { ContractInstanceStore } from './contract_instance_store.js';
import { LogStore } from './log_store.js';
import { MessageStore } from './message_store.js';

/**
 * LMDB implementation of the ArchiverDataStore interface.
 */
export class KVArchiverDataStore implements ArchiverDataStore {
  #blockStore: BlockStore;
  #logStore: LogStore;
  #messageStore: MessageStore;
  #contractClassStore: ContractClassStore;
  #contractInstanceStore: ContractInstanceStore;
  #contractArtifactStore: ContractArtifactsStore;

  #log = createDebugLogger('aztec:archiver:data-store');

  constructor(db: AztecKVStore, logsMaxPageSize: number = 1000) {
    this.#blockStore = new BlockStore(db);
    this.#logStore = new LogStore(db, this.#blockStore, logsMaxPageSize);
    this.#messageStore = new MessageStore(db);
    this.#contractClassStore = new ContractClassStore(db);
    this.#contractInstanceStore = new ContractInstanceStore(db);
    this.#contractArtifactStore = new ContractArtifactsStore(db);
  }

  getContractArtifact(address: AztecAddress): Promise<ContractArtifact | undefined> {
    return Promise.resolve(this.#contractArtifactStore.getContractArtifact(address));
  }

  addContractArtifact(address: AztecAddress, contract: ContractArtifact): Promise<void> {
    return this.#contractArtifactStore.addContractArtifact(address, contract);
  }

  getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return Promise.resolve(this.#contractClassStore.getContractClass(id));
  }

  getContractClassIds(): Promise<Fr[]> {
    return Promise.resolve(this.#contractClassStore.getContractClassIds());
  }

  getContractInstance(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    return Promise.resolve(this.#contractInstanceStore.getContractInstance(address));
  }

  async addContractClasses(data: ContractClassPublic[], blockNumber: number): Promise<boolean> {
    return (await Promise.all(data.map(c => this.#contractClassStore.addContractClass(c, blockNumber)))).every(Boolean);
  }

  async deleteContractClasses(data: ContractClassPublic[], blockNumber: number): Promise<boolean> {
    return (await Promise.all(data.map(c => this.#contractClassStore.deleteContractClasses(c, blockNumber)))).every(
      Boolean,
    );
  }

  addFunctions(
    contractClassId: Fr,
    privateFunctions: ExecutablePrivateFunctionWithMembershipProof[],
    unconstrainedFunctions: UnconstrainedFunctionWithMembershipProof[],
  ): Promise<boolean> {
    return this.#contractClassStore.addFunctions(contractClassId, privateFunctions, unconstrainedFunctions);
  }

  async addContractInstances(data: ContractInstanceWithAddress[], _blockNumber: number): Promise<boolean> {
    return (await Promise.all(data.map(c => this.#contractInstanceStore.addContractInstance(c)))).every(Boolean);
  }

  async deleteContractInstances(data: ContractInstanceWithAddress[], _blockNumber: number): Promise<boolean> {
    return (await Promise.all(data.map(c => this.#contractInstanceStore.deleteContractInstance(c)))).every(Boolean);
  }

  /**
   * Append new blocks to the store's list.
   * @param blocks - The L2 blocks to be added to the store and the last processed L1 block.
   * @returns True if the operation is successful.
   */
  addBlocks(blocks: L1Published<L2Block>[]): Promise<boolean> {
    return this.#blockStore.addBlocks(blocks);
  }

  /**
   * Unwinds blocks from the database
   * @param from -  The tip of the chain, passed for verification purposes,
   *                ensuring that we don't end up deleting something we did not intend
   * @param blocksToUnwind - The number of blocks we are to unwind
   * @returns True if the operation is successful
   */
  unwindBlocks(from: number, blocksToUnwind: number): Promise<boolean> {
    return this.#blockStore.unwindBlocks(from, blocksToUnwind);
  }

  /**
   * Gets up to `limit` amount of L2 blocks starting from `from`.
   *
   * @param start - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 blocks
   */
  getBlocks(start: number, limit: number): Promise<L1Published<L2Block>[]> {
    try {
      return Promise.resolve(Array.from(this.#blockStore.getBlocks(start, limit)));
    } catch (err) {
      // this function is sync so if any errors are thrown we need to make sure they're passed on as rejected Promises
      return Promise.reject(err);
    }
  }

  /**
   * Gets up to `limit` amount of L2 blocks headers starting from `from`.
   *
   * @param start - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 blocks
   */
  getBlockHeaders(start: number, limit: number): Promise<Header[]> {
    try {
      return Promise.resolve(Array.from(this.#blockStore.getBlockHeaders(start, limit)));
    } catch (err) {
      // this function is sync so if any errors are thrown we need to make sure they're passed on as rejected Promises
      return Promise.reject(err);
    }
  }

  /**
   * Gets a tx effect.
   * @param txHash - The txHash of the tx corresponding to the tx effect.
   * @returns The requested tx effect (or undefined if not found).
   */
  getTxEffect(txHash: TxHash): Promise<TxEffect | undefined> {
    return Promise.resolve(this.#blockStore.getTxEffect(txHash));
  }

  /**
   * Gets a receipt of a settled tx.
   * @param txHash - The hash of a tx we try to get the receipt for.
   * @returns The requested tx receipt (or undefined if not found).
   */
  getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined> {
    return Promise.resolve(this.#blockStore.getSettledTxReceipt(txHash));
  }

  /**
   * Append new logs to the store's list.
   * @param blocks - The blocks for which to add the logs.
   * @returns True if the operation is successful.
   */
  addLogs(blocks: L2Block[]): Promise<boolean> {
    return this.#logStore.addLogs(blocks);
  }

  deleteLogs(blocks: L2Block[]): Promise<boolean> {
    return this.#logStore.deleteLogs(blocks);
  }

  getTotalL1ToL2MessageCount(): Promise<bigint> {
    return Promise.resolve(this.#messageStore.getTotalL1ToL2MessageCount());
  }

  /**
   * Append L1 to L2 messages to the store.
   * @param messages - The L1 to L2 messages to be added to the store and the last processed L1 block.
   * @returns True if the operation is successful.
   */
  addL1ToL2Messages(messages: DataRetrieval<InboxLeaf>): Promise<boolean> {
    return Promise.resolve(this.#messageStore.addL1ToL2Messages(messages));
  }

  /**
   * Gets the first L1 to L2 message index in the L1 to L2 message tree which is greater than or equal to `startIndex`.
   * @param l1ToL2Message - The L1 to L2 message.
   * @param startIndex - The index to start searching from.
   * @returns The index of the L1 to L2 message in the L1 to L2 message tree (undefined if not found).
   */
  getL1ToL2MessageIndex(l1ToL2Message: Fr, startIndex: bigint): Promise<bigint | undefined> {
    return Promise.resolve(this.#messageStore.getL1ToL2MessageIndex(l1ToL2Message, startIndex));
  }

  /**
   * Gets L1 to L2 message (to be) included in a given block.
   * @param blockNumber - L2 block number to get messages for.
   * @returns The L1 to L2 messages/leaves of the messages subtree (throws if not found).
   */
  getL1ToL2Messages(blockNumber: bigint): Promise<Fr[]> {
    try {
      return Promise.resolve(this.#messageStore.getL1ToL2Messages(blockNumber));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * Gets up to `limit` amount of logs starting from `from`.
   * @param start - Number of the L2 block to which corresponds the first logs to be returned.
   * @param limit - The number of logs to return.
   * @param logType - Specifies whether to return encrypted or unencrypted logs.
   * @returns The requested logs.
   */
  getLogs<TLogType extends LogType>(
    start: number,
    limit: number,
    logType: TLogType,
  ): Promise<L2BlockL2Logs<FromLogType<TLogType>>[]> {
    try {
      return Promise.resolve(Array.from(this.#logStore.getLogs(start, limit, logType)));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * Gets unencrypted logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getUnencryptedLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
    try {
      return Promise.resolve(this.#logStore.getUnencryptedLogs(filter));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * Gets the number of the latest L2 block processed.
   * @returns The number of the latest L2 block processed.
   */
  getSynchedL2BlockNumber(): Promise<number> {
    return Promise.resolve(this.#blockStore.getSynchedL2BlockNumber());
  }

  getProvenL2BlockNumber(): Promise<number> {
    return Promise.resolve(this.#blockStore.getProvenL2BlockNumber());
  }

  getProvenL2EpochNumber(): Promise<number | undefined> {
    return Promise.resolve(this.#blockStore.getProvenL2EpochNumber());
  }

  setProvenL2BlockNumber(blockNumber: number) {
    this.#blockStore.setProvenL2BlockNumber(blockNumber);
    return Promise.resolve();
  }

  setProvenL2EpochNumber(epochNumber: number) {
    this.#blockStore.setProvenL2EpochNumber(epochNumber);
    return Promise.resolve();
  }

  setBlockSynchedL1BlockNumber(l1BlockNumber: bigint) {
    this.#blockStore.setSynchedL1BlockNumber(l1BlockNumber);
    return Promise.resolve();
  }

  setMessageSynchedL1BlockNumber(l1BlockNumber: bigint) {
    this.#messageStore.setSynchedL1BlockNumber(l1BlockNumber);
    return Promise.resolve();
  }

  /**
   * Gets the last L1 block number processed by the archiver
   */
  getSynchPoint(): Promise<ArchiverL1SynchPoint> {
    return Promise.resolve({
      blocksSynchedTo: this.#blockStore.getSynchedL1BlockNumber(),
      messagesSynchedTo: this.#messageStore.getSynchedL1BlockNumber(),
    });
  }
}
