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

    async handleKnownCMPs() {
        if (!this.signatures?.cmpProviders) return false;

        const DOM = window.ConsentBreakerDOM;

        for (const provider of this.signatures.cmpProviders) {
            // Check container presence
            let container = null;
            for (const selector of provider.selectors.container) {
                container = document.querySelector(selector);
                if (container && DOM.isVisible(container)) {
                    break;
                }
            }

            if (container) {
                this.log(`Found known CMP: ${provider.name}`);
                
                // Try reject buttons
                let handled = false;
                for (const rejectSelector of provider.selectors.rejectButtons) {
                    const buttons = document.querySelectorAll(rejectSelector);
                    for (const btn of buttons) {
                        if (DOM.isVisible(btn)) {
                            this.clickButton(btn, `${provider.name} Reject`);
                            handled = true;
                            // Don't break immediately, might need to click multiple? usually one is enough.
                            break; 
                        }
                    }
                    if (handled) break;
                }

                // If not handled and EXTREME mode, try aggressive tactics
                if (!handled && this.mode === 'extreme' && provider.selectors.acceptButtons) {
                    // Some users prefer acceptance over banners? Unlikely for "Consent Breaker".
                    // But if the goal is "No Cookie Windows", maybe?
                    // Safe approach: Just hide it?
                    // For now, let's stick to rejecting. hiding is dangerous if it leaves a modal backdrop.
                    
                    // Attempt to hide if no button found?
                    // container.style.display = 'none';
                    // container.style.visibility = 'hidden';
                    // this.log('Extreme: Force hid container');
                    // handled = true;
                }
                
                return true; // We identified it, so we stop heuristics loop
            }
        }
        return false;
    },

    findCandidates() {
        const DOM = window.ConsentBreakerDOM;
        const candidates = [];
        // Scan for potential cookie banners
        // 1. Fixed/Absolute position elements
        // 2. High z-index
        // 3. Contains keywords
        
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT,
            {
                acceptNode: (node) => {
                   if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
                   // Optimization: skip hidden elements?
                   // if (!DOM.isVisible(node)) return NodeFilter.FILTER_REJECT; // Expensive to check on all
                   return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let currentNode;
        while (currentNode = walker.nextNode()) {
            // Quick checks before expensive style computation
            const tag = currentNode.tagName;
            if (['DIV', 'SECTION', 'ASIDE', 'FOOTER', 'HEADER', 'DIALOG'].includes(tag)) {
                this.scoreElement(currentNode, candidates);
            }
        }
        
        // Sort by score
        return candidates.sort((a, b) => b.score - a.score);
    },

    scoreElement(element, candidates) {
        const DOM = window.ConsentBreakerDOM;
        const style = window.getComputedStyle(element);
        
        // Filter out non-fixed/overlay elements
        const pos = style.position;
        if (pos !== 'fixed' && pos !== 'absolute' && pos !== 'sticky') return;
        
        // Filter out small elements (likely badges or chat bubbles)
        const rect = element.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 50) return;
        
        // Filter out invisible
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

        let score = 0;
        const lowerText = element.innerText.toLowerCase();
        
        // 1. Keywords Analysis
        const hasRequire = this.signatures.safeguardKeywords.require.some(kw => lowerText.includes(kw));
        const hasExclude = this.signatures.safeguardKeywords.exclude.some(kw => lowerText.includes(kw));
        
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
            candidates.push({ element, score });
        }
    },

    handleCandidate(candidate) {
        const el = candidate.element;
        this.log(`Handling candidate: ${el.tagName} (Score: ${candidate.score})`);
        
        // Strategy 1: Find Reject Button
        if (this.clickUsingPatterns(el, this.signatures.genericRejectPatterns[navigator.language.split('-')[0]] || this.signatures.genericRejectPatterns['en'])) {
            return;
        }

        // Strategy 2: Find Close Button
        if (this.clickUsingPatterns(el, this.signatures.genericClosePatterns)) {
            return;
        }
        
        // Strategy 3: Extreme Mode Force Hide
        if (this.mode === 'extreme') {
             this.log('Extreme: Force removing candidate');
             el.remove(); // Nuke it
        }
    },
    
    clickUsingPatterns(root, patterns) {
        const DOM = window.ConsentBreakerDOM;
        if (!patterns) return false;
        
        // Find buttons or links
        const clickable = root.querySelectorAll('button, a, div[role="button"], span[role="button"]');
        for (const node of clickable) {
            const text = node.innerText.toLowerCase();
            for (const pattern of patterns) {
                if (text.includes(pattern.toLowerCase()) && DOM.isVisible(node)) {
                    this.clickButton(node, `Pattern match: ${pattern}`);
                    return true;
                }
            }
        }
        return false;
    },

    clickButton(element, reason) {
        this.log(`Clicking [${reason}]`);
        element.click();
        return true;
    },

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
