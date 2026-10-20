"""Generate the local GeoNames DE postal/place index from a reviewed DE.zip."""
import collections
import gzip
import json
from pathlib import Path
import sys
import zipfile

with zipfile.ZipFile(sys.argv[1]) as archive:
    rows = archive.read('DE.txt').decode('utf-8').splitlines()
index = collections.defaultdict(set)
for row in rows:
    fields = row.split('\t')
    if len(fields) < 3 or fields[0] != 'DE' or not fields[1].isdigit() or len(fields[1]) != 5:
        raise ValueError('Unexpected GeoNames DE record')
    index[fields[1]].add(fields[2])
if len(index) < 8000:
    raise ValueError('Incomplete German postcode reference')
data = json.dumps({key: sorted(values) for key, values in sorted(index.items())}, ensure_ascii=False, separators=(',', ':')).encode()
path = Path(__file__).resolve().parent.parent / 'server/data/de-postcodes.json.gz'
path.parent.mkdir(exist_ok=True)
path.write_bytes(gzip.compress(data, mtime=0))
print(f'{len(index)} postcodes written to {path.name}')
