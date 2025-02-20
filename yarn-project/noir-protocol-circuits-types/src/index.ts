import {
  type BaseOrMergeRollupPublicInputs,
  type BaseParityInputs,
  type BaseRollupInputs,
  type BlockMergeRollupInputs,
  type BlockRootOrBlockMergePublicInputs,
  type BlockRootRollupInputs,
  type EmptyBlockRootRollupInputs,
  Fr,
  type KernelCircuitPublicInputs,
  type MergeRollupInputs,
  type ParityPublicInputs,
  type PrivateKernelCircuitPublicInputs,
  type PrivateKernelEmptyInputs,
  type PrivateKernelInitCircuitPrivateInputs,
  type PrivateKernelInnerCircuitPrivateInputs,
  type PrivateKernelResetCircuitPrivateInputsVariants,
  type PrivateKernelResetDimensions,
  type PrivateKernelTailCircuitPrivateInputs,
  type PrivateKernelTailCircuitPublicInputs,
  type PublicKernelCircuitPrivateInputs,
  type PublicKernelCircuitPublicInputs,
  type PublicKernelInnerCircuitPrivateInputs,
  type PublicKernelTailCircuitPrivateInputs,
  type RootParityInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
  type VMCircuitPublicInputs,
} from '@aztec/circuits.js';
import { applyStringFormatting, createDebugLogger } from '@aztec/foundation/log';

import { type ForeignCallInput, type ForeignCallOutput } from '@noir-lang/acvm_js';
import { type CompiledCircuit, type InputMap, Noir } from '@noir-lang/noir_js';
import { type Abi, abiDecode, abiEncode } from '@noir-lang/noirc_abi';
import { type WitnessMap } from '@noir-lang/types';
import { strict as assert } from 'assert';

import {
  ClientCircuitArtifacts,
  ServerCircuitArtifacts,
  SimulatedClientCircuitArtifacts,
  SimulatedServerCircuitArtifacts,
} from './artifacts.js';
import { type PrivateResetArtifact } from './private_kernel_reset_data.js';
import {
  mapBaseOrMergeRollupPublicInputsFromNoir,
  mapBaseParityInputsToNoir,
  mapBaseRollupInputsToNoir,
  mapBlockMergeRollupInputsToNoir,
  mapBlockRootOrBlockMergePublicInputsFromNoir,
  mapBlockRootRollupInputsToNoir,
  mapEmptyBlockRootRollupInputsToNoir,
  mapEmptyKernelInputsToNoir,
  mapKernelCircuitPublicInputsFromNoir,
  mapMergeRollupInputsToNoir,
  mapParityPublicInputsFromNoir,
  mapPrivateKernelCircuitPublicInputsFromNoir,
  mapPrivateKernelInitCircuitPrivateInputsToNoir,
  mapPrivateKernelInnerCircuitPrivateInputsToNoir,
  mapPrivateKernelResetCircuitPrivateInputsToNoir,
  mapPrivateKernelTailCircuitPrivateInputsToNoir,
  mapPrivateKernelTailCircuitPublicInputsForPublicFromNoir,
  mapPrivateKernelTailCircuitPublicInputsForRollupFromNoir,
  mapPrivateKernelTailToPublicCircuitPrivateInputsToNoir,
  mapPublicKernelCircuitPrivateInputsToNoir,
  mapPublicKernelCircuitPublicInputsFromNoir,
  mapPublicKernelInnerCircuitPrivateInputsToNoir,
  mapPublicKernelTailCircuitPrivateInputsToNoir,
  mapRootParityInputsToNoir,
  mapRootRollupInputsToNoir,
  mapRootRollupPublicInputsFromNoir,
  mapVMCircuitPublicInputsFromNoir,
} from './type_conversion.js';
import {
  type ParityBaseReturnType as BaseParityReturnType,
  type RollupBaseReturnType as BaseRollupReturnType,
  type RollupBlockMergeReturnType as BlockMergeRollupReturnType,
  type RollupBlockRootReturnType as BlockRootRollupReturnType,
  type PrivateKernelInitReturnType as InitReturnType,
  type PrivateKernelInnerReturnType as InnerReturnType,
  type RollupMergeReturnType as MergeRollupReturnType,
  type PrivateKernelEmptyReturnType,
  type PublicKernelInnerReturnType,
  type PublicKernelMergeReturnType,
  type PrivateKernelResetReturnType as ResetReturnType,
  type RollupBlockRootEmptyReturnType,
  type ParityRootReturnType as RootParityReturnType,
  type RollupRootReturnType as RootRollupReturnType,
  type PrivateKernelTailReturnType as TailReturnType,
  PrivateKernelInit as executePrivateKernelInitWithACVM,
  PrivateKernelInner as executePrivateKernelInnerWithACVM,
  PrivateKernelTailToPublic as executePrivateKernelTailToPublicWithACVM,
  PrivateKernelTail as executePrivateKernelTailWithACVM,
} from './types/index.js';
import { getPrivateKernelResetArtifactName } from './utils/private_kernel_reset.js';

