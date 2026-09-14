#!/usr/bin/env node
/**
 * G9 — minimal stdio MCP server for SCIP / symbol-map queries.
 * Tools (read_only): code_definition, code_references, code_search_symbol
 *
 * Uses @modelcontextprotocol/sdk when present under node_modules; otherwise
 * a Content-Length JSON-RPC loop compatible with MCP stdio clients.
 *
 * Env:
 *   PATHCODE_SCIP_INDEX_DIR — index directory from ensureScipIndex
 */

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInterface } from "node:readline";

const TOOLS = [
  {
    name: "code_definition",
    description: "Find definition locations for a symbol (read-only SCIP/symbol map).",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol name to resolve" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "code_references",
    description: "Find reference locations for a symbol (read-only).",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol name" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "code_search_symbol",
    description: "Search symbols by substring (read-only).",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Substring / pattern" },
        query: { type: "string", description: "Alias for symbol" },
      },
    },
  },
];

/**
 * @returns {string | null}
 */
function indexDirFromEnv() {
  const d = process.env.PATHCODE_SCIP_INDEX_DIR;
  return typeof d === "string" && d.trim() ? d.trim() : null;
}

/**
 * Dynamically load queryScipIndex from sibling module.
 */
async function loadQuery() {
  const here = dirname(fileURLToPath(import.meta.url));
  const mod = await import(pathToFileURL(join(here, "scip.mjs")).href);
  return mod.queryScipIndex;
}

/**
 * @param {string} name
 * @param {Record<string, unknown>} args
 */
async function handleTool(name, args) {
  const indexDir = indexDirFromEnv();
  if (!indexDir) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ok: false,
            reason: "PATHCODE_SCIP_INDEX_DIR unset",
          }),
        },
      ],
      isError: true,
    };
  }

  const symbol =
    (typeof args.symbol === "string" && args.symbol) ||
    (typeof args.query === "string" && args.query) ||
    "";

  const op =
    name === "code_definition"
      ? "definition"
      : name === "code_references"
        ? "references"
        : "search";

  const queryScipIndex = await loadQuery();
  const result = queryScipIndex({ indexDir, op, symbol });
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    isError: result.ok === false,
  };
}

/**
 * Try MCP SDK Server if installed in repo or nearby node_modules.
 * @returns {Promise<boolean>} true if SDK handled the process
 */
async function trySdkMain() {
  const require = createRequire(import.meta.url);
  /** @type {string[]} */
  const candidates = [
    "@modelcontextprotocol/sdk/server/mcp.js",
    "@modelcontextprotocol/sdk/server/index.js",
  ];
  for (const id of candidates) {
    try {
      require.resolve(id);
    } catch {
      continue;
    }
    try {
      // Best-effort modern SDK shape; fall through to JSON-RPC on any failure.
      const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
      const {
        StdioServerTransport,
      } = require("@modelcontextprotocol/sdk/server/stdio.js");
      const server = new Server(
        { name: "path-scip", version: "1.0.0" },
        { capabilities: { tools: {} } },
      );
      server.setRequestHandler(
        require("@modelcontextprotocol/sdk/types.js").ListToolsRequestSchema,
        async () => ({ tools: TOOLS }),
      );
      server.setRequestHandler(
        require("@modelcontextprotocol/sdk/types.js").CallToolRequestSchema,
        async (request) => {
          const toolName = request.params.name;
          const args = request.params.arguments || {};
          return handleTool(toolName, args);
        },
      );
      const transport = new StdioServerTransport();
      await server.connect(transport);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Write one MCP JSON-RPC message as NDJSON.
 * Antigravity localharness JSON-parses stdout directly; Content-Length
 * responses start with 'C' and fail initialize. Accept Content-Length on
 * input, always reply NDJSON.
 * @param {object} msg
 */
function writeMessage(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

/**
 * Minimal MCP JSON-RPC over stdio (NDJSON + Content-Length input).
 */
async function jsonRpcMain() {
  let buffer = Buffer.alloc(0);

  process.stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    processBuffer();
  });

  async function processBuffer() {
    while (true) {
      // Content-Length framing (standard MCP) — prefer when headers present.
      const headerEndCrLf = buffer.indexOf("\r\n\r\n");
      const headerEndLf = buffer.indexOf("\n\n");
      let headerEnd = -1;
      let sepLen = 4;
      if (headerEndCrLf !== -1 && (headerEndLf === -1 || headerEndCrLf <= headerEndLf)) {
        headerEnd = headerEndCrLf;
        sepLen = 4;
      } else if (headerEndLf !== -1) {
        headerEnd = headerEndLf;
        sepLen = 2;
      }

      if (headerEnd !== -1) {
        const header = buffer.slice(0, headerEnd).toString("utf8");
        const match = /Content-Length:\s*(\d+)/i.exec(header);
        if (match) {
          const len = Number(match[1]);
          const start = headerEnd + sepLen;
          if (buffer.length < start + len) return;
          const body = buffer.slice(start, start + len).toString("utf8");
          buffer = buffer.slice(start + len);
          try {
            const msg = JSON.parse(body);
            await dispatch(msg);
          } catch {
            /* ignore */
          }
          continue;
        }
      }

      // NDJSON / bare JSON lines (Antigravity localharness).
      const nl = buffer.indexOf("\n");
      if (nl === -1) return;
      const line = buffer.slice(0, nl).toString("utf8").trim();
      buffer = buffer.slice(nl + 1);
      if (!line || /^content-length:/i.test(line)) continue;
      try {
        const msg = JSON.parse(line);
        await dispatch(msg);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * @param {any} msg
   */
  async function dispatch(msg) {
    if (!msg || typeof msg !== "object") return;
    const id = msg.id;
    const method = msg.method;

    if (method === "initialize") {
      writeMessage({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "path-scip", version: "1.0.0" },
        },
      });
      return;
    }

    if (method === "notifications/initialized" || method === "initialized") {
      return;
    }

    if (method === "tools/list") {
      writeMessage({
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS },
      });
      return;
    }

    if (method === "tools/call") {
      const name = msg.params?.name;
      const args = msg.params?.arguments || {};
      if (typeof name !== "string" || !TOOLS.some((t) => t.name === name)) {
        writeMessage({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Unknown tool: ${name}` },
        });
        return;
      }
      const result = await handleTool(name, args);
      writeMessage({ jsonrpc: "2.0", id, result });
      return;
    }

    if (method === "ping") {
      writeMessage({ jsonrpc: "2.0", id, result: {} });
      return;
    }

    if (typeof id !== "undefined") {
      writeMessage({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
    }
  }

  // Keep alive for stdin.
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin });
    rl.on("line", async (line) => {
      try {
        await dispatch(JSON.parse(line));
      } catch {
        /* ignore */
      }
    });
  }
}

async function main() {
  // Guard: refuse if index env points at missing path (honest startup).
  const indexDir = indexDirFromEnv();
  if (indexDir && !existsSync(indexDir)) {
    process.stderr.write(
      `path-scip: index dir missing: ${indexDir}\n`,
    );
  }

  const usedSdk = await trySdkMain();
  if (!usedSdk) {
    await jsonRpcMain();
  }
}

main().catch((err) => {
  process.stderr.write(
    `path-scip fatal: ${err instanceof Error ? err.stack || err.message : String(err)}\n`,
  );
  process.exit(1);
});
