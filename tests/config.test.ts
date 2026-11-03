/**
 * Tests for `readConfig`: dereferencing the volatile configuration references
 * Cordis hands to `apply`.
 *
 * The regression this guards against is concrete: adding a field to `Config`
 * without wiring it through `readConfig`'s `.get()` call would silently read
 * `undefined` everywhere the plain `PolishConfig` snapshot is used.
 */

import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/host/config.js';

/** A stable reference to one live configuration value, mirroring Cordis's `Volatile<T>`. */
const volatile = <T>(value: T): { get(): T } => ({ get: () => value });

describe('readConfig', () => {
    it('dereferences every volatile field into a plain snapshot', () => {
        const snapshot = readConfig({
            provider: volatile('deepseek'),
            model: volatile('deepseek-chat'),
            reasoningEffort: volatile('high'),
            instructions: volatile('Be concise.'),
            maxInputChars: volatile(4000),
            maxOutputTokens: volatile(1000),
            temperature: volatile(0.7),
        });

        expect(snapshot).toEqual({
            provider: 'deepseek',
            model: 'deepseek-chat',
            reasoningEffort: 'high',
            instructions: 'Be concise.',
            maxInputChars: 4000,
            maxOutputTokens: 1000,
            temperature: 0.7,
        });
    });

    it('reads the reference again on every call, not a value captured once', () => {
        let current = 'off';
        const source = {
            provider: volatile(''),
            model: volatile(''),
            reasoningEffort: { get: () => current },
            instructions: volatile(''),
            maxInputChars: volatile(8000),
            maxOutputTokens: volatile(2000),
            temperature: volatile(0.3),
        };

        expect(readConfig(source).reasoningEffort).toBe('off');
        current = 'high';
        expect(readConfig(source).reasoningEffort).toBe('high');
    });
});
