# PATH CODE — PHASE 2G-E1 EVIDENCE SUPPLEMENT

**Phase 2G audit checkpoint:** `f2e175886f888ce3ce42d5b1982f153971b75320`

**Purpose:** Complete missing Phase 2G compile-time audit evidence for RI-017 and RI-012 intended-error spot checks.

This supplement completes missing Phase 2G audit evidence. It does not change Phase 2 runtime implementation. It does not itself constitute Phase 2 Closure.

---

## Contradiction discovered

The committed Phase 2G audit report (`docs/reports/PHASE_2G_AUDIT_REPORT.md`) listed RI-017 and RI-012 among compile-time spot-checks, but the shell loop used during the audit was malformed and **did not actually execute** those two probes. Only RI-001 and related probes produced captured compiler output.

---

## RI-017 — GIT DOES NOT GRANT ADMISSION

**Directive location:** `tests/domain/type-contracts.ts:444`

**Context:**

```typescript
// Phase 2C Git baseline provenance evidence (RI-017)
declare function acceptRepositoryEntryFromGit(value: RepositoryEntry): void;
declare const rawGitPath: string;
// @ts-expect-error raw Git path string is not RepositoryEntry
acceptRepositoryEntryFromGit(rawGitPath);
```

**Source SHA before edit:** `2a0b0f6e67d5222db1452447f0bb9b9d5b54323dc52cddb50dbb477c281df80f`

**Procedure:** Removed only the `@ts-expect-error` comment on line 444; ran `npm run typecheck`.

**Exact compiler diagnostic:**

```
tests/domain/type-contracts.ts(445,30): error TS2345: Argument of type 'string' is not assignable to parameter of type 'RepositoryEntry'.
```

**Why error is intended:** The probe passes a raw Git path string where an earned `RepositoryEntry` is required. This is the RI-017 authority boundary: Git lexical output cannot manufacture repository admission authority.

**Restoration evidence:** File SHA after restore matches pre-edit SHA (`2a0b0f6e67d5222db1452447f0bb9b9d5b54323dc52cddb50dbb477c281df80f`); `git diff tests/domain/type-contracts.ts` empty; `npm run typecheck` PASS.

**Intended error confirmed:** YES

---

## RI-012 — NO MODEL BOUNDARY

**Compile-time probe applicability:** NOT APPLICABLE

**Candidate directive considered:** `tests/domain/type-contracts.ts:157`

```typescript
// 6. ModelResponse cannot carry AuthorityDecision / grant ActionClass
const _authoritySmuggle: ModelResponse = {
  content: "x",
  toolCalls: [],
  // @ts-expect-error ModelResponse must not accept AuthorityDecision
  authority: "ALLOW" as AuthorityDecision,
};
```

**Why NOT APPLICABLE for RI-012 compile-time evidence:**

- This directive lives in the Phase 1B domain contract section, not Phase 2 production modules.
- RI-012 frozen obligation (Master Contract): *"Phase 2 production architecture has no execution dependency on a model provider implementation."*
- The directive proves structural separation between `ModelResponse` and `AuthorityDecision` in domain types. It does **not** demonstrate that Phase 2 inventory/reader/git/metadata/search/snapshot code lacks model-provider execution dependency or repository-content egress.
- Forcing this probe as RI-012 evidence would conflate Phase 1 domain typing with the Phase 2 no-model-boundary audit obligation.

**Primary RI-012 evidence preserved:** Independent Phase 2G source/dist/runtime audit documented in `docs/reports/PHASE_2G_AUDIT_REPORT.md` §5 and enforced by `tests/integration/phase2-architecture-audit.test.ts` (zero model/provider pattern hits in Phase 2 `src/**` and `dist/**`; search module performs no content I/O; executable `child_process` limited to `dist/git/runner.js` `execFile`).

**Intended error confirmed via compile-time probe:** N/A — compile-time probe not used; primary audit evidence stands.

---

## Compile-time sweep (post-restoration)

| Item | Value |
|---|---|
| `@ts-expect-error` directives in TypeScript sources | 64 (all in `tests/domain/type-contracts.ts`) |
| TS2578 unused directive count | 0 |
| `npm run typecheck` | PASS |

**Note:** The Phase 2G audit report recorded 65 directives; recount at E1 finds 64 in repository `.ts` sources. No directive was added or removed during E1.

---

## Full validation

| Check | Result |
|---|---|
| Runtime test total | 437 |
| `npm run test` | PASS |
| `npm run build` | PASS |
| `npm run check` | PASS |
| Source diff after restoration | empty |
| Test diff after restoration | empty |
| Working tree before evidence commit | clean (docs-only change pending) |

---

## Not Validated

- Phase 2 Closure record
- `PHASE_VERIFIED` / Capability Ledger derivation
- Re-execution of the full Phase 2G integration audit (not required for this evidence supplement)
