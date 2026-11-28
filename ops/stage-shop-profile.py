from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

root = Path('/opt/bringness-delivery-sandbox')
base = '9f57d6f9a8085107613c3741cba928a070382f71'
shop = '172aff5d1443209afeebf9b50e63e5f59cf7b94c'
container = 'bringness-delivery-sandbox-app-1'
files = tuple('apps/web/public/bestellen/' + name for name in ('index.html','preview.js','style.css'))
files += ('apps/web/public/pos/setup.html', 'apps/web/public/pos/delivery-portal.js', 'server/delivery-portal.js')


def source(ref, name):
    return subprocess.check_output(['git', '-C', str(root), 'show', f'{ref}:{name}'], text=True)


def stage(path):
    path.mkdir()
    for name in files:
        original = source(base, name)
        updated = source(shop, name)
        (path / name).parent.mkdir(parents=True, exist_ok=True)
        current = (root / name).read_text()
        with tempfile.TemporaryDirectory() as temp:
            versions = [Path(temp) / item for item in ('sandbox', 'base', 'shop')]
            for version, text in zip(versions, (current, original, updated)):
                version.write_text(text)
            merged = subprocess.run(['git', 'merge-file', '-p', *map(str, versions)], capture_output=True, text=True)
            (path / name).write_text(merged.stdout)
            if merged.returncode:
                raise SystemExit(f'Merge conflict: {name}')
    for name in files:
        if name.endswith('.js'):
            subprocess.run(['docker','exec','-i',container,'node','--check'], input=(path / name).read_bytes(), check=True)
    print('SHOP_STAGE_OK')


def install(path):
    backup = Path(tempfile.mkdtemp(prefix='restaurant-shop-', dir='/opt/bringness-design-backups'))
    for name in files:
        (backup / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / name, backup / name)
    try:
        for name in files:
            publish(path, name)
        subprocess.run(['docker','restart',container], check=True)
    except Exception:
        for name in files:
            publish(backup, name)
        subprocess.run(['docker','restart',container], check=True)
        raise
    print('SHOP_DEPLOY_OK', backup)


def publish(path, name):
    target = root / name
    shutil.copyfile(path / name, target)
    subprocess.run(['docker', 'cp', str(target), f'{container}:/app/{relative}/{name}'], check=True)


if __name__ == '__main__':
    action, directory = sys.argv[1:]
    path = Path(directory)
    if action == 'stage':
        stage(path)
    elif action == 'install':
        for name in files:
            if name.endswith('.js'):
                subprocess.run(['docker','exec','-i',container,'node','--check'], input=(path / name).read_bytes(), check=True)
        install(path)
    else:
        raise SystemExit('Expected stage or install')
