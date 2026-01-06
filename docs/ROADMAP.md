# 🚀 Roadmap: The Path to 100% Consent Blocking

**Current Status:** Level 2 - Advanced Heuristics.
**Goal:** Level 4 - Universal Guarantee.

De huidige versie van Consent Breaker gebruikt geavanceerde heuristieken en TCF-injectie. Dit dekt ~90-95% van de gevallen. Om de laatste, hardnekkige 5% te garanderen (de "God Mode"), zijn de volgende architecturale upgrades nodig.

---

## 🟢 Phase 1: Deep DOM Inspection (Immediate)
*Het onzichtbare zichtbaar maken.*

1.  **Shadow DOM Traversal**: Veel moderne banners verstoppen zich in Shadow Roots (open/closed). De huidige scanner ziet deze niet.
    *   *Actie*: Recursive `shadowRoot` walker in `banner_slayer.js`.
2.  **Iframe Injection**: Banners in cross-origin iframes zijn onbereikbaar voor de main world scanner.
    *   *Actie*: Content scripts laten draaien in `all_frames: true` en communiceren via messaging.

## 🟡 Phase 2: Crowdsourced Signals (Medium Term)
*Niet gokken, maar weten.*

1.  **Community Blocklist**: Integratie met een externe database van specifieke CSS selectors (zoals "I don't care about cookies" of AdGuard/EasyList).
    *   *Architectuur*: Periodieke fetch van een `cosmetic_rules.txt` en deze parsen naar injecteerbare CSS.
2.  **User Reporting**: Een "Rechtermuisknop -> Block this Banner" optie die de selector naar een centrale server stuurt.

## 🔴 Phase 3: AI & Computer Vision (Long Term)
*Begrijpen wat je ziet.*

1.  **DOM Tree ML Model**: Een klein TensorFlow.js model in de extensie dat de structuur van de pagina analyseert en met 99.9% zekerheid zegt: "Dit is een dialoog die de main content blokkeert".
2.  **OCR / Vision**: Screenshot analyse (duur/traag).
3.  **AOM (Accessibility Object Model)**: Gebruik de toegankelijkheidsboom (die screenreaders gebruiken) om modal dialogs te vinden, ongeacht hoe ze in de DOM verstopt zitten.

---

## Technical Next Step (Immediate)
**Shadow DOM Support**. Dit is de grootste blinde vlek op dit moment.
