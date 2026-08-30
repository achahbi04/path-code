/**
 * Path Code package entrypoint.
 *
 * Phase 1A exposes only the runtime compatibility contract.
 * No process side effects occur on import.
 */

export {
  MINIMUM_SUPPORTED_NODE_MAJOR,
  evaluateNodeVersion,
  isNodeVersionSupported,
  parseNodeVersion,
  type NodeVersionEvaluation,
  type ParsedNodeVersion,
} from "./core/runtime.js";
