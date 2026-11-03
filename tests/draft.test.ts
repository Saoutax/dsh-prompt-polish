/**
 * Tests for draft rewriting: chip re-anchoring, lost-chip append, and command
 * claim preservation.
 *
 * @module @saoutax/dsh-prompt-polish/tests/draft.test
 */

import { describe, expect, it } from 'vitest';
import { canPolish, rebuildDraft, type DraftReference, type DraftSnapshot } from '../src/draft.js';

/** Build a reference with only the fields a case cares about. */
const ref = (
    over: Partial<DraftReference> & Pick<DraftReference, 'clipboardText'>,
): DraftReference => {
    return {
        source: 'session',
        ref: 'r1',
        label: 'r1',
        offset: 0,
        length: over.clipboardText.length,
        ...over,
    };
};

describe('rebuildDraft', () => {
    it('returns the plain rewrite when the draft has no chips', () => {
        const original: DraftSnapshot = { text: 'hello', references: [] };
        expect(rebuildDraft(original, 'Hello there')).toEqual({
            text: 'Hello there',
            references: [],
        });
    });

    it('drops a rewrite that trims to empty', () => {
        const original: DraftSnapshot = { text: 'hello', references: [] };
        expect(rebuildDraft(original, '   ')).toBeUndefined();
    });

    it('re-anchors a chip whose clipboard text survives the rewrite', () => {
        const chip = ref({ clipboardText: '@notes.md', offset: 6 });
        const original: DraftSnapshot = { text: 'check @notes.md please', references: [chip] };
        const rewritten = rebuildDraft(original, 'Please check @notes.md carefully');
        expect(rewritten?.text).toBe('Please check @notes.md carefully');
        expect(rewritten?.references).toEqual([
            expect.objectContaining({ clipboardText: '@notes.md', offset: 13 }),
        ]);
    });

    it('appends a chip whose clipboard text disappeared from the rewrite', () => {
        const chip = ref({ clipboardText: '@notes.md', offset: 6 });
        const original: DraftSnapshot = { text: 'check @notes.md please', references: [chip] };
        const rewritten = rebuildDraft(original, 'Please review this carefully');
        expect(rewritten?.text).toBe('Please review this carefully @notes.md');
        expect(rewritten?.references).toEqual([
            expect.objectContaining({ clipboardText: '@notes.md', offset: 29 }),
        ]);
    });

    it('places two chips sharing the same clipboard text at two distinct occurrences', () => {
        const first = ref({ clipboardText: '@a.md', offset: 0, label: 'first' });
        const second = ref({ clipboardText: '@a.md', offset: 20, label: 'second' });
        const original: DraftSnapshot = {
            text: '@a.md and also @a.md',
            references: [first, second],
        };
        const rewritten = rebuildDraft(original, '@a.md plus @a.md combined');
        const offsets = rewritten?.references.map(entry => entry.offset);
        expect(offsets).toHaveLength(2);
        expect(offsets?.[0]).toBeLessThan(offsets?.[1] ?? -1);
    });

    it('keeps the command claim and only rewrites the prose after it', () => {
        const original: DraftSnapshot = {
            text: '/plan build the thing',
            references: [],
            command: { token: '/plan ' },
        };
        const rewritten = rebuildDraft(original, 'Build the feature properly');
        expect(rewritten?.text).toBe('/plan Build the feature properly');
        expect(rewritten?.command).toEqual({ token: '/plan ' });
    });

    it('shifts chip offsets under a command claim back into absolute coordinates', () => {
        const chip = ref({ clipboardText: '@notes.md', offset: 12 });
        const original: DraftSnapshot = {
            text: '/plan read @notes.md now',
            references: [chip],
            command: { token: '/plan ' },
        };
        const rewritten = rebuildDraft(original, 'Read @notes.md thoroughly');
        expect(rewritten?.text).toBe('/plan Read @notes.md thoroughly');
        expect(rewritten?.references).toEqual([
            expect.objectContaining({ clipboardText: '@notes.md', offset: 11 }),
        ]);
    });

    it('drops a rewrite under a command claim that trims to empty prose', () => {
        const original: DraftSnapshot = {
            text: '/plan ',
            references: [],
            command: { token: '/plan ' },
        };
        expect(rebuildDraft(original, '  ')).toBeUndefined();
    });
});

describe('canPolish', () => {
    it('is false for a bare command claim with no prose', () => {
        const draft: DraftSnapshot = {
            text: '/plan',
            references: [],
            command: { token: '/plan ' },
        };
        expect(canPolish(draft)).toBe(false);
    });

    it('is true once the command claim has prose after it', () => {
        const draft: DraftSnapshot = {
            text: '/plan do something',
            references: [],
            command: { token: '/plan ' },
        };
        expect(canPolish(draft)).toBe(true);
    });

    it('is false for whitespace-only prose', () => {
        const draft: DraftSnapshot = { text: '   ', references: [] };
        expect(canPolish(draft)).toBe(false);
    });
});
