# German postal-code reference

`de-postcodes.json.gz` is a deterministic gzip-compressed UTF-8 JSON map from German postal code to distinct place names. It includes GeoNames' special/bulk-recipient postcodes, not just residential codes. It is a plausibility reference, never proof of delivery or of street/house-number existence. Unknown or mismatched entries show advisory warnings; they do not alter or block a payment or historical document.

Source: https://download.geonames.org/export/zip/DE.zip (`DE.txt`)
Retrieved: 2026-10-20
Attribution: GeoNames, https://www.geonames.org/
License: Creative Commons Attribution 4.0, https://creativecommons.org/licenses/by/4.0/ (the downloaded archive's readme specifies 4.0).
No warranty of accuracy, timeliness or completeness. The UI links to the attribution.

Regenerate with `python3 ops/update-postcodes.py /path/to/downloaded/DE.zip`. This does not fetch customer data or call an external address provider. Review changes, run address tests and release through the normal pipeline. There is no runtime external lookup.


# DWD MOSMIX station catalog

`dwd-mosmix-stations.cfg.gz` contains the official worldwide MOSMIX catalog, including forecast locations across Germany. Source: https://www.dwd.de/DE/leistungen/met_verfahren_mosmix/mosmix_stationskatalog.cfg?view=nasPublication . Retrieved 2026-10-21. Attribution: Deutscher Wetterdienst (DWD), MOSMIX. Search runs locally without submitting restaurant addresses or search terms to DWD. Weather is fetched only for the station saved by the user. Station catalog membership does not guarantee current forecast availability.

CFG coordinates are degrees and minutes, not decimal degrees (DWD MOSMIX procedure description, FAQ 9.1). The parser converts them before exposing coordinates. Retain existing manual station codes; do not silently reassign sites. Update by downloading the source, verifying the header and count, and gzip-compressing with mtime=0; run station and weather tests before release.

`de-postcode-centers.json.gz` adds approximate postcode centers from the same GeoNames DE.zip source (retrieved 2026-10-21, CC BY 4.0). Average all valid coordinates per postcode, retain leading zeros and gzip deterministically. Used locally only to select the nearest catalog forecast location within 100 km, including cross-border DWD points where nearer. This is not an exact restaurant location or deliverability check. No restaurant address is sent to GeoNames/DWD. Existing manually selected stations remain manual unless the user explicitly enables postcode assignment.
