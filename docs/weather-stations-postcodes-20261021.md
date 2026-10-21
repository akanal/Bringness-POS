# DWD station search and postcode assignment

Official MOSMIX catalog (retrieved 2026-10-21) is bundled for local name/ID/ICAO search. German coverage includes alphabetic IDs with leading spaces in the source. CFG coordinates are degrees/minutes and converted explicitly. German postcode centers cover 10,815 entries from GeoNames, with leading zeros preserved.

In Planning & Events, a compact collapsed station search preserves the existing manual code field. Explicit automatic assignment uses the nearest catalog station to the approximate postcode center within 100 km; unknown/malformed postcodes fail before writes. Manual selection turns automation off. Existing sites remain manual by default. No lookup transmits restaurant addresses to an external geocoding service. Catalog membership does not guarantee forecast availability; weather errors continue to leave demand unchanged. Automatic purchasing remains unchanged.

Validation: station parser/coordinates/search/postcode unit tests, full unit suite, real planning API authorization/save/rejected-postcode atomicity checks and actual workspace DOM search/manual-override tests in the AI integration suite. The original Netcup live weather test succeeded for Berlin-Tempelhof in Bringness testshop; this does not imply a live test at every station.
