#!/usr/bin/env node
/**
 * Fake AG1 JSONL bridge for same-session continue proofs.
 * Mirrors bridge_main.py continue loop without Antigravity.
 *
 * Protocol (stdout JSONL):
 *   start    → started, finished(summary="initial done"), wait
 *   continue → activity(repairing), finished(summary="repaired")
 *   done/close → exit 0
 *
 * Echoes the continue payload on stderr as CONTINUE_TEXT=<json> for assertions.
 */
import { createInterface } from "node:readline";

/** @param {Record<string, unknown>} obj */
function emit(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

/** @param {string} msg */
function diag(msg) {
  process.stderr.write(`${msg}\n`);
}

let taskId = "unknown";
/** @type {"idle" | "awaiting_signal" | "busy"} */
let phase = "idle";

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", (line) => {
  const raw = String(line || "").trim();
  if (!raw) return;

  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    diag(`ignored non-json: ${raw.slice(0, 120)}`);
    return;
  }
  if (!msg || typeof msg !== "object") return;

  const mtype = msg.type;
  if (mtype === "start") {
    taskId = typeof msg.taskId === "string" ? msg.taskId : "unknown";
    phase = "busy";
    emit({ type: "started", taskId, workspace: msg.workspace ?? "" });
    emit({ type: "finished", taskId, summary: "initial done" });
    phase = "awaiting_signal";
    return;
  }

  if (mtype === "continue") {
    const text = typeof msg.text === "string" ? msg.text : String(msg.text ?? "");
    // Side-channel for tests: prove the exact continue payload arrived.
    diag(`CONTINUE_TEXT=${JSON.stringify(text)}`);
    if (phase !== "awaiting_signal") {
      diag(`continue ignored; phase=${phase}`);
      return;
    }
    phase = "busy";
    emit({
      type: "activity",
      taskId,
      activity: "repairing",
      detail: "same-session repair",
    });
    emit({ type: "finished", taskId, summary: "repaired" });
    phase = "awaiting_signal";
    return;
  }

  if (mtype === "done" || mtype === "close") {
    diag(`${mtype} received`);
    rl.close();
    process.exit(0);
  }

  if (mtype === "cancel") {
    emit({ type: "cancelled", taskId });
    rl.close();
    process.exit(0);
  }
});

rl.on("close", () => {
  process.exit(0);
});
