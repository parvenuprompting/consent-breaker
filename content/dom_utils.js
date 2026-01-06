/**
 * Consent Breaker - DOM Utilities
 * Safe DOM manipulation helpers with Shadow DOM support.
 */

const DOMUtils = {
    // ─────────────────────────────────────────────────────────────────────────
    // Shadow DOM & Deep Querying
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Recursively search for elements across all Shadow DOMs.
     * @param {string} selector - CSS selector
     * @param {Node} root - Root node to start search (default: document)
     * @returns {Element[]} Array of found elements
     */
    deepQuerySelectorAll(selector, root = document) {
        const results = [];

        // 1. Search current root
        try {
            results.push(...Array.from(root.querySelectorAll(selector)));
        } catch (e) {
            // Selector might be invalid for this context
        }

        // 2. Find all hosts with shadow roots in this level
        // Note: TreeWalker is faster than recursive querySelector('*')
        const walker = document.createTreeWalker(
            root === document ? document.body : root,
            NodeFilter.SHOW_ELEMENT,
            null,
            false
        );

        while (walker.nextNode()) {
            const el = walker.currentNode;
            if (el.shadowRoot) {
                results.push(...this.deepQuerySelectorAll(selector, el.shadowRoot));
            }
        }

        return results;
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Element Visibility
    // ─────────────────────────────────────────────────────────────────────────

    isVisible(element) {
        if (!element) return false;

        // Handle Shadow DOM elements (they have no offsetParent sometimes)
        // Check getBoundingClientRect instead
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;

        const style = window.getComputedStyle(element);
        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0'
        );
    },

    isFixed(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        return style.position === 'fixed' || style.position === 'sticky';
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Z-Index Parsing
    // ─────────────────────────────────────────────────────────────────────────

    getZIndex(element) {
        if (!element) return 0;

        const style = window.getComputedStyle(element);
        const zIndex = parseInt(style.zIndex, 10);

        if (isNaN(zIndex)) return 0;
        return zIndex;
    },

    hasHighZIndex(element, threshold = 1000) {
        return this.getZIndex(element) >= threshold;
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Text Search
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Find elements containing specific text (case-insensitive).
     * @param {string} text - Text to search for
     * @param {string} selector - CSS selector to filter results
     * @returns {Element[]}
     */
    findElementsByText(text, selector = '*') {
        const results = [];
        const searchText = text.toLowerCase();

        // Use deep query
        const elements = this.deepQuerySelectorAll(selector);

        for (const el of elements) {
            // Check direct text content (not children)
            const directText = Array.from(el.childNodes)
                .filter(node => node.nodeType === Node.TEXT_NODE)
                .map(node => node.textContent)
                .join('')
                .toLowerCase();

            if (directText.includes(searchText)) {
                results.push(el);
                continue;
            }

            // Check innerText for buttons/links
            if (el.tagName === 'BUTTON' || el.tagName === 'A' ||
                el.getAttribute('role') === 'button') {
                if (el.innerText?.toLowerCase().includes(searchText)) {
                    results.push(el);
                }
            }
        }

        return results;
    },

    /**
     * Find clickable elements (buttons, links) with specific text.
     */
    findClickableByText(texts) {
        const selectors = 'button, a, [role="button"], input[type="button"], input[type="submit"]';
        const results = [];

        for (const text of texts) {
            const found = this.findElementsByText(text, selectors);
            results.push(...found.filter(el => this.isVisible(el)));
        }

        return results;
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Element Removal
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Safely remove an element from the DOM.
     * Uses element.remove() which is safer in Shadow DOM contexts.
     */
    removeElement(element) {
        if (!element) return false;

        try {
            element.remove();
            return true;
        } catch (e) {
            // Fallback for very old browsers or edge cases
            if (element.parentNode) {
                element.parentNode.removeChild(element);
                return true;
            }
            return false;
        }
    },

    /**
     * Hide element via styles (safer than removal for some cases).
     */
    hideElement(element) {
        if (!element) return false;

        try {
            element.style.setProperty('display', 'none', 'important');
            element.style.setProperty('visibility', 'hidden', 'important');
            element.style.setProperty('opacity', '0', 'important');
            element.style.setProperty('pointer-events', 'none', 'important');
            return true;
        } catch (e) {
            return false;
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Scroll Restoration
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Restore scrolling capability on body/html.
     */
    restoreScroll() {
        const targets = [document.body, document.documentElement];

        for (const target of targets) {
            if (!target) continue;

            // Remove inline styles that block scrolling
            target.style.removeProperty('overflow');
            target.style.removeProperty('overflow-x');
            target.style.removeProperty('overflow-y');
            target.style.removeProperty('position');
            target.style.removeProperty('height');
            target.style.removeProperty('max-height');

            // Fix padding (some CMPs add padding for scrollbar)
            target.style.removeProperty('padding-right');
            target.style.removeProperty('margin-right');
        }

        // Remove common CMP classes
        const classesToRemove = [
            'modal-open',
            'no-scroll',
            'scroll-lock',
            'overflow-hidden',
            'cookie-consent-open',
            'cmp-open',
            'has-overlay'
        ];

        for (const cls of classesToRemove) {
            document.body?.classList.remove(cls);
            document.documentElement?.classList.remove(cls);
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Overlay Detection
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Check if element looks like an overlay/modal.
     */
    isOverlay(element) {
        if (!element) return false;

        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        // Check for overlay characteristics
        const isPositioned = style.position === 'fixed' || style.position === 'absolute';
        const hasHighZ = this.getZIndex(element) >= 1000;
        const coversViewport = (
            rect.width >= window.innerWidth * 0.5 ||
            rect.height >= window.innerHeight * 0.5
        );
        const hasBackdrop = (
            style.backgroundColor.includes('rgba') ||
            parseFloat(style.opacity) < 1 ||
            style.backdropFilter !== 'none'
        );

        return isPositioned && (hasHighZ || coversViewport || hasBackdrop);
    },

    /**
     * Check if body has scroll lock applied.
     */
    hasScrollLock() {
        const bodyStyle = window.getComputedStyle(document.body);
        const htmlStyle = window.getComputedStyle(document.documentElement);

        return (
            bodyStyle.overflow === 'hidden' ||
            htmlStyle.overflow === 'hidden' ||
            bodyStyle.position === 'fixed'
        );
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Click Simulation
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Safely click an element.
     */
    safeClick(element) {
        if (!element) return false;

        try {
            // Try native click first
            element.click();
            return true;
        } catch (e) {
            try {
                // Fallback: dispatch click event
                const event = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                element.dispatchEvent(event);
                return true;
            } catch (e2) {
                return false;
            }
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Wait Utilities
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Wait for an element to appear in DOM.
     */
    waitForElement(selector, timeout = 5000) {
        return new Promise((resolve) => {
            // Check if already exists
            const existing = document.querySelector(selector);
            if (existing) {
                resolve(existing);
                return;
            }

            const observer = new MutationObserver((mutations, obs) => {
                const found = document.querySelector(selector);
                if (found) {
                    obs.disconnect();
                    resolve(found);
                }
            });

            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });

            // Timeout
            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    },

    /**
     * Wait for DOM to be ready.
     */
    domReady() {
        return new Promise((resolve) => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', resolve, { once: true });
            } else {
                resolve();
            }
        });
    }
};

// Export for content scripts
if (typeof window !== 'undefined') {
    window.ConsentBreakerDOM = DOMUtils;
}
