/**
 * Consent Breaker - Banner Slayer
 * V2: Mode-driven with reporting + Shadow DOM Support
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

        // 1. Known CMPs (Updated to use deep search if needed, though most signatures are global)
        // For now, signatures reuse querySelector, but we could upgrade them to deepQuerySelectorAll if needed.
        if (await this.handleKnownCMPs()) return;

        // 2. Heuristics (Now using Deep Search)
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

        // Note: To support Shadow DOM signatures, deepQuerySelectorAll would be needed here too.
        // For now, we assume known CMPs are mostly in Light DOM, but heuristics scan Shadow.

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
      [class*="cookie"], [class*="consent"], [class*="gdpr"], [class*="privacy"], [class*="cmp"], [class*="notice"],
      [id*="cookie"], [id*="consent"], [id*="gdpr"], [id*="cmp"], [id*="notice"], [role="dialog"], [role="alertdialog"]
    `;

        // USE DEEP SEARCH NOW
        const elements = DOM.deepQuerySelectorAll(selector);

        elements.forEach(el => {
            // Element might have been removed during iteration
            if (!el.isConnected) return;

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

        // Text Analysis (Handle Shadow DOM content access safely)
        const text = (element.innerText || element.textContent || '').toLowerCase();

        // Strong Reject Keywords
        const rejectKeywords = ['weiger', 'reject', 'decline', 'alles weigeren', 'alleen noodzakelijk'];
        let hasRejectKey = false;
        rejectKeywords.forEach(k => { if (text.includes(k)) hasRejectKey = true; });

        // Strong Accept/Confirmation Keywords
        const acceptKeywords = ['akkoord', 'accept', 'accepteren', 'begrepen', 'prima', 'aanvaarden', 'verder gaan'];

        // General Keywords
        const generalKeywords = ['cookie', 'consent', 'privacy', 'partner', 'instellen', 'toestemming', 'cmp'];
        let textScore = 0;
        generalKeywords.forEach(k => { if (text.includes(k)) textScore += 5; });

        if (score < 10 && textScore > 0) textScore = 0;
        score += Math.min(textScore, 25);

        // Button Analysis
        const buttons = element.querySelectorAll('button, a, .btn, [role="button"], input[type="button"], input[type="submit"]');
        let hasRejectBtn = false;
        let hasAcceptBtn = false;
        let hasAction = false;

        buttons.forEach(btn => {
            hasAction = true;
            const bText = (btn.innerText || btn.value || '').toLowerCase();

            if (rejectKeywords.some(k => bText.includes(k))) {
                hasRejectBtn = true;
            }
            if (acceptKeywords.some(k => bText.includes(k))) {
                hasAcceptBtn = true;
            }
        });

        if (hasAction) score += 5;

        // Boost scores
        if (hasRejectBtn) score += 40;
        else if (hasAcceptBtn) score += 30;

        if (hasRejectKey) score += 10;

        // Safeguards
        if (text.includes('checkout') || text.includes('log in') || text.includes('sign in') || text.includes('wachtwoord')) {
            score -= 100; // Strong penalty
        }

        return score;
    },

    async handleCandidate(cand) {
        const DOM = window.ConsentBreakerDOM;
        const el = cand.element;

        // 1. Try clicking Reject
        if (await this.tryRejectButton(el)) {
            await this.sleep(500);
            if (!DOM.isVisible(el)) {
                DOM.restoreScroll();
                this.report('Banner Rejected', 'Clicked heuristic reject button');
                return;
            }
        }

        // 2. Try clicking Close
        if (await this.tryCloseButton(el)) {
            await this.sleep(500);
            if (!DOM.isVisible(el)) {
                DOM.restoreScroll();
                this.report('Banner Closed', 'Clicked heuristic close button');
                return;
            }
        }

        // 3. Fallback: Removal (Slay)
        const shouldRemove = (this.mode === 'extreme' && cand.score >= 40) ||
            (this.mode === 'normal' && cand.score >= 70);

        if (shouldRemove) {
            DOM.hideElement(el);
            const backdrop = document.querySelector('.modal-backdrop, .overlay, .backdrop');
            if (backdrop && DOM.isVisible(backdrop)) DOM.hideElement(backdrop);

            DOM.restoreScroll();
            this.report('Banner Removed', 'Heuristic removal (Slayed)');
        }
    },

    async tryRejectButton(container) {
        const DOM = window.ConsentBreakerDOM;
        const buttons = container.querySelectorAll('button, a, .btn, input[type="button"]');
        const rejectKeywords = ['weiger', 'reject', 'decline', 'noodzakelijk', 'instellen', 'manage'];

        for (const btn of buttons) {
            const txt = (btn.innerText || btn.value || '').toLowerCase();
            if (rejectKeywords.some(k => txt.includes(k))) {
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
        const fastScan = setInterval(() => this.scan(), 1000);
        setTimeout(() => clearInterval(fastScan), 12000);

        const observer = new MutationObserver((mutations) => {
            if (this.scanTimeout) clearTimeout(this.scanTimeout);
            this.scanTimeout = setTimeout(() => this.scan(), 500);
        });

        // Note: observe only works on light DOM root. For Shadow DOM, each root needs its own observer.
        // This is complex. For V2, we rely on the periodic fastScan + main DOM changes triggering scans.
        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });
    },

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
    log(msg) { if (window.__cbDebug) console.log(`[CB-Banner] ${msg}`); }
};

if (typeof window !== 'undefined') {
    window.ConsentBreakerBanner = BannerSlayer;
}
