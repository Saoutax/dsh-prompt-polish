/**
 * Draft rewriting for the composer.
 *
 * The composer's draft is not a plain string: it carries reference chips
 * ("@file", "@session") that occupy ranges of the clipboard-text projection.
 * Replacing the draft with `setDraft(string)` erases those chips, so this module
 * rebuilds a full `DraftSnapshot` that keeps them.
 *
 * A draft may also open with a claimed command chip (`/plan`, `/goal`, ...).
 * That chip is not a reference: it is the document's submit claim, published
 * separately from `occurrences`, and the prose follows its token. Only the prose
 * is rewritten - the claim is carried through untouched, so polishing a
 * `/plan <task>` draft keeps the command claimed instead of silently turning it
 * into plain text.
 *
 * The rewrite only changes prose. Chips are re-anchored by searching for their
 * original clipboard text in the rewritten prose, near where they used to be.
 * A chip whose text no longer appears is appended at the end instead of being
 * dropped, so nothing the author inserted disappears silently.
 *
 * @module @saoutax/dsh-prompt-polish/draft
 */

/** How far from its original offset a chip may be re-anchored before it is treated as moved away. */
const SEARCH_WINDOW = 240;

/** One reference occurrence in clipboard-text coordinates. */
interface Occurrence {
    readonly occurrenceId: number;
    readonly source: string;
    readonly ref: string;
    readonly offset: number;
    readonly length: number;
    readonly label: string;
    readonly appearance?: 'session' | 'file' | 'folder';
    readonly clipboardText: string;
    readonly invalid?: boolean;
}

/** One remembered reference without the live occurrence identity. */
interface DraftReference {
    readonly source: string;
    readonly ref: string;
    readonly label: string;
    readonly offset: number;
    readonly length: number;
    readonly appearance?: 'session' | 'file' | 'folder';
    readonly clipboardText: string;
    readonly invalid?: boolean;
}

/**
 * The command chip opening a draft: its spelling plus argument separator, e.g.
 * `/plan `. The draft text starts with the spelling without the separator.
 */
interface DraftCommand {
    readonly token: string;
}

/** Editor-independent draft content: text, ordered reference ranges, and an optional opening claim. */
interface DraftSnapshot {
    readonly text: string;
    readonly references: readonly DraftReference[];
    readonly command?: DraftCommand;
}

/** A chip located (or not) in the rewritten prose. */
interface PlacedChip {
    chip: Occurrence;
    /** Start offset in the rewritten text, or -1 when the chip's text is gone. */
    offset: number;
}

/**
 * Every start index of a needle in a haystack.
 * @param haystack - text to search.
 * @param needle - non-empty text to find.
 * @returns ascending start offsets.
 */
const allIndexesOf = (haystack: string, needle: string): number[] => {
    const found: number[] = [];
    let from = 0;
    for (;;) {
        const at = haystack.indexOf(needle, from);
        if (at < 0) {
            return found;
        }
        found.push(at);
        from = at + 1;
    }
};

/**
 * Sort a copy of an array by a numeric key.
 *
 * `Array#toSorted` matches the intent but predates the lib both toolchains
 * compile against, so the copy-then-sort idiom is used explicitly; the input
 * array is never touched.
 * @param items - array to copy.
 * @returns a new array ordered ascending by the key.
 */
const sortByOffset = <T extends { offset: number }>(items: readonly T[]): T[] => {
    // The array is this function's own copy; the in-place mutation stays contained here.
    // oxlint-disable-next-line unicorn/no-array-sort -- contained mutation of a local copy
    return Array.from(items).sort((left, right) => left.offset - right.offset);
};

/**
 * Locate the occurrence offsets of already-placed chips inside a text.
 *
 * Chips are placed in original order with a forward-moving cursor: each chip
 * takes the first unused occurrence of its clipboard text at or after the
 * previous chip's placement, so two chips that share the same clipboard text
 * (the same file mentioned twice) claim two different occurrences instead of
 * collapsing onto the same one. A chip whose text has no occurrence in the
 * forward window is recorded as lost and appended later.
 * @param text - the rewritten prose.
 * @param chips - chips to place, in original order.
 * @returns placed spans, including `-1` offsets for chips that found no home.
 */
