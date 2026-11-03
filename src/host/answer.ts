/**
 * Answer post-processing: what the model returns versus what the composer needs.
 *
 * Models habitually wrap a rewritten prompt in a fenced block or quotes. This
 * module strips exactly those wrappers and nothing else, so a prompt that
 * legitimately opens with a quote survives untouched.
 *
 * @module @saoutax/dsh-prompt-polish/host/answer
 */

/**
 * Strip the wrappers a model commonly adds around a rewritten prompt: a whole
 * answer wrapped in a fenced block, or the whole answer quoted. Newlines inside
 * the answer are preserved.
 * @param raw - the model's full text answer.
 * @returns the rewritten prompt, trimmed, or an empty string when nothing usable remains.
 */
export const unwrapAnswer = (raw: string): string => {
    let text = raw.trim();
    if (text === '') {
        return '';
    }

    // A single fenced block that spans the entire answer: keep its body.
    const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(text);
    if (fenced?.[1] !== undefined) {
        text = fenced[1].trim();
        if (text === '') {
            return '';
        }
    }

    // The whole answer wrapped in matching quotes, possibly multi-line.
    const quoted = /^(["'`])([\s\S]*)\1$/.exec(text);
    if (quoted?.[2] !== undefined) {
        const body = quoted[2].trim();
        // Only treat it as a wrapper when the body does not itself start with the same
        // quote, so a prompt that legitimately opens with a quote is left intact.
        const quote = quoted[1] ?? '';
        if (body !== '' && !body.startsWith(quote)) {
            return body;
        }
    }

    return text;
};
