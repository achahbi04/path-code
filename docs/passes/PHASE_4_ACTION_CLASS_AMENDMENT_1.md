# PATH CODE — PHASE 4 ACTION CLASS AMENDMENT 1

**Amendment ID:** PHASE_4_ACTION_CLASS_AMENDMENT_1  
**Status:** Additive foundation amendment for Phase 4 execution  
**Amends:** Phase 1E ActionClass vocabulary as closed in `docs/PHASE_1_FOUNDATION_CLOSURE.md`, as extended by `docs/PHASE_1_ACTION_CLASS_AMENDMENT_1.md`  
**Baseline HEAD at amendment authorship:** `c23f08feb848c576bbfb5ffc352824bf7d1ee0af`  
**Governing Master:** `docs/passes/PHASE_4_EXECUTION_MASTER.md`

The original Phase 1 / Phase 1 Action Class Amendment 1 documents remain immutable. This amendment is read **together with** those sources.

---

## 1. Exact new ActionClass token

**New token:** `EXECUTE_PROCESS`

**Naming convention:** SCREAMING_SNAKE, matching existing Phase 1E wire tokens.

**Semantic meaning:**

Disables **explicitly authorized, non-interactive local process execution** through the Path Code execution engine (`src/execution/**`).

It does **not**:

- mean shell execution (`shell: true`, shell command strings);
- mean privileged/system execution (`PRIVILEGED_EXECUTION`, `SYSTEM_LEVEL_OPERATION`);
- mean deployment (`DEPLOYMENT`);
- mean PTY / interactive stdin;
- mean browser, remote, database, or network product features;
- grant model authority;
- imply semantic success of tests/builds from exit code 0.

---

## 2. Phase 4 semantic mapping

| Phase 4 semantic action | ActionClass token |
|---|---|
| Local non-interactive process execution | `EXECUTE_PROCESS` |

Config `disable-action=EXECUTE_PROCESS` must refuse:

- authorization issuance for prepared local process execution;
- pre-spawn re-resolved policy checks at execute time.

---

## 3. Why existing tokens were not reused

Mapping generic local process execution onto `TARGETED_TEST`, `TYPECHECK`, `LINT`, `BUILD`, `PRIVILEGED_EXECUTION`, or `SYSTEM_LEVEL_OPERATION` would overload semantically different classes (same class of defect as CREATE_FILE→EDIT).

Those tokens may later classify higher-level validation *intent*; they are not the generic local-process authority token.

---

## 4. Backward compatibility

- All old ActionClass values retain exact meaning.
- Unknown `disable-action` values remain fail-closed / rejected per current config semantics.
- Additive only: one new known token.
- No wildcard / general policy engine.

---

## 5. Direct consumers

- `src/domain/authority.ts` — `ActionClass` union
- `src/config/parser.ts` — `ACTION_CLASSES` set
- `src/execution/policy.ts` — disable-action mapping for process execution
