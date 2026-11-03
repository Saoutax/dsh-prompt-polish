/**
 * Contract shared by both halves of the plugin.
 *
 * The two build outputs import this module: the Host half for the operation's
 * result shape, the Client half for the same type without reaching any
 * Host-only symbol. Keep it dependency-free so neither side pulls a runtime
 * import across the wire boundary.
 *
 * @module @saoutax/dsh-prompt-polish/shared
 */

/** Why a polish request produced no replacement text. */
const POLISH_FAILURES = [
    /** The draft was empty or whitespace-only. */
    'empty',
    /** The draft exceeded `maxInputChars`. */
    'too-long',
    /** No provider/model route could be resolved. */
    'no-model',
    /** The system instruction could not be resolved (packaged file missing or empty). */
    'no-instruction',
    /** The model call failed, was aborted, or ended in a non-stop finish reason. */
    'call-failed',
    /** The model answered with no usable text. */
    'empty-result',
] as const;

/** One reason a polish request produced no replacement text. */
type PolishFailure = (typeof POLISH_FAILURES)[number];

/** Successful polish: the rewritten draft text. */
interface PolishSuccess {
    readonly ok: true;
    /** Rewritten prompt text, with surrounding code fences and wrapping quotes removed. */
    readonly text: string;
    /** Provider route the rewrite used. */
    readonly provider: string;
    /** Model id the rewrite used. */
    readonly model: string;
}

/** Failed polish: the draft must stay untouched. */
interface PolishError {
    readonly ok: false;
    readonly reason: PolishFailure;
    /** Human-readable detail for the caller to show, already localized by the Host. */
    readonly message: string;
}

/** Result of one polish request. */
type PolishResult = PolishSuccess | PolishError;

/** Maximum number of characters a single rewrite accepts, default applied by Config. */
const DEFAULT_MAX_INPUT_CHARS = 8000;

/** Maximum number of output tokens a single rewrite requests. */
const DEFAULT_MAX_OUTPUT_TOKENS = 2000;

/** Milliseconds the composer button stays in its undo state after a replacement. */
const DEFAULT_UNDO_WINDOW_MS = 8000;

/** XML-ish delimiters that keep the draft separable from the instructions. */
const DRAFT_OPEN = '<draft>';
const DRAFT_CLOSE = '</draft>';

/** The result contract and the failure union of one polish request. */
export type { PolishFailure, PolishSuccess, PolishError, PolishResult };

/** The tunable defaults and the draft delimiters shared by both halves. */
export {
    POLISH_FAILURES,
    DEFAULT_MAX_INPUT_CHARS,
    DEFAULT_MAX_OUTPUT_TOKENS,
    DEFAULT_UNDO_WINDOW_MS,
    DRAFT_OPEN,
    DRAFT_CLOSE,
};
