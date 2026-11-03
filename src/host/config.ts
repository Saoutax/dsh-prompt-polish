/**
 * Tunable values of the plugin, validated at activation.
 *
 * The schema is the single source of truth: the bundle row carries whatever the
 * user configured, and Cordis validates it against this object before `apply`
 * runs. Defaults live beside their field so the schema reads as documentation.
 *
 * Every field the settings page may edit is `.volatile()`. That marker is what
 * makes the field appear in `ctx.settings.describe()`: the settings domain
 * projects only volatile fields into a form, and an entry with none is skipped
 * entirely. It also changes the runtime shape - a volatile field arrives as a
 * reference whose `.get()` answers the current value - which is why this module
 * pairs the schema with `readConfig`, the one place that dereferences them.
 *
 * @module @saoutax/dsh-prompt-polish/host/config
 */

import z from '@deepseek-ai/schemastery';
import { DEFAULT_MAX_INPUT_CHARS, DEFAULT_MAX_OUTPUT_TOKENS } from '../shared.js';

/** A stable reference to one live configuration value. */
interface VolatileLike<T> {
    get(): T;
}

/**
 * The configuration Cordis hands to `apply`.
 *
 * Structural rather than imported: the reference type lives in a package this
 * plugin does not depend on directly, and only the `.get()` contract matters
 * here.
 */
interface ConfigSource {
    readonly provider: VolatileLike<string>;
    readonly model: VolatileLike<string>;
    readonly reasoningEffort: VolatileLike<string>;
    readonly instructions: VolatileLike<string>;
    readonly maxInputChars: VolatileLike<number>;
    readonly maxOutputTokens: VolatileLike<number>;
    readonly temperature: VolatileLike<number>;
}

/** One configuration read, with every value dereferenced. */
interface PolishConfig {
    provider: string;
    model: string;
    reasoningEffort: string;
    instructions: string;
    maxInputChars: number;
    maxOutputTokens: number;
    temperature: number;
}

/** Configurable surface of the plugin, declared on the bundle's row. */
const Config = z.object({
    /**
     * Provider route for the rewrite, picked from the deployment's model
     * catalog. Empty follows the calling Session's own route.
     */
    provider: z.string().default('').volatile(),
    /** Model id for the rewrite, picked from that provider's models. */
    model: z.string().default('').volatile(),
    /**
     * Reasoning effort for the rewrite, picked from the efforts the chosen model
     * advertises. Empty follows the Session's own effort.
     */
    reasoningEffort: z.string().default('').volatile(),
    /**
     * System instruction that defines what "polish" means. Empty falls back to
     * `prompts/polish.md`, shipped beside the bundle entry point.
     */
    instructions: z.string().default('').volatile(),
    /** Longest draft a single rewrite accepts. */
    maxInputChars: z.natural().min(1).default(DEFAULT_MAX_INPUT_CHARS).volatile(),
    /** Output tokens requested from the model. */
    maxOutputTokens: z.natural().min(64).default(DEFAULT_MAX_OUTPUT_TOKENS).volatile(),
    /** Sampling temperature for the rewrite. */
    temperature: z.number().min(0).max(2).default(0.3).volatile(),
});

/**
 * Dereference the live configuration.
 *
 * Volatile fields are read on every call rather than captured at activation, so
 * a settings write takes effect on the next rewrite without reloading the
 * plugin.
 * @param source - the live configuration references.
 * @returns one plain snapshot of the current values.
 */
const readConfig = (source: ConfigSource): PolishConfig => {
    return {
        provider: source.provider.get(),
        model: source.model.get(),
        reasoningEffort: source.reasoningEffort.get(),
        instructions: source.instructions.get(),
        maxInputChars: source.maxInputChars.get(),
        maxOutputTokens: source.maxOutputTokens.get(),
        temperature: source.temperature.get(),
    };
};

/** The live configuration references; one dereferenced read; the validated shape. */
export type { ConfigSource, PolishConfig };

/** The configurable surface of the plugin; one dereferenced read of its values. */
export { Config, readConfig };
