/**
 * Validation kind → ActionClass disable mapping.
 */

import type { ActionClass } from "../domain/authority.js";
import type { ResolvedProjectConfig } from "../config/types.js";
import { isExecuteProcessDisabled } from "../execution/policy.js";
import type { ValidationCheckKind } from "./types.js";

export function actionClassForCheckKind(kind: ValidationCheckKind): ActionClass {
  return kind;
}

export function isCheckKindDisabled(
  kind: ValidationCheckKind,
  config: ResolvedProjectConfig,
): boolean {
  return config.restrictions.disabledActions.includes(
    actionClassForCheckKind(kind),
  );
}

export function isValidationExecutionDisabled(
  kind: ValidationCheckKind,
  config: ResolvedProjectConfig,
): boolean {
  return isExecuteProcessDisabled(config) || isCheckKindDisabled(kind, config);
}