const place = (text: string, chips: readonly Occurrence[]): PlacedChip[] => {
    const placed: PlacedChip[] = [];
    let cursor = 0;
    for (const chip of chips) {
        const needle = chip.clipboardText;
        if (needle === '') {
            continue;
        }

        const starts = allIndexesOf(text, needle);
        // Occurrences at or after the cursor, so later chips cannot steal an
        // earlier chip's match; before the cursor the prose is already claimed.
        const forward = starts.filter(start => start >= cursor);
        const first = forward[0];
        if (first === undefined || Math.abs(first - chip.offset) > SEARCH_WINDOW) {
            placed.push({ chip, offset: -1 });
            continue;
        }

        cursor = first + needle.length;
        placed.push({ chip, offset: first });
    }
    return placed;
};

/** Narrow a placement that actually landed in the text. */
const isPlaced = (entry: PlacedChip): entry is PlacedChip & { offset: number } => {
    return entry.offset >= 0;
};

/**
 * Drop placements that overlap an earlier kept placement, keeping document order.
 *
 * The forward-cursor placement already avoids collisions, so this is only a
 * belt-and-braces filter for the pathological case where two different chips'
 * clipboard texts overlap inside the rewritten prose.
 * @param placed - candidate placements with resolved offsets.
 * @returns non-overlapping placements, ascending by offset.
 */
const withoutOverlaps = (
    placed: readonly (PlacedChip & { offset: number })[],
): (PlacedChip & { offset: number })[] => {
    const kept: (PlacedChip & { offset: number })[] = [];
    for (const candidate of sortByOffset(placed)) {
        const previous = kept.at(-1);
        if (
            previous !== undefined &&
            candidate.offset < previous.offset + previous.chip.clipboardText.length
        ) {
            continue;
        }
        kept.push(candidate);
    }
    return kept;
};

/**
 * Reference-bearing chips of a draft, in document order.
 *
 * `references` is sorted by offset first: `place`'s forward-moving cursor
 * depends on seeing chips in document order, and nothing in `DraftSnapshot`'s
 * contract guarantees the caller already supplied them that way.
 * @param draft - the composer document.
 * @returns its chips as occurrences with clipboard text, ascending by offset.
 */
const chipsOf = (draft: DraftSnapshot): Occurrence[] => {
    return sortByOffset(draft.references).map((reference, index) => ({
        occurrenceId: index,
        source: reference.source,
        ref: reference.ref,
        label: reference.label,
        offset: reference.offset,
        length: reference.length,
        clipboardText: reference.clipboardText,
        ...(reference.invalid === undefined ? {} : { invalid: reference.invalid }),
        ...(reference.appearance === undefined ? {} : { appearance: reference.appearance }),
    }));
};

/**
 * The leading claim's literal prefix of the draft text.
 *
 * A command chip projects as its spelling followed by the argument separator,
 * so the prefix is the claim's token. When the published claim does not match
 * the text (a restore still in flight) there is no prefix: the whole draft is
 * prose, and rewriting it leaves the command alone.
 * @param draft - the composer document.
 * @returns the prefix to carry through verbatim, or `''` without a claim.
 */
const commandPrefix = (draft: DraftSnapshot): string => {
    const command = draft.command;
    if (command === undefined) {
        return '';
    }
    const spelling = command.token.trimEnd();
    return draft.text.startsWith(spelling) ? command.token : '';
};

/**
 * The prose a rewrite may touch: the draft without its leading command prefix.
 * @param draft - the composer document.
 * @returns the text the model rewrites.
 */
const proseOf = (draft: DraftSnapshot): string => {
    return draft.text.slice(commandPrefix(draft).length);
};

/**
 * Rebuild a draft whose text has no leading command prefix.
 * @param original - prose-only draft, with prose-relative chip offsets.
 * @param polished - the rewritten prose (chip clipboard text included as-is).
 * @returns a snapshot ready for `setDraft`, or `undefined` when there is nothing to write.
 */
