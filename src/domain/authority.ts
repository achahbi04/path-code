/**
 * Authority, action class, and deliberately small risk vocabulary.
 * The model does not control its own authority.
 */

export type ActionClass =
  | "READ"
  | "LIST"
  | "SEARCH"
  | "INSPECT"
  | "EDIT"
  | "TARGETED_TEST"
  | "TYPECHECK"
  | "LINT"
  | "BUILD"
  | "DIAGNOSE"
  | "REPAIR"
  | "REVALIDATE"
  | "PACKAGE_INSTALL"
  | "NETWORK_ACCESS"
  | "SECRET_ACCESS"
  | "OUT_OF_WORKSPACE_ACCESS"
  | "BROAD_DELETION"
  | "DATABASE_MUTATION"
  | "PRODUCTION_DATA_ACCESS"
  | "GIT_COMMIT"
  | "GIT_PUSH"
  | "DEPLOYMENT"
  | "SYSTEM_LEVEL_OPERATION"
  | "PRIVILEGED_EXECUTION";

export type AuthorityDecision = "ALLOW" | "ASK" | "DENY";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type RiskClassification = {
  readonly level: RiskLevel;
  readonly actionClass: ActionClass;
};
