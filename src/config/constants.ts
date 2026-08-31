/**
 * Fixed configuration filename and read bounds for PATHCODE.md.
 * Private to the configuration loader — not exported.
 */

export const PATHCODE_FILENAME = "PATHCODE.md" as const;

/** Maximum configuration file size in bytes (64 KiB). */
export const MAX_CONFIG_BYTES = 65_536;

/** Hard read ceiling used to detect growth after stat (MAX + 1). */
export const CONFIG_READ_LIMIT_BYTES = MAX_CONFIG_BYTES + 1;
