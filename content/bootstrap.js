/**
 * Consent Breaker - Bootstrap
 * 
 * Entry point for content scripts.
 * Orchestrates TCF enforcer and banner slayer based on domain settings.
 */

(async function () {
    'use strict';

    const SCRIPT_ID = 'consent-breaker-bootstrap';

    // Prevent double execution
    if (window[SCRIPT_ID]) return;
    window[SCRIPT_ID] = true;

    // ─────────────────────────────────────────────────────────────────────────
    // Debug Mode Setup
    // ─────────────────────────────────────────────────────────────────────────

    async function checkDebugMode() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
            if (response?.debugMode) {
                window.__cbDebug = true;
                localStorage.setItem('consent_breaker_debug', 'true');
            }
        } catch (e) {
            // Extension context might be invalid (e.g., during update)
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Domain Check
    // ─────────────────────────────────────────────────────────────────────────

    async function isDomainAllowed() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'CHECK_DOMAIN',
                data: { domain: window.location.hostname }
            });

            return response?.allowed !== false;
        } catch (e) {
            // On error, proceed (fail-open for UX)
            return true;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Main Execution
    // ─────────────────────────────────────────────────────────────────────────

    async function main() {
        // Check debug mode first
        await checkDebugMode();

        const log = (msg) => {
            if (window.__cbDebug) {
                console.log(`[Consent Breaker] ${msg}`);
            }
        };

        log('Bootstrap starting...');

        // Check if domain is allowed
        const allowed = await isDomainAllowed();

        if (!allowed) {
            log('Domain is allowlisted, skipping');
            return;
        }

        // TCF Enforcer is already initialized at document_start
        // (it injects synchronously for pre-emptive hook)

        const TCF = window.ConsentBreakerTCF;
        if (TCF) {
            log('TCF enforcer active');
        }

        // Wait a bit for page to stabilize before banner slaying
        // This gives TCF override time to work
        await new Promise(r => setTimeout(r, 100));

        // Initialize banner slayer
        const Banner = window.ConsentBreakerBanner;
        if (Banner) {
            log('Starting banner slayer');
            await Banner.init();
        }

        // Report site processed
        try {
            await chrome.runtime.sendMessage({
                type: 'UPDATE_STATS',
                data: { siteProcessed: true }
            });
        } catch (e) { }

        // Re-scan after full page load (catches late banners)
        window.addEventListener('load', () => {
            setTimeout(() => {
                if (Banner) {
                    log('Post-load re-scan');
                    Banner.scan();
                }
            }, 1000);
        });

        // Also re-scan after a delay (some CMPs load very late)
        setTimeout(() => {
            if (Banner) {
                log('Delayed re-scan');
                Banner.scan();
            }
        }, 3000);

        log('Bootstrap complete');
    }

    // Execute
    main().catch(err => {
        if (window.__cbDebug) {
            console.error('[Consent Breaker] Bootstrap error:', err);
        }
    });

})();
