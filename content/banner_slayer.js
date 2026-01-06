/**
 * Consent Breaker - Banner Slayer
 * 
 * Heuristic detection and removal of cookie consent banners.
 * Uses confidence scoring: structural signals weighted higher than text keywords.
 */

const BannerSlayer = {
    signatures: null,
    processed: new WeakSet(),

    // Confidence thresholds
    THRESHOLD_ACTION: 60,

    // Signal weights (per review feedback: less text dependency)
    WEIGHTS: {
        // Structural signals (primary - 60%)
        overlay: 20,
        fixedPosition: 15,
        highZIndex: 15,
        scrollLock: 10,

        // Text signals (secondary - max 40%)
        consentKeyword: 8,
        rejectButtonPresent: 15,
        modalClass: 7
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Initialization
    // ─────────────────────────────────────────────────────────────────────────

    async init() {
        // Load signatures
        try {
            const response = await fetch(chrome.runtime.getURL('content/cmp_signatures.json'));
            this.signatures = await response.json();
        } catch (e) {
            this.log('Failed to load signatures', 'error');
            this.signatures = { cmpProviders: [], genericRejectPatterns: {}, safeguardKeywords: {} };
        }

        // Wait for DOM
        await this.waitForDOM();

        // Run detection
        this.scan();

        // Set up mutation observer for dynamically added banners
        this.observeDOM();
    },

    waitForDOM() {
        return new Promise(resolve => {
            if (document.readyState !== 'loading') {
                resolve();
            } else {
                document.addEventListener('DOMContentLoaded', resolve, { once: true });
            }
        });
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Main Scan
    // ─────────────────────────────────────────────────────────────────────────

    async scan() {
        const DOM = window.ConsentBreakerDOM;
        if (!DOM) return;

        // 1. First try known CMP providers (most reliable)
        const cmpResult = await this.handleKnownCMPs();
        if (cmpResult) {
            this.log('Handled via known CMP');
            return;
        }

        // 2. Detect generic consent overlays
        const candidates = this.findCandidates();

        for (const candidate of candidates) {
            if (this.processed.has(candidate.element)) continue;

            if (candidate.score >= this.THRESHOLD_ACTION) {
                this.log(`Processing candidate with score ${candidate.score}`);
                await this.handleCandidate(candidate);
                this.processed.add(candidate.element);
            }
        }

        // 3. Always try to restore scroll if locked
        if (DOM.hasScrollLock()) {
            DOM.restoreScroll();
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Known CMP Handling
    // ─────────────────────────────────────────────────────────────────────────

    async handleKnownCMPs() {
        if (!this.signatures?.cmpProviders) return false;

        const DOM = window.ConsentBreakerDOM;

        for (const cmp of this.signatures.cmpProviders) {
            // Check if CMP container exists
            let container = null;
            for (const selector of cmp.selectors.container) {
                container = document.querySelector(selector);
                if (container) break;
            }

            if (!container) continue;

            this.log(`Found ${cmp.name} banner`);

            // Try reject buttons
            for (const selector of cmp.selectors.rejectButtons) {
                const button = document.querySelector(selector);
                if (button && DOM.isVisible(button)) {
                    this.log(`Clicking ${cmp.name} reject: ${selector}`);
                    DOM.safeClick(button);

                    // Wait for dialog to process
                    await this.sleep(500);

                    // Verify it worked
                    let stillVisible = false;
                    for (const sel of cmp.selectors.container) {
                        const el = document.querySelector(sel);
                        if (el && DOM.isVisible(el)) {
                            stillVisible = true;
                            break;
                        }
                    }

                    if (!stillVisible) {
                        DOM.restoreScroll();
                        this.reportAction('known_cmp_reject', { cmp: cmp.name });
                        return true;
                    }
                }
            }

            // If no reject button worked, hide the container
            if (container && DOM.isVisible(container)) {
                DOM.hideElement(container);
                DOM.restoreScroll();
                this.reportAction('known_cmp_hide', { cmp: cmp.name });
                return true;
            }
        }

        return false;
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Candidate Detection (Heuristics)
    // ─────────────────────────────────────────────────────────────────────────

    findCandidates() {
        const DOM = window.ConsentBreakerDOM;
        const candidates = [];

        // Find potential overlays/modals
        const potentialOverlays = document.querySelectorAll(`
      [class*="cookie"],
      [class*="consent"],
      [class*="gdpr"],
      [class*="privacy"],
      [class*="banner"],
      [class*="modal"],
      [class*="overlay"],
      [class*="popup"],
      [id*="cookie"],
      [id*="consent"],
      [id*="gdpr"],
      [id*="privacy"],
      [role="dialog"],
      [role="alertdialog"],
      [aria-modal="true"]
    `);

        for (const element of potentialOverlays) {
            if (!DOM.isVisible(element)) continue;
            if (this.processed.has(element)) continue;

            const score = this.scoreElement(element);

            if (score > 20) { // Minimum threshold to consider
                candidates.push({ element, score });
            }
        }

        // Sort by score descending
        candidates.sort((a, b) => b.score - a.score);

        return candidates;
    },

    scoreElement(element) {
        const DOM = window.ConsentBreakerDOM;
        let score = 0;
        const reasons = [];

        // ─── Structural signals (primary) ───

        if (DOM.isFixed(element)) {
            score += this.WEIGHTS.fixedPosition;
            reasons.push('fixed');
        }

        if (DOM.hasHighZIndex(element, 1000)) {
            score += this.WEIGHTS.highZIndex;
            reasons.push('high-z');
        }

        if (DOM.isOverlay(element)) {
            score += this.WEIGHTS.overlay;
            reasons.push('overlay');
        }

        if (DOM.hasScrollLock()) {
            score += this.WEIGHTS.scrollLock;
            reasons.push('scroll-lock');
        }

        // ─── Class/ID signals ───

        const classAndId = ((element.className || '') + ' ' + (element.id || '')).toLowerCase();
        const modalPatterns = ['modal', 'overlay', 'popup', 'dialog', 'banner'];

        for (const pattern of modalPatterns) {
            if (classAndId.includes(pattern)) {
                score += this.WEIGHTS.modalClass;
                reasons.push(`class:${pattern}`);
                break;
            }
        }

        // ─── Text signals (limited weight per review) ───

        const text = (element.innerText || '').toLowerCase();
        const consentKeywords = this.getConsentKeywords();
        let keywordHits = 0;

        for (const keyword of consentKeywords) {
            if (text.includes(keyword)) {
                keywordHits++;
                if (keywordHits <= 3) { // Cap keyword contribution
                    score += this.WEIGHTS.consentKeyword;
                    reasons.push(`keyword:${keyword}`);
                }
            }
        }

        // ─── Reject button presence ───

        const rejectPatterns = this.getRejectPatterns();
        const buttons = element.querySelectorAll('button, a[role="button"], [class*="btn"]');

        for (const button of buttons) {
            const buttonText = (button.innerText || button.textContent || '').toLowerCase();
            for (const pattern of rejectPatterns) {
                if (buttonText.includes(pattern)) {
                    score += this.WEIGHTS.rejectButtonPresent;
                    reasons.push('has-reject-btn');
                    break;
                }
            }
        }

        // ─── Safeguards (negative scoring) ───

        const excludeKeywords = this.signatures?.safeguardKeywords?.exclude || [];
        for (const keyword of excludeKeywords) {
            if (text.includes(keyword.toLowerCase())) {
                // Check if consent keywords are also present
                const hasConsentKeyword = consentKeywords.some(ck => text.includes(ck));
                if (!hasConsentKeyword) {
                    score -= 50; // Strong penalty
                    reasons.push(`safeguard:${keyword}`);
                }
            }
        }

        if (reasons.length && localStorage.getItem('consent_breaker_debug')) {
            this.log(`Score ${score} for ${element.tagName}#${element.id}.${element.className}: ${reasons.join(', ')}`);
        }

        return Math.max(0, score);
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Candidate Handling
    // ─────────────────────────────────────────────────────────────────────────

    async handleCandidate(candidate) {
        const DOM = window.ConsentBreakerDOM;
        const element = candidate.element;

        // 1. Try to find and click reject button
        const rejectClicked = await this.tryRejectButton(element);

        if (rejectClicked) {
            await this.sleep(500);

            // Check if element is gone
            if (!DOM.isVisible(element)) {
                DOM.restoreScroll();
                this.reportAction('generic_reject_click', {});
                return;
            }
        }

        // 2. Try to find and click close button
        const closeClicked = await this.tryCloseButton(element);

        if (closeClicked) {
            await this.sleep(500);
        }

        // 3. If still visible, hide it
        if (DOM.isVisible(element)) {
            DOM.hideElement(element);
            this.log('Hid element after failed button attempts');
        }

        // 4. Always restore scroll
        DOM.restoreScroll();

        this.reportAction('generic_hide', { hadReject: rejectClicked, hadClose: closeClicked });
    },

    async tryRejectButton(container) {
        const DOM = window.ConsentBreakerDOM;
        const rejectPatterns = this.getRejectPatterns();

        const buttons = container.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]');

        for (const button of buttons) {
            if (!DOM.isVisible(button)) continue;

            const buttonText = (button.innerText || button.textContent || button.value || '').toLowerCase();
            const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
            const title = (button.getAttribute('title') || '').toLowerCase();

            const checkText = buttonText + ' ' + ariaLabel + ' ' + title;

            for (const pattern of rejectPatterns) {
                if (checkText.includes(pattern)) {
                    // Avoid accept buttons
                    const acceptPatterns = ['accept', 'agree', 'allow', 'akkoord', 'accepteer', 'toestaan'];
                    const isAccept = acceptPatterns.some(ap => checkText.includes(ap));

                    if (!isAccept) {
                        this.log(`Found reject button: "${buttonText.trim()}"`);
                        DOM.safeClick(button);
                        return true;
                    }
                }
            }
        }

        return false;
    },

    async tryCloseButton(container) {
        const DOM = window.ConsentBreakerDOM;
        const closePatterns = this.signatures?.genericClosePatterns || ['close', '×', '✕', 'x'];

        const buttons = container.querySelectorAll('button, a, [role="button"]');

        for (const button of buttons) {
            if (!DOM.isVisible(button)) continue;

            const buttonText = (button.innerText || button.textContent || '').toLowerCase().trim();
            const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
            const className = (button.className || '').toLowerCase();

            // Check for close button patterns
            const isClose = (
                closePatterns.some(p => buttonText === p || ariaLabel.includes(p)) ||
                className.includes('close') ||
                className.includes('dismiss') ||
                button.getAttribute('data-dismiss') === 'modal'
            );

            if (isClose) {
                this.log(`Found close button: "${buttonText}"`);
                DOM.safeClick(button);
                return true;
            }
        }

        return false;
    },

    // ─────────────────────────────────────────────────────────────────────────
    // DOM Observer
    // ─────────────────────────────────────────────────────────────────────────

    observeDOM() {
        const observer = new MutationObserver((mutations) => {
            let shouldScan = false;

            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const classAndId = ((node.className || '') + ' ' + (node.id || '')).toLowerCase();
                        if (classAndId.match(/cookie|consent|gdpr|privacy|banner|modal|overlay/)) {
                            shouldScan = true;
                            break;
                        }
                    }
                }
                if (shouldScan) break;
            }

            if (shouldScan) {
                // Debounce
                clearTimeout(this.scanTimeout);
                this.scanTimeout = setTimeout(() => this.scan(), 200);
            }
        });

        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    getConsentKeywords() {
        const base = ['cookie', 'consent', 'privacy', 'gdpr', 'tracking', 'partner', 'vendor', 'third party', 'legitimate interest', 'personali'];
        const required = this.signatures?.safeguardKeywords?.require || [];
        return [...new Set([...base, ...required])];
    },

    getRejectPatterns() {
        const patterns = [];
        const genericPatterns = this.signatures?.genericRejectPatterns || {};

        for (const lang of Object.values(genericPatterns)) {
            patterns.push(...lang);
        }

        return [...new Set(patterns)];
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    reportAction(action, details) {
        try {
            chrome.runtime.sendMessage({
                type: 'LOG_ACTION',
                data: {
                    action,
                    domain: window.location.hostname,
                    details
                }
            });

            chrome.runtime.sendMessage({
                type: 'UPDATE_STATS',
                data: { bannerBlocked: true }
            });
        } catch (e) {
            // Extension context might be invalid
        }
    },

    log(message, level = 'info') {
        if (window.__cbDebug || localStorage.getItem('consent_breaker_debug')) {
            console.log(`[Consent Breaker Banner] [${level.toUpperCase()}] ${message}`);
        }
    }
};

// Export
if (typeof window !== 'undefined') {
    window.ConsentBreakerBanner = BannerSlayer;
}
