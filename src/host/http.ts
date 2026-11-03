/**
 * The plugin's HTTP route: how the browser half reaches the polish operation.
 *
 * The Gateway's `/api` interceptor claims only endpoints declared by generated
 * Typert contributions, so this plugin's own Service never answers there. An
 * exact Fetch route is the supported extension point for a package-owned HTTP
 * surface.
 *
 * `connection` is deliberately an optional dependency: a headless deployment
 * carries no web carrier at all, so the plugin registers the route when one is
 * present and logs and skips otherwise rather than throwing at activation.
 *
 * @module @saoutax/dsh-prompt-polish/host/http
 */

import type { Context } from '@deepseek-ai/cordis';
import { SessionId } from '@deepseek-ai/dsh-session/types';
import type { PromptPolishService } from './service.js';

/** Endpoint path below `/api`, owned by this plugin alone. */
const ROUTE_PATH = '/api/prompt-polish/polish';

/** Wire shape of a polish request from the browser half. */
interface PolishRequestBody {
    agentId: import('@deepseek-ai/dsh-session/types').SessionId;
    text: string;
}

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
 * Register the polish route when the deployment has a web carrier.
 * @param ctx - owning Host context.
 * @param service - the operation's owner.
 */
export const registerHttpRoute = (ctx: Context, service: PromptPolishService): void => {
    const connection = ctx.get('connection');
    if (connection === undefined || connection.fetch === undefined) {
        // A headless deployment: no browser half exists, so the button cannot
        // exist either, and this plugin has no other way to run a rewrite.
        ctx.logger.info('prompt-polish: no web carrier; the composer button is unavailable');
        return;
    }

    ctx.effect(async () => {
        // `connection.fetch.register` answers an asynchronous disposer; the
        // effect awaits it during unload, so the route is fully withdrawn.
        return connection.fetch.register({
            path: ROUTE_PATH,
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: async (request: Request): Promise<Response> => {
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

                const agents = ctx.get('agents');
                const agent = agents === undefined ? undefined : agents.get(parsed.agentId);
                if (agent === undefined) {
                    return Response.json(
                        {
                            ok: false,
                            error: `session "${String(parsed.agentId)}" has no live agent`,
                        },
                        { status: 404 },
                    );
                }

                const result = await service.polishDraft(parsed.text, agent, request.signal);
                return Response.json(result);
            },
        });
    }, 'prompt-polish: HTTP route');
};