export * from './artifacts.js';
export { maxPrivateKernelResetDimensions, privateKernelResetDimensionsConfig } from './private_kernel_reset_data.js';
export * from './utils/private_kernel_reset.js';
export * from './vks.js';

// TODO(Tom): This should be exported from noirc_abi
/**
 * The decoded inputs from the circuit.
 */
export type DecodedInputs = {
  /**
   * The inputs to the circuit
   */
  inputs: Record<string, any>;
  /**
   * The return value of the circuit
   */
  return_value: any;
};

/**
 * Executes the init private kernel.
 * @param privateKernelInitCircuitPrivateInputs - The private inputs to the initial private kernel.
 * @returns The public inputs.
 */
export async function executeInit(
  privateKernelInitCircuitPrivateInputs: PrivateKernelInitCircuitPrivateInputs,
): Promise<PrivateKernelCircuitPublicInputs> {
  const returnType = await executePrivateKernelInitWithACVM(
    mapPrivateKernelInitCircuitPrivateInputsToNoir(privateKernelInitCircuitPrivateInputs),
    SimulatedClientCircuitArtifacts.PrivateKernelInitArtifact as CompiledCircuit,
    foreignCallHandler,
  );

  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Executes the inner private kernel.
 * @param privateKernelInnerCircuitPrivateInputs - The private inputs to the inner private kernel.
 * @returns The public inputs.
 */
export async function executeInner(
  privateKernelInnerCircuitPrivateInputs: PrivateKernelInnerCircuitPrivateInputs,
): Promise<PrivateKernelCircuitPublicInputs> {
  const returnType = await executePrivateKernelInnerWithACVM(
    mapPrivateKernelInnerCircuitPrivateInputsToNoir(privateKernelInnerCircuitPrivateInputs),
    SimulatedClientCircuitArtifacts.PrivateKernelInnerArtifact as CompiledCircuit,
    foreignCallHandler,
  );

  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Executes the inner private kernel.
 * @param privateKernelResetCircuitPrivateInputs - The private inputs to the reset private kernel.
 * @returns The public inputs.
 */
export async function executeReset<
  NH_RR_PENDING extends number,
  NH_RR_SETTLED extends number,
  NLL_RR_PENDING extends number,
  NLL_RR_SETTLED extends number,
  KEY_VALIDATION_REQUESTS extends number,
  NUM_TRANSIENT_DATA_HINTS extends number,
>(
  privateKernelResetCircuitPrivateInputs: PrivateKernelResetCircuitPrivateInputsVariants<
    NH_RR_PENDING,
    NH_RR_SETTLED,
    NLL_RR_PENDING,
    NLL_RR_SETTLED,
    KEY_VALIDATION_REQUESTS,
    NUM_TRANSIENT_DATA_HINTS
  >,
  dimensions: PrivateKernelResetDimensions,
): Promise<PrivateKernelCircuitPublicInputs> {
  const artifact = SimulatedClientCircuitArtifacts[getPrivateKernelResetArtifactName(dimensions)];
  const program = new Noir(artifact as CompiledCircuit);
  const args: InputMap = {
    input: mapPrivateKernelResetCircuitPrivateInputsToNoir(privateKernelResetCircuitPrivateInputs),
  };
  const { returnValue } = await program.execute(args, foreignCallHandler);
  return mapPrivateKernelCircuitPublicInputsFromNoir(returnValue as any);
}

/**
 * Executes the tail private kernel.
 * @param privateKernelCircuitPrivateInputs - The private inputs to the tail private kernel.
 * @returns The public inputs.
 */
export async function executeTail(
  privateInputs: PrivateKernelTailCircuitPrivateInputs,
): Promise<PrivateKernelTailCircuitPublicInputs> {
  const returnType = await executePrivateKernelTailWithACVM(
    mapPrivateKernelTailCircuitPrivateInputsToNoir(privateInputs),
    SimulatedClientCircuitArtifacts.PrivateKernelTailArtifact as CompiledCircuit,
    foreignCallHandler,
  );

  return mapPrivateKernelTailCircuitPublicInputsForRollupFromNoir(returnType);
}

/**
 * Executes the tail private kernel.
 * @param privateKernelInnerCircuitPrivateInputs - The private inputs to the tail private kernel.
 * @returns The public inputs.
 */
export async function executeTailForPublic(
  privateInputs: PrivateKernelTailCircuitPrivateInputs,
): Promise<PrivateKernelTailCircuitPublicInputs> {
  const returnType = await executePrivateKernelTailToPublicWithACVM(
    mapPrivateKernelTailToPublicCircuitPrivateInputsToNoir(privateInputs),
    SimulatedClientCircuitArtifacts.PrivateKernelTailToPublicArtifact as CompiledCircuit,
    foreignCallHandler,
  );

  return mapPrivateKernelTailCircuitPublicInputsForPublicFromNoir(returnType);
}

/**
 * Converts the inputs of the private kernel init circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelInitInputsToWitnessMap(
  privateKernelInitCircuitPrivateInputs: PrivateKernelInitCircuitPrivateInputs,
): WitnessMap {
  const mapped = mapPrivateKernelInitCircuitPrivateInputsToNoir(privateKernelInitCircuitPrivateInputs);
  const initialWitnessMap = abiEncode(ClientCircuitArtifacts.PrivateKernelInitArtifact.abi, {
    input: mapped as any,
  });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the private kernel inner circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelInnerInputsToWitnessMap(
  privateKernelInnerCircuitPrivateInputs: PrivateKernelInnerCircuitPrivateInputs,
): WitnessMap {
  const mapped = mapPrivateKernelInnerCircuitPrivateInputsToNoir(privateKernelInnerCircuitPrivateInputs);
  const initialWitnessMap = abiEncode(ClientCircuitArtifacts.PrivateKernelInnerArtifact.abi, { input: mapped as any });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the private kernel reset circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelResetInputsToWitnessMap<
  NH_RR_PENDING extends number,
  NH_RR_SETTLED extends number,
  NLL_RR_PENDING extends number,
  NLL_RR_SETTLED extends number,
  KEY_VALIDATION_REQUESTS extends number,
  NUM_TRANSIENT_DATA_HINTS extends number,
>(
  privateKernelResetCircuitPrivateInputs: PrivateKernelResetCircuitPrivateInputsVariants<
    NH_RR_PENDING,
    NH_RR_SETTLED,
    NLL_RR_PENDING,
    NLL_RR_SETTLED,
    KEY_VALIDATION_REQUESTS,
    NUM_TRANSIENT_DATA_HINTS
  >,
  artifactName: PrivateResetArtifact,
): WitnessMap {
  const mapped = mapPrivateKernelResetCircuitPrivateInputsToNoir(privateKernelResetCircuitPrivateInputs);
  const artifact = ClientCircuitArtifacts[artifactName];
  const initialWitnessMap = abiEncode(artifact.abi as Abi, { input: mapped as any });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the private kernel tail circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelTailInputsToWitnessMap(
  privateKernelTailCircuitPrivateInputs: PrivateKernelTailCircuitPrivateInputs,
): WitnessMap {
  const mapped = mapPrivateKernelTailCircuitPrivateInputsToNoir(privateKernelTailCircuitPrivateInputs);
  const initialWitnessMap = abiEncode(ClientCircuitArtifacts.PrivateKernelTailArtifact.abi, { input: mapped as any });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the private kernel tail to public circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelTailToPublicInputsToWitnessMap(
  privateKernelTailToPublicCircuitPrivateInputs: PrivateKernelTailCircuitPrivateInputs,
): WitnessMap {
  const mapped = mapPrivateKernelTailToPublicCircuitPrivateInputsToNoir(privateKernelTailToPublicCircuitPrivateInputs);
  const initialWitnessMap = abiEncode(ClientCircuitArtifacts.PrivateKernelTailToPublicArtifact.abi, {
    input: mapped as any,
  });
  return initialWitnessMap;
}

/**
 * Converts the outputs of the private kernel init circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelInitOutputsFromWitnessMap(outputs: WitnessMap): PrivateKernelCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ClientCircuitArtifacts.PrivateKernelInitArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as InitReturnType;

  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the private kernel inner circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelInnerOutputsFromWitnessMap(outputs: WitnessMap): PrivateKernelCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ClientCircuitArtifacts.PrivateKernelInnerArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as InnerReturnType;

  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the private kernel reset circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelResetOutputsFromWitnessMap(
  outputs: WitnessMap,
  artifactName: PrivateResetArtifact,
): PrivateKernelCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const artifact = ClientCircuitArtifacts[artifactName];
  const decodedInputs: DecodedInputs = abiDecode(artifact.abi as Abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as ResetReturnType;

  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the private kernel tail circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelTailOutputsFromWitnessMap(
  outputs: WitnessMap,
): PrivateKernelTailCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ClientCircuitArtifacts.PrivateKernelTailArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as TailReturnType;

  return mapPrivateKernelTailCircuitPublicInputsForRollupFromNoir(returnType);
}

/**
 * Converts the outputs of the private kernel tail for public circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelTailForPublicOutputsFromWitnessMap(
  outputs: WitnessMap,
): PrivateKernelTailCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ClientCircuitArtifacts.PrivateKernelTailToPublicArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as PublicKernelMergeReturnType;

  return mapPrivateKernelTailCircuitPublicInputsForPublicFromNoir(returnType);
}

/**
 * Converts the inputs of the base parity circuit into a witness map.
 * @param inputs - The base parity inputs.
 * @returns The witness map
 */
export function convertBaseParityInputsToWitnessMap(inputs: BaseParityInputs): WitnessMap {
  const mapped = mapBaseParityInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.BaseParityArtifact.abi, { inputs: mapped as any });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the root parity circuit into a witness map.
 * @param inputs - The root parity inputs.
 * @returns The witness map
 */
export function convertRootParityInputsToWitnessMap(inputs: RootParityInputs): WitnessMap {
  const mapped = mapRootParityInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.RootParityArtifact.abi, { inputs: mapped as any });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the base rollup circuit into a witness map.
 * @param inputs - The base rollup inputs.
 * @returns The witness map
 */
export function convertBaseRollupInputsToWitnessMap(inputs: BaseRollupInputs): WitnessMap {
  const mapped = mapBaseRollupInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.BaseRollupArtifact.abi, { inputs: mapped as any });
  return initialWitnessMap;
}

export function convertPrivateKernelEmptyInputsToWitnessMap(inputs: PrivateKernelEmptyInputs): WitnessMap {
  const mapped = mapEmptyKernelInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.PrivateKernelEmptyArtifact.abi, { input: mapped as any });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the simulated base rollup circuit into a witness map.
 * @param inputs - The base rollup inputs.
 * @returns The witness map
 */
export function convertSimulatedBaseRollupInputsToWitnessMap(inputs: BaseRollupInputs): WitnessMap {
  const mapped = mapBaseRollupInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(SimulatedServerCircuitArtifacts.BaseRollupArtifact.abi, {
    inputs: mapped as any,
  });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the merge rollup circuit into a witness map.
 * @param inputs - The merge rollup inputs.
 * @returns The witness map
 */
export function convertMergeRollupInputsToWitnessMap(inputs: MergeRollupInputs): WitnessMap {
  const mapped = mapMergeRollupInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.MergeRollupArtifact.abi, { inputs: mapped as any });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the block root rollup circuit into a witness map.
 * @param inputs - The block root rollup inputs.
 * @returns The witness map
 */
export function convertBlockRootRollupInputsToWitnessMap(inputs: BlockRootRollupInputs): WitnessMap {
  const mapped = mapBlockRootRollupInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.BlockRootRollupArtifact.abi, { inputs: mapped as any });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the empty block root rollup circuit into a witness map.
 * @param inputs - The empty block root rollup inputs.
 * @returns The witness map
 */
export function convertEmptyBlockRootRollupInputsToWitnessMap(inputs: EmptyBlockRootRollupInputs): WitnessMap {
  const mapped = mapEmptyBlockRootRollupInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.EmptyBlockRootRollupArtifact.abi, {
    inputs: mapped as any,
  });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the block merge rollup circuit into a witness map.
 * @param inputs - The block merge rollup inputs.
 * @returns The witness map
 */
export function convertBlockMergeRollupInputsToWitnessMap(inputs: BlockMergeRollupInputs): WitnessMap {
  const mapped = mapBlockMergeRollupInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.BlockMergeRollupArtifact.abi, { inputs: mapped as any });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the root rollup circuit into a witness map.
 * @param inputs - The root rollup inputs.
 * @returns The witness map
 */
export function convertRootRollupInputsToWitnessMap(inputs: RootRollupInputs): WitnessMap {
  const mapped = mapRootRollupInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.RootRollupArtifact.abi, { inputs: mapped as any });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the public inner circuit into a witness map
 * @param inputs - The public kernel inputs.
 * @returns The witness map
 */
export function convertSimulatedPublicInnerInputsToWitnessMap(
  inputs: PublicKernelInnerCircuitPrivateInputs,
): WitnessMap {
  const mapped = mapPublicKernelInnerCircuitPrivateInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(SimulatedServerCircuitArtifacts.PublicKernelInnerArtifact.abi, {
    input: mapped as any,
  });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the public merge circuit into a witness map
 * @param inputs - The public kernel inputs.
 * @returns The witness map
 */
export function convertSimulatedPublicMergeInputsToWitnessMap(inputs: PublicKernelCircuitPrivateInputs): WitnessMap {
  const mapped = mapPublicKernelCircuitPrivateInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(SimulatedServerCircuitArtifacts.PublicKernelMergeArtifact.abi, {
    input: mapped as any,
  });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the public tail circuit into a witness map
 * @param inputs - The public kernel inputs.
 * @returns The witness map
 */
export function convertSimulatedPublicTailInputsToWitnessMap(inputs: PublicKernelTailCircuitPrivateInputs): WitnessMap {
  const mapped = mapPublicKernelTailCircuitPrivateInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(SimulatedServerCircuitArtifacts.PublicKernelTailArtifact.abi, {
    input: mapped as any,
  });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the public inner circuit into a witness map
 * @param inputs - The public kernel inputs.
 * @returns The witness map
 */
export function convertPublicInnerInputsToWitnessMap(inputs: PublicKernelInnerCircuitPrivateInputs): WitnessMap {
  const mapped = mapPublicKernelInnerCircuitPrivateInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.PublicKernelInnerArtifact.abi, {
    input: mapped as any,
  });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the public merge circuit into a witness map
 * @param inputs - The public kernel inputs.
 * @returns The witness map
 */
export function convertPublicMergeInputsToWitnessMap(inputs: PublicKernelCircuitPrivateInputs): WitnessMap {
  const mapped = mapPublicKernelCircuitPrivateInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.PublicKernelMergeArtifact.abi, {
    input: mapped as any,
  });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the public tail circuit into a witness map
 * @param inputs - The public kernel inputs.
 * @returns The witness map
 */
export function convertPublicTailInputsToWitnessMap(inputs: PublicKernelTailCircuitPrivateInputs): WitnessMap {
  const mapped = mapPublicKernelTailCircuitPrivateInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.PublicKernelTailArtifact.abi, { input: mapped as any });
  return initialWitnessMap;
}

export function convertPrivateKernelEmptyOutputsFromWitnessMap(outputs: WitnessMap): KernelCircuitPublicInputs {
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.PrivateKernelEmptyArtifact.abi, outputs);
  const returnType = decodedInputs.return_value as PrivateKernelEmptyReturnType;

  return mapKernelCircuitPublicInputsFromNoir(returnType);
}

export function convertSimulatedPrivateKernelEmptyOutputsFromWitnessMap(
  outputs: WitnessMap,
): KernelCircuitPublicInputs {
  const decodedInputs: DecodedInputs = abiDecode(
    SimulatedServerCircuitArtifacts.PrivateKernelEmptyArtifact.abi,
    outputs,
  );
  const returnType = decodedInputs.return_value as PrivateKernelEmptyReturnType;

  return mapKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the simulated base rollup circuit from a witness map.
 * @param outputs - The base rollup outputs as a witness map.
 * @returns The public inputs.
 */
export function convertSimulatedBaseRollupOutputsFromWitnessMap(outputs: WitnessMap): BaseOrMergeRollupPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(SimulatedServerCircuitArtifacts.BaseRollupArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as BaseRollupReturnType;

  return mapBaseOrMergeRollupPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the base rollup circuit from a witness map.
 * @param outputs - The base rollup outputs as a witness map.
 * @returns The public inputs.
 */
export function convertBaseRollupOutputsFromWitnessMap(outputs: WitnessMap): BaseOrMergeRollupPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.BaseRollupArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as BaseRollupReturnType;

  return mapBaseOrMergeRollupPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the merge rollup circuit from a witness map.
 * @param outputs - The merge rollup outputs as a witness map.
 * @returns The public inputs.
 */
export function convertMergeRollupOutputsFromWitnessMap(outputs: WitnessMap): BaseOrMergeRollupPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.MergeRollupArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as MergeRollupReturnType;

  return mapBaseOrMergeRollupPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the empty block root rollup circuit from a witness map.
 * @param outputs - The block root rollup outputs as a witness map.
 * @returns The public inputs.
 */
export function convertEmptyBlockRootRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
): BlockRootOrBlockMergePublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.EmptyBlockRootRollupArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupBlockRootEmptyReturnType;

  return mapBlockRootOrBlockMergePublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the block root rollup circuit from a witness map.
 * @param outputs - The block root rollup outputs as a witness map.
 * @returns The public inputs.
 */
export function convertBlockRootRollupOutputsFromWitnessMap(outputs: WitnessMap): BlockRootOrBlockMergePublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.BlockRootRollupArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as BlockRootRollupReturnType;

  return mapBlockRootOrBlockMergePublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the block merge rollup circuit from a witness map.
 * @param outputs - The block merge rollup outputs as a witness map.
 * @returns The public inputs.
 */
export function convertBlockMergeRollupOutputsFromWitnessMap(outputs: WitnessMap): BlockRootOrBlockMergePublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.BlockMergeRollupArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as BlockMergeRollupReturnType;

  return mapBlockRootOrBlockMergePublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the root rollup circuit from a witness map.
 * @param outputs - The root rollup outputs as a witness map.
 * @returns The public inputs.
 */
export function convertRootRollupOutputsFromWitnessMap(outputs: WitnessMap): RootRollupPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.RootRollupArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RootRollupReturnType;

  return mapRootRollupPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the base parity circuit from a witness map.
 * @param outputs - The base parity outputs as a witness map.
 * @returns The public inputs.
 */
export function convertBaseParityOutputsFromWitnessMap(outputs: WitnessMap): ParityPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.BaseParityArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as BaseParityReturnType;

  return mapParityPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the root parity circuit from a witness map.
 * @param outputs - The root parity outputs as a witness map.
 * @returns The public inputs.
 */
export function convertRootParityOutputsFromWitnessMap(outputs: WitnessMap): ParityPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.RootParityArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RootParityReturnType;

  return mapParityPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the public inner circuit from a witness map.
 * @param outputs - The public kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertSimulatedPublicInnerOutputFromWitnessMap(outputs: WitnessMap): VMCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(
    SimulatedServerCircuitArtifacts.PublicKernelInnerArtifact.abi,
    outputs,
  );

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as PublicKernelInnerReturnType;

  return mapVMCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the public merge circuit from a witness map.
 * @param outputs - The public kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertSimulatedPublicMergeOutputFromWitnessMap(outputs: WitnessMap): PublicKernelCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(
    SimulatedServerCircuitArtifacts.PublicKernelMergeArtifact.abi,
    outputs,
  );

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as PublicKernelMergeReturnType;

  return mapPublicKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the public tail circuit from a witness map.
 * @param outputs - The public kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertSimulatedPublicTailOutputFromWitnessMap(outputs: WitnessMap): KernelCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(SimulatedServerCircuitArtifacts.PublicKernelTailArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as TailReturnType;

  return mapKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the public inner circuit from a witness map.
 * @param outputs - The public kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPublicInnerOutputFromWitnessMap(outputs: WitnessMap): VMCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.PublicKernelInnerArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as PublicKernelInnerReturnType;

  return mapVMCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the public merge circuit from a witness map.
 * @param outputs - The public kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPublicMergeOutputFromWitnessMap(outputs: WitnessMap): PublicKernelCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.PublicKernelMergeArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as PublicKernelMergeReturnType;

  return mapPublicKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the public tail circuit from a witness map.
 * @param outputs - The public kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPublicTailOutputFromWitnessMap(outputs: WitnessMap): KernelCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.PublicKernelTailArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as TailReturnType;

  return mapKernelCircuitPublicInputsFromNoir(returnType);
}

function fromACVMField(field: string): Fr {
  return Fr.fromBuffer(Buffer.from(field.slice(2), 'hex'));
}

export function foreignCallHandler(name: string, args: ForeignCallInput[]): Promise<ForeignCallOutput[]> {
  // ForeignCallInput is actually a string[], so the args are string[][].
  const log = createDebugLogger('aztec:noir-protocol-circuits:oracle');

  if (name === 'debugLog') {
    assert(args.length === 3, 'expected 3 arguments for debugLog: msg, fields_length, fields');
    const [msgRaw, _ignoredFieldsSize, fields] = args;
    const msg: string = msgRaw.map(acvmField => String.fromCharCode(fromACVMField(acvmField).toNumber())).join('');
    const fieldsFr: Fr[] = fields.map((field: string) => fromACVMField(field));
    log.verbose('debug_log ' + applyStringFormatting(msg, fieldsFr));
  } else {
    throw Error(`unexpected oracle during execution: ${name}`);
  }

  return Promise.resolve([]);
}
