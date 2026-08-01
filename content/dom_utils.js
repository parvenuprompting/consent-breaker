/**
 * Consent Breaker - DOM Utilities
 * Safe DOM manipulation helpers with Shadow DOM support.
 */

const ConsentBreakerDOM = {
  // === Deep query (Shadow DOM support) ===
  deepQuerySelectorAll(selector, root = document) {
    const results = [];

    function walk(node) {
      if (!node) return;

      // Light DOM
      try {
        node.querySelectorAll?.(selector)?.forEach(el => results.push(el));
      } catch (e) {}

      // Shadow roots
      if (node.shadowRoot) {
        walk(node.shadowRoot);
      }

      // Recurse children
      const children = node.children || node.childNodes || [];
      for (const child of children) {
        if (child.nodeType === 1) walk(child);
      }
    }

    walk(root);
    return results;
  },

  deepQuerySelector(selector, root = document) {
    return this.deepQuerySelectorAll(selector, root)[0] || null;
  },

  // === Visibility check ===
  isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  },

  // === Safe force hide (beter dan .remove()) ===
  safeHide(el, reason = '') {
    if (!el || el.dataset.cbHidden) return;

    el.dataset.cbHidden = 'true';
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('opacity', '0', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    el.setAttribute('aria-hidden', 'true');

    // Probeer ook eventuele backdrop/overlay te dempen
    if (el.parentElement) {
      const siblings = Array.from(el.parentElement.children);
      siblings.forEach(sib => {
        if (sib !== el && this.isLikelyBackdrop(sib)) {
          this.safeHide(sib, 'backdrop');
        }
      });
    }

    if (window.__cbDebug) {
      console.log('[CB-DOM] Safe hid element:', reason, el);
    }
  },

  isLikelyBackdrop(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return (
      (style.position === 'fixed' || style.position === 'absolute') &&
      rect.width >= window.innerWidth * 0.9 &&
      rect.height >= window.innerHeight * 0.9 &&
      (parseFloat(style.opacity) < 1 || style.backgroundColor !== 'rgba(0, 0, 0, 0)')
    );
  },

  // === Scroll lock herstel ===
  hasScrollLock() {
    const html = document.documentElement;
    const body = document.body;
    if (!html || !body) return false;
    return (
      html.style.overflow === 'hidden' ||
      body.style.overflow === 'hidden' ||
      html.classList.contains('no-scroll') ||
      body.classList.contains('no-scroll') ||
      body.classList.contains('modal-open')
    );
  },

  restoreScroll() {
    if (document.documentElement) {
      document.documentElement.style.removeProperty('overflow');
      document.documentElement.classList.remove('no-scroll', 'modal-open');
    }
    if (document.body) {
      document.body.style.removeProperty('overflow');
      document.body.classList.remove('no-scroll', 'modal-open');
    }
  },

  // === Dialog / Modal detectie via roles ===
  findDialogs(root = document) {
    const selectors = [
      '[role="dialog"]',
      '[role="alertdialog"]',
      'dialog',
      '[aria-modal="true"]'
    ];
    const results = [];
    selectors.forEach(sel => {
      this.deepQuerySelectorAll(sel, root).forEach(el => {
        if (this.isVisible(el)) results.push(el);
      });
    });
    return results;
  },

  // === Secondary helper utilities ===
  isFixed(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.position === 'fixed' || style.position === 'sticky';
  },

  getZIndex(element) {
    if (!element) return 0;
    const style = window.getComputedStyle(element);
    const zIndex = parseInt(style.zIndex, 10);
    return isNaN(zIndex) ? 0 : zIndex;
  },

  hasHighZIndex(element, threshold = 1000) {
    return this.getZIndex(element) >= threshold;
  },

  findElementsByText(text, selector = '*') {
    const results = [];
    const searchText = text.toLowerCase();
    const elements = this.deepQuerySelectorAll(selector);

    for (const el of elements) {
      const directText = Array.from(el.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent)
        .join('')
        .toLowerCase();

      if (directText.includes(searchText)) {
        results.push(el);
        continue;
      }

      if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button') {
        if (el.innerText?.toLowerCase().includes(searchText)) {
          results.push(el);
        }
      }
    }
    return results;
  },

  findClickableByText(texts) {
    const selectors = 'button, a, [role="button"], input[type="button"], input[type="submit"]';
    const results = [];

    for (const text of texts) {
      const found = this.findElementsByText(text, selectors);
      results.push(...found.filter(el => this.isVisible(el)));
    }
    return results;
  },

  removeElement(element) {
    if (!element) return false;
    try {
      element.remove();
      return true;
    } catch (e) {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
        return true;
      }
      return false;
    }
  },

  hideElement(element) {
    return this.safeHide(element, 'hideElement');
  },

  isOverlay(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const isPositioned = style.position === 'fixed' || style.position === 'absolute';
    const hasHighZ = this.getZIndex(element) >= 1000;
    const coversViewport = (
      rect.width >= window.innerWidth * 0.5 ||
      rect.height >= window.innerHeight * 0.5
    );
    const hasBackdrop = (
      style.backgroundColor.includes('rgba') ||
      parseFloat(style.opacity) < 1 ||
      style.backdropFilter !== 'none'
    );
    return isPositioned && (hasHighZ || coversViewport || hasBackdrop);
  },

  safeClick(element) {
    if (!element) return false;
    try {
      element.click();
      return true;
    } catch (e) {
      try {
        const event = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        element.dispatchEvent(event);
        return true;
      } catch (e2) {
        return false;
      }
    }
  },

  waitForElement(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const existing = this.deepQuerySelector(selector);
      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const found = this.deepQuerySelector(selector);
        if (found) {
          obs.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  },

  domReady() {
    return new Promise((resolve) => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
      } else {
        resolve();
      }
    });
  }
};

if (typeof window !== 'undefined') {
  window.ConsentBreakerDOM = ConsentBreakerDOM;
}

