/**
 * Consent Breaker - TCF Injected Script
 * 
 * This script runs in the PAGE CONTEXT (not content script sandbox).
 * It's injected via <script> tag to access window.__tcfapi.
 * 
 * Strategy:
 * 1. Hook/override __tcfapi before CMP initializes
 * 2. Return reject-all consent state for all queries
 * 3. Block legitimate interest
 * 4. Signal completion back to content script
 */

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // Constants: Valid Reject-All TC String
    // ─────────────────────────────────────────────────────────────────────────

    // This is a minimal valid TCF v2.2 TC String that represents:
    // - All purposes rejected
    // - All vendors rejected
    // - All legitimate interests rejected
    // Format: Base64-encoded according to IAB TCF spec
    const REJECT_ALL_TC_STRING = 'CPv4IAAPV4IAAPoABAENBkCsAP_AAH_AAAAAJqNd_X__bX9j-_5_f_t0eY1P9_r_v-Qzjhfdt-8N2f_X_L8X42M7vF36pq4KuR4Eu3LBIQNlHMHUTUmwaokVrzHsak2MpyNKJ7LkmnsZe2dYGH9Pn9lDuYKY7_5___bz3z-v_t_-39T378X_3_d5_2---vCfV599jbv9f3__39nP___9v-_8_______gAAAAA.YAAAAAAAAAAA';

    // ─────────────────────────────────────────────────────────────────────────
    // Reject-All TCData Object
    // ─────────────────────────────────────────────────────────────────────────

    function createRejectAllTCData() {
        return {
            tcString: REJECT_ALL_TC_STRING,
            tcfPolicyVersion: 4,
            cmpId: 0,
            cmpVersion: 0,
            gdprApplies: true,
            eventStatus: 'tcloaded',
            cmpStatus: 'loaded',
            listenerId: null,
            isServiceSpecific: true,
            useNonStandardStacks: false,
            publisherCC: 'NL',
            purposeOneTreatment: false,

            // All purposes rejected
            purpose: {
                consents: {},
                legitimateInterests: {}
            },

            // All vendors rejected
            vendor: {
                consents: {},
                legitimateInterests: {}
            },

            // Special features (none consented)
            specialFeatureOptins: {},

            // Publisher restrictions
            publisher: {
                consents: {},
                legitimateInterests: {},
                customPurpose: {
                    consents: {},
                    legitimateInterests: {}
                },
                restrictions: {}
            },

            // Explicitly set all standard purposes to false
            purposeConsents: {
                1: false, 2: false, 3: false, 4: false, 5: false,
                6: false, 7: false, 8: false, 9: false, 10: false
            },
            purposeLegitimateInterests: {
                1: false, 2: false, 3: false, 4: false, 5: false,
                6: false, 7: false, 8: false, 9: false, 10: false
            }
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TCF API Override
    // ─────────────────────────────────────────────────────────────────────────

    const listeners = new Map();
    let listenerIdCounter = 0;

    function overriddenTcfApi(command, version, callback, parameter) {
        // Log for debugging
        if (window.__cbDebug) {
            console.log('[Consent Breaker] __tcfapi called:', command, version);
        }

        if (typeof callback !== 'function') {
            callback = () => { };
        }

        switch (command) {
            case 'getTCData':
                const tcData = createRejectAllTCData();
                // If vendorIds requested, ensure they're all false
                if (parameter && Array.isArray(parameter)) {
                    for (const vendorId of parameter) {
                        tcData.vendor.consents[vendorId] = false;
                        tcData.vendor.legitimateInterests[vendorId] = false;
                    }
                }
                callback(tcData, true);
                break;

            case 'ping':
                callback({
                    gdprApplies: true,
                    cmpLoaded: true,
                    cmpStatus: 'loaded',
                    displayStatus: 'hidden',
                    apiVersion: '2.2',
                    cmpVersion: 1,
                    cmpId: 0,
                    gvlVersion: 0,
                    tcfPolicyVersion: 4
                }, true);
                break;

            case 'addEventListener':
                const listenerId = ++listenerIdCounter;
                const tcDataWithListener = createRejectAllTCData();
                tcDataWithListener.listenerId = listenerId;
                tcDataWithListener.eventStatus = 'tcloaded';
                listeners.set(listenerId, callback);
                callback(tcDataWithListener, true);
                break;

            case 'removeEventListener':
                const removed = listeners.delete(parameter);
                callback(removed);
                break;

            case 'getInAppTCData':
                callback(createRejectAllTCData(), true);
                break;

            case 'getVendorList':
                // Return empty vendor list
                callback({ vendors: {}, purposes: {} }, true);
                break;

            default:
                // Unknown command - return success to prevent errors
                callback(null, true);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Installation
    // ─────────────────────────────────────────────────────────────────────────

    function install() {
        // Store original if exists (for potential restoration)
        const original = window.__tcfapi;

        // Define our override
        Object.defineProperty(window, '__tcfapi', {
            value: overriddenTcfApi,
            writable: false,
            configurable: false
        });

        // Also handle the queue if CMP hasn't loaded yet
        if (window.__tcfapiQueue && Array.isArray(window.__tcfapiQueue)) {
            window.__tcfapiQueue.forEach(args => {
                try {
                    overriddenTcfApi.apply(null, args);
                } catch (e) { }
            });
        }

        // Handle locator frame (some CMPs use this)
        try {
            const frames = window.frames;
            if (frames['__tcfapiLocator']) {
                // CMP is using iframe communication - we've already overridden the API
            }
        } catch (e) {
            // Cross-origin frame access denied - expected
        }

        // Signal success to content script
        window.postMessage({
            type: 'CONSENT_BREAKER_TCF_OVERRIDE',
            success: true,
            hadOriginal: !!original
        }, '*');

        if (window.__cbDebug) {
            console.log('[Consent Breaker] TCF API override installed');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Google Consent Mode Override (bonus)
    // ─────────────────────────────────────────────────────────────────────────

    function overrideGoogleConsentMode() {
        // Override Google's consent mode if present
        window.dataLayer = window.dataLayer || [];

        // Push deny-all consent
        window.dataLayer.push('consent', 'default', {
            'ad_storage': 'denied',
            'ad_user_data': 'denied',
            'ad_personalization': 'denied',
            'analytics_storage': 'denied',
            'functionality_storage': 'denied',
            'personalization_storage': 'denied',
            'security_storage': 'granted' // Keep security for site functionality
        });

        // Prevent future consent updates
        const originalPush = window.dataLayer.push;
        window.dataLayer.push = function (...args) {
            // Block consent updates that would grant permissions
            if (args[0] === 'consent' && args[1] === 'update') {
                if (window.__cbDebug) {
                    console.log('[Consent Breaker] Blocked Google consent update:', args);
                }
                return;
            }
            return originalPush.apply(this, args);
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Execute
    // ─────────────────────────────────────────────────────────────────────────

    // Install immediately (we're already in page context at document_start)
    install();
    overrideGoogleConsentMode();

})();
