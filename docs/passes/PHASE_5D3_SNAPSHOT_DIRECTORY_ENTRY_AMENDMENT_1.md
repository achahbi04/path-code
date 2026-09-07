# PATH CODE — PHASE 5D3 SNAPSHOT DIRECTORY ENTRY AMENDMENT 1

**Prospective extension of:** Phase 2F `verifyRepositorySnapshot` entry scope.  
**Companion to:** `PHASE_5D3_CATALOG_DIRECTORY_ENTRY_AMENDMENT_1.md`.

## Problem

Walked directories are inventory `DESCENDED`. Gate 1 EXISTS currentness calls `verifyRepositorySnapshot` with the directory entry. Prior scope accepted only `ADMITTED` members, so directory EXISTS always failed as `ENTRY_NOT_IN_SNAPSHOT` / STALE_EVIDENCE.

## Exact change

In `src/snapshot/verify.ts`, replace private `admittedEntries` with `verificationEligibleEntries`:

- keep all `ADMITTED` entries;
- additionally accept `DESCENDED` directories;
- content verification paths unchanged.

## Preserved

- No manufactured entries
- File content verification still ADMITTED-only via content observations
- Denial / budget / identity semantics unchanged

## Proofs

- M10 / M11 / M28 CREATE paths bind EXISTS against `src` parent
