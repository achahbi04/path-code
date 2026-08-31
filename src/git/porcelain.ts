/**
 * Parse git status --porcelain=v2 -z output.
 * Fail closed on unknown / malformed records.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import {
  gitBaselineFailure,
  type GitBaselineFailure,
} from "./baseline-failure.js";
import type { GitChangeKind, GitEntryState } from "./types.js";
import {
  assertGitPathVisible,
  type GitVisibilityScope,
} from "./visibility.js";

export type ParsedStatusRecord =
  | {
      readonly kind: "CHANGED";
      readonly gitRelativePath: string;
      readonly indexState: GitChangeKind;
      readonly worktreeState: GitChangeKind;
      readonly originalGitRelativePath?: string;
      readonly score?: number;
      readonly submoduleStatus?: string;
    }
  | {
      readonly kind: "UNMERGED";
      readonly gitRelativePath: string;
      readonly stages: string;
    }
  | {
      readonly kind: "UNTRACKED";
      readonly gitRelativePath: string;
    };

function mapXy(char: string): Result<GitChangeKind, GitBaselineFailure> {
  switch (char) {
    case ".":
      return success("CLEAN");
    case "A":
      return success("ADDED");
    case "M":
      return success("MODIFIED");
    case "D":
      return success("DELETED");
    case "R":
      return success("RENAMED");
    case "C":
      return success("COPIED");
    case "T":
      return success("TYPE_CHANGED");
    default:
      return failure(
        gitBaselineFailure(
          "GIT_STATUS_PARSE_FAILED",
          "Unsupported porcelain status character",
        ),
      );
  }
}

function splitNulRecords(output: string): Result<string[], GitBaselineFailure> {
  if (output.length === 0) {
    return success([]);
  }
  // Porcelain v2 -z: records are NUL-terminated. A trailing NUL is normal.
  const parts = output.split("\0");
  if (parts.length > 0 && parts[parts.length - 1] === "") {
    parts.pop();
  }
  if (parts.some((part) => part.includes("\0"))) {
    return failure(
      gitBaselineFailure(
        "GIT_STATUS_PARSE_FAILED",
        "Malformed NUL framing in status output",
      ),
    );
  }
  return success(parts);
}

function parseType1(
  record: string,
): Result<ParsedStatusRecord, GitBaselineFailure> {
  // 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
  const match = /^1 ([.MTADRCU?]{2}) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (.*)$/s.exec(
    record,
  );
  if (match === null) {
    return failure(
      gitBaselineFailure(
        "GIT_STATUS_PARSE_FAILED",
        "Malformed ordinary changed status record",
      ),
    );
  }
  const xy = match[1]!;
  const sub = match[2]!;
  const filePath = match[8]!;
  const indexState = mapXy(xy[0]!);
  if (!indexState.ok) {
    return indexState;
  }
  const worktreeState = mapXy(xy[1]!);
  if (!worktreeState.ok) {
    return worktreeState;
  }
  return success({
    kind: "CHANGED",
    gitRelativePath: filePath,
    indexState: indexState.value,
    worktreeState: worktreeState.value,
    ...(sub === "N..." ? {} : { submoduleStatus: sub }),
  });
}

function parseType2(
  record: string,
  nextPath: string | undefined,
): Result<{ record: ParsedStatusRecord; consumedExtra: boolean }, GitBaselineFailure> {
  // 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path> + next NUL field = orig
  const match =
    /^2 ([.MTADRCU?]{2}) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) ([RC]\d+) (.*)$/s.exec(
      record,
    );
  if (match === null) {
    return failure(
      gitBaselineFailure(
        "GIT_STATUS_PARSE_FAILED",
        "Malformed rename/copy status record",
      ),
    );
  }
  if (nextPath === undefined) {
    return failure(
      gitBaselineFailure(
        "GIT_STATUS_PARSE_FAILED",
        "Rename/copy record missing original path field",
      ),
    );
  }
  const xy = match[1]!;
  const sub = match[2]!;
  const scoreField = match[8]!;
  const filePath = match[9]!;
  const indexState = mapXy(xy[0]!);
  if (!indexState.ok) {
    return indexState;
  }
  const worktreeState = mapXy(xy[1]!);
  if (!worktreeState.ok) {
    return worktreeState;
  }
  const score = Number.parseInt(scoreField.slice(1), 10);
  if (!Number.isFinite(score)) {
    return failure(
      gitBaselineFailure(
        "GIT_STATUS_PARSE_FAILED",
        "Malformed rename/copy score",
      ),
    );
  }
  return success({
    consumedExtra: true,
    record: {
      kind: "CHANGED",
      gitRelativePath: filePath,
      indexState: indexState.value,
      worktreeState: worktreeState.value,
      originalGitRelativePath: nextPath,
      score,
      ...(sub === "N..." ? {} : { submoduleStatus: sub }),
    },
  });
}

function parseUnmerged(
  record: string,
): Result<ParsedStatusRecord, GitBaselineFailure> {
  // u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
  const match =
    /^u ([.MTADRCU?]{2}) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (.*)$/s.exec(
      record,
    );
  if (match === null) {
    return failure(
      gitBaselineFailure(
        "GIT_STATUS_PARSE_FAILED",
        "Malformed unmerged status record",
      ),
    );
  }
  return success({
    kind: "UNMERGED",
    gitRelativePath: match[10]!,
    stages: match[1]!,
  });
}

/**
 * Parse porcelain v2 -z output and enforce visibility on every path field.
 */
