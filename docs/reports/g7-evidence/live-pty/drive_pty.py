#!/usr/bin/env python3
"""G7 live PTY capture — real pathcode TUI (not reconstructed frames)."""

from __future__ import annotations

import errno
import fcntl
import json
import os
import pty
import re
import select
import signal
import struct
import termios
import time
from pathlib import Path

REL = Path("/tmp/pathcode-g7-live-pty")
CAPTURE = REL / "capture"
REPO = REL / "repo"
RUNTIME = REL / "runtime"
WT = Path("/Users/achahbi/Projects/path-code-worktrees/cursor-pathcode-antigravity-v1")
CANDIDATE = WT / "scripts" / "pathcode.mjs"

SHOW_CURSOR = b"\x1b[?25h"
EXIT_ALT = b"\x1b[?1049l"
ENTER_ALT = b"\x1b[?1049h"

TASK_CANCEL = (
    "Add divide(a,b) in src/sum.js returning a/b and a node:test divide(8,2)===4. Keep sum.\n"
)
TASK_OK = (
    "Add multiply(a,b) in src/sum.js returning a*b and a node:test multiply(3,4)===12. Keep sum.\n"
)


def set_winsize(fd: int, rows: int, cols: int) -> None:
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


def read_termios_flags(fd: int) -> dict:
    attrs = termios.tcgetattr(fd)
    iflag, oflag, cflag, lflag = attrs[0], attrs[1], attrs[2], attrs[3]
    return {
        "lflag": lflag,
        "echo": bool(lflag & termios.ECHO),
        "icanon": bool(lflag & termios.ICANON),
        "isig": bool(lflag & termios.ISIG),
    }


def strip_ansi_partial(data: bytes) -> str:
    text = data.decode("utf-8", "replace")
    text = re.sub(r"\x1b\[[0-9;?]*[ -/]*[@-~]", "", text)
    text = re.sub(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)", "", text)
    text = text.replace("\r", "")
    return text


