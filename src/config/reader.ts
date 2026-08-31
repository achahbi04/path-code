/**
 * Private bounded reader for the single admitted PATHCODE.md canonical path.
 * Not exported — not a general file-reading primitive.
 */

import { open } from "node:fs/promises";

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { CanonicalPath } from "../domain/workspace.js";
import type { JsonObject } from "../domain/json.js";
import {
  CONFIG_READ_LIMIT_BYTES,
  MAX_CONFIG_BYTES,
} from "./constants.js";
import { configFailure, type ConfigFailure } from "./failure.js";

function filesystemDetails(error: unknown): JsonObject | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as NodeJS.ErrnoException).code === "string"
  ) {
    return { errnoCode: (error as NodeJS.ErrnoException).code as string };
  }
  return undefined;
}

/**
 * Read at most MAX_CONFIG_BYTES through an opened handle using a MAX + 1 bound.
 */
export async function readBoundedConfigFile(
  admittedPath: CanonicalPath,
): Promise<Result<string, ConfigFailure>> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(admittedPath, "r");
    const stat = await handle.stat();
    if (!stat.isFile()) {
      return failure(
        configFailure(
          "CONFIG_NOT_FILE",
          "Configuration path is not a regular file",
        ),
      );
    }

    if (stat.size > MAX_CONFIG_BYTES) {
      return failure(
        configFailure(
          "CONFIG_TOO_LARGE",
          "Configuration file exceeds maximum size",
        ),
      );
    }

    const buffer = Buffer.alloc(CONFIG_READ_LIMIT_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, CONFIG_READ_LIMIT_BYTES, 0);
    if (bytesRead > MAX_CONFIG_BYTES) {
      return failure(
        configFailure(
          "CONFIG_TOO_LARGE",
          "Configuration file exceeds maximum size",
        ),
      );
    }

    const slice = buffer.subarray(0, bytesRead);
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(slice);
    } catch {
      return failure(
        configFailure(
          "CONFIG_INVALID_ENCODING",
          "Configuration file is not valid UTF-8",
        ),
      );
    }

    if (text.includes("\0")) {
      return failure(
        configFailure(
          "CONFIG_MALFORMED",
          "Configuration content contains a null byte",
        ),
      );
    }

    return success(text);
  } catch (error) {
    return failure(
      configFailure(
        "CONFIG_UNREADABLE",
        "Failed to read configuration file",
        filesystemDetails(error),
      ),
    );
  } finally {
    await handle?.close();
  }
}
