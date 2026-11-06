# Marketplace customer contact and delivery addresses

`/shop/customer.html`, linked from Mein Bringness, explicitly loads the signed-in marketplace company's contact profile and up to ten delivery addresses. One address is the default when the address book is nonempty. Editing contact email does not change login credentials. The company-scoped marketplace account uses separate tables and never updates POS billing profiles or historical order recipient snapshots.

The private GET/POST `/api/v1/shop/customer-account` requires an active owner/admin marketplace session. POST requires the canonical origin, bounded JSON, an expected revision and a UUID request ID. Atomic account changes and digest-only receipts support identical retries after uncertain responses and reject stale or conflicting writes. The browser keeps unsent drafts in memory; account changes and page exit close private views. The address book is shared by authorized owners/admins of the same company, not a separate personal identity system.

Checkout loads saved addresses only after an explicit click. Selecting an address does not overwrite recipient fields until the user clicks Übernehmen and confirms any existing input. The final recipient remains part of the existing immutable order command.

German postcode suggestions load the existing public GeoNames reference from `/api/v1/shop/address-reference` and match locally. Customer address input is never sent to an external geocoder. A unique postcode locality can complete an empty or previously automatic city; manual input stays intact. Non-German addresses remain free-form. The data cannot establish street existence or deliverability. Reference source and CC BY 4.0 attribution remain visible.

Validation: customer API tests cover company isolation, authorization, idempotent retries, stale revisions, default changes/removal, bounded input and unchanged POS/login records. JSDOM checks exercise CRUD, unknown-result retry, privacy, explicit checkout application and postcode races/manual overrides. Production-entrypoint acceptance uses real PostgreSQL and Chromium at mobile and desktop widths.

Release: PR246 feature b36e045fb7c15e52148a629cc0c2c9ebaeba7adb, tree40e7e1d9041be6191add61b8a03d28fe53b1286b, merge a4fd20b7ac0aff5244aec43f29b1403b8f5940ae. Six final CI workflows passed, including 788 Shop tests and real PostgreSQL/Chromium acceptance. Netcup42311082803/job128212403121 deployed the exact merge and retained the previous container/database backup. Fresh authenticated backup42211075899/job128204878352 was validated before release. No private production accounts were used for acceptance.

Live verification matched all twelve changed public assets byte-for-byte. Health returned200/no-store, the migrated private customer route returned401/no-store without credentials, and the public postcode reference returned200 with public caching and10551→Berlin. No production customer profiles or orders were changed during acceptance.
