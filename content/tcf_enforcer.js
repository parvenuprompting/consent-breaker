/**
 * Consent Breaker - TCF Enforcer
 * 
 * Runs at document_start.
 */

const TCFEnforcer = {
    injected: false,
    tcfDetected: false,
    mode: 'normal',

    init(mode = 'normal') {
        this.mode = mode;
        this.injectOverrideScript();
        window.addEventListener('message', this.handleMessage.bind(this));
        this.setupLateDetection();

        if (this.mode === 'extreme') {
            // In extreme mode, if we see TCF frames but no successful override,
            // we assume we need to block/reject aggressively.
            // However, TCF override script is best effort.
        }
    },

    injectOverrideScript() {
        if (this.injected) return;
        try {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('content/tcf_injected.js');
            // Pass mode via dataset if we wanted, but script is simple
            script.onload = () => script.remove();

            const target = document.head || document.documentElement;
            target.insertBefore(script, target.firstChild);
            this.injected = true;
        } catch (e) {
            this.log('Failed to inject TCF script', 'error');
        }
    },

    handleMessage(event) {
        if (event.source !== window) return;
        const { type, success, hadOriginal } = event.data || {};

        if (type === 'CONSENT_BREAKER_TCF_OVERRIDE') {
            this.tcfDetected = hadOriginal;
            this.log(`Override ${success ? 'success' : 'failed'}. Original: ${hadOriginal}`);

            // Extreme fallback: if override failed but we suspect TCF, what to do?
            // The banner slayer will likely kill the UI manifest.
        }
    },

    setupLateDetection() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.tagName === 'IFRAME') this.checkFrame(node);
                }
            }
        });

        const target = document.body || document.documentElement;
        if (target) observer.observe(target, { childList: true, subtree: true });

        setTimeout(() => this.checkExistingFrames(), 1000);
    },

    checkExistingFrames() {
        document.querySelectorAll('iframe').forEach(f => this.checkFrame(f));
    },

    checkFrame(frame) {
        const name = frame.name || '';
        const src = frame.src || '';
        if (name === '__tcfapiLocator' || name.includes('cmp') || src.includes('consent')) {
            this.tcfDetected = true;
            this.log('CMP frame detected');
        }
    },

    log(msg, level = 'info') {
        if (window.__cbDebug) console.log(`[CB-TCF] [${level.toUpperCase()}] ${msg}`);
    }
};

if (typeof window !== 'undefined') {
    window.ConsentBreakerTCF = TCFEnforcer;
    // Don't auto-init; let bootstrap do it with mode
}
