/**
 * Deterministic Engineering Brain adapters for Phase 5D1 tests.
 * No network, SDK, subprocess, or live provider.
 */

import type {
  EngineeringBrainAdapter,
  EngineeringBrainAdapterDescriptor,
  EngineeringBrainAdapterReply,
  FrozenNormalizedAdapterPacket,
} from "../../src/brain/index.js";

export type ScriptedReply =
  | EngineeringBrainAdapterReply
  | ((
      packet: FrozenNormalizedAdapterPacket,
      control: { signal: AbortSignal; invocationId: string },
    ) => EngineeringBrainAdapterReply | Promise<EngineeringBrainAdapterReply>);

export type DeterministicAdapterOptions = {
  readonly providerId: string;
  readonly modelId: string;
  readonly descriptor?: Partial<EngineeringBrainAdapterDescriptor>;
  readonly script?: ScriptedReply;
  readonly delayMs?: number;
  readonly ignoreAbort?: boolean;
  readonly syncThrow?: boolean;
  readonly rejectWith?: unknown;
  readonly onInvoke?: (info: {
    packet: FrozenNormalizedAdapterPacket;
    control: { signal: AbortSignal; invocationId: string };
    callIndex: number;
  }) => void;
  /** Optional nested re-entry hook for single-flight proofs. */
  readonly reenter?: (adapterSelf: EngineeringBrainAdapter) => void;
};

export function baseDescriptor(
  providerId: string,
  modelId: string,
  overrides?: Partial<EngineeringBrainAdapterDescriptor>,
): EngineeringBrainAdapterDescriptor {
  return {
    providerId,
    modelId,
    capabilities: {
      textInput: true,
      textOutput: true,
      acceptedResponseProfiles: [
        { kind: "REASONING_PROPOSAL_JSON", schemaVersion: 1 },
      ],
      honorsOutputTokenLimit: true,
      cancellationDeclared: true,
      ...(overrides?.capabilities ?? {}),
    },
  };
}

export function createDeterministicAdapter(
  options: DeterministicAdapterOptions,
): EngineeringBrainAdapter & {
  readonly calls: {
    packet: FrozenNormalizedAdapterPacket;
    control: { signal: AbortSignal; invocationId: string };
  }[];
  readonly settleIgnored?: () => void;
} {
  const calls: {
    packet: FrozenNormalizedAdapterPacket;
    control: { signal: AbortSignal; invocationId: string };
  }[] = [];
  let callIndex = 0;
  let resolveIgnored: ((value: EngineeringBrainAdapterReply) => void) | undefined;
  let rejectIgnored: ((reason?: unknown) => void) | undefined;

  const adapter: EngineeringBrainAdapter & {
    calls: typeof calls;
    settleIgnored?: () => void;
  } = {
    descriptor: baseDescriptor(
      options.providerId,
      options.modelId,
      options.descriptor,
    ),
    calls,
    async invoke(packet, control) {
      callIndex += 1;
      calls.push({ packet, control });
      options.onInvoke?.({ packet, control, callIndex });

      if (options.reenter) {
        options.reenter(adapter);
      }

      if (options.syncThrow) {
        throw new Error("SECRET_ADAPTER_SYNC_THROW_TOKEN=leak");
      }

      if (options.rejectWith !== undefined) {
        return Promise.reject(options.rejectWith);
      }

      const runScript = async (): Promise<EngineeringBrainAdapterReply> => {
        const script = options.script;
        if (script === undefined) {
          return {
            kind: "COMPLETE",
            invocationId: control.invocationId,
            text: '{"schemaVersion":1,"proposalId":"p","requestedOutcome":"x","claims":[],"hypotheses":[]}',
            usage: { provenance: "TEST_FIXTURE", inputTokens: 1, outputTokens: 1 },
          };
        }
        if (typeof script === "function") {
          return await script(packet, control);
        }
        // Rewrite invocationId to match control when script used a placeholder.
        if (
          script.kind === "COMPLETE" ||
          script.kind === "REFUSAL" ||
          script.kind === "INCOMPLETE" ||
          script.kind === "FAILURE"
        ) {
          return { ...script, invocationId: control.invocationId };
        }
        return script;
      };

      if (options.ignoreAbort) {
        return await new Promise<EngineeringBrainAdapterReply>((resolve, reject) => {
          resolveIgnored = resolve;
          rejectIgnored = reject;
        });
      }

      if (options.delayMs !== undefined && options.delayMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => resolve(), options.delayMs);
          const onAbort = (): void => {
            clearTimeout(timer);
            reject(new Error("aborted"));
          };
          if (control.signal.aborted) {
            onAbort();
            return;
          }
          control.signal.addEventListener("abort", onAbort, { once: true });
        });
      } else if (!options.ignoreAbort) {
        if (control.signal.aborted) {
          throw new Error("aborted");
        }
      }

      return runScript();
    },
  };

  if (options.ignoreAbort) {
    adapter.settleIgnored = () => {
      resolveIgnored?.({
        kind: "COMPLETE",
        invocationId: calls[0]?.control.invocationId ?? "missing",
        text: "late-ignored-abort-text",
        usage: { provenance: "TEST_FIXTURE", outputTokens: 0 },
      });
    };
    void rejectIgnored;
  }

  return adapter;
}

export function validRequest(overrides?: Record<string, unknown>) {
  return {
    correlationId: "corr-1",
    purpose: "PROPOSE_REASONING" as const,
    taskText: "Propose reference-bound reasoning.",
    context: {
      references: [] as const,
      blocks: [] as const,
    },
    ...overrides,
  };
}
