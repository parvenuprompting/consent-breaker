/**
 * Consent Breaker - Banner Slayer
 * V2: Mode-driven with reporting
 */

const BannerSlayer = {
    signatures: null,
    processed: new WeakSet(),
    mode: 'normal',

    config: {
        threshold: 60,
        textWeightMax: 40,
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
            this.config.threshold = 40;
            this.config.textWeightMax = 50;
            this.config.retryLimit = 3;
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
        if (DOM.hasScrollLock()) {
            DOM.restoreScroll();
        }
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
                    if (!DOM.isVisible(container)) {
                        DOM.restoreScroll();
                        this.report('Banner Rejected', `Clicked reject on ${cmp.name}`);
                        return true;
                    }
                }
            }

            if (this.mode === 'extreme' || !this.signatures.tcf) {
                DOM.hideElement(container);
                DOM.restoreScroll();
                this.report('Banner Removed', `Forced removal of ${cmp.name}`);
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
    `;

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

        // Text
        const text = (element.innerText || '').toLowerCase();
        let textScore = 0;
        const keywords = ['cookie', 'consent', 'accept', 'privacy', 'partner'];
        keywords.forEach(k => { if (text.includes(k)) textScore += 5; });

        if (score < 10 && textScore > 0) textScore = 0;
        score += Math.min(textScore, 25);

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

        if (await this.tryRejectButton(el)) {
            await this.sleep(500);
            if (!DOM.isVisible(el)) {
                DOM.restoreScroll();
                this.report('Banner Rejected', 'Clicked heuristic reject button');
                return;
            }
        }

        if (await this.tryCloseButton(el)) {
            await this.sleep(500);
            if (!DOM.isVisible(el)) {
                DOM.restoreScroll();
                this.report('Banner Closed', 'Clicked heuristic close button');
                return;
            }
        }

        if (this.mode === 'extreme') {
            DOM.hideElement(el);
            DOM.restoreScroll();
            this.report('Banner Removed', 'Extreme mode forced removal');
        } else {
            if (cand.score > 80) {
                DOM.hideElement(el);
                this.report('Banner Removed', 'High confidence removal');
            }
        }
    },

    async tryRejectButton(container) {
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

    report(action, details) {
        chrome.runtime.sendMessage({
            type: 'REPORT_ACTION',
            data: { action, details, domain: window.location.hostname }
        }).catch(() => { });
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
