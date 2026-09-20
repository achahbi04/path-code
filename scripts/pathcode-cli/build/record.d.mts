import type { BuildRecord } from "./index.mjs";

export const BUILD_RECORD_SCHEMA: string;
export function resolveBuildsDir(runtimeRoot: string): string;
export function resolveBuildRecordPath(runtimeRoot: string, buildId: string): string;
export function makeBuildActionId(kind: string, keyMaterial: string): string;
export function createBuildRecordSkeleton(input: {
  outcome: string;
  explicitRequirements?: Array<{
    id?: string;
    statement: string;
    required?: boolean;
  }>;
  buildId?: string;
}): BuildRecord;
export function writeBuildRecord(
  runtimeRoot: string,
  record: BuildRecord,
): BuildRecord;
export function readBuildRecord(
  runtimeRoot: string,
  buildId: string,
): BuildRecord | null;
export function listBuildRecords(runtimeRoot: string): BuildRecord[];
export function findLatestActiveBuild(runtimeRoot: string): BuildRecord | null;
export function updateBuildRecord(
  runtimeRoot: string,
  buildId: string,
  mutator: (record: BuildRecord) => BuildRecord | void,
): BuildRecord;
export function scrubBuildTempFiles(runtimeRoot: string): void;
