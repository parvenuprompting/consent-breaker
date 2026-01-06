/**
 * Consent Breaker - Banner Slayer
 * Mode-driven heuristics.
 */

const BannerSlayer = {
    signatures: null,
    processed: new WeakSet(),
    mode: 'normal',

    // Dynamic config based on mode
    config: {
        threshold: 60,
        textWeightMax: 40, // percentage cap
        retryLimit: 0
    },

    async init(mode = 'normal') {
        this.mode = mode;
        this.configureMode();

        try {
            const response = await fetch(chrome.runtime.getURL('content/cmp_signatures.json'));
            this.signatures = await response.json();
        } catch (e) {
            this.signatures = { cmpProviders: [], genericRejectPatterns: {}, genericClosePatterns: [] };
        }

        await this.waitForDOM();
        this.scan();
        this.observeDOM();
    },

    configureMode() {
        if (this.mode === 'extreme') {
            this.config.threshold = 40;  // Lower threshold
            this.config.textWeightMax = 50; // Allow more text influence
            this.config.retryLimit = 3; // Aggressive retries
        } else {
            this.config.threshold = 60;
            this.config.textWeightMax = 40;
            this.config.retryLimit = 0;
        }
        this.log(`Configured for ${this.mode} mode (Threshold: ${this.config.threshold})`);
    },

    waitForDOM() {
        return new Promise(resolve => {
            if (document.readyState !== 'loading') resolve();
            else document.addEventListener('DOMContentLoaded', resolve, { once: true });
        });
    },

    async scan() {
        const DOM = window.ConsentBreakerDOM;
        if (!DOM) return;

        // 1. Known CMPs
        if (await this.handleKnownCMPs()) return;

        // 2. Heuristics
        const candidates = this.findCandidates();
        for (const cand of candidates) {
            if (this.processed.has(cand.element)) continue;

            if (cand.score >= this.config.threshold) {
                this.log(`Processing candidate (Score ${cand.score} >= ${this.config.threshold})`);
                await this.handleCandidate(cand);
                this.processed.add(cand.element);
            }
        }

        // 3. Scroll unlock
        if (DOM.hasScrollLock()) DOM.restoreScroll();
    },

    async handleKnownCMPs() {
        if (!this.signatures?.cmpProviders) return false;
        const DOM = window.ConsentBreakerDOM;

        for (const cmp of this.signatures.cmpProviders) {
            let container = null;
            for (const sel of cmp.selectors.container) {
                container = document.querySelector(sel);
                if (container) break;
            }
            if (!container) continue;

            this.log(`Found ${cmp.name}`);

            // Try buttons
            for (const sel of cmp.selectors.rejectButtons) {
                const btn = document.querySelector(sel);
                if (btn && DOM.isVisible(btn)) {
                    DOM.safeClick(btn);
                    await this.sleep(500);
                    // Check success
                    if (!DOM.isVisible(container)) {
                        DOM.restoreScroll();
                        return true;
                    }
                }
            }

            // If extreme mode OR normal fallback: close/hide
            // In extreme mode, we don't wait for reject button failure to hide
            if (this.mode === 'extreme' || !this.signatures.tcf) {
                DOM.hideElement(container);
                DOM.restoreScroll();
                return true;
            }
        }
        return false;
    },

    findCandidates() {
        const DOM = window.ConsentBreakerDOM;
        const candidates = [];
        const selector = `
      [class*="cookie"], [class*="consent"], [class*="gdpr"], [class*="privacy"],
      [id*="cookie"], [id*="consent"], [id*="gdpr"], [role="dialog"], [role="alertdialog"]
    `; // Simplified for performance

        document.querySelectorAll(selector).forEach(el => {
            if (!DOM.isVisible(el) || this.processed.has(el)) return;
            const score = this.scoreElement(el);
            if (score > 10) candidates.push({ element: el, score });
        });

        return candidates.sort((a, b) => b.score - a.score);
    },

    scoreElement(element) {
        const DOM = window.ConsentBreakerDOM;
        let score = 0;

        // Structural
        if (DOM.isFixed(element)) score += 20;
        if (DOM.hasHighZIndex(element, 1000)) score += 15;
        if (DOM.isOverlay(element)) score += 20;
        if (DOM.hasScrollLock()) score += 10;

        // Text (Max capped)
        const text = (element.innerText || '').toLowerCase();
        let textScore = 0;
        const keywords = ['cookie', 'consent', 'accept', 'privacy', 'partner'];
        keywords.forEach(k => { if (text.includes(k)) textScore += 5; });

        // Cap text score influence
        // Total max score is roughly 100. weightMax is percentage roughly.
        // If structural is 0, we shouldn't rely solely on text usually.
        if (score < 10 && textScore > 0) textScore = 0; // Require SOME structure

        score += Math.min(textScore, 25); // Hard cap 25 points from text

        // Buttons
        if (element.querySelector('button, a[role="button"]')) score += 5;

        // Safeguards
        if (text.includes('checkout') || text.includes('log in') || text.includes('sign in')) {
            score -= 50;
        }

        return score;
    },

    async handleCandidate(cand) {
        const DOM = window.ConsentBreakerDOM;
        const el = cand.element;

        // 1. Try Reject
        if (await this.tryRejectButton(el)) {
            await this.sleep(500);
            if (!DOM.isVisible(el)) { DOM.restoreScroll(); return; }
        }

        // 2. Try Close
        if (await this.tryCloseButton(el)) {
            await this.sleep(500);
            if (!DOM.isVisible(el)) { DOM.restoreScroll(); return; }
        }

        // 3. Extreme removal
        if (this.mode === 'extreme') {
            DOM.hideElement(el);
            DOM.restoreScroll();
            this.log('Extreme removal applied');
        } else {
            // Normal mode: only hide if score is VERY high (certainty)
            if (cand.score > 80) {
                DOM.hideElement(el);
            }
        }
    },

    async tryRejectButton(container) {
        // (Simplified logic reused from previous iteration via this method call)
        // For brevity in this artifact, assuming improved logic or reusing previous method structure
        // Re-implementing basic logic here for completeness as file is overwritten
        const DOM = window.ConsentBreakerDOM;
        const buttons = container.querySelectorAll('button, a, .btn');
        for (const btn of buttons) {
            const txt = (btn.innerText || '').toLowerCase();
            if (txt.includes('reject') || txt.includes('weiger') || txt.includes('decline')) {
                DOM.safeClick(btn);
                return true;
            }
        }
        return false;
    },

    async tryCloseButton(container) {
        const DOM = window.ConsentBreakerDOM;
        const buttons = container.querySelectorAll('button, a, [role="button"]');
        for (const btn of buttons) {
            const txt = (btn.innerText || '').toLowerCase();
            if (txt === 'x' || txt.includes('close') || txt.includes('sluit')) {
                DOM.safeClick(btn);
                return true;
            }
        }
        return false;
    },

    observeDOM() {
        const observer = new MutationObserver(() => {
            clearTimeout(this.scanTimeout);
            this.scanTimeout = setTimeout(() => this.scan(), 500);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    },

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
    log(msg) { if (window.__cbDebug) console.log(`[CB-Banner] ${msg}`); }
};

if (typeof window !== 'undefined') {
    window.ConsentBreakerBanner = BannerSlayer;
}
