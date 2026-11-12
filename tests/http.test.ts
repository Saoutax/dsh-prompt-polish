/**
 * Tests for the Host HTTP surface: route registration follows the optional
 * `connection` service, and one request resolves a cold Session before calling
 * the polish operation.
 *
 * The route handler's doubles cover only the members it reads, so they are
 * partial `Context`/`Agent`/service shapes rather than real deployments.
 */

import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlePolishRequest, registerHttpRoute } from '../src/host/http.js';
import type { PromptPolishService } from '../src/host/service.js';
import { POLISH_PATH } from '../src/shared.js';

/** One captured exact Fetch route registration. */
interface RegisteredRoute {
    readonly path: string;
    readonly methods: readonly string[];
    readonly requestBody: string;
    readonly fetch: (request: Request) => Promise<Response>;
}

/** The Session controller face read by the route. */
interface ResolverFake {
    resolveAgent(
        sessionId: string,
    ): Promise<{ readonly agent: Agent } | { readonly error: { readonly message: string } }>;
}

/**
 * Narrow a partial test double to its production shape.
 * @param value - the partial double.
 * @returns the same value typed as the production shape.
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the generic is the test-double boundary
const asPartial = <T>(value: unknown): T => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- intentional partial doubles
    return value as T;
};

/** A partial Agent double: only identity is read by these tests. */
const agent = (id: string): Agent => {
    return asPartial<Agent>({ id });
};

/** Build the partial Host context the handler reads. */
const contextWith = (options: {
    readonly resolver?: ResolverFake;
    readonly agents?: { get(id: string): Agent | undefined };
}): Context => {
    return asPartial<Context>({
        get: (name: string) => {
            if (name === 'sessionController') {
                return options.resolver;
            }
            if (name === 'agents') {
                return options.agents;
            }
            return undefined;
        },
        logger: { warn: vi.fn() },
    });
};

