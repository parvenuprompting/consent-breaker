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

    scan() {
        const DOM = window.ConsentBreakerDOM;
        if (!DOM) return;

        // Iframe Throttling: Skip heavy scanning in small iframes (likely ads)
        if (window !== window.top) {
            if (window.innerWidth < 300 || window.innerHeight < 300) {
                return;
            }
        }

        // 1. Known CMPs (Updated to use deep search if needed, though most signatures are global)
        // For now, signatures reuse querySelector, but we could upgrade them to deepQuerySelectorAll if needed.
        this.handleKnownCMPs().then(found => {
            if (found) return;

            // 2. Heuristics (Now using Deep Search)
            const candidates = this.findCandidates();
            for (const cand of candidates) {
                if (this.processed.has(cand.element)) continue;

                if (cand.score >= this.config.threshold) {
                    this.log(`Processing candidate (Score ${cand.score} >= ${this.config.threshold})`);
                    this.handleCandidate(cand);
                    this.processed.add(cand.element);
                }
            }

            // 3. Scroll unlock
            if (DOM.hasScrollLock()) {
                DOM.restoreScroll();
            }
        });
    },

    // ... (handleKnownCMPs, findCandidates, etc. unchanged)

    observeDOM() {
        // Debounce helper
        const debounce = (func, wait) => {
            let timeout;
            return (...args) => {
                const later = () => {
                    clearTimeout(timeout);
                    func.apply(this, args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        };

        // Optimized scan trigger (Smart Debounce: 1000ms)
        const debouncedScan = debounce(() => this.scan(), 1000);

        const observer = new MutationObserver((mutations) => {
            let significantChange = false;
            for (const m of mutations) {
                // Ignore small attribute changes on non-containers
                if (m.type === 'childList') {
                    significantChange = true;
                    break;
                }
                // If it's just a class change, only trigger if it might be a modal opening
                if (m.type === 'attributes' && (m.attributeName === 'class' || m.attributeName === 'style')) {
                    significantChange = true;
                }
            }

            if (significantChange) {
                debouncedScan();
            }
        });

        // Use more specific observation configuration to reduce noise
        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class', 'hidden'] // Only listen to relevant attribute changes
        });

        // Fallback periodic scan (reduced frequency)
        const period = this.mode === 'extreme' ? 3000 : 5000;
        setInterval(() => this.scan(), period);
    },

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
    log(msg) { if (window.__cbDebug) console.log(`[CB-Banner] ${msg}`); }
};

if (typeof window !== 'undefined') {
    window.ConsentBreakerBanner = BannerSlayer;
}
