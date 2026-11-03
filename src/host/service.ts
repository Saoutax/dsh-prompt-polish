/**
 * The polish operation, shared by every caller.
 *
 * The composer button reaches it through the plugin's HTTP route. It answers a
 * discriminated result instead of throwing so a caller reports a failure the
 * same way every time.
 *
 * The class is deliberately not a Cordis Service: no other plugin consumes it,
 * and mounting one would spend a name in the shared service namespace for
 * nothing (official guidance: use the function shape until you must expose a
 * service).
 *
 * @module @saoutax/dsh-prompt-polish/host/service
 */

import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { DRAFT_CLOSE, DRAFT_OPEN, type PolishResult } from '../shared.js';
import { unwrapAnswer } from './answer.js';
import { readConfig, type ConfigSource } from './config.js';
import { loadInstructions } from './instructions.js';
import { resolveRoute } from './route.js';

/**
 * The polish operation behind the composer button.
 */
export class PromptPolishService {
    private readonly ctx: Context;
    private readonly source: ConfigSource;
    private readonly unload: AbortSignal;

    /**
     * @param ctx - owning Host context.
     * @param source - the live configuration references, read per request so a
     * settings write applies without reloading the plugin.
     * @param unload - aborted when the owning fiber unloads.
     */
    constructor(ctx: Context, source: ConfigSource, unload: AbortSignal) {
        this.ctx = ctx;
        this.source = source;
        this.unload = unload;
    }

    /**
     * The instruction defining this rewrite, resolved for one request.
     *
     * A configured instruction always wins; otherwise the packaged Markdown is
     * read, and its absence is reported rather than papered over.
     * @param instructions - the configured instruction, empty when unset.
     * @returns the system instruction to send.
     */
    private instructionFor(instructions: string): string {
        return instructions.trim() === '' ? loadInstructions() : instructions;
    }

    /**
     * Rewrite one prompt with the model, collecting the streamed text.
     *
     * This is the single implementation behind the composer button and the
     * slash command.
     *
     * @param text - the draft prompt to rewrite.
     * @param agent - Session the request came from, for route resolution.
     * @param signal - caller cancellation.
     * @returns the rewritten text, or the reason no rewrite happened.
     */
    async polishDraft(
        text: string,
        agent: Agent | undefined,
        signal: AbortSignal,
    ): Promise<PolishResult> {
        // The call honours both its caller and the plugin lifetime: an unload
        // mid-stream cancels the model call instead of burning tokens for a
        // result nobody will read.
        const combined = AbortSignal.any([signal, this.unload]);
        const config = readConfig(this.source);
        const draft = text.trim();
        if (draft === '') {
            return { ok: false, reason: 'empty', message: 'There is no prompt text to polish.' };
        }
        if (draft.length > config.maxInputChars) {
            return {
                ok: false,
                reason: 'too-long',
                message: `The draft is longer than ${String(config.maxInputChars)} characters; shorten it before polishing.`,
            };
        }

        let instruction: string;
        try {
            instruction = this.instructionFor(config.instructions);
        } catch (error) {
            return {
                ok: false,
                reason: 'no-instruction',
                message: error instanceof Error ? error.message : String(error),
            };
        }

        const defaultModel = this.ctx.get('agentDefaultModel');
        const route = resolveRoute(
            config,
            agent,
            defaultModel === undefined ? undefined : defaultModel.currentSelection(),
        );
        if (route === undefined) {
            return {
                ok: false,
                reason: 'no-model',
                message:
                    'No model is available: configure provider and model on this plugin, or select a model in the composer.',
            };
        }

        const llm = this.ctx.get('llm');
        if (llm === undefined) {
            return {
                ok: false,
                reason: 'no-model',
                message: 'The model service is not available in this deployment.',
            };
        }

        let answer = '';
        try {
            const stream = llm.stream({
                provider: route.provider,
                model: route.model,
                // The Session's own reasoning effort; pinned routes follow the provider default.
                ...(route.reasoningEffort === undefined
                    ? {}
                    : { reasoningEffort: route.reasoningEffort }),
                system: instruction,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: `${DRAFT_OPEN}\n${draft}\n${DRAFT_CLOSE}` },
                        ],
                    },
                ],
                maxTokens: config.maxOutputTokens,
                temperature: config.temperature,
                signal: combined,
            });

            for await (const chunk of stream) {
                if (chunk.type === 'text-delta') {
                    answer += chunk.text;
                } else if (chunk.type === 'finish' && chunk.reason.kind !== 'stop') {
                    const detail =
                        chunk.reason.kind === 'error'
                            ? chunk.reason.failure.message
                            : chunk.reason.kind;
                    return {
                        ok: false,
                        reason: 'call-failed',
                        message: `The model call ended without an answer: ${detail}`,
                    };
                }
            }
        } catch (error) {
            if (combined.aborted) {
                return {
                    ok: false,
                    reason: 'call-failed',
                    message: 'The polish request was cancelled.',
                };
            }
            const detail = error instanceof Error ? error.message : String(error);
            return {
                ok: false,
                reason: 'call-failed',
                message: `The model call failed: ${detail}`,
            };
        }

        const polished = unwrapAnswer(answer);
        if (polished === '') {
            return {
                ok: false,
                reason: 'empty-result',
                message: 'The model returned no usable text; the draft is unchanged.',
            };
        }
        return { ok: true, text: polished, provider: route.provider, model: route.model };
    }
}
