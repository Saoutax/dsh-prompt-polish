/**
 * Route resolution for a rewrite: which provider, model, and reasoning effort
 * to call with.
 *
 * The rule is "never guess": an explicitly configured route wins, then the
 * calling Session's own route, then the deployment's default model. The
 * Session's route comes from its latest request header - the route the
 * composer's model selector last committed, reasoning effort included; a draft
 * whose model was changed but not yet sent still reports the sent route.
 * Anything unresolved answers `no-model` instead of picking an arbitrary route.
 *
 * @module @saoutax/dsh-prompt-polish/host/route
 */

import type { Agent } from '@deepseek-ai/dsh-agent';
import { ReasoningEffortId, type ReasoningEffortId as EffortId } from '@deepseek-ai/dsh-llm';
import type { PolishConfig } from './config.js';

/** One resolved provider/model route for a rewrite. */
interface ResolvedRoute {
    provider: string;
    model: string;
    reasoningEffort?: EffortId;
}

/** A provider/model pair that may carry a pinned or default reasoning effort. */
interface RouteCandidate {
    provider: string;
    model: string;
    reasoningEffort?: EffortId;
}

/** Default route the configuration pins, or `undefined` to follow the Session. */
const configuredRoute = (config: PolishConfig): RouteCandidate | undefined => {
    if (config.provider === '' || config.model === '') {
        return undefined;
    }
    // A pinned route keeps the configured effort when one is set; otherwise the
    // provider's own default applies to this exact model.
    return {
        provider: config.provider,
        model: config.model,
        ...(config.reasoningEffort === ''
            ? {}
            : { reasoningEffort: ReasoningEffortId(config.reasoningEffort) }),
    };
};

/**
 * Read the route a Session's requests use.
 *
 * Before the Session's first request there is no header, so the Agent's own
 * options - the route its first request will take - stand in; afterwards the
 * logged header is the authoritative record of what the composer's selector
 * produced.
 * @param agent - Session the rewrite was requested from.
 * @returns the route, or `undefined` when the Agent declares no route either.
 */
const sessionRoute = (agent: Agent): ResolvedRoute | undefined => {
    const header = agent.session.requestHeader();
    if (header !== undefined) {
        const { provider, model, reasoningEffort } = header.config;
        return {
            provider,
            model,
            ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
        };
    }

    // First request pending: the Agent's own options are its route.
    const { provider, model, reasoningEffort } = agent.options;
    if (provider === undefined || model === undefined) {
        return undefined;
    }
    return {
        provider,
        model,
        ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    };
};

/**
 * Attach an effort to a provider/model pair without changing the rest.
 * @param candidate - the pair to carry forward.
 * @returns the resolved route, preserving the candidate's effort when present.
 */
const withEffort = (candidate: RouteCandidate): ResolvedRoute => {
    return {
        provider: candidate.provider,
        model: candidate.model,
        ...(candidate.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: candidate.reasoningEffort }),
    };
};

/**
 * Choose the route for one rewrite.
 * @param config - validated plugin configuration.
 * @param agent - Session the rewrite was requested from, when one is in scope.
 * @param defaultSelection - the deployment default model service, when mounted.
 * @returns the resolved route, or `undefined` when no route can be resolved.
 */
const resolveRoute = (
    config: PolishConfig,
    agent: Agent | undefined,
    defaultSelection: RouteCandidate | undefined,
): ResolvedRoute | undefined => {
    const pinned = configuredRoute(config);
    if (pinned !== undefined) {
        return pinned;
    }

    if (agent !== undefined) {
        const own = sessionRoute(agent);
        if (own !== undefined) {
            return own;
        }
    }

    if (
        defaultSelection !== undefined &&
        defaultSelection.provider !== '' &&
        defaultSelection.model !== ''
    ) {
        return withEffort(defaultSelection);
    }

    return undefined;
};

/** One resolved provider/model route for a rewrite. */
export type { ResolvedRoute };

/** Choose the route for one rewrite. */
export { resolveRoute };
