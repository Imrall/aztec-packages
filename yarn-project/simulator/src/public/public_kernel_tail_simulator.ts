import { ProvingRequestType, type PublicKernelTailRequest } from '@aztec/circuit-types';
import {
  type KernelCircuitPublicInputs,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  NESTED_RECURSIVE_PROOF_LENGTH,
  type PublicKernelCircuitPublicInputs,
  PublicKernelData,
  PublicKernelTailCircuitPrivateInputs,
  makeEmptyRecursiveProof,
  mergeAccumulatedData,
} from '@aztec/circuits.js';
import { ProtocolCircuitVks, getVKIndex, getVKSiblingPath } from '@aztec/noir-protocol-circuits-types';
import { type MerkleTreeOperations } from '@aztec/world-state';

import { HintsBuilder } from './hints_builder.js';
import { type PublicKernelCircuitSimulator } from './public_kernel_circuit_simulator.js';

export class PublicKernelTailSimulator {
  constructor(
    private db: MerkleTreeOperations,
    private publicKernelSimulator: PublicKernelCircuitSimulator,
    private hintsBuilder: HintsBuilder,
  ) {}

  static create(db: MerkleTreeOperations, publicKernelSimulator: PublicKernelCircuitSimulator) {
    const hintsBuilder = new HintsBuilder(db);
    return new PublicKernelTailSimulator(db, publicKernelSimulator, hintsBuilder);
  }

  async simulate(
    previousOutput: PublicKernelCircuitPublicInputs,
  ): Promise<{ output: KernelCircuitPublicInputs; provingRequest: PublicKernelTailRequest }> {
    const inputs = await this.buildPrivateInputs(previousOutput);

    const output = await this.publicKernelSimulator.publicKernelCircuitTail(inputs);

    const provingRequest: PublicKernelTailRequest = {
      type: ProvingRequestType.PUBLIC_KERNEL_TAIL,
      inputs,
    };

    return { output, provingRequest };
  }

  private async buildPrivateInputs(previousOutput: PublicKernelCircuitPublicInputs) {
    const previousKernel = this.getPreviousKernelData(previousOutput);

    const { validationRequests, endNonRevertibleData: nonRevertibleData, end: revertibleData } = previousOutput;

    const noteHashReadRequestHints = await this.hintsBuilder.getNoteHashReadRequestsHints(
      validationRequests.noteHashReadRequests,
    );

    const pendingNullifiers = mergeAccumulatedData(
      nonRevertibleData.nullifiers,
      revertibleData.nullifiers,
      MAX_NULLIFIERS_PER_TX,
    );

    const nullifierReadRequestHints = await this.hintsBuilder.getNullifierReadRequestHints(
      validationRequests.nullifierReadRequests,
      pendingNullifiers,
    );

    const nullifierNonExistentReadRequestHints = await this.hintsBuilder.getNullifierNonExistentReadRequestHints(
      validationRequests.nullifierNonExistentReadRequests,
      pendingNullifiers,
    );

    const l1ToL2MsgReadRequestHints = await this.hintsBuilder.getL1ToL2MsgReadRequestsHints(
      validationRequests.l1ToL2MsgReadRequests,
    );

    const pendingPublicDataWrites = mergeAccumulatedData(
      nonRevertibleData.publicDataUpdateRequests,
      revertibleData.publicDataUpdateRequests,
      MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    );

    const publicDataHints = await this.hintsBuilder.getPublicDataHints(
      validationRequests.publicDataReads,
      pendingPublicDataWrites,
    );

    const currentState = await this.db.getStateReference();

    return new PublicKernelTailCircuitPrivateInputs(
      previousKernel,
      noteHashReadRequestHints,
      nullifierReadRequestHints,
      nullifierNonExistentReadRequestHints,
      l1ToL2MsgReadRequestHints,
      publicDataHints,
      currentState.partial,
    );
  }

  private getPreviousKernelData(previousOutput: PublicKernelCircuitPublicInputs): PublicKernelData {
    const proof = makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH);
    const vk = ProtocolCircuitVks.PublicKernelMergeArtifact;
    const vkIndex = getVKIndex(vk);
    const siblingPath = getVKSiblingPath(vkIndex);
    return new PublicKernelData(previousOutput, proof, vk, vkIndex, siblingPath);
  }
}