export function parsePorcelainV2Status(
  output: string,
  scope: GitVisibilityScope,
): Result<readonly ParsedStatusRecord[], GitBaselineFailure> {
  const recordsResult = splitNulRecords(output);
  if (!recordsResult.ok) {
    return recordsResult;
  }
  const tokens = recordsResult.value;
  const parsed: ParsedStatusRecord[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token.startsWith("# ")) {
      // Header lines such as "# branch.head"
      continue;
    }

    const kind = token[0];
    if (kind === "1") {
      const item = parseType1(token);
      if (!item.ok) {
        return item;
      }
      const visible = assertGitPathVisible(item.value.gitRelativePath, scope);
      if (!visible.ok) {
        return visible;
      }
      parsed.push({ ...item.value, gitRelativePath: visible.value });
      continue;
    }

    if (kind === "2") {
      const item = parseType2(token, tokens[index + 1]);
      if (!item.ok) {
        return item;
      }
      const current = assertGitPathVisible(item.value.record.gitRelativePath, scope);
      if (!current.ok) {
        return current;
      }
      if (item.value.record.kind !== "CHANGED") {
        return failure(
          gitBaselineFailure(
            "GIT_STATUS_PARSE_FAILED",
            "Rename/copy parser produced unexpected record kind",
          ),
        );
      }
      const originalPath = item.value.record.originalGitRelativePath;
      if (originalPath === undefined) {
        return failure(
          gitBaselineFailure(
            "GIT_STATUS_PARSE_FAILED",
            "Rename/copy record missing original path field",
          ),
        );
      }
      const original = assertGitPathVisible(originalPath, scope);
      if (!original.ok) {
        return original;
      }
      parsed.push({
        kind: "CHANGED",
        gitRelativePath: current.value,
        indexState: item.value.record.indexState,
        worktreeState: item.value.record.worktreeState,
        originalGitRelativePath: original.value,
        ...(item.value.record.score === undefined
          ? {}
          : { score: item.value.record.score }),
        ...(item.value.record.submoduleStatus === undefined
          ? {}
          : { submoduleStatus: item.value.record.submoduleStatus }),
      });
      if (item.value.consumedExtra) {
        index += 1;
      }
      continue;
    }

    if (kind === "u") {
      const item = parseUnmerged(token);
      if (!item.ok) {
        return item;
      }
      const visible = assertGitPathVisible(item.value.gitRelativePath, scope);
      if (!visible.ok) {
        return visible;
      }
      parsed.push({ ...item.value, gitRelativePath: visible.value });
      continue;
    }

    if (kind === "?") {
      // ? <path>
      if (!token.startsWith("? ")) {
        return failure(
          gitBaselineFailure(
            "GIT_STATUS_PARSE_FAILED",
            "Malformed untracked status record",
          ),
        );
      }
      const filePath = token.slice(2);
      const visible = assertGitPathVisible(filePath, scope);
      if (!visible.ok) {
        return visible;
      }
      parsed.push({ kind: "UNTRACKED", gitRelativePath: visible.value });
      continue;
    }

    if (kind === "!") {
      // Ignored entries are not requested with --untracked-files=all by default
      // in our command, but if present, still enforce visibility.
      if (!token.startsWith("! ")) {
        return failure(
          gitBaselineFailure(
            "GIT_STATUS_PARSE_FAILED",
            "Malformed ignored status record",
          ),
        );
      }
      const filePath = token.slice(2);
      const visible = assertGitPathVisible(filePath, scope);
      if (!visible.ok) {
        return visible;
      }
      // Ignored paths from status are not retained as change observations here;
      // ignore annotation comes from check-ignore on admitted entries.
      continue;
    }

    return failure(
      gitBaselineFailure(
        "GIT_STATUS_PARSE_FAILED",
        "Unknown porcelain status record type",
      ),
    );
  }

  return success(parsed);
}

export function statusRecordToEntryState(
  record: ParsedStatusRecord,
): GitEntryState {
  if (record.kind === "UNTRACKED") {
    return { kind: "UNTRACKED" };
  }
  if (record.kind === "UNMERGED") {
    return { kind: "UNMERGED", stages: record.stages };
  }
  return {
    kind: "TRACKED",
    indexState: record.indexState,
    worktreeState: record.worktreeState,
    ...(record.originalGitRelativePath === undefined
      ? {}
      : { originalPath: record.originalGitRelativePath }),
    ...(record.score === undefined ? {} : { score: record.score }),
    ...(record.submoduleStatus === undefined
      ? {}
      : { submoduleStatus: record.submoduleStatus }),
  };
}

/** Test/export seam: parse without live Git, still enforcing visibility. */
export function parsePorcelainV2StatusForTests(
  output: string,
  scope: GitVisibilityScope,
): Result<readonly ParsedStatusRecord[], GitBaselineFailure> {
  return parsePorcelainV2Status(output, scope);
}
