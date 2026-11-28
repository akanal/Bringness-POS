from pathlib import Path
import hashlib,re,shutil,time,urllib.request,subprocess
ROOT=Path('/opt/bringness-delivery-sandbox/apps/web/public/bestellen')
REF='f3e3f1b240d174a903949ae5436afd0b37c63424'
HASHES={'index.html': 'd611185f0c483bdcfe369312e8c8c8c0b6889b4ff51520a3b8e8b6bc7186c50d', 'style.css': '66e3e764097ff9494ba54817e16fe90e8c5b4839dbb8e0a790aae2abce74eb2e', 'preview.js': 'e519f837295effc45e6e41dded60cfd35824f4218abc9f54f7c188e09fee4d76'}
ICON_CSS='.shop-categories{padding:28px clamp(16px,6vw,96px)!important}.shop-categories h2{margin:0 0 6px;font-size:clamp(1.4rem,3vw,2rem)}.shop-categories>p{color:#6b5140;margin:0 0 22px}\n.category-icons{display:flex;gap:clamp(14px,4vw,54px);flex-wrap:wrap}.category-choice{display:grid;justify-items:center;align-content:start;gap:8px;min-width:110px;color:inherit;text-decoration:none;text-align:center}.category-choice small{font-size:.78rem;color:#6b5140}.category-figure{position:relative;display:grid;place-items:center;font-size:3rem;width:88px;height:88px;border-radius:50%;background:#f6bc80;box-shadow:0 5px 0 #ad683d;transform:rotate(-7deg)}.category-choice:nth-child(2) .category-figure{background:#c7d399;transform:rotate(6deg)}.category-choice:nth-child(3) .category-figure{background:#b9cee0;transform:rotate(-5deg)}.category-choice:nth-child(4) .category-figure{background:#d9b9c7;transform:rotate(5deg)}.category-choice:nth-child(5) .category-figure{background:#c8b9d9}.category-figure i{position:absolute;bottom:-8px;right:-3px;font-style:normal;font-size:1.5rem;background:#ffdcac;color:#422f22;border-radius:50%;width:30px;height:30px;line-height:28px}.category-choice:hover .category-figure{transform:rotate(0)}.soon small{border:1px solid #7e837f;border-radius:20px;padding:2px 8px}\n\n@media(max-width:650px){.category-icons{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px 10px}.category-choice{min-width:0;font-size:.85rem}.category-figure{width:72px;height:72px;font-size:2.4rem}.category-choice strong{overflow-wrap:anywhere}}\n@media(max-width:350px){.category-icons{grid-template-columns:repeat(2,minmax(0,1fr))}}\n@media(prefers-reduced-motion:reduce){.category-figure{transform:none!important}}'

def prepare(current, originals):
    match=re.search(r'<section class="shop-categories".*?</section>',current,re.S)
    if not match:
        raise RuntimeError('Existing icon section absent; no files changed')
    h=originals['index.html'].decode()
    marker='<section aria-labelledby="results-heading">'
    if h.count(marker)!=1:raise RuntimeError('Unexpected baseline HTML')
    h=h.replace(marker,match.group(0)+marker)
    h=re.sub(r'style\.css(?:\?[^" ]*)?"','style.css?v=restore-20261127-1400"',h)
    originals=dict(originals)
    originals['index.html']=h.encode()
    originals['style.css']+=('\n/* Retained existing category icons; restored pre-14:00 design. */\n'+ICON_CSS).encode()
    return originals

def main():
    sources={}
    for name,expected in HASHES.items():
        url=f'https://raw.githubusercontent.com/akanal/Bringness-POS/{REF}/apps/web/public/bestellen/{name}'
        data=urllib.request.urlopen(url,timeout=30).read()
        if hashlib.sha256(data).hexdigest()!=expected:raise RuntimeError('Baseline checksum mismatch')
        sources[name]=data
    result=prepare((ROOT/'index.html').read_text(),sources)
    backup=Path('/opt/bringness-design-backups')/('restore-1400-'+str(time.time_ns()))
    shutil.copytree(ROOT,backup)
    try:
        for name,data in result.items():
            staged=ROOT/(name+'.restore-tmp')
            staged.write_bytes(data)
            staged.replace(ROOT/name)
        for name in result:
            subprocess.run(['docker','cp',str(ROOT/name),'bringness-delivery-sandbox-app-1:/app/apps/web/public/bestellen/'+name],check=True)
    except Exception:
        for name in result:
            shutil.copy2(backup/name,ROOT/name)
            subprocess.run(['docker','cp',str(ROOT/name),'bringness-delivery-sandbox-app-1:/app/apps/web/public/bestellen/'+name],check=True)
        raise
    print('RESTORE_1400_OK; existing icons retained; backup:',backup)

if __name__=='__main__':main()
