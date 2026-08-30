/**
 * Narrow policy boundary contract.
 * Declaration only — no engine, rules, config, or prompting.
 */

import type {
  ActionClass,
  AuthorityDecision,
  RiskClassification,
} from "./authority.js";

/**
 * Minimal structured context for a future policy decision.
 */
export type PolicyActionContext = {
  readonly actionClass: ActionClass;
  readonly risk: RiskClassification;
};

/**
 * Future policy systems implement this interface.
 * Phase 1B declares the boundary only.
 */
export interface PolicyContract {
  decide(context: PolicyActionContext): AuthorityDecision;
}
