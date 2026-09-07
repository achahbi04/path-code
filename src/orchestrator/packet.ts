/**
 * Bounded Brain packet construction with revision-slot reservation.
 */

import {
  MAX_CONTEXT_BLOCK_TEXT_UTF8_BYTES,
  MAX_CONTEXT_BLOCKS,
  MAX_PREPARED_REQUEST_UTF8_BYTES,
  MAX_TASK_TEXT_UTF8_BYTES,
  utf8ByteLength,
} from "../brain/bounds.js";
import type {
  BrainContextBlock,
  BrainContextPacket,
  BrainInvocationPurpose,
  BrainInvocationRequest,
  BrainReferenceDescriptor,
} from "../brain/types.js";
import {
  COORDINATOR_DIAGNOSTIC_BLOCK_ID,
  MAX_DIAGNOSTIC_UTF8_BYTES,
} from "./bounds.js";
import { configurationFailure, type CycleConfigurationFailure } from "./failures.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";

const STRUCTURAL_OVERHEAD_BUDGET = 4_096;

export function validateOriginalBlocksForRevision(
  blocks: readonly BrainContextBlock[],
  instructionText: string,
  references: readonly BrainReferenceDescriptor[],
  revisionsEnabled: boolean,
): Result<void, CycleConfigurationFailure> {
  if (utf8ByteLength(instructionText) > MAX_TASK_TEXT_UTF8_BYTES) {
    return failure(
      configurationFailure(
        "PACKET_CANNOT_RESERVE_REVISION",
        "Instruction text exceeds Brain task ceiling",
      ),
    );
  }
  const maxBlocks = revisionsEnabled
    ? MAX_CONTEXT_BLOCKS - 1
    : MAX_CONTEXT_BLOCKS;
  if (blocks.length > maxBlocks) {
    return failure(
      configurationFailure(
        "PACKET_CANNOT_RESERVE_REVISION",
        revisionsEnabled
          ? "Original context blocks leave no room for diagnostic revision block"
          : "Original context blocks exceed Brain block ceiling",
      ),
    );
  }
  for (const block of blocks) {
    if (block.blockId === COORDINATOR_DIAGNOSTIC_BLOCK_ID) {
      return failure(
        configurationFailure(
          "PACKET_CANNOT_RESERVE_REVISION",
          "Caller blockId collides with coordinator diagnostic id",
        ),
      );
    }
    if (utf8ByteLength(block.text) > MAX_CONTEXT_BLOCK_TEXT_UTF8_BYTES) {
      return failure(
        configurationFailure(
          "PACKET_CANNOT_RESERVE_REVISION",
          "Context block exceeds per-block ceiling",
        ),
      );
    }
  }

  if (!revisionsEnabled) {
    return success(undefined);
  }

  const worstDiagnostic = "x".repeat(MAX_DIAGNOSTIC_UTF8_BYTES);
  const worstPacket = buildContextPacket(references, blocks, worstDiagnostic);
  const estimate =
    utf8ByteLength(instructionText) +
    estimatePacketBytes(worstPacket) +
    STRUCTURAL_OVERHEAD_BUDGET;
  if (estimate > MAX_PREPARED_REQUEST_UTF8_BYTES) {
    return failure(
      configurationFailure(
        "PACKET_CANNOT_RESERVE_REVISION",
        "Normalized packet cannot fit Brain byte ceiling with reserved diagnostic",
      ),
    );
  }
  return success(undefined);
}

function estimatePacketBytes(packet: BrainContextPacket): number {
  let total = 0;
  for (const ref of packet.references) {
    total += utf8ByteLength(ref.handle) + utf8ByteLength(ref.evidenceKind);
    if (ref.relativePath !== undefined) {
      total += utf8ByteLength(ref.relativePath);
    }
  }
  for (const block of packet.blocks) {
    total += utf8ByteLength(block.blockId);
    total += utf8ByteLength(block.role);
    total += utf8ByteLength(block.text);
    for (const h of block.referenceHandles) {
      total += utf8ByteLength(h);
    }
  }
  return total;
}

export function buildContextPacket(
  references: readonly BrainReferenceDescriptor[],
  originalBlocks: readonly BrainContextBlock[],
  diagnosticText: string | null,
): BrainContextPacket {
  const blocks: BrainContextBlock[] = originalBlocks.map((b) =>
    Object.freeze({
      blockId: b.blockId,
      role: b.role,
      text: b.text,
      referenceHandles: Object.freeze([...b.referenceHandles]),
    }),
  );
  if (diagnosticText !== null) {
    const clipped =
      utf8ByteLength(diagnosticText) <= MAX_DIAGNOSTIC_UTF8_BYTES
        ? diagnosticText
        : diagnosticText.slice(0, MAX_DIAGNOSTIC_UTF8_BYTES);
    const limited =
      utf8ByteLength(clipped) <= MAX_CONTEXT_BLOCK_TEXT_UTF8_BYTES
        ? clipped
        : clipped.slice(0, MAX_CONTEXT_BLOCK_TEXT_UTF8_BYTES);
    blocks.push(
      Object.freeze({
        blockId: COORDINATOR_DIAGNOSTIC_BLOCK_ID,
        role: "DIAGNOSTIC" as const,
        text: limited,
        referenceHandles: Object.freeze([] as string[]),
      }),
    );
  }
  return Object.freeze({
    references: Object.freeze(
      references.map((r) =>
        Object.freeze({
          handle: r.handle,
          evidenceKind: r.evidenceKind,
          ...(r.relativePath !== undefined
            ? { relativePath: r.relativePath }
            : {}),
        }),
      ),
    ),
    blocks: Object.freeze(blocks),
  });
}

export function buildBrainRequest(input: {
  readonly correlationId: string;
  readonly purpose: BrainInvocationPurpose;
  readonly taskText: string;
  readonly context: BrainContextPacket;
  readonly timeoutMs: number;
}): BrainInvocationRequest {
  return Object.freeze({
    correlationId: input.correlationId,
    purpose: input.purpose,
    taskText: input.taskText,
    context: input.context,
    responseProfile: Object.freeze({
      kind: "REASONING_PROPOSAL_JSON" as const,
      schemaVersion: 1 as const,
    }),
    timeoutMs: input.timeoutMs,
  });
}
