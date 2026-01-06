/**
 * Consent Breaker - TCF Enforcer
 * 
 * Detects TCF/CMP environments and injects override script into page context.
 * Runs at document_start for pre-emptive hook installation.
 */

const TCFEnforcer = {
    injected: false,
    tcfDetected: false,

    // ─────────────────────────────────────────────────────────────────────────
    // Initialization
    // ─────────────────────────────────────────────────────────────────────────

    init() {
        // Inject immediately at document_start (before CMP loads)
        this.injectOverrideScript();

        // Listen for success message from injected script
        window.addEventListener('message', this.handleMessage.bind(this));

        // Also set up detection for late-loading CMPs
        this.setupLateDetection();
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Script Injection (Page Context)
    // ─────────────────────────────────────────────────────────────────────────

    injectOverrideScript() {
        if (this.injected) return;

        try {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('content/tcf_injected.js');
            script.onload = () => {
                script.remove(); // Clean up
            };

            // Inject as early as possible
            const target = document.head || document.documentElement;
            target.insertBefore(script, target.firstChild);

            this.injected = true;
            this.log('TCF override script injected');
        } catch (error) {
            this.log('Failed to inject TCF script: ' + error.message, 'error');
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Message Handling
    // ─────────────────────────────────────────────────────────────────────────

    handleMessage(event) {
        if (event.source !== window) return;

        const { type, success, hadOriginal } = event.data || {};

        if (type === 'CONSENT_BREAKER_TCF_OVERRIDE') {
            this.tcfDetected = hadOriginal;
            this.log(`TCF override ${success ? 'successful' : 'failed'}. Had existing API: ${hadOriginal}`);

            // Notify service worker
            this.reportAction('tcf_override', {
                success,
                hadOriginal
            });
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Late Detection (for dynamically loaded CMPs)
    // ─────────────────────────────────────────────────────────────────────────

    setupLateDetection() {
        // Check for CMP frames that might load later
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.tagName === 'IFRAME') {
                        this.checkFrame(node);
                    }
                }
            }
        });

        // Start observing when DOM is ready
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                observer.observe(document.body, { childList: true, subtree: true });
            });
        }

        // Check existing frames periodically (some CMPs inject late)
        setTimeout(() => this.checkExistingFrames(), 1000);
        setTimeout(() => this.checkExistingFrames(), 3000);
    },

    checkExistingFrames() {
        const frames = document.querySelectorAll('iframe');
        for (const frame of frames) {
            this.checkFrame(frame);
        }
    },

    checkFrame(frame) {
        const name = frame.name || '';
        const src = frame.src || '';

        // TCF locator frame detection
        if (name === '__tcfapiLocator' ||
            name.includes('cmp') ||
            src.includes('consent') ||
            src.includes('cmp')) {
            this.tcfDetected = true;
            this.log('TCF/CMP frame detected: ' + (name || src));
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // CMP Signature Detection
    // ─────────────────────────────────────────────────────────────────────────

    async detectCMP() {
        // Load CMP signatures
        let signatures;
        try {
            const response = await fetch(chrome.runtime.getURL('content/cmp_signatures.json'));
            signatures = await response.json();
        } catch (e) {
            this.log('Failed to load CMP signatures', 'error');
            return null;
        }

        // Check each CMP provider
        for (const cmp of signatures.cmpProviders) {
            for (const selector of cmp.selectors.container) {
                if (document.querySelector(selector)) {
                    this.log(`Detected CMP: ${cmp.name}`);
                    return cmp;
                }
            }
        }

        return null;
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Attempt Reject via CMP UI (fallback)
    // ─────────────────────────────────────────────────────────────────────────

    async attemptCMPReject(cmp) {
        if (!cmp) return false;

        const DOM = window.ConsentBreakerDOM;
        if (!DOM) return false;

        // Try reject buttons in order
        for (const selector of cmp.selectors.rejectButtons) {
            const button = document.querySelector(selector);
            if (button && DOM.isVisible(button)) {
                this.log(`Clicking reject button: ${selector}`);
                DOM.safeClick(button);

                // Wait a bit for dialog to close
                await new Promise(r => setTimeout(r, 500));

                // Check if container is gone
                const containerGone = !cmp.selectors.container.some(
                    s => document.querySelector(s)
                );

                if (containerGone) {
                    this.reportAction('cmp_ui_reject', { cmp: cmp.name });
                    return true;
                }
            }
        }

        return false;
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Reporting
    // ─────────────────────────────────────────────────────────────────────────

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
        } catch (e) {
            // Extension context might be invalid
        }
    },

    log(message, level = 'info') {
        // Check if debug mode is enabled
        if (window.__cbDebug || localStorage.getItem('consent_breaker_debug')) {
            console.log(`[Consent Breaker TCF] [${level.toUpperCase()}] ${message}`);
        }
    }
};

// Export for other content scripts
if (typeof window !== 'undefined') {
    window.ConsentBreakerTCF = TCFEnforcer;

    // Initialize immediately (we're at document_start)
    TCFEnforcer.init();
}
