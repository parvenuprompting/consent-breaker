/**
 * Consent Breaker - Bootstrap
 * 
 * Entry point for content scripts.
 * Orchestrates TCF enforcer and banner slayer based on domain settings.
 */

(async function () {
    'use strict';

    const SCRIPT_ID = 'consent-breaker-bootstrap';

    if (window[SCRIPT_ID]) return;
    window[SCRIPT_ID] = true;

    // ─────────────────────────────────────────────────────────────────────────
    // Config
    // ─────────────────────────────────────────────────────────────────────────

    async function getConfig() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'GET_MODE',
                data: { domain: window.location.hostname }
            });

            const debugResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });

            return {
                mode: response?.mode || 'normal',
                debug: debugResponse?.debugMode || false
            };
        } catch (e) {
            return { mode: 'normal', debug: false }; // Fail safe
        }
    }

    async function checkDomainAllowed(domain) {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'CHECK_DOMAIN',
                data: { domain }
            });
            return response?.allowed !== false;
        } catch (e) {
            return true;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Main Execution
    // ─────────────────────────────────────────────────────────────────────────

    async function main() {
        const config = await getConfig();

        if (config.debug) {
            window.__cbDebug = true;
            localStorage.setItem('consent_breaker_debug', 'true');
        }

        const log = (msg) => {
            if (window.__cbDebug) {
                console.log(`[Consent Breaker] [${config.mode.toUpperCase()}] ${msg}`);
            }
        };

        log('Bootstrap starting...');

        const allowed = await checkDomainAllowed(window.location.hostname);
        if (!allowed && config.mode !== 'extreme') { // Allow extreme to override allowlist? No, respect allowlist always.
            // Wait, allowlist is explicitly "disabled".
            log('Domain is allowlisted, skipping');
            return;
        }

        // TCF Enforcer
        const TCF = window.ConsentBreakerTCF;
        if (TCF) {
            log('Initializing TCF enforcer');
            TCF.init(config.mode);
        }

        await new Promise(r => setTimeout(r, 100));

        // Banner Slayer
        const Banner = window.ConsentBreakerBanner;
        if (Banner) {
            log('Initializing Banner slayer');
            await Banner.init(config.mode);
        }

        try {
            await chrome.runtime.sendMessage({
                type: 'UPDATE_STATS',
                data: { siteProcessed: true }
            });
        } catch (e) { }

        // Re-scans
        window.addEventListener('load', () => {
            setTimeout(() => Banner?.scan(), 1000);
        });

        // Aggressive re-scanning in EXTREME mode
        if (config.mode === 'extreme') {
            setInterval(() => Banner?.scan(), 2000); // Poll every 2s
            log('Extreme polling active');
        } else {
            setTimeout(() => Banner?.scan(), 3000);
        }
    }

    main().catch(console.error);

})();
