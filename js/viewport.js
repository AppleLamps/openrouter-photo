/**
 * Visual viewport tracking for mobile Safari.
 *
 * iOS never resizes the layout viewport when the software keyboard opens, so
 * `position: fixed; bottom: 0` chrome (the composer, the bottom sheets) ends up
 * hidden underneath it. The VisualViewport API is the only reliable way to
 * measure what is actually on screen.
 *
 * Publishes two custom properties on the document element:
 *   --keyboard-inset   height of the strip occluded at the bottom, in px
 *   --viewport-height  height of the visible viewport, in px
 *
 * and toggles `body.is-keyboard-open`. css/mobile.css consumes all three.
 */

// Below this the difference is rounding/toolbar noise rather than a keyboard.
const KEYBOARD_THRESHOLD_PX = 120;

let rafId = 0;
let lastInset = -1;
let lastHeight = -1;

function apply() {
    rafId = 0;

    const viewport = window.visualViewport;
    if (!viewport) return;

    const height = Math.round(viewport.height);

    // `offsetTop` accounts for the page being scrolled within the visual
    // viewport, which iOS does on its own when it focuses a field.
    const occluded = Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
    );
    const inset = occluded > KEYBOARD_THRESHOLD_PX ? occluded : 0;

    if (inset !== lastInset) {
        lastInset = inset;
        document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`);
        document.body.classList.toggle('is-keyboard-open', inset > 0);
    }

    if (height !== lastHeight) {
        lastHeight = height;
        document.documentElement.style.setProperty('--viewport-height', `${height}px`);
    }
}

function schedule() {
    if (rafId) return;
    rafId = requestAnimationFrame(apply);
}

/**
 * Start tracking the visual viewport. Safe to call more than once.
 */
export function initViewportTracking() {
    const viewport = window.visualViewport;
    // Without the API the CSS fallbacks (0px / 100dvh) are already correct.
    if (!viewport) return;

    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);
    window.addEventListener('orientationchange', schedule);

    apply();
}
