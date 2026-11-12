/**
 * The plugin's HTTP route: how the browser half reaches the polish operation.
 *
 * The Gateway's `/api` interceptor claims only endpoints declared by generated
 * Typert contributions, so this plugin's own Service never answers there. An
 * exact Fetch route is the supported extension point for a package-owned HTTP
 * surface.
 *
 * `connection` is deliberately an optional dependency: a headless deployment
 * carries no web carrier at all, so the route is registered through
 * `ctx.inject` only when one becomes available. The loader activates profile
 * entries concurrently, so checking `ctx.get('connection')` once during this
 * plugin's own activation could miss the carrier and leave the route
 * unregistered for the rest of the process.
 *
 * Session resolution goes through `SessionController.resolveAgent` when that
 * service is mounted: a Session opened from history is cold until its Agent is
 * resumed, and the composer's chat path resumes it lazily. Reading the raw
 * Agent registry instead would answer 404 for every such Session before any
 * model call happens.
 *
 * @module @saoutax/dsh-prompt-polish/host/http
 */

import type { Context } from '@deepseek-ai/cordis';
import type { Agent, AgentRegistry } from '@deepseek-ai/dsh-agent';
import { SessionId } from '@deepseek-ai/dsh-session/types';
import { POLISH_PATH, type PolishResult } from '../shared.js';
import type { PromptPolishService } from './service.js';

/**
 * The exact Fetch-route registration face this route needs.
 *
 * Structural rather than imported: `dsh-client-connection` is an optional
 * deployment package, and only this one member is used here.
 */
interface PolishFetchConnection {
    readonly fetch?: {
        register(route: {
            readonly path: string;
            readonly methods: readonly ('GET' | 'HEAD' | 'POST')[];
            readonly requestBody: 'buffered';
            readonly fetch: (request: Request) => Promise<Response>;
        }): () => Promise<void>;
    };
}

/**
 * The Session controller's agent-resolution face.
 *
 * `sessionController` is mounted by the Host Session API (the web deployment
 * always has it) but not by every headless deployment, so it is read as an
 * optional service with this minimal structural contract.
 */
interface SessionAgentResolver {
    resolveAgent(
        sessionId: SessionId,
    ): Promise<{ readonly agent: Agent } | { readonly error: { readonly message: string } }>;
}

/** Wire shape of a polish request from the browser half. */
interface PolishRequestBody {
    agentId: SessionId;
    text: string;
}

/** One resolved Agent, or the reason no Agent could be reached. */
type AgentResolution = { readonly agent: Agent } | { readonly failure: string };

/**
 * Whether a parsed body carries the request shape.
 * @param body - parsed JSON body.
 * @returns the request fields, or `undefined` when the shape is wrong.
 */
const parseBody = (body: unknown): PolishRequestBody | undefined => {
    if (typeof body !== 'object' || body === null || !('agentId' in body) || !('text' in body)) {
        return undefined;
    }
    const record = body as Record<string, unknown>;
    const agentId = record['agentId'];
    const text = record['text'];
    if (typeof agentId !== 'string' || typeof text !== 'string') {
        return undefined;
    }
    // Value-level brand: the Host's own SessionId coercion, imported from the
    // deployment's shared session package.
    return { agentId: SessionId(agentId), text };
};

/**
 * Resolve one Session identity to its live Agent.
 *
 * The Session controller is authoritative when present: it resumes cold
 * Sessions, deduplicates concurrent resumes, and rejects identities that are
 * not ordinary Sessions. The raw registry is only a fallback for deployments
 * without that service.
 *
 * @param ctx - owning Host context.
 * @param sessionId - Session whose draft is being polished.
 * @returns the Agent, or a short failure detail for the caller to report.
 */
const resolveAgent = async (ctx: Context, sessionId: SessionId): Promise<AgentResolution> => {
    const controller: SessionAgentResolver | undefined = ctx.get('sessionController');
    if (controller !== undefined) {
        try {
            const resolved = await controller.resolveAgent(sessionId);
            return 'agent' in resolved
                ? { agent: resolved.agent }
                : { failure: resolved.error.message };
        } catch (error) {
            return { failure: error instanceof Error ? error.message : String(error) };
        }
    }

    const agents: AgentRegistry | undefined = ctx.get('agents');
    const agent = agents?.get(sessionId);
    return agent === undefined ? { failure: 'no live agent' } : { agent };
};

/**
 * Handle one polish request.
 *
 * Transport failures (malformed body) answer 400. A Session that cannot be
 * resolved answers 200 with the plugin's own `no-session` result, which is a
 * business failure like `no-model` and lets the browser half show localized
 * copy instead of a raw transport status.
 *
 * @param ctx - owning Host context.
 * @param service - the operation's owner.
 * @param request - the Fetch request from the browser half.
 * @returns the Fetch response carrying the plugin's result.
 */
const handlePolishRequest = async (
    ctx: Context,
    service: PromptPolishService,
    request: Request,
): Promise<Response> => {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ ok: false, error: 'body is not JSON' }, { status: 400 });
    }

    const parsed = parseBody(body);
    if (parsed === undefined) {
        return Response.json(
            { ok: false, error: 'expected agentId and text strings' },
            { status: 400 },
        );
    }

    const resolution = await resolveAgent(ctx, parsed.agentId);
    if ('failure' in resolution) {
        const result: PolishResult = {
            ok: false,
            reason: 'no-session',
            message: `Session "${String(parsed.agentId)}" could not be resolved: ${resolution.failure}`,
        };
        ctx.logger.warn(`prompt-polish: ${result.message}`);
        return Response.json(result);
    }

    const result = await service.polishDraft(parsed.text, resolution.agent, request.signal);
    return Response.json(result);
};

/**
 * Register the polish route when the deployment has a web carrier.
 *
 * `ctx.inject` waits for `connection` and re-runs if that service is replaced
 * (for example a carrier reload), so the exact route follows the carrier's
 * lifetime and cannot be lost to activation order.
 *
 * @param ctx - owning Host context.
 * @param service - the operation's owner.
 */
const registerHttpRoute = (ctx: Context, service: PromptPolishService): void => {
    ctx.inject(['connection'], connectionCtx => {
        const connection: PolishFetchConnection | undefined = connectionCtx.get('connection');
        if (connection === undefined || connection.fetch === undefined) {
            return;
        }

        const fetch = connection.fetch;
        connectionCtx.logger.info(`prompt-polish: HTTP route registered at ${POLISH_PATH}`);
        connectionCtx.effect(async () => {
            // `fetch.register` answers an asynchronous disposer; the effect
            // awaits it during unload, so the route is fully withdrawn before
            // the carrier goes away.
            return fetch.register({
                path: POLISH_PATH,
                methods: ['POST'],
                requestBody: 'buffered',
                fetch: request => handlePolishRequest(ctx, service, request),
            });
        }, 'prompt-polish: HTTP route');
    });
};

/** The request handler (unit-testable) and the carrier-aware registration. */
export { handlePolishRequest, registerHttpRoute };
