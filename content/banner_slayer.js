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
      [class*="cookie"], [class*="consent"], [class*="gdpr"], [class*="privacy"], [class*="cmp"], [class*="notice"],
      [id*="cookie"], [id*="consent"], [id*="gdpr"], [id*="cmp"], [id*="notice"], [role="dialog"], [role="alertdialog"]
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

        // Text Analysis
        const text = (element.innerText || '').toLowerCase();

        // Strong Reject Keywords
        const rejectKeywords = ['weiger', 'reject', 'decline', 'alles weigeren', 'alleen noodzakelijk'];
        let hasRejectKey = false;
        rejectKeywords.forEach(k => { if (text.includes(k)) hasRejectKey = true; });

        // Strong Accept/Confirmation Keywords (Signals "This IS a banner")
        // "akkoord", "begrepen", "accept", "prima", "aanvaarden"
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
        let hasAcceptBtn = false; // New: Detect accept buttons too
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
        else if (hasAcceptBtn) score += 30; // Accept button strongly implies it is a banner

        if (hasRejectKey) score += 10;

        // Safeguards (Do NOT remove login/checkout)
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
        // In Extreme: Always remove if score > threshold
        // In Normal: Only remove if we are VERY sure (score > 80) OR if it matches "Accept Only" pattern
        // Update logic: If it has Akkoord button (score += 30) and structural (20+20) + text (10) -> Score ~80.

        const shouldRemove = (this.mode === 'extreme' && cand.score >= 40) ||
            (this.mode === 'normal' && cand.score >= 70); // Lowered from 80 to catch Akkoord-only banners

        if (shouldRemove) {
            DOM.hideElement(el);
            // Also look for separate backdrops
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
