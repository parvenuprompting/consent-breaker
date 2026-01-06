# 🧪 Testplan Consent Breaker (v1.1.0)

## Nieuwe Filter Modi Testing

### Setup
1. Open extensie opties (rechtermuisknop op icoon -> Opties).
2. Verifieer dat "Standaard Filter Modus" op **Normal** staat.

### VS-1: Normal Mode Verificatie
**Doel:** Stabiliteit, geen site breakage.
1. Bezoek `theguardian.com`.
   - [ ] Banner verdwijnt.
   - [ ] Scroll werkt.
2. Bezoek `components-ui.com` (of een site met TCF).
   - [ ] TCF override werkt (check console logs indien debug aan).
3. Bezoek site met video embeds (bijv. nieuwsartikel met youtube).
   - [ ] Video speelt af.

### VS-2: Extreme Mode Verificatie
**Doel:** Agressieve verwijdering.
1. Bezoek een hardnekkige site (waarvan Normal misschien faalt, of gebruik testpagina).
   - [ ] Klik op extensie icoon -> Selecteer "Extreme" -> Pagina reload automatisch(of handmatig).
   - [ ] Banner die eerst bleef, moet nu weg zijn.
   - [ ] Check console: `[Consent Breaker] [EXTREME] ...`
2. Check `dnr_rules_tracking_extreme.json` regels:
   - [ ] Network tab: zie block van extra domeinen (indien van toepassing op de site).

### VS-3: Per-Site Override
1. Zet global mode op **Normal**.
2. Ga naar `nu.nl`.
3. Open popup, zet op **Extreme**.
4. Reload pagina.
   - [ ] Extensie gedraagt zich als Extreme op `nu.nl`.
5. Open nieuwe tab naar `ad.nl`.
   - [ ] Extensie gedraagt zich als Normal (global default).

---

## Regressie Testen (Bestaande features)

### TCF/IAB CMP Sites
| # | Site | CMP | Expected |
|---|------|-----|----------|
| 1 | theguardian.com | Sourcepoint | Banner weg, scroll werkt |
| 2 | spiegel.de | Sourcepoint | Banner weg, artikelen laden |
| 3 | lemonde.fr | Didomi | Banner weg, video's werken |

### Custom/Dark Pattern Banners
| # | Site | Expected |
|---|------|----------|
| 11 | nu.nl | Nederlandse banner verwijderd |
| 12 | ad.nl | Banner weg, artikelen laden |

### Debug Check:
1. Schakel Debug mode in.
2. Filter console op `[Consent Breaker]`.
3. Verifieer modus label in logs: `[NORMAL]` of `[EXTREME]`.

## Expected Results Matrix (Update)

| Test | Normal Criteria | Extreme Criteria |
|------|-----------------|------------------|
| TCF Fallback | Geen actie bij fail | Assume reject, kill UI |
| Banner Threshold | Score >= 60 | Score >= 40 |
| Action Retry | 0 retries | 3 retries (aggressive polling) |
| Network Block | 20+20 basis regels | +10+8 extra aggressive regels |
