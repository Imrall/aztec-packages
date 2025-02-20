import { type InboxLeaf } from '@aztec/circuit-types';
import {
  Fr,
  INITIAL_L2_BLOCK_NUM,
  L1_TO_L2_MSG_SUBTREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
} from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { type AztecKVStore, type AztecMap, type AztecSingleton } from '@aztec/kv-store';

import { type DataRetrieval } from '../structs/data_retrieval.js';

/**
 * LMDB implementation of the ArchiverDataStore interface.
 */
export class MessageStore {
  #l1ToL2Messages: AztecMap<string, Buffer>;
  #l1ToL2MessageIndices: AztecMap<string, bigint[]>; // We store array of bigints here because there can be duplicate messages
  #lastSynchedL1Block: AztecSingleton<bigint>;
  #totalMessageCount: AztecSingleton<bigint>;

  #log = createDebugLogger('aztec:archiver:message_store');

  #l1ToL2MessagesSubtreeSize = 2 ** L1_TO_L2_MSG_SUBTREE_HEIGHT;

  constructor(private db: AztecKVStore) {
    this.#l1ToL2Messages = db.openMap('archiver_l1_to_l2_messages');
    this.#l1ToL2MessageIndices = db.openMap('archiver_l1_to_l2_message_indices');
    this.#lastSynchedL1Block = db.openSingleton('archiver_last_l1_block_new_messages');
    this.#totalMessageCount = db.openSingleton('archiver_l1_to_l2_message_count');
  }

  getTotalL1ToL2MessageCount(): bigint {
    return this.#totalMessageCount.get() ?? 0n;
  }

  /**
   * Gets the last L1 block number that emitted new messages.
   * @returns The last L1 block number processed
   */
  getSynchedL1BlockNumber(): bigint | undefined {
    return this.#lastSynchedL1Block.get();
  }

  setSynchedL1BlockNumber(l1BlockNumber: bigint) {
    void this.#lastSynchedL1Block.set(l1BlockNumber);
  }

  /**
   * Append L1 to L2 messages to the store.
   * @param messages - The L1 to L2 messages to be added to the store and the last processed L1 block.
   * @returns True if the operation is successful.
   */
  addL1ToL2Messages(messages: DataRetrieval<InboxLeaf>): Promise<boolean> {
    return this.db.transaction(() => {
      const lastL1BlockNumber = this.#lastSynchedL1Block.get() ?? 0n;
      if (lastL1BlockNumber >= messages.lastProcessedL1BlockNumber) {
        return false;
      }

      void this.#lastSynchedL1Block.set(messages.lastProcessedL1BlockNumber);

      for (const message of messages.retrievedData) {
        if (message.index >= this.#l1ToL2MessagesSubtreeSize) {
          throw new Error(`Message index ${message.index} out of subtree range`);
        }
        const key = `${message.blockNumber}-${message.index}`;
        void this.#l1ToL2Messages.setIfNotExists(key, message.leaf.toBuffer());

        const indexInTheWholeTree =
          (message.blockNumber - BigInt(INITIAL_L2_BLOCK_NUM)) * BigInt(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP) +
          message.index;

        const indices = this.#l1ToL2MessageIndices.get(message.leaf.toString()) ?? [];
        indices.push(indexInTheWholeTree);
        void this.#l1ToL2MessageIndices.set(message.leaf.toString(), indices);
      }

      const lastTotalMessageCount = this.getTotalL1ToL2MessageCount();
      void this.#totalMessageCount.set(lastTotalMessageCount + BigInt(messages.retrievedData.length));

      return true;
    });
  }

  /**
   * Gets the first L1 to L2 message index in the L1 to L2 message tree which is greater than or equal to `startIndex`.
   * @param l1ToL2Message - The L1 to L2 message.
   * @param startIndex - The index to start searching from.
   * @returns The index of the L1 to L2 message in the L1 to L2 message tree (undefined if not found).
   */
  getL1ToL2MessageIndex(l1ToL2Message: Fr, startIndex: bigint): Promise<bigint | undefined> {
    const indices = this.#l1ToL2MessageIndices.get(l1ToL2Message.toString()) ?? [];
    const index = indices.find(i => i >= startIndex);
    return Promise.resolve(index);
  }

  getL1ToL2Messages(blockNumber: bigint): Fr[] {
    const messages: Fr[] = [];
    let undefinedMessageFound = false;
    for (let messageIndex = 0; messageIndex < this.#l1ToL2MessagesSubtreeSize; messageIndex++) {
      // This is inefficient but probably fine for now.
      const key = `${blockNumber}-${messageIndex}`;
      const message = this.#l1ToL2Messages.get(key);
      if (message) {
        if (undefinedMessageFound) {
          throw new Error(`L1 to L2 message gap found in block ${blockNumber}`);
        }
        messages.push(Fr.fromBuffer(message));
      } else {
        undefinedMessageFound = true;
        // We continue iterating over messages here to verify that there are no more messages after the undefined one.
        // --> If this was the case this would imply there is some issue with log fetching.
      }
    }
    return messages;
  }
}
