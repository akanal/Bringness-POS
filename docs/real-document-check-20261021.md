# Real document OCR checkpoint — 2026-10-21

Checked against main `ca8109b8831af0d919b80aae556a907ac8fc38cd`. The intervening main changes concern the A4 invoice layout; the OCR implementation was not changed in this check.

## Scope and results

An already supplied real photographed supplier invoice was processed locally through the actual `recognizeDocument` worker with the bundled German model. No external OCR provider, customer account, inventory transaction, payment or production upload was used. The original document and its personal/business details are not copied into the repository.

| Check | Result | Cause / next action |
| --- | --- | --- |
| Local photo recognition completes | Passed | Real worker returned text; reported confidence 49 |
| Merchandise quantity compared with original | Passed for this one position | Unit and count were recovered; this is not general document acceptance |
| Clean automatic product matching | Not passed | OCR noise and row number remain before the item name; the exact-match guard leaves stockId empty. Manually correct/assign; do not add fuzzy automatic financial assignments from this result |
| Automatic net-price extraction | Not established | Table amount has no explicit per-line net label accepted by the parser; netCents stays null rather than guessed |
| Header extraction | Incomplete | No confidently labelled supplier/delivery-note reference/date recovered; an invoice number must not be silently used as a delivery-note number |
| Safe draft state | Passed | No product assigned, no guessed price and no reviewed flag automatically set |
| Targeted existing/new regression suite | Passed: 11 tests | Core validation, suggestions, actual German photo/blank-photo OCR and text/scanned-PDF recognition |
| Real device and operational goods-receipt acceptance | Still open | Requires a restaurant account and explicit verification of actual received goods; this local check creates no stock |

The generic readable flag only means that enough text was extracted. It is not proof that all positions or header fields are complete. Keep the review step and original-text view.

## Added regression

`server/ai-delivery-suggestions.test.js` uses an anonymized synthetic row with the same structural OCR defects. It checks recovery of count/unit without guessing product, net price, review approval or a delivery-note reference. No original photograph or private supplier/customer details are committed.

Command: `node --test server/ai-delivery-core.test.js server/ai-delivery-suggestions.test.js server/ai-delivery-ocr.test.js`.

## Current owner decisions

- Mollie test payment, webhook and Bringness activation: owner confirmed successful on 2026-10-21. This is not approval/evidence of live money processing.
- Language work remains paused at its separately saved interim state; no deployment requested for it.
- Windows signing deferred until the TSE work is resolved; no certificate purchase authorized.
- Simplified deposit returns remain an idea only; do not implement yet. Existing sale/deposit behavior stays.
- DWD live account test still needs the restaurant account; the supplier account is not a substitute.
- TSE provider access/hardware/terms and physical scanner/Windows acceptance remain external/physical prerequisites. Do not describe them as completed based on source tests.

## Implemented follow-up

A bounded second sparse-OCR pass is attempted for weak image text. Observed page coordinates reassemble fragments on the same row. The alternative is selected only with at least five additional confidence points, within existing text/line limits, and while preserving every previously recognized quantity/unit occurrence. Otherwise the first pass remains authoritative. Worker timeout and single-recognition guard remain in force.

The previous OCR text is retained with the draft and visible in the existing original-text disclosure, including after reopening/duplicate upload. Labelled delivery dates can be recovered from a joined multi-column row; conflicting/invalid dates remain empty. Weak-confidence text explicitly warns that recognition is partial.

Real-photo rerun: confidence increased from 49 to 59; clean merchandise name, correct original quantity and delivery date recovered. Matching was tested against a synthetic exact-name stock fixture only; no real account mapping or stock write was performed. Supplier and invoice-as-delivery reference were not guessed, net price remained unknown, reviewed stayed false. Original OCR text was retained.

Verification: 531 unit tests passed; full AI HTTP/database/DOM integration passed. This improves the demonstrated defect; it does not close physical-device/operational acceptance or promise universal supplier-layout recognition.
