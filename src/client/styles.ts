/*
 * Styles of the composer toolbar button.
 *
 * The rules live in a real stylesheet, imported as text and injected as one
 * `<style>` tag at activation - the same pattern the shipped static packages
 * use, since `styles.insert` exists only for dynamically defined packages.
 * Every color and state reference goes through the host theme tokens
 * (`--dsw-alias-*`), so the button follows light/dark switching instead of
 * hard-coding a look.
 *
 * Generated from src/client/styles.css by the build.
 */

/**
 * Register the stylesheet on the client context.
 * @param ctx - the client plugin context.
 * @param css - the stylesheet text, imported from `styles.css` at build time.
 */
export const registerStyles = (
    ctx: { effect(callback: () => (() => void) | void, label?: string): () => void },
    css: string,
): void => {
    ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset.plugin = 'prompt-polish';
        tag.dataset.pluginCss = 'prompt-polish/button.css';
        tag.textContent = css;
        document.head.append(tag);
        return () => {
            tag.remove();
        };
    }, 'prompt-polish: stylesheet');
};
