# PATH CODE — PHASE 5D3 CATALOG DIRECTORY ENTRY AMENDMENT 1

**Prospective extension of:** Gate 1 `createReferenceCatalog` entry selection (`docs/passes` Phase 5B/5C catalog semantics).  
**Does not rewrite** historical contracts.

## Problem

Inventory marks walked directories as `DESCENDED`, not `ADMITTED`. Phase 5D3 CREATE_TEXT requires an EXISTS claim bound to the caller-selected parent directory entry. Prior catalog eligibility accepted only `ADMITTED` members, so genuine directory parents could not be selected.

## Exact change

Replace private `admittedEntrySet` with `catalogEligibleEntrySet`:

- keep all `ADMITTED` entries;
- additionally accept `DESCENDED` entries whose `physicalKind === "DIRECTORY"`;
- content/manifest selection rules unchanged.

## Preserved

- No manufactured entries; still requires inventory-retained object identity
- Denied / partial / cycle dispositions still rejected
- File entries remain ADMITTED-only for content binding

## Affected files

- `src/reasoning/catalog.ts`
- Mutation CREATE proofs (M10, M11, M28)
