# Foundation Extensibility Constitution V1 — Amendment 1
## Public Authority Surfaces

**Status:** FROZEN additive amendment  
**Amends:** `docs/FOUNDATION_EXTENSIBILITY_CONSTITUTION_V1.md` at commit  
`a73a623cfed77d2c2dc0238d386d40d4d1595065`  
**Governing package:** `docs/passes/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_CONTRACT.md`  
**Census:** `docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_CENSUS.md`

The original Constitution remains immutable. This document adds one defect pattern,
one pass-writer obligation, and one proportional standing guard. It does not rewrite
historical Constitution text.

---

## 1. Source headings amended (resolved at Constitution freeze)

This amendment extends and binds the following frozen headings from Constitution V1
at `a73a623cfed77d2c2dc0238d386d40d4d1595065`:

| Constitution heading | Section |
|---|---|
| Pass-writer obligations | §5 |
| Proportional amendment protocol | §6 |
| Pass contracts become repository artifacts | §9 |
| Single source of truth for gaps | §12 |

Related frozen headings that remain in force for downstream stages:

| Constitution heading | Section |
|---|---|
| Default development rhythm | §0 (under Governing balance) |
| Integration-audit responsibility | §11 |
| One bounded baseline audit before Phase 4 | §10 |

---

## 2. Defect pattern — PUBLIC_AUTHORITY_SURFACE_LEAK

**Name:** `PUBLIC_AUTHORITY_SURFACE_LEAK`

**Meaning:**

An internal authority issuer, brand constructor, mutable registry capability,
filesystem operation set, adapter, executor, binding, loader, verifier, fault
seam, or other substitute for a frozen mechanism is reachable through a
supported public API as:

- an export;
- an accepted parameter or nested property;
- an undeclared runtime argument;
- a return value;
- a public package subpath.

This name is a constitutional defect pattern.

It does **not** create a new Gap Ledger `reviewClassification` or lifecycle value.

Each concrete instance still uses the existing Gap Ledger classification
vocabulary, normally `BLOCKING_INVARIANT` when it permits authority/mechanism
substitution.

If the machine-readable Gap Ledger already contains a compatible defect-class
field, record the pattern there. If it does not, record
`PUBLIC_AUTHORITY_SURFACE_LEAK` in the gap title/description and reports.

### Supported public surface

The supported public surface is determined mechanically from:

- package.json main/types/exports/subpath exports;
- package-root runtime exports;
- public barrel exports;
- public declaration entry points;
- documented supported API.

It includes:

- every declared parameter of a public function;
- every nested property of a public options/input object;
- callbacks and callable properties;
- adapters, bindings, operation sets, loaders, readers, writers, runners,
  transports, clients, and executors;
- index signatures;
- rest parameters;
- any/unknown escape hatches later narrowed into authority-bearing values;
- extra JavaScript arguments or undeclared option properties that runtime code
  reads or forwards;
- authority-bearing values returned to the caller.

**Clarify:**

- “Not exported as a named symbol” does **not** mean “not publicly reachable.”
- Arbitrary emitted `dist` files blocked by a restrictive package exports map
  are **not** automatically a supported public surface.

---

## 3. Pass-writer obligation 8.8

**PUBLIC CALLABLE SURFACE IS COMPLETE AUTHORITY SURFACE**

This obligation is additive to Constitution §5 Pass-writer obligations.

Every contract that introduces or modifies a public function must state:

1. complete parameter list;
2. complete public options/input shape;
3. whether any parameter/property is callable;
4. whether any input can substitute for a frozen mechanism;
5. behavior of extra JavaScript arguments / unknown option fields;
6. package / declaration / barrel reachability;
7. runtime proof for authority-sensitive wrappers.

“Not exported” is not sufficient when a public function accepts the value.

A public function may accept a callable/callback only when:

- the capability explicitly requires it;
- the contract names its authority and limits;
- it cannot substitute for a frozen authority/mechanism;
- it has targeted tests;
- it is listed in the approved public callable-surface manifest.

A pass contract is defective under Constitution §5 if it introduces or modifies a
public function without satisfying this obligation where authority-sensitive.

---

## 4. Standing guard — proportional requirement

Under Constitution §6 Proportional amendment protocol (always-required proof /
falsification that makes the amendment load-bearing), Path Code requires **one**
standing architecture guard that runs in `npm run check`.

The guard must:

**A.** derive supported public entry points from package metadata/barrels;

**B.** parse public `.d.ts` with the TypeScript compiler API or equivalent
existing dev tooling;

**C.** produce a deterministic public callable-surface manifest containing every
public function’s parameters and relevant user-defined option properties;

**D.** fail on an unreviewed public parameter/property that contains:

- a user-defined call signature;
- operation / adaptor / bindings / executor / loader / reader / writer /
  verifier shape;
- a type originating from internal authority modules;
- any / unknown / index / rest escape in an authority-sensitive operation;

**E.** permit only explicit approved exceptions with:

- function + parameter;
- governing frozen contract;
- reason it is ordinary behavior rather than mechanism substitution;
- targeted test;

**F.** inspect runtime/public wrappers for known hidden-input patterns:
`arguments`, rest forwarding, whole-options spreading into internal authority
functions;

**G.** verify the package export map does not expose internal authority modules.

Do not recursively inspect library data types such as `Buffer` methods and create
false positives. Inspect the user-defined public parameter/option graph.

Implementation of this guard is deferred to the Stage 3 correction package that
internalizes confirmed Phase 3 instances. This amendment freezes the requirement;
it does not ship the guard by itself.

---

## 5. Historical instances

### Phase 3 (mechanically confirmed by census)

Recorded at Stage 1 census HEAD `696ef4fe58c21cdd527869309a2b9fd5abcd19a8` and
supersession commit `eabbc19da3916e050f9015fafdd8735026a17b45`:

| Instance | Introducing commit | Gap |
|---|---|---|
| `replaceExistingFile` public `fsOps` | `76d106724a129a4101981db88c7c1a4d086fb100` | GAP-048 |
| `createFile` public `fsOps` | `5deb63e96d9a11d44410e02eafe950d562032cbf` | GAP-049 |
| `executeMultiFilePlan` public `targetOps` | `4fd4567e1ed2b9e5bef303fb6bb90a23d83927d9` | GAP-050 |

### Phase 1C canonical-path exposure analogy

Omitted. Immutable repository evidence was not mechanically re-proven in this
amendment package to classify a Phase 1C event under
`PUBLIC_AUTHORITY_SURFACE_LEAK`. Chat is not evidence.

---

## 6. Gap Ledger relationship

Under Constitution §12 Single source of truth for gaps:

- this amendment defines the **rule**;
- GAP-048 / GAP-049 / GAP-050 / GAP-051 record the **live findings**.

Pass contracts remain repository artifacts under Constitution §9; the governing
hardening contract is stored at:

`docs/passes/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_CONTRACT.md`

---

## 7. What this amendment does not do

- does not rewrite Constitution V1 text in place;
- does not invent new Gap Ledger schema fields solely for this pattern;
- does not promote `safe-editing`;
- does not close Phase 3;
- does not implement production corrections (Stage 3);
- does not start Phase 4.
