/**
 * Body scroll locking for overlays.
 *
 * `overflow: hidden` on <body> is not honoured by iOS Safari — the page keeps
 * scrolling and rubber-banding behind a fixed overlay, and dismissing the
 * overlay leaves the user somewhere else in the gallery. Pinning the body with
 * `position: fixed` and restoring the offset afterwards is what actually holds
 * on iOS.
 *
 * Rather than pairing lock/unlock calls across a dozen open/close functions,
 * this derives the lock from the classes the overlays already put on <body>.
 * That keeps it idempotent: nested overlays and double-close calls cannot
 * unbalance it.
 */

/**
 * Body class -> media query that has to match for the overlay to be
 * full-screen. `null` means it is full-screen at every width.
 */
const LOCKING_CLASSES = [
    ['is-modal-open', null],
    ['is-sidebar-overlay-open', null],
    ['is-settings-open', '(max-width: 768px)'],
    ['model-picker-open', '(max-width: 900px)'],
];

let isLocked = false;
let scrollYBeforeLock = 0;

function shouldLock() {
    return LOCKING_CLASSES.some(([className, query]) => (
        document.body.classList.contains(className)
        && (query === null || window.matchMedia(query).matches)
    ));
}

function lock() {
    if (isLocked) return;
    isLocked = true;

    scrollYBeforeLock = window.scrollY || window.pageYOffset || 0;

    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollYBeforeLock}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
}

function unlock() {
    if (!isLocked) return;
    isLocked = false;

    const top = document.body.style.top;
    const y = top ? Math.abs(parseInt(top, 10)) : scrollYBeforeLock;

    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';

    // Has to run after the styles are cleared, or there is nothing to scroll.
    window.scrollTo(0, y);
}

/**
 * Bring the lock in line with whichever overlays are currently open.
 */
export function syncScrollLock() {
    if (shouldLock()) {
        lock();
    } else {
        unlock();
    }
}

/**
 * Watch <body> for overlay classes and keep the lock in sync. Safe to call
 * more than once.
 */
export function initScrollLock() {
    const observer = new MutationObserver(syncScrollLock);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // A rotation can change which overlays count as full-screen.
    window.addEventListener('orientationchange', syncScrollLock);
    window.addEventListener('resize', syncScrollLock);

    syncScrollLock();
}
