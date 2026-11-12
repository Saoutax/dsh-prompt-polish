/**
 * Tests for the browser half's HTTP call: the path it posts to, and how it
 * folds successful, business-failure, and transport answers into the plugin's
 * discriminated result.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { callPolish } from '../src/client/bridge.js';
import { POLISH_PATH } from '../src/shared.js';

/** Install a fetch double and return it. */
const fetchWith = (response: Response): ReturnType<typeof vi.fn> => {
    const mock = vi.fn(async () => response);
    vi.stubGlobal('fetch', mock);
    return mock;
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('callPolish', () => {
    it('posts the Session and prose to the shared route', async () => {
        const fetchMock = fetchWith(
            Response.json({
                ok: true,
                text: 'polished',
                provider: 'provider',
                model: 'model',
            }),
        );
        const controller = new AbortController();

        await callPolish(controller.signal, 'session-1', 'draft text');

        expect(fetchMock).toHaveBeenCalledWith(
            POLISH_PATH,
            expect.objectContaining({
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ agentId: 'session-1', text: 'draft text' }),
                signal: controller.signal,
            }),
        );
    });

    it('parses a successful result', async () => {
        fetchWith(
            Response.json({
                ok: true,
                text: 'polished',
                provider: 'provider',
                model: 'model',
            }),
        );

        await expect(
            callPolish(new AbortController().signal, 'session-1', 'draft text'),
        ).resolves.toEqual({
            ok: true,
            text: 'polished',
            provider: 'provider',
            model: 'model',
        });
    });

    it('preserves the no-session business failure', async () => {
        fetchWith(
            Response.json({
                ok: false,
                reason: 'no-session',
                message: 'Session "session-1" could not be resolved: no live agent',
            }),
        );

        await expect(
            callPolish(new AbortController().signal, 'session-1', 'draft text'),
        ).resolves.toEqual({
            ok: false,
            reason: 'no-session',
            message: 'Session "session-1" could not be resolved: no live agent',
        });
    });

    it('folds a missing route into a transport code', async () => {
        fetchWith(new Response('not found', { status: 404 }));

        await expect(
            callPolish(new AbortController().signal, 'session-1', 'draft text'),
        ).resolves.toEqual({
            ok: false,
            reason: 'call-failed',
            message: 'http-404',
        });
    });

    it('folds a non-JSON success body into a transport code', async () => {
        fetchWith(new Response('not json', { status: 200 }));

        await expect(
            callPolish(new AbortController().signal, 'session-1', 'draft text'),
        ).resolves.toEqual({
            ok: false,
            reason: 'call-failed',
            message: 'non-JSON',
        });
    });
});
