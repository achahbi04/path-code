# S4.3 Mac reboot — operator acceptance

**STATUS: PENDING OPERATOR** (Cursor completed autonomous host-restart simulation)

S4.1 and S4.2 remain frozen. This is the only acceptance step Cursor cannot fully self-observe across its own host death.

## Goal

Prove a PATH task survives a real Mac restart and continues as the **same** taskId with coherent history/report/result.

## Preflight (once)

1. PATH Code checkout with working auth for at least one engine (Cursor preferred if available).
2. Open a real Git project in Terminal.
3. Note runtime root is under `~/.path-code/runtime/…` (do not delete it across reboot).

## Procedure (short / deterministic)

1. Start PATH in the project: `pathcode` (or your installed entry).
2. Start a **bounded** engineering task, e.g.  
   `Create a file S4_REBOOT_ACCEPTANCE.md with one line: reboot-proof. Do not modify other files.`
3. Wait until you see durable progress (engineering stream active / file created or clearly in progress). Prefer waiting until the worktree has the new file or PATH has written a checkpoint mid-task.
4. **Do not** `/stop` or `/exit` to “finish” — leave the task in progress.
5. **Reboot the Mac** (Apple menu → Restart).
6. After login, open the **same project** and start PATH again.
7. Confirm PATH shows an **Interrupted engineering task** card with:
   - same task id
   - objective
   - continuity state (`interrupted` / recoverable)
   - `/resume <taskId>` guidance
8. Run `/resume` (or `/resume <taskId>`).
9. Let PATH continue; finish to a verified/coherent result.
10. Confirm:
    - **same taskId**
    - `/history` and `/inspect <taskId>` still refer to that task
    - report/result remain attached
    - worktree/Git changes from before reboot are not lost
    - PATH did **not** silently mint a new task

## Pass criteria

- [ ] Interrupted task discovered on reopen without manual reconstruction
- [ ] `/resume` continues the **same** taskId
- [ ] Native resume used only if PATH reports it; otherwise honest rehydrate
- [ ] History / inspect / report coherent
- [ ] No orphan “second task” for the same work

## Fail / stop

If PATH opens clean with **no** recoverable notice despite an in-progress task before reboot, capture `~/.path-code/runtime/.../metadata/tasks/*.checkpoint.json` for that taskId and stop.

## After PASS

Operator records acceptance → **FREEZE S4**.  
PATH Build = S5. PATH Studio = S6.
