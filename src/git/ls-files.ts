/**
 * Parse git ls-files --stage -z output.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import {
  gitBaselineFailure,
  type GitBaselineFailure,
} from "./baseline-failure.js";
import {
  assertGitPathVisible,
  type GitVisibilityScope,
} from "./visibility.js";

export type ParsedLsFilesRecord = {
  readonly mode: string;
  readonly objectId: string;
  readonly stage: number;
  readonly gitRelativePath: string;
};

function splitNulRecords(output: string): Result<string[], GitBaselineFailure> {
  if (output.length === 0) {
    return success([]);
  }
  const parts = output.split("\0");
  if (parts.length > 0 && parts[parts.length - 1] === "") {
    parts.pop();
  }
  return success(parts);
}

/**
 * Stage line format: <mode> <object> <stage>\t<path>
 */
export function parseLsFilesStage(
  output: string,
  scope: GitVisibilityScope,
): Result<readonly ParsedLsFilesRecord[], GitBaselineFailure> {
  const recordsResult = splitNulRecords(output);
  if (!recordsResult.ok) {
    return recordsResult;
  }

  const parsed: ParsedLsFilesRecord[] = [];
  for (const token of recordsResult.value) {
    const tab = token.indexOf("\t");
    if (tab === -1) {
      return failure(
        gitBaselineFailure(
          "GIT_LS_FILES_PARSE_FAILED",
          "Malformed ls-files stage record",
        ),
      );
    }
    const meta = token.slice(0, tab);
    const filePath = token.slice(tab + 1);
    const match = /^([0-7]{6}) ([0-9a-f]+) ([0-3])$/.exec(meta);
    if (match === null) {
      return failure(
        gitBaselineFailure(
          "GIT_LS_FILES_PARSE_FAILED",
          "Malformed ls-files stage metadata",
        ),
      );
    }

    const visible = assertGitPathVisible(filePath, scope);
    if (!visible.ok) {
      return visible;
    }

    parsed.push({
      mode: match[1]!,
      objectId: match[2]!,
      stage: Number.parseInt(match[3]!, 10),
      gitRelativePath: visible.value,
    });
  }

  return success(parsed);
}

export function isGitlinkMode(mode: string): boolean {
  return mode === "160000";
}
