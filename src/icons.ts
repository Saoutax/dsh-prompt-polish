/**
 * Lucide icon data rendered without JSX and without importing the React build
 * of Lucide: the browser half receives React from the host module table, so a
 * second React peer would only risk a version mismatch.
 *
 * `lucide` (the vanilla package) exports icon node data as
 * `[tag, attributes][]` pairs. This module turns one node into an element tree
 * through the caller's own element factory, which keeps the output independent
 * of any particular React version.
 *
 * Lucide is ISC licensed - see https://lucide.dev/license
 *
 * @module @saoutax/dsh-prompt-polish/icons
 */

import { LoaderCircle, Sparkles, Undo2, type IconNode } from 'lucide';

/** Element factory: the subset of React's `createElement` this module needs. */
type ElementFactory = (
    type: string,
    props: Record<string, unknown>,
    ...children: unknown[]
) => unknown;

/** Attributes every inline icon shares: sized by the surrounding control. */
const BASE: Record<string, string> = {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.5',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
};

/** Icons this plugin renders. */
const ICONS = {
    /** Idle: offer the polish action. */
    polish: Sparkles,
    /** After a replacement: revert to the pre-polish draft. */
    undo: Undo2,
    /** In flight: the model is working. */
    busy: LoaderCircle,
} as const;

/**
 * Render one named Lucide icon.
 * @param createElement - the page's element factory.
 * @param name - which icon to draw.
 * @param size - rendered edge length in pixels.
 * @returns the icon as an element tree.
 */
const renderIcon = (
    createElement: ElementFactory,
    name: keyof typeof ICONS,
    size = 16,
): unknown => {
    const node: IconNode = ICONS[name];
    const children = node.map(([tag, attributes], index) =>
        createElement(tag, { ...attributes, key: `p${String(index)}` }),
    );
    return createElement(
        'svg',
        { ...BASE, width: size, height: size, className: 'pp-icon' },
        ...children,
    );
};

/** Element factory: the subset of React's `createElement` this module needs. */
export type { ElementFactory };

/** Render one named Lucide icon. */
export { renderIcon };
