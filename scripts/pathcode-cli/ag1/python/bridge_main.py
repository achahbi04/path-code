#!/usr/bin/env python3
"""PATH AG1 — Antigravity JSONL bridge (stdout = protocol only)."""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import re
import sys
import traceback
from pathlib import Path
from typing import Any

# stderr-only diagnostics; never write human logs to stdout.
def _diag(msg: str) -> None:
    sys.stderr.write(msg.rstrip() + "\n")
    sys.stderr.flush()


def _emit(obj: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj, separators=(",", ":"), ensure_ascii=True) + "\n")
    sys.stdout.flush()


def _activity_for_tool(name: str, args: dict[str, Any] | None = None) -> str:
    n = (name or "").lower()
    args = args or {}
    cmd = str(args.get("CommandLine") or args.get("command") or "").lower()
    if n in ("view_file", "list_directory", "find_file", "search_directory"):
        return "inspecting"
    if n in ("edit_file", "create_file"):
        return "editing"
    if n == "run_command":
        if any(t in cmd for t in ("test", "vitest", "pytest", "jest", "mocha")):
            return "testing"
        if any(t in cmd for t in ("tsc", "typecheck", "mypy", "eslint", "lint")):
            return "testing"
        if any(t in cmd for t in ("build", "compile")):
            return "testing"
        return "running_command"
    if n == "finish":
        return "complete"
    if n in ("ask_question",):
        return "understanding"
    return "inspecting"


_HIGH_RISK_PATTERNS = [
    re.compile(r"\bgit\s+push\b", re.I),
    re.compile(r"\bgit\s+remote\b", re.I),
    re.compile(r"\bdeploy\b", re.I),
    re.compile(r"\bpublish\b", re.I),
    re.compile(r"\bterraform\s+apply\b", re.I),
    re.compile(r"\bgcloud\s+", re.I),
    re.compile(r"\baws\s+", re.I),
    re.compile(r"\bkubectl\s+", re.I),
    re.compile(r"\bdocker\s+(push|login)\b", re.I),
    re.compile(r"\bnpm\s+publish\b", re.I),
]


def _is_high_risk_command(command_line: str) -> bool:
    return any(p.search(command_line or "") for p in _HIGH_RISK_PATTERNS)


def _resolve_under(root: Path, candidate: str | None) -> Path | None:
    if candidate is None or str(candidate).strip() == "":
        return root.resolve()
    p = Path(candidate).expanduser()
    if not p.is_absolute():
        p = (root / p).resolve()
    else:
        p = p.resolve()
    return p


