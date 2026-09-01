/**
 * Pure batch bounds validation — not multi-file execution or coordination.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import {
  MAX_EDIT_FILE_BYTES,
  MAX_FILES_PER_EDIT_OPERATION,
  MAX_TOTAL_PROPOSED_AFTER_BYTES,
} from "./bounds.js";
import type { PreparedChange, PreparationFailure } from "./types.js";

function boundsFailure(message: string): PreparationFailure {
  return { code: "BOUNDS_EXCEEDED", message };
}

export function validatePreparedBatchBounds(
  preparedChanges: readonly PreparedChange[],
): Result<true, PreparationFailure> {
  if (preparedChanges.length > MAX_FILES_PER_EDIT_OPERATION) {
    return failure(
      boundsFailure(
        `Prepared change count exceeds MAX_FILES_PER_EDIT_OPERATION (${MAX_FILES_PER_EDIT_OPERATION})`,
      ),
    );
  }

  let totalAfterBytes = 0;
  for (const prepared of preparedChanges) {
    if (prepared.afterByteLength > MAX_EDIT_FILE_BYTES) {
      return failure(
        boundsFailure(
          `Prepared after bytes exceed MAX_EDIT_FILE_BYTES (${MAX_EDIT_FILE_BYTES})`,
        ),
      );
    }
    totalAfterBytes += prepared.afterByteLength;
    if (totalAfterBytes > MAX_TOTAL_PROPOSED_AFTER_BYTES) {
      return failure(
        boundsFailure(
          `Total proposed after bytes exceed MAX_TOTAL_PROPOSED_AFTER_BYTES (${MAX_TOTAL_PROPOSED_AFTER_BYTES})`,
        ),
      );
    }
  }

  return success(true);
}

export function validateReaderByteLimit(
  requestedMaxBytes: number,
): Result<number, PreparationFailure> {
  if (requestedMaxBytes > MAX_EDIT_FILE_BYTES) {
    return failure(
      boundsFailure(
        `Caller cannot widen beyond MAX_EDIT_FILE_BYTES (${MAX_EDIT_FILE_BYTES})`,
      ),
    );
  }
  return success(requestedMaxBytes);
}
