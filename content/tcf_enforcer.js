/**
 * Consent Breaker - TCF Enforcer
 * V2: Adds reporting hooks
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
    },

    injectOverrideScript() {
        if (this.injected) return;
        try {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('content/tcf_injected.js');
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

            if (success) {
                this.report('TCF Override', 'Forced reject-all consent');
            } else if (hadOriginal) {
                // Fallback or warning
                this.report('TCF Detected', 'Override failed, native CMP active');
            }
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
            if (!this.tcfDetected) { // Only report once
                this.tcfDetected = true;
                this.log('CMP frame detected');
                this.report('TCF Frame', 'Detected CMP iframe');
            }
        }
    },

    report(action, details) {
        chrome.runtime.sendMessage({
            type: 'REPORT_ACTION',
            data: { action, details, domain: window.location.hostname }
        }).catch(() => { });
    },

    log(msg, level = 'info') {
        if (window.__cbDebug) console.log(`[CB-TCF] [${level.toUpperCase()}] ${msg}`);
    }
};

if (typeof window !== 'undefined') {
    window.ConsentBreakerTCF = TCFEnforcer;
}
