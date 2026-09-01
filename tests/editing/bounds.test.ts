import { afterEach, describe, expect, it } from "vitest";

import { MAX_REPOSITORY_CONTENT_BYTES } from "../../src/reader/constants.js";
import {
  MAX_EDIT_FILE_BYTES,
  MAX_FILES_PER_EDIT_OPERATION,
  MAX_TOTAL_PROPOSED_AFTER_BYTES,
  validatePreparedBatchBounds,
  validateReaderByteLimit,
} from "../../src/editing/index.js";
import { cleanupInventoryFixtures } from "../inventory/fixture-helpers.js";

afterEach(async () => {
  await cleanupInventoryFixtures();
});

describe("editing bounds", () => {
  it("links MAX_EDIT_FILE_BYTES to the Phase 2B reader ceiling", () => {
    expect(MAX_EDIT_FILE_BYTES).toBe(MAX_REPOSITORY_CONTENT_BYTES);
    expect(MAX_EDIT_FILE_BYTES).toBe(1_048_576);
  });

  it("rejects caller widening beyond the hard reader ceiling", () => {
    const result = validateReaderByteLimit(MAX_EDIT_FILE_BYTES + 1);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("BOUNDS_EXCEEDED");
  });

  it("accepts caller narrowing within the hard ceiling", () => {
    const result = validateReaderByteLimit(1024);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toBe(1024);
  });

  it("validates pure batch file-count and total-byte ceilings", () => {
    expect(MAX_FILES_PER_EDIT_OPERATION).toBe(16);
    expect(MAX_TOTAL_PROPOSED_AFTER_BYTES).toBe(8_388_608);
    const empty = validatePreparedBatchBounds([]);
    expect(empty.ok).toBe(true);
  });
});