def main() -> int:
    CAPTURE.mkdir(parents=True, exist_ok=True)
    raw_path = CAPTURE / "session.typescript"
    log_path = CAPTURE / "session.log"
    summary_path = CAPTURE / "summary.json"
    frames_dir = CAPTURE / "frames"
    frames_dir.mkdir(exist_ok=True)

    env = os.environ.copy()
    env["PATHCODE_RUNTIME_ROOT"] = str(RUNTIME)
    env["TERM"] = "xterm-256color"
    # Force candidate on PATH ahead of public install for any child lookups,
    # but we exec the candidate path explicitly.
    env["PATH"] = f"{WT}:{env.get('PATH', '')}"

    master, slave = pty.openpty()
    set_winsize(slave, 40, 140)
    set_winsize(master, 40, 140)

    pid = os.fork()
    if pid == 0:
        os.close(master)
        os.setsid()
        fcntl.ioctl(slave, termios.TIOCSCTTY, 0)
        os.dup2(slave, 0)
        os.dup2(slave, 1)
        os.dup2(slave, 2)
        if slave > 2:
            os.close(slave)
        os.chdir(str(REPO))
        os.execve(
            "/opt/homebrew/bin/node",
            ["node", str(CANDIDATE)],
            env,
        )

    os.close(slave)

    events: list[dict] = []
    buf = bytearray()
    raw_f = open(raw_path, "wb")
    log_f = open(log_path, "w", encoding="utf-8")
    t0 = time.monotonic()

    def stamp(kind: str, **extra):
        events.append({"t": round(time.monotonic() - t0, 3), "kind": kind, **extra})

    def note(msg: str):
        line = f"[{time.monotonic()-t0:7.3f}] {msg}\n"
        log_f.write(line)
        log_f.flush()
        stamp("note", msg=msg)

    def write_in(data: bytes, label: str):
        os.write(master, data)
        raw_f.write(b"I" + struct.pack(">dI", time.monotonic() - t0, len(data)) + data)
        raw_f.flush()
        stamp("input", label=label, n=len(data))
        note(f"INPUT {label!r} ({len(data)} bytes)")

    def snapshot(name: str):
        plain = strip_ansi_partial(bytes(buf[-120000:]))
        path = frames_dir / f"{name}.txt"
        path.write_text(plain[-8000:], encoding="utf-8")
        stamp("frame", name=name, bytes=len(buf))
        note(f"FRAME {name} plain_chars={len(plain)}")
        return plain

    def wait_until(pred, timeout: float, label: str) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            r, _, _ = select.select([master], [], [], 0.25)
            if master in r:
                try:
                    chunk = os.read(master, 65536)
                except OSError as e:
                    if e.errno == errno.EIO:
                        note(f"PTY EOF during wait for {label}")
                        return False
                    raise
                if not chunk:
                    note(f"empty read during wait for {label}")
                    return False
                buf.extend(chunk)
                raw_f.write(b"O" + struct.pack(">dI", time.monotonic() - t0, len(chunk)) + chunk)
                raw_f.flush()
                if pred(bytes(buf)):
                    note(f"MATCH {label}")
                    return True
            elif pred(bytes(buf)):
                note(f"MATCH {label} (buffered)")
                return True
        note(f"TIMEOUT waiting for {label}")
        return False

    def has_prompt(data: bytes) -> bool:
        plain = strip_ansi_partial(data[-8000:])
        return bool(re.search(r"PATH\s*[●*]\s*Code\s*>\s*$", plain, re.M)) or plain.rstrip().endswith(
            "PATH * Code >"
        ) or plain.rstrip().endswith("PATH ● Code >")

    def in_alt(data: bytes) -> bool:
        # last enter/exit wins
        ei = data.rfind(ENTER_ALT)
        xo = data.rfind(EXIT_ALT)
        return ei > xo

    results = {
        "candidate": str(CANDIDATE),
        "packageRoot": str(WT),
        "projectRoot": str(REPO),
        "runtimeRoot": str(RUNTIME),
        "promptSeen": False,
        "altEntered": False,
        "activitySeen": False,
        "resizeOk": False,
        "cancelRequested": False,
        "promptAfterCancel": False,
        "altExitedAfterCancel": False,
        "secondTaskVerified": False,
        "promptAfterSecond": False,
        "exitAltOnQuit": False,
        "showCursorOnQuit": False,
        "childExitCode": None,
        "primaryUntouched": None,
        "defects": [],
    }

    try:
        note("spawned pathcode in PTY")
        if not wait_until(has_prompt, 60, "initial prompt"):
            results["defects"].append("initial prompt not seen")
            snapshot("fail-initial")
            os.kill(pid, signal.SIGTERM)
        else:
            results["promptSeen"] = True
            snapshot("01-initial-prompt")

            # --- Task 1: cancel mid-flight ---
            write_in(TASK_CANCEL.encode(), "task-cancel")
            if wait_until(lambda d: ENTER_ALT in d or in_alt(d), 90, "alt-screen enter"):
                results["altEntered"] = True
            snapshot("02-after-task1-start")

            def activity(d: bytes) -> bool:
                p = strip_ansi_partial(d)
                return bool(
                    re.search(
                        r"Inspecting|Implementing|Running command|Understanding|Testing|Working",
                        p,
                    )
                )

            if wait_until(activity, 120, "live activity"):
                results["activitySeen"] = True
            snapshot("03-live-activity-wide")

            # Active resize while TUI running
            for rows, cols, tag in ((24, 80, "narrow"), (36, 120, "mid"), (40, 140, "wide")):
                set_winsize(master, rows, cols)
                try:
                    os.kill(pid, signal.SIGWINCH)
                except ProcessLookupError:
                    pass
                time.sleep(0.8)
                # drain
                wait_until(lambda d: True, 0.5, f"drain-resize-{tag}")
                plain = snapshot(f"04-resize-{tag}")
                # after resize, frame should still be coherent enough to contain PATH
                if "PATH" in plain:
                    results["resizeOk"] = True
            note(f"resizeOk={results['resizeOk']}")

            # Cancel via Ctrl-C (raw input path)
            write_in(b"\x03", "ctrl-c-cancel")
            results["cancelRequested"] = True

            if wait_until(lambda d: EXIT_ALT in d[-50000:] or (not in_alt(d) and has_prompt(d)), 90, "exit alt after cancel"):
                results["altExitedAfterCancel"] = EXIT_ALT in bytes(buf) or not in_alt(bytes(buf))
            if wait_until(has_prompt, 90, "prompt after cancel"):
                results["promptAfterCancel"] = True
            snapshot("05-after-cancel-prompt")

            # --- Task 2: successful ---
            write_in(TASK_OK.encode(), "task-ok")
            wait_until(lambda d: ENTER_ALT in d[-80000:] or in_alt(d), 90, "alt for task2")
            snapshot("06-task2-mid")

            def verified(d: bytes) -> bool:
                p = strip_ansi_partial(d[-100000:])
                return "Verified" in p or "VERIFIED" in p

            if wait_until(verified, 240, "verified result"):
                results["secondTaskVerified"] = True
            snapshot("07-task2-verified")

            if wait_until(lambda d: (not in_alt(d)) and has_prompt(d), 90, "prompt after second"):
                results["promptAfterSecond"] = True
            snapshot("08-after-second-prompt")

            write_in(b"/quit\n", "quit")
            # allow restore + exit
            wait_until(lambda d: False, 8, "drain-quit")

    finally:
        # Wait for child
        try:
            wpid, status = os.waitpid(pid, os.WNOHANG)
            if wpid == 0:
                time.sleep(1.5)
                wpid, status = os.waitpid(pid, os.WNOHANG)
            if wpid == 0:
                os.kill(pid, signal.SIGTERM)
                time.sleep(0.5)
                wpid, status = os.waitpid(pid, 0)
            else:
                # already exited; if WNOHANG got it, status set; else wait
                if wpid == 0:
                    wpid, status = os.waitpid(pid, 0)
        except ChildProcessError:
            status = 0
        except Exception as e:
            note(f"wait error: {e}")
            try:
                os.kill(pid, signal.SIGKILL)
            except Exception:
                pass
            status = -1

        if os.WIFEXITED(status):
            results["childExitCode"] = os.WEXITSTATUS(status)
        elif os.WIFSIGNALED(status):
            results["childExitCode"] = 128 + os.WTERMSIG(status)

        final = bytes(buf)
        results["exitAltOnQuit"] = EXIT_ALT in final
        results["showCursorOnQuit"] = SHOW_CURSOR in final
        results["bytesCaptured"] = len(final)
        results["events"] = events

        # Primary untouched
        import subprocess

        head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
        branch = subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=REPO, text=True
        ).strip()
        dirty = subprocess.check_output(["git", "status", "--porcelain"], cwd=REPO, text=True)
        meta_primary = (CAPTURE / "meta.txt").read_text().split("PRIMARY=")[-1].splitlines()[0].strip()
        results["primaryHead"] = head
        results["primaryBranch"] = branch
        results["primaryDirty"] = dirty
        results["primaryUntouched"] = head == meta_primary and branch == "main" and dirty == ""

        snapshot("09-final")
        raw_f.close()
        log_f.close()
        try:
            os.close(master)
        except Exception:
            pass

        summary_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
        print(json.dumps({k: results[k] for k in results if k != "events"}, indent=2))
        return 0 if results.get("secondTaskVerified") and results.get("promptAfterCancel") else 1


if __name__ == "__main__":
    raise SystemExit(main())