/** Build a POST request carrying one polish body. */
const polishRequest = (body: unknown): Request => {
    return new Request(`http://localhost${POLISH_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
};

/** A service double whose operation succeeds unless a test overrides it. */
const serviceWith = (polishDraft: ReturnType<typeof vi.fn>): PromptPolishService => {
    return asPartial<PromptPolishService>({ polishDraft });
};

describe('registerHttpRoute', () => {
    it('waits for connection through ctx.inject instead of reading it once', () => {
        const injected: Array<{
            readonly deps: readonly string[];
            readonly callback: (child: Context) => void;
        }> = [];
        const ctx = asPartial<Context>({
            inject: (deps: readonly string[], callback: (child: Context) => void) => {
                injected.push({ deps, callback });
                return undefined;
            },
        });
        const service = serviceWith(vi.fn());

        registerHttpRoute(ctx, service);

        expect(injected).toHaveLength(1);
        expect(injected[0]?.deps).toEqual(['connection']);
    });

    it('registers the exact route once the injected connection appears', () => {
        const injected: Array<{ readonly callback: (child: Context) => void }> = [];
        const routes: RegisteredRoute[] = [];
        const ctx = asPartial<Context>({
            inject: (_deps: readonly string[], callback: (child: Context) => void) => {
                injected.push({ callback });
                return undefined;
            },
        });
        const service = serviceWith(vi.fn());
        registerHttpRoute(ctx, service);

        const child = asPartial<Context>({
            get: (name: string) =>
                name === 'connection'
                    ? {
                          fetch: {
                              register(route: RegisteredRoute) {
                                  routes.push(route);
                                  return async () => Promise.resolve();
                              },
                          },
                      }
                    : undefined,
            logger: { info: vi.fn() },
            effect: (callback: () => unknown) => {
                void callback();
                return () => undefined;
            },
        });
        injected[0]?.callback(child);

        expect(routes).toHaveLength(1);
        expect(routes[0]?.path).toBe(POLISH_PATH);
        expect(routes[0]?.methods).toEqual(['POST']);
        expect(routes[0]?.requestBody).toBe('buffered');
        expect(typeof routes[0]?.fetch).toBe('function');
    });
});

describe('handlePolishRequest', () => {
    let polishDraft: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        polishDraft = vi.fn(async () => ({
            ok: true as const,
            text: 'polished text',
            provider: 'custom-provider',
            model: 'custom-model',
        }));
    });

    it('resumes a cold Session through the Session controller', async () => {
        const resolved = agent('session-cold');
        const resolveAgent = vi.fn(async () => ({ agent: resolved }));
        const ctx = contextWith({ resolver: { resolveAgent } });
        const service = serviceWith(polishDraft);

        const response = await handlePolishRequest(
            ctx,
            service,
            polishRequest({ agentId: 'session-cold', text: 'draft text' }),
        );

        expect(response.status).toBe(200);
        expect(resolveAgent).toHaveBeenCalledWith('session-cold');
        expect(polishDraft).toHaveBeenCalledWith('draft text', resolved, expect.any(AbortSignal));
        expect(await response.json()).toEqual({
            ok: true,
            text: 'polished text',
            provider: 'custom-provider',
            model: 'custom-model',
        });
    });

    it('answers no-session as a business result when resolution fails', async () => {
        const resolveAgent = vi.fn(async () => ({
            error: { message: 'session "session-gone" not found' },
        }));
        const ctx = contextWith({ resolver: { resolveAgent } });
        const service = serviceWith(polishDraft);

        const response = await handlePolishRequest(
            ctx,
            service,
            polishRequest({ agentId: 'session-gone', text: 'draft text' }),
        );

        expect(response.status).toBe(200);
        expect(polishDraft).not.toHaveBeenCalled();
        expect(await response.json()).toEqual({
            ok: false,
            reason: 'no-session',
            message:
                'Session "session-gone" could not be resolved: session "session-gone" not found',
        });
    });

    it('falls back to a live Agent when no Session controller is mounted', async () => {
        const live = agent('session-live');
        const ctx = contextWith({ agents: { get: () => live } });
        const service = serviceWith(polishDraft);

        const response = await handlePolishRequest(
            ctx,
            service,
            polishRequest({ agentId: 'session-live', text: 'draft text' }),
        );

        expect(response.status).toBe(200);
        expect(polishDraft).toHaveBeenCalledWith('draft text', live, expect.any(AbortSignal));
    });

    it('answers no-session when the fallback registry has no live Agent', async () => {
        const ctx = contextWith({ agents: { get: () => undefined } });
        const service = serviceWith(polishDraft);

        const response = await handlePolishRequest(
            ctx,
            service,
            polishRequest({ agentId: 'session-cold', text: 'draft text' }),
        );

        expect(response.status).toBe(200);
        expect(polishDraft).not.toHaveBeenCalled();
        expect(await response.json()).toEqual({
            ok: false,
            reason: 'no-session',
            message: 'Session "session-cold" could not be resolved: no live agent',
        });
    });

    it('rejects a body that is not JSON', async () => {
        const ctx = contextWith({});
        const response = await handlePolishRequest(
            ctx,
            serviceWith(polishDraft),
            polishRequest('{'),
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ ok: false, error: 'body is not JSON' });
    });

    it('rejects a body without agentId and text strings', async () => {
        const ctx = contextWith({});
        const response = await handlePolishRequest(
            ctx,
            serviceWith(polishDraft),
            polishRequest({ agentId: 7, text: 'draft text' }),
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
            ok: false,
            error: 'expected agentId and text strings',
        });
    });

    it('passes an operation failure through as a business result', async () => {
        polishDraft.mockResolvedValueOnce({
            ok: false,
            reason: 'no-model',
            message: 'No model is available.',
        });
        const live = agent('session-live');
        const ctx = contextWith({ agents: { get: () => live } });

        const response = await handlePolishRequest(
            ctx,
            serviceWith(polishDraft),
            polishRequest({ agentId: 'session-live', text: 'draft text' }),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            ok: false,
            reason: 'no-model',
            message: 'No model is available.',
        });
    });
});
