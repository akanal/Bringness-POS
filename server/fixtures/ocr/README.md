# Synthetic delivery-note OCR fixtures

These PNGs contain invented delivery-note text only; no customer or supplier data.
They replace text drawn at test time with `44px sans-serif`, whose glyph pixels depend
on the CI runner's installed fonts. Fixed pixels let the real Tesseract recognition
and scanned-PDF path run against identical inputs on every runner. Confidence and
readability thresholds, expected recognised text, blank-photo rejection and review
flags are unchanged; no OCR result is mocked.

Generated with @napi-rs/canvas1.0.10 using system DejaVu Sans, registered explicitly as
`Bringness OCR Fixture`, black44px text on white:

- delivery-photo.png:1400x800; x80; baselines100,210,320,430;
  Lieferschein123456, Lieferant Berlin, Mehl3kg, Milch2Liter (spaces as displayed).
- delivery-scan.png:1100x600; x70; baselines100,200,300;
  Lieferschein987654, Lieferant Berlin, Mehl3kg (spaces as displayed).

The scanned fixture is still embedded into a freshly generated PDF by the test.
The text-PDF case and white blank-photo case are also generated during the test.
