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
            this.signatures = { cmpProviders: [], genericRejectPatterns: {}, genericClosePatterns: [], safeguardKeywords: { require: [], exclude: [] } };
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

        // 1. Known CMPs (Using deep search across Shadow DOM)
        this.handleKnownCMPs().then(found => {
            if (found) return;

            // 2. Heuristics (Using Deep Search & Dialog detection)
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

    async handleKnownCMPs() {
        if (!this.signatures?.cmpProviders) return false;
        const DOM = window.ConsentBreakerDOM;

        for (const provider of this.signatures.cmpProviders) {
            let container = null;
            for (const selector of provider.selectors.container) {
                container = DOM.deepQuerySelector(selector);
                if (container && DOM.isVisible(container)) break;
            }

            if (container) {
                this.log(`Found known CMP: ${provider.name}`);

                let handled = false;
                for (const rejectSelector of provider.selectors.rejectButtons) {
                    const buttons = DOM.deepQuerySelectorAll(rejectSelector);
                    for (const btn of buttons) {
                        if (DOM.isVisible(btn)) {
                            this.clickButton(btn, `${provider.name} Reject`);
                            handled = true;
                            break;
                        }
                    }
                    if (handled) break;
                }

                // Fallback in Extreme mode
                if (!handled && this.mode === 'extreme') {
                    DOM.safeHide(container, `${provider.name} force hide`);
                    handled = true;
                }

                if (handled) {
                    this.reportAction(`Slayed ${provider.name}`);
                    return true;
                }
            }
        }
        return false;
    },

    findCandidates() {
        const DOM = window.ConsentBreakerDOM;
        const candidates = [];

        // 1. Eerst expliciete dialogs
        const dialogs = DOM.findDialogs();
        dialogs.forEach(el => {
            this.scoreElement(el, candidates, 30); // bonus voor role="dialog"
        });

        // 2. Daarna de rest via deepQuerySelectorAll op veelvoorkomende tags
        const possible = DOM.deepQuerySelectorAll('div, section, aside, footer, header, dialog');
        possible.forEach(el => this.scoreElement(el, candidates));

        return candidates.sort((a, b) => b.score - a.score);
    },

    scoreElement(element, candidates, bonusScore = 0) {
        const DOM = window.ConsentBreakerDOM;
        if (!element || this.processed.has(element)) return;

        const style = window.getComputedStyle(element);

        // Filter out non-fixed/overlay elements
        const pos = style.position;
        if (pos !== 'fixed' && pos !== 'absolute' && pos !== 'sticky') return;

        // Filter out small elements (likely badges or chat bubbles)
        const rect = element.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 50) return;

        // Filter out invisible
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

        let score = bonusScore;
        const lowerText = (element.innerText || element.textContent || '').toLowerCase();

        // 1. Keywords Analysis
        const hasRequire = this.signatures?.safeguardKeywords?.require?.some(kw => lowerText.includes(kw));
        const hasExclude = this.signatures?.safeguardKeywords?.exclude?.some(kw => lowerText.includes(kw));

        if (hasExclude) return; // Safer to skip
        if (hasRequire) score += 50;

        // 2. Z-Index
        const zIndex = parseInt(style.zIndex);
        if (!isNaN(zIndex) && zIndex > 100) score += 20;
        if (!isNaN(zIndex) && zIndex > 1000) score += 10;

        // 3. Position (Bottom/Top banners usually)
        if (rect.bottom === window.innerHeight || rect.top === 0) score += 10;

        // 4. Modal characteristics (Overlay covering screen?)
        if (rect.width >= window.innerWidth && rect.height >= window.innerHeight) score += 30; // Full screen overlay

        if (score > 0) {
            if (!candidates.some(c => c.element === element)) {
                candidates.push({ element, score });
            }
        }
    },

    handleCandidate(candidate) {
        const DOM = window.ConsentBreakerDOM;
        const el = candidate.element;
        this.log(`Handling candidate: ${el.tagName} (Score: ${candidate.score})`);

        const lang = (navigator.language || 'en').split('-')[0];
        const rejectPatterns = this.signatures?.genericRejectPatterns?.[lang] || this.signatures?.genericRejectPatterns?.['en'];

        // Strategy 1: Find Reject Button
        if (this.clickUsingPatterns(el, rejectPatterns)) {
            return;
        }

        // Strategy 2: Find Close Button
        if (this.clickUsingPatterns(el, this.signatures?.genericClosePatterns)) {
            return;
        }

        // Strategy 3: Extreme Mode Force Hide
        if (this.mode === 'extreme') {
            this.log('Extreme: Safe hiding candidate');
            DOM.safeHide(el, 'extreme force');
            this.reportAction('Force hid banner');
        }
    },

    clickUsingPatterns(root, patterns) {
        const DOM = window.ConsentBreakerDOM;
        if (!patterns || !root) return false;

        const clickable = DOM ? DOM.deepQuerySelectorAll('button, a, div[role="button"], span[role="button"]', root) : root.querySelectorAll('button, a, div[role="button"], span[role="button"]');
        for (const node of clickable) {
            const text = (node.innerText || node.textContent || '').toLowerCase();
            for (const pattern of patterns) {
                if (text.includes(pattern.toLowerCase()) && DOM.isVisible(node)) {
                    this.clickButton(node, `Pattern match: ${pattern}`);
                    this.reportAction(`Clicked reject/close pattern (${pattern})`);
                    return true;
                }
            }
        }
        return false;
    },

    clickButton(element, reason) {
        this.log(`Clicking [${reason}]`);
        try {
            element.click();
        } catch (e) {
            const DOM = window.ConsentBreakerDOM;
            DOM?.safeClick(element);
        }
        return true;
    },

    reportAction(details) {
        try {
            chrome.runtime.sendMessage({
                type: 'REPORT_ACTION',
                data: { action: 'Banner Slayer', details, domain: window.location.hostname }
            }).catch(() => { });
        } catch (e) { }
    },

    observeDOM() {
        let scheduled = false;

        const scheduleScan = () => {
            if (scheduled) return;
            scheduled = true;
            setTimeout(() => {
                scheduled = false;
                this.scan();
            }, this.mode === 'extreme' ? 800 : 1500);
        };

        const observer = new MutationObserver((mutations) => {
            const significant = mutations.some(m =>
                m.type === 'childList' ||
                (m.type === 'attributes' && ['class', 'style', 'hidden', 'aria-hidden'].includes(m.attributeName))
            );
            if (significant) scheduleScan();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class', 'hidden', 'aria-hidden']
        });
    },

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
    log(msg) { if (window.__cbDebug) console.log(`[CB-Banner] ${msg}`); }
};

if (typeof window !== 'undefined') {
    window.ConsentBreakerBanner = BannerSlayer;
}

