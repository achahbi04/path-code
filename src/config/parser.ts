/**
 * PATHCODE.md fenced directive parser.
 * Private to configuration loading — not exported.
 */

import type { ActionClass } from "../domain/authority.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import { configFailure, type ConfigFailure } from "./failure.js";
import type {
  ProjectConfig,
  ProjectRestrictions,
  UnknownDirective,
} from "./types.js";

const FENCE_OPEN = "```pathcode-config";
const FENCE_CLOSE = "```";

const AUTHORITY_INCREASING_DIRECTIVES = new Set([
  "workspace-root",
  "allow-path",
  "allow-action",
  "grant-action",
  "authority",
  "authority-level",
  "trust-level",
  "permission",
  "permissions",
  "command-allowlist",
  "provider",
  "model",
  "endpoint",
  "credential",
  "credentials",
  "risk-ceiling",
  "autonomy-level",
]);

const ACTION_CLASSES: ReadonlySet<ActionClass> = new Set([
  "READ",
  "LIST",
  "SEARCH",
  "INSPECT",
  "EDIT",
  "TARGETED_TEST",
  "TYPECHECK",
  "LINT",
  "BUILD",
  "DIAGNOSE",
  "REPAIR",
  "REVALIDATE",
  "PACKAGE_INSTALL",
  "NETWORK_ACCESS",
  "SECRET_ACCESS",
  "OUT_OF_WORKSPACE_ACCESS",
  "BROAD_DELETION",
  "DATABASE_MUTATION",
  "PRODUCTION_DATA_ACCESS",
  "GIT_COMMIT",
  "GIT_PUSH",
  "DEPLOYMENT",
  "SYSTEM_LEVEL_OPERATION",
  "PRIVILEGED_EXECUTION",
]);

type ExtractedContent = {
  readonly guidanceText: string;
  readonly blockContent: string | null;
};

function extractFencedBlock(
  content: string,
): Result<ExtractedContent, ConfigFailure> {
  let searchFrom = 0;
  let firstOpen = -1;
  let blockStart = -1;
  let openCount = 0;

  while (true) {
    const index = content.indexOf(FENCE_OPEN, searchFrom);
    if (index === -1) {
      break;
    }
    openCount += 1;
    if (openCount === 1) {
      firstOpen = index;
      blockStart = index + FENCE_OPEN.length;
      if (content[blockStart] === "\r") {
        blockStart += 1;
      }
      if (content[blockStart] === "\n") {
        blockStart += 1;
      }
    }
    searchFrom = index + FENCE_OPEN.length;
  }

  if (openCount === 0) {
    return success({ guidanceText: content, blockContent: null });
  }

  if (openCount > 1) {
    return failure(
      configFailure(
        "CONFIG_MALFORMED",
        "Multiple pathcode-config directive blocks are not allowed",
      ),
    );
  }

  const closeIndex = content.indexOf(FENCE_CLOSE, blockStart);
  if (closeIndex === -1) {
    return failure(
      configFailure(
        "CONFIG_MALFORMED",
        "Unterminated pathcode-config directive block",
      ),
    );
  }

  const blockContent = content.slice(blockStart, closeIndex);
  const guidanceText =
    content.slice(0, firstOpen) + content.slice(closeIndex + FENCE_CLOSE.length);

  return success({ guidanceText, blockContent });
}

function isValidDenyPath(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  if (value.includes("\0")) {
    return false;
  }
  if (value.startsWith("/")) {
    return false;
  }
  if (/^[A-Za-z]:/.test(value)) {
    return false;
  }
  for (const segment of value.split("/")) {
    if (segment === "..") {
      return false;
    }
  }
  return true;
}

function isActionClass(value: string): value is ActionClass {
  return ACTION_CLASSES.has(value as ActionClass);
}

function pushUnique<T>(items: T[], value: T): void {
  if (!items.includes(value)) {
    items.push(value);
  }
}

function parseDirectiveBlock(
  blockContent: string,
): Result<
  {
    restrictions: ProjectRestrictions;
    unknownDirectives: UnknownDirective[];
  },
  ConfigFailure
> {
  const deniedPaths: string[] = [];
  const disabledActions: ActionClass[] = [];
  const unknownDirectives: UnknownDirective[] = [];

  const lines = blockContent.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    const delimiterIndex = line.indexOf("=");
    if (delimiterIndex === -1) {
      return failure(
        configFailure(
          "CONFIG_MALFORMED",
          "Directive line must contain exactly one assignment delimiter",
        ),
      );
    }

    const name = line.slice(0, delimiterIndex).trim();
    const value = line.slice(delimiterIndex + 1).trim();

    if (name.length === 0 || value.length === 0) {
      return failure(
        configFailure(
          "CONFIG_MALFORMED",
          "Directive name and value must not be empty",
        ),
      );
    }

    if (AUTHORITY_INCREASING_DIRECTIVES.has(name)) {
      return failure(
        configFailure(
          "CONFIG_AUTHORITY_INCREASE_REJECTED",
          `Authority-increasing directive rejected: ${name}`,
          { directive: name.slice(0, 64) },
        ),
      );
    }

    if (name === "deny-path") {
      if (!isValidDenyPath(value)) {
        return failure(
          configFailure("CONFIG_MALFORMED", "Invalid deny-path directive value"),
        );
      }
      pushUnique(deniedPaths, value);
      continue;
    }

    if (name === "disable-action") {
      if (!isActionClass(value)) {
        return failure(
          configFailure(
            "CONFIG_MALFORMED",
            "disable-action value must be a known ActionClass",
          ),
        );
      }
      pushUnique(disabledActions, value);
      continue;
    }

    unknownDirectives.push({ name, value });
  }

  return success({
    restrictions: {
      deniedPaths,
      disabledActions,
    },
    unknownDirectives,
  });
}

export function parseProjectConfigContent(
  content: string,
): Result<ProjectConfig, ConfigFailure> {
  const extracted = extractFencedBlock(content);
  if (!extracted.ok) {
    return extracted;
  }

  if (extracted.value.blockContent === null) {
    return success({
      source: { kind: "REPOSITORY_FILE" },
      restrictions: {
        deniedPaths: [],
        disabledActions: [],
      },
      unknownDirectives: [],
      guidance: {
        trust: "UNTRUSTED_REPOSITORY",
        provenance: "PRE_EXISTING",
        text: extracted.value.guidanceText,
      },
    });
  }

  const parsed = parseDirectiveBlock(extracted.value.blockContent);
  if (!parsed.ok) {
    return parsed;
  }

  return success({
    source: { kind: "REPOSITORY_FILE" },
    restrictions: parsed.value.restrictions,
    unknownDirectives: parsed.value.unknownDirectives,
    guidance: {
      trust: "UNTRUSTED_REPOSITORY",
      provenance: "PRE_EXISTING",
      text: extracted.value.guidanceText,
    },
  });
}
