# 🧪 Testplan Consent Breaker

## Test Sites (15+ verdeeld over categorieën)

### TCF/IAB CMP Sites
| # | Site | CMP | Expected |
|---|------|-----|----------|
| 1 | theguardian.com | Sourcepoint | Banner weg, scroll werkt |
| 2 | spiegel.de | Sourcepoint | Banner weg, artikelen laden |
| 3 | lemonde.fr | Didomi | Banner weg, video's werken |
| 4 | independent.co.uk | OneTrust | Banner weg, ads geblokkeerd |
| 5 | telegraph.co.uk | OneTrust | Banner weg (mogelijk paywall) |

### OneTrust-achtige Banners
| # | Site | Expected |
|---|------|----------|
| 6 | cnn.com | Reject button gevonden en geklikt |
| 7 | bbc.com | Banner verwijderd, video's werken |
| 8 | nytimes.com | Banner verwijderd (mogelijk paywall) |

### Cookiebot Sites
| # | Site | Expected |
|---|------|----------|
| 9 | medium.com | Decline button geklikt |
| 10 | booking.com | Banner weg, zoeken werkt |

### Custom/Dark Pattern Banners
| # | Site | Expected |
|---|------|----------|
| 11 | nu.nl | Nederlandse banner verwijderd |
| 12 | ad.nl | Banner weg, artikelen laden |
| 13 | rtl.nl | Banner verwijderd via heuristiek |
| 14 | tweakers.net | Cookie banner weg |

### Video Embed Test Sites
| # | Site | Expected |
|---|------|----------|
| 15 | youtube.com (embedded) | Video's spelen, consent prompt weg |
| 16 | vimeo.com | Videos laden correct |

## Test Procedure

### Per site checken:

```markdown
[ ] Banner is verdwenen (< 3 seconden)
[ ] Scroll werkt (body overflow: auto)
[ ] Geen accept-all getriggerd (check cookies)
[ ] Site functionaliteit intact:
    [ ] Navigatie werkt
    [ ] Content laadt
    [ ] Video's spelen
    [ ] Forms werken
[ ] DevTools Network:
    [ ] Tracking endpoints geblokkeerd (rood)
    [ ] Site content laadt (groen/200)
```

### Debug Check:
1. Schakel Debug mode in via Options
2. Open DevTools → Console
3. Filter op `[Consent Breaker]`
4. Bekijk welke acties uitgevoerd zijn

### Network Check:
1. Open DevTools → Network
2. Filter op "Blocked"
3. Verify: google-analytics, facebook/tr, etc.

## Expected Results Matrix

| Test | Pass Criteria |
|------|---------------|
| TCF Override | `__tcfapi` retourneert reject-all data |
| CMP UI Reject | Reject button werd geklikt |
| Heuristic Removal | Overlay verwijderd met score > 60 |
| Scroll Restore | body/html overflow niet "hidden" |
| Network Block | Tracking requests tonen "blocked" |
| No Accept | Geen consent cookies gezet |

## Edge Cases

### Legitieme modals (NIET verwijderen)
- Login dialogen
- Checkout flows
- Newsletter popups (zonder consent keywords)
- Age verification

### Te testen:
```markdown
[ ] Login modal op reddit.com blijft staan
[ ] Checkout op bol.com werkt
[ ] Paywall op nrc.nl verschijnt nog
```

## Troubleshooting Resultaten

### Als banner niet verdwijnt:
1. Check debug logs voor detection
2. Check of site in allowlist staat
3. Check of CMP dynamisch laadt (late injection)

### Als site kapot is:
1. Voeg toe aan allowlist
2. Check welke network requests geblokkeerd zijn
3. Rapporteer als bug met site URL + screenshots
