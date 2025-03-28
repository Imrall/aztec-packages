import { type ServerCircuitProver } from '@aztec/circuit-types';
import {
  Fr,
  type GlobalVariables,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  RECURSIVE_PROOF_LENGTH,
  type RootParityInput,
} from '@aztec/circuits.js';
import { makeRootParityInput } from '@aztec/circuits.js/testing';
import { createDebugLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { type MerkleTreeOperations } from '@aztec/world-state';

import { type MockProxy, mock } from 'jest-mock-extended';

import { makeBloatedProcessedTx } from '../mocks/fixtures.js';
import { TestContext } from '../mocks/test_context.js';
import { type ProvingOrchestrator } from './orchestrator.js';

const logger = createDebugLogger('aztec:orchestrator-workflow');

describe('prover/orchestrator', () => {
  describe('workflow', () => {
    let orchestrator: ProvingOrchestrator;
    let actualDb: MerkleTreeOperations;
    let globalVariables: GlobalVariables;
    let context: TestContext;

    describe('with mock prover', () => {
      let mockProver: MockProxy<ServerCircuitProver>;

      beforeEach(async () => {
        mockProver = mock<ServerCircuitProver>();
        context = await TestContext.new(logger, 'legacy', 4, () => Promise.resolve(mockProver));
        ({ actualDb, orchestrator, globalVariables } = context);
      });

      it('calls root parity circuit only when ready', async () => {
        // create a custom L2 to L1 message
        const message = Fr.random();

        // and delay its proof
        const pendingBaseParityResult = promiseWithResolvers<RootParityInput<typeof RECURSIVE_PROOF_LENGTH>>();
        const expectedBaseParityResult = makeRootParityInput(RECURSIVE_PROOF_LENGTH, 0xff);

        mockProver.getRootParityProof.mockResolvedValue(makeRootParityInput(NESTED_RECURSIVE_PROOF_LENGTH));

        mockProver.getBaseParityProof.mockImplementation(inputs => {
          if (inputs.msgs[0].equals(message)) {
            return pendingBaseParityResult.promise;
          } else {
            return Promise.resolve(makeRootParityInput(RECURSIVE_PROOF_LENGTH));
          }
        });

        orchestrator.startNewEpoch(1, 1);
        await orchestrator.startNewBlock(2, globalVariables, [message]);

        await sleep(10);
        expect(mockProver.getBaseParityProof).toHaveBeenCalledTimes(NUM_BASE_PARITY_PER_ROOT_PARITY);
        expect(mockProver.getRootParityProof).not.toHaveBeenCalled();

        await sleep(10);
        // even now the root parity should not have been called
        expect(mockProver.getRootParityProof).not.toHaveBeenCalled();

        // only after the base parity proof is resolved, the root parity should be called
        pendingBaseParityResult.resolve(expectedBaseParityResult);

        // give the orchestrator a chance to calls its callbacks
        await sleep(10);
        expect(mockProver.getRootParityProof).toHaveBeenCalledTimes(1);

        orchestrator.cancel();
      });
    });

    describe('with simulated prover', () => {
      beforeEach(async () => {
        context = await TestContext.new(logger);
        ({ actualDb, orchestrator, globalVariables } = context);
      });

      it('waits for block to be completed before enqueueing block root proof', async () => {
        orchestrator.startNewEpoch(1, 1);
        await orchestrator.startNewBlock(2, globalVariables, []);
        await orchestrator.addNewTx(makeBloatedProcessedTx(actualDb, 1));
        await orchestrator.addNewTx(makeBloatedProcessedTx(actualDb, 2));

        // wait for the block root proof to try to be enqueued
        await sleep(1000);

        // now finish the block
        await orchestrator.setBlockCompleted();

        const result = await orchestrator.finaliseEpoch();
        expect(result.proof).toBeDefined();
      });
    });
  });
});
