/**
 * The HTTP call behind the button.
 *
 * The Host registers an exact Fetch route at `/api/prompt-polish/polish`; the
 * browser half posts the draft there and reads the plugin's own discriminated
 * result from the JSON answer. Same-origin fetch carries the Host's
 * authority-bound browser cookie automatically, which is all the
 * authentication the exact route requires.
 *
 * @module @saoutax/dsh-prompt-polish/client/bridge
 */

import type { PolishResult } from '../shared.js';

/** Wire shape of a failed answer that is not the plugin's own result. */
interface HttpErrorBody {
    readonly ok?: unknown;
    readonly error?: unknown;
}

/** Endpoint path registered by the Host half. */
const POLISH_PATH = '/api/prompt-polish/polish';

/**
 * Narrow an unknown value to the plugin's own result shape.
 * @param value - candidate value.
 * @returns the value when it matches `PolishResult`, otherwise `undefined`.
 */
const asResult = (value: unknown): PolishResult | undefined => {
    if (typeof value !== 'object' || value === null || !('ok' in value)) {
        return undefined;
    }
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.ok !== 'boolean') {
        return undefined;
    }
    if (candidate.ok) {
        return typeof candidate.text === 'string' &&
            typeof candidate.provider === 'string' &&
            typeof candidate.model === 'string'
            ? {
                  ok: true,
                  text: candidate.text,
                  provider: candidate.provider,
                  model: candidate.model,
              }
            : undefined;
    }
    const reason = candidate.reason;
    const message = candidate.message;
    return {
        ok: false,
        reason:
            reason === 'empty' ||
            reason === 'too-long' ||
            reason === 'no-model' ||
            reason === 'no-instruction' ||
            reason === 'call-failed' ||
            reason === 'empty-result'
                ? reason
                : 'call-failed',
        message: typeof message === 'string' ? message : 'unspecified',
    };
};

/**
 * Fold one HTTP answer into the plugin's own result.
 *
 * Transport-level answers carry compact codes, never user-facing prose: the
 * button composes the visible sentence from its own locale dictionaries, so no
 * hard-coded English reaches the composer in a Chinese UI.
 *
 * @param response - the fetch response from the Host route.
 * @returns the operation result, or an error carrying the transport code.
 */
const asPolishResult = async (response: Response): Promise<PolishResult> => {
    if (!response.ok) {
        return {
            ok: false,
            reason: 'call-failed',
            message: `http-${String(response.status)}`,
        };
    }
    let body: unknown;
    try {
        body = await response.json();
    } catch {
        return { ok: false, reason: 'call-failed', message: 'non-JSON' };
    }
    const inner = asResult(body);
    if (inner !== undefined) {
        return inner;
    }
    // Error answers use { ok: false, error } instead of the plugin's shape.
    if (typeof body === 'object' && body !== null && 'error' in (body as HttpErrorBody)) {
        const detail = (body as HttpErrorBody).error;
        return {
            ok: false,
            reason: 'call-failed',
            message: typeof detail === 'string' ? detail : 'refused',
        };
    }
    return { ok: false, reason: 'call-failed', message: 'unexpected-answer' };
};

/**
 * Call the Host polish operation for one Session's draft.
 * @param signal - cancellation for the fetch.
 * @param sessionId - Session whose draft is being polished.
 * @param text - the draft prompt to rewrite.
 * @returns the plugin's own discriminated result.
 */
export const callPolish = async (
    signal: AbortSignal,
    sessionId: string,
    text: string,
): Promise<PolishResult> => {
    const response = await fetch(POLISH_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: sessionId, text }),
        signal,
    });
    return await asPolishResult(response);
};
