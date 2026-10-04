# Shared language catalog

POS and AI use one dedicated PostgreSQL database named `bringness_languages`, on the database server configured by `DATABASE_URL`. Business databases and product/menu translations stay separate. The runtime creates only the language database and its `ui_languages` and `ui_translations` tables; it does not move or copy business records.

The public read-only endpoint `/api/languages/catalog?system=ai` or `system=pos` returns shared (`common`) plus system-specific interface records. It never returns account, menu or product data. No browser receives database credentials. New language database bootstrap uses the existing server-side database administrator connection. A dedicated-server connection can be configured with `LANGUAGE_DATABASE_URL`, whose database name must be `bringness_languages`.

The initial catalog supports German, English and Turkish. AI retains its existing translations; POS gains language selection for login, primary navigation and user menu controls. Other POS screens require their own interface translations to be completed. Ingredient descriptions and supplier product translations are not automatically published to this catalog.

Maintain seed records in `apps/web/public/shared-language-catalog.json`, increment its numeric `version`, then run `node ops/build-language-snapshot.mjs`. This regenerates the offline snapshot used by the download/browser interfaces. On deployment the server seeds new or newer managed records once. Redeploying the same version or rolling back to an older version does not overwrite newer central records. Removed/retired keys are retained for compatibility with older app releases.

The browser first renders the bundled snapshot or a newer saved catalog, then refreshes from the common database through its own application server. A database/network outage retains offline translations and all controls. A new language needs a language-code/label entry and complete translations for relevant interface records. Untranslated text falls back to German.

Verification: `node server/ai-tests/language-integration.mjs` covers shared records, namespace separation, SQL seeds, rolling releases, cached central updates, offline rendering, language switching and exclusion of business content. Normal AI integration additionally verifies existing workflows and translation switching.
