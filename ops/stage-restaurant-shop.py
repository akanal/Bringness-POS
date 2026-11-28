from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

root = Path('/opt/bringness-delivery-sandbox')
relative = 'apps/web/public/bestellen'
base = 'f3e3f1b240d174a903949ae5436afd0b37c63424'
shop = '9f57d6f9a8085107613c3741cba928a070382f71'
container = 'bringness-delivery-sandbox-app-1'
files = ('index.html', 'preview.js', 'style.css')


def source(ref, name):
    return subprocess.check_output(['git', '-C', str(root), 'show', f'{ref}:{relative}/{name}'], text=True)


def stage(path):
    path.mkdir()
    for name in files:
        original = source(base, name)
        updated = source(shop, name)
        current = (root / relative / name).read_text()
        if name == 'style.css':
            rules = updated[updated.index('\n.shop-categories {'):]
            current = re.sub(r'main\s*>\s*section:nth-child\(2\)', 'main > section[aria-labelledby="results-heading"]', current)
            (path / name).write_text(current + rules)
            continue
        if name == 'index.html':
            current = re.sub(r'<section class="shop-categories"[^>]*>.*?</section>\s*', '', current, count=1, flags=re.S)
            current = re.sub(r'(style\.css|preview\.js)\?[^"]+', r'\1?v=single-card-style', current)
        with tempfile.TemporaryDirectory() as temp:
            versions = [Path(temp) / item for item in ('sandbox', 'base', 'shop')]
            for version, text in zip(versions, (current, original, updated)):
                version.write_text(text)
            merged = subprocess.run(['git', 'merge-file', '-p', *map(str, versions)], capture_output=True, text=True)
            (path / name).write_text(merged.stdout)
            if merged.returncode:
                raise SystemExit(f'Merge conflict: {name}')
    subprocess.run(['node', '--check', str(path / 'preview.js')], check=True)
    print('SHOP_STAGE_OK')


def install(path):
    backup = Path(tempfile.mkdtemp(prefix='restaurant-shop-', dir='/opt/bringness-design-backups'))
    for name in files:
        shutil.copy2(root / relative / name, backup / name)
    try:
        for name in files:
            publish(path, name)
    except Exception:
        for name in files:
            publish(backup, name)
        raise
    print('SHOP_DEPLOY_OK', backup)


def publish(path, name):
    target = root / relative / name
    shutil.copyfile(path / name, target)
    subprocess.run(['docker', 'cp', str(target), f'{container}:/app/{relative}/{name}'], check=True)


if __name__ == '__main__':
    action, directory = sys.argv[1:]
    path = Path(directory)
    if action == 'stage':
        stage(path)
    elif action == 'install':
        subprocess.run(['node', '--check', str(path / 'preview.js')], check=True)
        install(path)
    else:
        raise SystemExit('Expected stage or install')
