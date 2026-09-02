import { describe, expect, it } from "vitest";

import * as editing from "../../src/editing/index.js";

describe("editing import side effects", () => {
  it("importing the public editing surface has no persistent side effects", () => {
    expect(Object.keys(editing).sort()).toEqual(
      [
        "CREATED_FILE_BASE_MODE",
        "DISABLE_ACTION_FOR_MODIFY_EXISTING_FILE",
        "MAX_EDIT_FILE_BYTES",
        "MAX_FILES_PER_EDIT_OPERATION",
        "MAX_TOTAL_PROPOSED_AFTER_BYTES",
        "PATH_CODE_CREATE_TEMP_PREFIX",
        "PATH_CODE_TEMP_PREFIX",
        "authorizePreparedChange",
        "computeCreatedFileMode",
        "createFile",
        "explicitEditApproval",
        "isAtomicCreatePlatformSupported",
        "isAtomicReplacePlatformSupported",
        "isModifyExistingFileDisabled",
        "isMutationActionDisabledByConfig",
        "prepareCreateFile",
        "prepareModifyExistingFile",
        "replaceExistingFile",
        "validatePreparedBatchBounds",
        "validateReaderByteLimit",
      ].sort(),
    );
  });
});
