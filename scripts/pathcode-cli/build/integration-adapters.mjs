import { createStripeIdentityAdapter } from "./stripe-integration-adapter.mjs";
import { createGitHubIdentityAdapter } from "./github-integration-adapter.mjs";

/** Production verification adapters. Test services may inject a narrower registry. */
export const DEFAULT_INTEGRATION_VERIFICATION_ADAPTERS = Object.freeze({
  github: createGitHubIdentityAdapter(),
  stripe: createStripeIdentityAdapter(),
});
