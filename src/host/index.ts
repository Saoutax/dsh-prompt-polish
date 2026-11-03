/**
 * Host half of the prompt-polish plugin.
 *
 * This entry is intentionally small: it wires the modules beside it into the
 * Cordis lifecycle and exports the manifest facts Cordis reads (name, inject,
 * Config). The operation lives in `service.ts`, route choice in `route.ts`,
 * answer cleanup in `answer.ts`, and the default instruction loader in
 * `instructions.ts`. The composer button is the operation's only caller.
 *
 * @module @saoutax/dsh-prompt-polish
 */

import type { Context } from '@deepseek-ai/cordis';
import { Config, type ConfigSource } from './config.js';
import { registerHttpRoute } from './http.js';
import { PromptPolishService } from './service.js';

/** Cordis diagnostics read the plugin's own name. */
const name = 'prompt-polish';

/** Services the plugin body reads. */
const inject = ['llm', 'agents'];

/**
 * Apply the plugin: create the operation and register the HTTP route for this
 * fiber's lifetime.
 *
 * The configuration is passed as live references, not a snapshot, so a write
 * from the settings page changes the next rewrite without reloading the plugin.
 * The default instruction is likewise resolved per request rather than here.
 * @param ctx - owning Host context.
 * @param config - live configuration references.
 */
const apply = (ctx: Context, config: ConfigSource): void => {
    // In-flight model calls are cancelled when this fiber unloads, so a reload
    // never leaves a stream running for a result nobody will read.
    const unload = new AbortController();
    ctx.effect(
        () => () => {
            unload.abort();
        },
        'prompt-polish: in-flight calls',
    );

    const service = new PromptPolishService(ctx, config, unload.signal);
    registerHttpRoute(ctx, service);
};

/** The manifest facts Cordis reads from a plugin entry: name, inject, Config, apply. */
export { name, inject, Config, apply };