def _is_within(root: Path, path: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


class BridgeState:
    def __init__(self) -> None:
        self.cancel_requested = asyncio.Event()
        self.agent = None
        self.task: asyncio.Task | None = None
        self.workspace: Path | None = None
        self.allow_shell = True


STATE = BridgeState()


async def _run_engineering_task(payload: dict[str, Any]) -> None:
    from google.antigravity import Agent, LocalAgentConfig
    from google.antigravity.hooks import PostToolCallHook, PreToolCallDecideHook, policy
    from google.antigravity.hooks.hooks import HookResult
    from google.antigravity.types import (
        AgentBehavior,
        BudgetConfig,
        BuiltinTools,
        CapabilitiesConfig,
        RunCommandConfig,
        ToolCall,
    )

    task_id = payload.get("taskId") or "unknown"
    workspace = Path(payload["workspace"]).resolve()
    task_text = payload.get("task") or ""
    budget = payload.get("budget") or {}
    allow_shell = bool(payload.get("allowShell", True))
    STATE.workspace = workspace
    STATE.allow_shell = allow_shell

    max_model_calls = int(budget.get("maxModelCalls") or 48)
    max_tool_calls = int(budget.get("maxToolCalls") or 200)
    wall_ms = int(budget.get("wallClockMs") or 1_200_000)

    # Limited env: keep PATH/HOME/locale and auth vars the SDK needs; drop unrelated secrets.
    limited_env: dict[str, str] = {}
    keep_keys = (
        "PATH",
        "HOME",
        "USER",
        "LANG",
        "LC_ALL",
        "LC_CTYPE",
        "TZ",
        "TMPDIR",
        "TMP",
        "TEMP",
        "TERM",
        "SHELL",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "GOOGLE_GENAI_USE_VERTEXAI",
        "GOOGLE_GENAI_USE_ENTERPRISE",
        "GOOGLE_CLOUD_PROJECT",
        "GOOGLE_CLOUD_LOCATION",
        "GOOGLE_APPLICATION_CREDENTIALS",
        "CLOUDSDK_CORE_PROJECT",
    )
    for key in keep_keys:
        val = os.environ.get(key)
        if isinstance(val, str) and val != "":
            limited_env[key] = val
    # AG3 noninteractive engineering guards (never global CI=true).
    limited_env["GIT_TERMINAL_PROMPT"] = "0"
    limited_env["GCM_INTERACTIVE"] = "never"
    limited_env["PATHCODE_NONINTERACTIVE"] = "1"

    class CwdConfineHook(PreToolCallDecideHook):
        async def run(self, context, data: ToolCall) -> HookResult:  # type: ignore[override]
            del context
            name = data.name or ""
            args = dict(data.args or {})
            if name == BuiltinTools.RUN_COMMAND.value or name == "run_command":
                if not STATE.allow_shell:
                    return HookResult(
                        allow=False,
                        message="Autonomous shell is unavailable: sandbox confinement not proven.",
                    )
                cmd = str(args.get("CommandLine") or args.get("command") or "")
                if _is_high_risk_command(cmd):
                    return HookResult(
                        allow=False,
                        message="High-impact external command denied for this engineering session.",
                    )
                # AG3: block known interactive-only commands before they hang PATH.
                interactive_patterns = (
                    r"\bpython3?\s+-i\b",
                    r"\bnode\s+(?:--interactive|-i)\b",
                    r"\birb\b",
                    r"\bprisma\s+studio\b",
                    r"\b(?:vim|nvim|nano|less|more)\b",
                    r"\bgit\s+add\s+-p\b",
                    r"\bgit\s+rebase\s+-i\b",
                )
                for pat in interactive_patterns:
                    if re.search(pat, cmd, re.I):
                        return HookResult(
                            allow=False,
                            message=(
                                "INTERACTIVE_COMMAND_BLOCKED: interactive command "
                                "refused for autonomous engineering. Prefer "
                                "noninteractive flags when available."
                            ),
                        )
                cwd_raw = args.get("Cwd") or args.get("cwd")
                resolved = _resolve_under(workspace, str(cwd_raw) if cwd_raw is not None else None)
                if resolved is None or not _is_within(workspace, resolved):
                    return HookResult(
                        allow=False,
                        message="Command Cwd is outside the task workspace and was refused.",
                    )
                # Force canonical Cwd inside the worktree.
                return HookResult(
                    allow=True,
                    modified_args={**args, "Cwd": str(workspace)},
                )
            # File tools are workspace-scoped by harness + workspace_only policy.
            return HookResult(allow=True)

    class ObserveToolHook(PostToolCallHook):
        async def run(self, context, data) -> None:  # type: ignore[override]
            del context
            try:
                # PostToolCallHook receives ToolResult (name/result/…).
                name = getattr(data, "name", "") or ""
                result_text = str(getattr(data, "result", "") or "")
                activity = _activity_for_tool(str(name), {"CommandLine": result_text})
                kind = (
                    "command"
                    if "run_command" in str(name)
                    else "file_edit"
                    if "edit" in str(name) or "create" in str(name)
                    else "inspect"
                )
                if activity == "testing":
                    kind = "test"
                _emit(
                    {
                        "type": "activity",
                        "taskId": task_id,
                        "activity": activity,
                        "tool": str(name),
                    }
                )
                summary = f"{name} {result_text}".strip()[:400]
                _emit(
                    {
                        "type": "tool",
                        "taskId": task_id,
                        "kind": kind,
                        "tool": str(name),
                        "summary": summary,
                    }
                )
            except Exception as exc:  # noqa: BLE001
                _diag(f"observe hook error: {exc!r}")

    enabled = [
        BuiltinTools.LIST_DIR,
        BuiltinTools.SEARCH_DIR,
        BuiltinTools.FIND_FILE,
        BuiltinTools.VIEW_FILE,
        BuiltinTools.CREATE_FILE,
        BuiltinTools.EDIT_FILE,
        BuiltinTools.FINISH,
    ]
    if allow_shell:
        enabled.append(BuiltinTools.RUN_COMMAND)

    policies = [
        *policy.workspace_only([str(workspace)]),
        policy.deny(BuiltinTools.SEARCH_WEB.value),
        policy.deny(BuiltinTools.READ_URL_CONTENT.value),
        policy.deny(BuiltinTools.GENERATE_IMAGE.value),
        policy.deny(BuiltinTools.ASK_QUESTION.value),
        policy.deny(BuiltinTools.START_SUBAGENT.value),
        policy.allow(BuiltinTools.LIST_DIR.value),
        policy.allow(BuiltinTools.SEARCH_DIR.value),
        policy.allow(BuiltinTools.FIND_FILE.value),
        policy.allow(BuiltinTools.VIEW_FILE.value),
        policy.allow(BuiltinTools.CREATE_FILE.value),
        policy.allow(BuiltinTools.EDIT_FILE.value),
        policy.allow(BuiltinTools.FINISH.value),
    ]
    if allow_shell:
        policies.append(policy.allow(BuiltinTools.RUN_COMMAND.value))
    else:
        policies.append(policy.deny(BuiltinTools.RUN_COMMAND.value))

    # Deny-by-default for anything else.
    policies.insert(0, policy.deny_all())

    system_instructions = (
        "You are the PATH engineering engine. Complete the coding task inside the "
        "configured workspace only. Investigate, edit, run tests/typechecks/builds "
        "as needed, diagnose failures, and correct your own work. Do not push to "
        "remotes, deploy, or access secrets outside the workspace. Never run "
        "interactive prompts (editors, REPLs, git add -p). Prefer noninteractive "
        "flags such as --yes / --non-interactive when a tool requires confirmation. "
        "When finished, use the finish tool. Do not ask the operator clarifying "
        "questions."
    )

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    project = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get(
        "CLOUDSDK_CORE_PROJECT"
    )
    location = os.environ.get("GOOGLE_CLOUD_LOCATION") or "us-central1"
    # Default to a model known to work on Agent Platform; override via AG1_MODEL.
    model_name = (
        os.environ.get("AG1_MODEL")
        or os.environ.get("GOOGLE_CLOUD_MODEL")
        or "gemini-2.5-flash"
    )
    use_vertex = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in (
        "true",
        "1",
    ) or os.environ.get("GOOGLE_GENAI_USE_ENTERPRISE", "").lower() in ("true", "1")
    # Prefer Vertex/ADC whenever a cloud project is configured. A present
    # GEMINI_API_KEY may be invalid for Express mode and must not win.
    if project:
        use_vertex = True

    config_kwargs: dict[str, Any] = {
        "system_instructions": system_instructions,
        "workspaces": [str(workspace)],
        "env": limited_env,
        "model": model_name,
        "capabilities": CapabilitiesConfig(
            agent_behavior=AgentBehavior.AUTONOMOUS,
            enable_subagents=False,
            enabled_tools=enabled,
            run_command_config=RunCommandConfig(
                enable_sandbox=True,
                timeout_seconds=float(budget.get("commandTimeoutSeconds") or 300),
            ),
        ),
        "policies": policies,
        "hooks": [CwdConfineHook(), ObserveToolHook()],
        "budget_config": BudgetConfig(
            max_model_calls=max_model_calls,
            max_tool_calls=max_tool_calls,
        ),
    }
    if use_vertex and project:
        config_kwargs["vertex"] = True
        config_kwargs["project"] = project
        config_kwargs["location"] = location
        _diag(f"auth_mode=vertex project={project} location={location} model={model_name}")
    elif api_key:
        config_kwargs["api_key"] = api_key
        config_kwargs["vertex"] = False
        _diag(f"auth_mode=api_key model={model_name}")
    else:
        _emit(
            {
                "type": "failed",
                "taskId": task_id,
                "code": "AG1_AUTH_FAILED",
                "message": "No Vertex project/ADC and no GEMINI_API_KEY for engineering.",
            }
        )
        return

    config = LocalAgentConfig(**config_kwargs)

    _emit({"type": "activity", "taskId": task_id, "activity": "understanding"})

    try:
        async with Agent(config) as agent:
            STATE.agent = agent
            _emit({"type": "started", "taskId": task_id, "workspace": str(workspace)})

            async def _watch_cancel() -> None:
                await STATE.cancel_requested.wait()
                try:
                    await agent.conversation.connection.cancel()
                except Exception as exc:  # noqa: BLE001
                    _diag(f"cancel via connection failed: {exc!r}")

            cancel_watcher = asyncio.create_task(_watch_cancel())
            try:
                prompt = (
                    f"Engineering task:\n{task_text}\n\n"
                    f"Workspace: {workspace}\n"
                    "Stay inside this workspace. You MUST investigate the repository, "
                    "edit files as needed to complete the task, and run the project's "
                    "existing test/typecheck scripts while debugging. Do not stop after "
                    "only reading files — implement the fix."
                )
                response = await asyncio.wait_for(
                    agent.chat(prompt), timeout=wall_ms / 1000.0
                )

                async def _drain_tools() -> None:
                    try:
                        async for call in response.tool_calls:
                            name = getattr(call, "name", "") or ""
                            args = dict(getattr(call, "args", None) or {})
                            _emit(
                                {
                                    "type": "activity",
                                    "taskId": task_id,
                                    "activity": _activity_for_tool(str(name), args),
                                    "tool": str(name),
                                }
                            )
                    except asyncio.CancelledError:
                        raise
                    except Exception as exc:  # noqa: BLE001
                        _diag(f"tool_calls stream: {exc!r}")
                        raise

                async def _drain_text() -> str:
                    return await response.text()

                tools_task = asyncio.create_task(_drain_tools())
                try:
                    # Shield the response drain so harness teardown CancelledError
                    # cannot swallow a real engine/auth failure mid-flight.
                    text = await asyncio.shield(_drain_text())
                except Exception as exc:  # noqa: BLE001
                    tools_task.cancel()
                    with contextlib.suppress(Exception):
                        await tools_task
                    raise RuntimeError(f"engineering response failed: {exc!r}") from exc
                with contextlib.suppress(Exception):
                    await tools_task

                if STATE.cancel_requested.is_set():
                    _emit({"type": "cancelled", "taskId": task_id})
                    return

                _emit(
                    {
                        "type": "finished",
                        "taskId": task_id,
                        "summary": (text or "")[:2000],
                    }
                )
            finally:
                cancel_watcher.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await cancel_watcher
    except asyncio.TimeoutError:
        _emit(
            {
                "type": "failed",
                "taskId": task_id,
                "code": "BUDGET_WALL_CLOCK",
                "message": "Task exceeded wall-clock budget.",
            }
        )
    except asyncio.CancelledError:
        if STATE.cancel_requested.is_set():
            _emit({"type": "cancelled", "taskId": task_id})
            raise
        # Harness/SDK sometimes cancels the host task on connection death
        # (notably 401). Treat as engine failure unless PATH asked to cancel.
        _diag("unexpected CancelledError without cancel_requested")
        _diag(traceback.format_exc())
        _emit(
            {
                "type": "failed",
                "taskId": task_id,
                "code": "AG1_ENGINE_CANCELLED",
                "message": "Engineering session terminated unexpectedly.",
            }
        )
    except Exception as exc:  # noqa: BLE001
        _diag(traceback.format_exc())
        msg = repr(exc)
        code = "ENGINE_ERROR"
        if "401" in msg or "authentication" in msg.lower() or "credentials" in msg.lower():
            code = "AG1_AUTH_FAILED"
        _emit(
            {
                "type": "failed",
                "taskId": task_id,
                "code": code,
                "message": msg[:800],
            }
        )
    finally:
        STATE.agent = None


def _isolate_protocol_stdin() -> int:
    """Dup Node's JSONL pipe off fd 0 so the Antigravity harness cannot steal it.

    The local harness is spawned with close_fds semantics that still inherit
    fds 0/1/2. If fd 0 remains the PATH↔bridge protocol pipe, the harness may
    read/close it and our asyncio readline sees EOF — which previously cancelled
    the engineering task mid-flight (false cancelled, hiding real auth/engine
    errors). Point fd 0 at /dev/null for children; read commands from the dup.
    """
    protocol_fd = os.dup(0)
    try:
        devnull = os.open(os.devnull, os.O_RDONLY)
        try:
            os.dup2(devnull, 0)
        finally:
            os.close(devnull)
    except OSError as exc:
        _diag(f"protocol stdin isolate failed: {exc!r}")
    return protocol_fd


async def _stdin_loop() -> None:
    protocol_fd = _isolate_protocol_stdin()
    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    proto_file = os.fdopen(protocol_fd, "rb", buffering=0, closefd=True)
    await loop.connect_read_pipe(lambda: protocol, proto_file)
    _diag("protocol stdin isolated from fd0")

    while True:
        line = await reader.readline()
        if not line:
            _diag("protocol stdin EOF")
            break
        raw = line.decode("utf-8", errors="replace").strip()
        if raw == "":
            continue
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            _diag(f"ignored non-json stdin line: {raw[:200]!r}")
            continue
        if not isinstance(msg, dict):
            _diag("ignored non-object stdin json")
            continue
        mtype = msg.get("type")
        if mtype == "start":
            if STATE.task and not STATE.task.done():
                _emit(
                    {
                        "type": "failed",
                        "taskId": msg.get("taskId"),
                        "code": "BUSY",
                        "message": "A task is already running.",
                    }
                )
                continue
            STATE.cancel_requested.clear()
            STATE.task = asyncio.create_task(_run_engineering_task(msg))
        elif mtype == "cancel":
            _diag("cancel command received")
            STATE.cancel_requested.set()
            if STATE.task and not STATE.task.done():
                STATE.task.cancel()
        elif mtype == "close":
            _diag("close command received")
            STATE.cancel_requested.set()
            if STATE.task and not STATE.task.done():
                STATE.task.cancel()
                with contextlib.suppress(Exception):
                    await STATE.task
            break
        else:
            _diag(f"unknown command type: {mtype!r}")

    # Protocol EOF / loop end: wait for in-flight engineering to finish.
    # Do NOT cancel — orphan cleanup is the parent's close/cancel/SIGTERM job.
    # Cancelling on EOF was the false-cancelled production failure mode.
    if STATE.task and not STATE.task.done():
        _diag("protocol closed; awaiting in-flight engineering task")
        with contextlib.suppress(Exception):
            await STATE.task


def main() -> None:
    try:
        asyncio.run(_stdin_loop())
    except KeyboardInterrupt:
        _diag("interrupted")
        sys.exit(130)


if __name__ == "__main__":
    main()
