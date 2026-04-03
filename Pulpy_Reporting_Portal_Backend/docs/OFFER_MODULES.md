# Offer code: two modules

| Module | Path | Use |
|--------|------|-----|
| **New / full** | `src/services/offer.service.js` | Full offer CRUD, `public_offer_id`, validators, tenant-scoped admin flows. **Prefer this for new features.** |
| **Legacy** | `src/services/offerService.js` | Older shape (`url_key`, simpler columns). Still used by some tracking/helpers. **Do not add major features here** — extend `offer.service.js` or migrate callers. |

Routing imports `offer.routes.js` → `offer.controller.js` → `offer.service.js` for the main product UI.

For URL-key uniqueness and migration notes, see `docs/OFFER_URL_KEY_UNIQUENESS.md`.