const rebuildProse = (original: DraftSnapshot, polished: string): DraftSnapshot | undefined => {
    const chips = chipsOf(original);
    const text = polished.trim();
    if (text === '') {
        return undefined;
    }

    // No chips: the plain rewrite is the whole document.
    if (chips.length === 0) {
        return { text, references: [] };
    }

    const resolved = withoutOverlaps(place(text, chips).filter(isPlaced));

    // Chips whose text no longer appears: append them so the author keeps the references.
    const lost = chips.filter(
        chip => !resolved.some(entry => entry.chip.occurrenceId === chip.occurrenceId),
    );
    const pieces: string[] = [text];
    const appended: (PlacedChip & { offset: number })[] = [];
    let cursor = text.length;
    for (const chip of lost) {
        if (chip.clipboardText === '') {
            continue;
        }
        pieces.push(' ', chip.clipboardText);
        cursor += 1;
        appended.push({ chip, offset: cursor });
        cursor += chip.clipboardText.length;
    }
    const finalText = pieces.join('');

    const all = sortByOffset(resolved.concat(appended));
    const references: DraftReference[] = all.map(entry => ({
        source: entry.chip.source,
        ref: entry.chip.ref,
        label: entry.chip.label,
        offset: entry.offset,
        length: entry.chip.clipboardText.length,
        clipboardText: entry.chip.clipboardText,
        ...(entry.chip.invalid === undefined ? {} : { invalid: entry.chip.invalid }),
        ...(entry.chip.appearance === undefined ? {} : { appearance: entry.chip.appearance }),
    }));

    return { text: finalText, references };
};

/**
 * Rebuild the composer document for a rewritten prompt, preserving reference
 * chips and any leading command claim.
 *
 * @param original - the draft as it was before the rewrite, including its chips
 * and claim.
 * @param polished - the rewritten prose (chip clipboard text included as-is).
 * @returns a snapshot ready for `setDraft`, or `undefined` when there is nothing to write.
 */
const rebuildDraft = (original: DraftSnapshot, polished: string): DraftSnapshot | undefined => {
    const prefix = commandPrefix(original);
    if (prefix === '') {
        return rebuildProse(original, polished);
    }

    // Work in prose coordinates, then shift the rewritten document back under
    // the command chip: its claim and the chips' absolute offsets both survive.
    // A reference whose offset falls inside the prefix itself has no prose
    // coordinate to carry through rebuildProse, so it is appended after the
    // rewrite instead of being dropped - the same "nothing disappears
    // silently" guarantee rebuildProse gives chips whose text moved out of
    // range.
    const shift = prefix.length;
    const insidePrefix = original.references.filter(reference => reference.offset < shift);
    const body: DraftSnapshot = {
        text: original.text.slice(shift),
        references: original.references
            .filter(reference => reference.offset >= shift)
            .map(reference => ({ ...reference, offset: reference.offset - shift })),
    };
    const rebuilt = rebuildProse(body, polished);
    if (rebuilt === undefined) {
        return undefined;
    }

    const pieces: string[] = [rebuilt.text];
    const references: DraftReference[] = rebuilt.references.map(reference => ({
        ...reference,
        offset: reference.offset + shift,
    }));
    let cursor = rebuilt.text.length + shift;
    for (const reference of insidePrefix) {
        if (reference.clipboardText === '') {
            continue;
        }
        pieces.push(' ', reference.clipboardText);
        cursor += 1;
        references.push({ ...reference, offset: cursor, length: reference.clipboardText.length });
        cursor += reference.clipboardText.length;
    }

    return {
        text: prefix + pieces.join(''),
        references,
        command: { token: prefix },
    };
};

/**
 * Whether a draft may be rewritten: its prose needs content. A leading command
 * chip is not prose, so `/plan` alone has nothing to polish while `/plan <task>`
 * does.
 * @param draft - the composer document under the cursor.
 * @returns true when a rewrite is safe.
 */
const canPolish = (draft: DraftSnapshot): boolean => {
    return proseOf(draft).trim() !== '';
};

/** One reference occurrence in clipboard-text coordinates; one remembered reference without the live identity; the opening claim; the composer document shape. */
export type { Occurrence, DraftReference, DraftCommand, DraftSnapshot };

/** Rebuild the composer document for a rewritten prompt; chips of a draft in document order; the prose a rewrite may touch; whether a draft may be rewritten. */
export { rebuildDraft, chipsOf, proseOf, canPolish };
