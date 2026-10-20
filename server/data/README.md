# German postal-code reference

`de-postcodes.json.gz` is a deterministic gzip-compressed UTF-8 JSON map from German postal code to distinct place names. It includes GeoNames' special/bulk-recipient postcodes, not just residential codes. It is a plausibility reference, never proof of delivery or of street/house-number existence. Unknown or mismatched entries show advisory warnings; they do not alter or block a payment or historical document.

Source: https://download.geonames.org/export/zip/DE.zip (`DE.txt`)
Retrieved: 2026-10-20
Attribution: GeoNames, https://www.geonames.org/
License: Creative Commons Attribution 4.0, https://creativecommons.org/licenses/by/4.0/ (the downloaded archive's readme specifies 4.0).
No warranty of accuracy, timeliness or completeness. The UI links to the attribution.

Regenerate with `python3 ops/update-postcodes.py /path/to/downloaded/DE.zip`. This does not fetch customer data or call an external address provider. Review changes, run address tests and release through the normal pipeline. There is no runtime external lookup.
