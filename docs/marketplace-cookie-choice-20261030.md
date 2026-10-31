# Marketplace cookie and storage choice

The root marketplace and /shop/ now show a first-visit storage notice. Equal buttons choose necessary storage only or optional persistent view/filter preferences. A footer button reopens the choice; withdrawing permission deletes only the optional browse preference. Login/cart and explicitly requested session tools are preserved. No analytics or marketing service is introduced, and historical generic POS cookie choices do not imply permission for marketplace preferences.

Persistent browse preference reads and writes now require an explicit versioned opt-in. The banner remains usable without storage access and reports failed persistence. It uses an accessible nonmodal labelled region and responsive layout. Existing POS cookie UI is unchanged.

Local targeted cookie/personal UI tests cover first visit, opt-in, reopening, withdrawal, essential-token preservation, malformed/legacy choices and denied storage. Existing personal native-browser checks now explicitly opt in before asserting cross-visit preference persistence. Applicable CI and live verification must complete before release is reported.

Payment continuation still requires actual Mollie sign-in; the provider dashboard currently shows a login form. No secrets, real provider consent, payment or merchant acceptance have been entered or fabricated by this cookie change.
