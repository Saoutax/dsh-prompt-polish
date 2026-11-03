/**
 * Tests for route resolution precedence: configured route, then the Session's
 * own route, then the deployment default.
 *
 * `Agent` is used here only through the two properties `resolveRoute` reads
 * (`session.requestHeader()` and `options`), so tests build minimal doubles
 * instead of a real Agent.
 */

import type { Agent } from '@deepseek-ai/dsh-agent';
import { describe, expect, it } from 'vitest';
import type { PolishConfig } from '../src/host/config.js';
import { resolveRoute } from '../src/host/route.js';

/** A config with every field empty except overrides supplied by the caller. */
const emptyConfig = (overrides: Partial<PolishConfig> = {}): PolishConfig => ({
    provider: '',
    model: '',
    reasoningEffort: '',
    instructions: '',
    maxInputChars: 8000,
    maxOutputTokens: 2000,
    temperature: 0.3,
    ...overrides,
});

/** Build a minimal Agent double exposing only what `resolveRoute` reads. */
const agentWith = (fields: {
    header?: { provider: string; model: string; reasoningEffort?: string };
    options?: { provider?: string; model?: string; reasoningEffort?: string };
}): Agent => {
    // The double covers only the two properties `resolveRoute` reads; asserting
    // the full `Agent` shape is the point of a minimal test double.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- intentional partial double
    return {
        session: {
            requestHeader: () =>
                fields.header === undefined ? undefined : { config: fields.header },
        },
        options: fields.options ?? {},
    } as unknown as Agent;
};

describe('resolveRoute', () => {
    it('prefers the configured route over everything else', () => {
        const config = emptyConfig({ provider: 'deepseek', model: 'deepseek-chat' });
        const agent = agentWith({ header: { provider: 'other', model: 'other-model' } });

        const route = resolveRoute(config, agent, {
            provider: 'default-provider',
            model: 'default-model',
        });

        expect(route).toEqual({ provider: 'deepseek', model: 'deepseek-chat' });
    });

    it('carries the configured reasoning effort when the route is pinned', () => {
        const config = emptyConfig({
            provider: 'deepseek',
            model: 'deepseek-reasoner',
            reasoningEffort: 'high',
        });

        const route = resolveRoute(config, undefined, undefined);

        expect(route).toEqual({
            provider: 'deepseek',
            model: 'deepseek-reasoner',
            reasoningEffort: 'high',
        });
    });

    it('falls back to the Session route when nothing is configured', () => {
        const config = emptyConfig();
        const agent = agentWith({
            header: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'low' },
        });

        const route = resolveRoute(config, agent, {
            provider: 'default-provider',
            model: 'default-model',
        });

        expect(route).toEqual({
            provider: 'deepseek',
            model: 'deepseek-chat',
            reasoningEffort: 'low',
        });
    });

    it('reads the Agent options before its first request header exists', () => {
        const config = emptyConfig();
        const agent = agentWith({ options: { provider: 'deepseek', model: 'deepseek-chat' } });

        const route = resolveRoute(config, agent, undefined);

        expect(route).toEqual({ provider: 'deepseek', model: 'deepseek-chat' });
    });

    it('falls back to the deployment default when the Session declares no route', () => {
        const config = emptyConfig();
        const agent = agentWith({});

        const route = resolveRoute(config, agent, {
            provider: 'default-provider',
            model: 'default-model',
        });

        expect(route).toEqual({ provider: 'default-provider', model: 'default-model' });
    });

    it('resolves to undefined when no layer offers a route', () => {
        const config = emptyConfig();

        expect(resolveRoute(config, undefined, undefined)).toBeUndefined();
    });

    it('ignores a default selection with an empty provider or model', () => {
        const config = emptyConfig();

        expect(
            resolveRoute(config, undefined, { provider: '', model: 'deepseek-chat' }),
        ).toBeUndefined();
        expect(
            resolveRoute(config, undefined, { provider: 'deepseek', model: '' }),
        ).toBeUndefined();
    });
});
