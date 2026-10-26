#!/usr/bin/env python3
"""Run interactively as root on the existing POS host. Never accepts secrets as arguments."""
import fcntl
import getpass
import os
from pathlib import Path
import re
import stat
import tempfile
import warnings

CONFIG = Path('/opt/bringness-pos/config/app.env')
NAMES = ('SHOP_ASSISTANT_API_KEY', 'SHOP_ASSISTANT_MODEL', 'SHOP_ASSISTANT_ENABLED')

def update_config(path, key, model):
    if not isinstance(key,str) or not re.fullmatch(r'sk-[A-Za-z0-9_-]{17,509}',key):
        raise ValueError('Ungültiges Schlüsselformat. Nichts geändert.')
    if not isinstance(model,str) or not re.fullmatch(r'[A-Za-z0-9._-]{1,80}',model):
        raise ValueError('Ungültige Modellkennung. Nichts geändert.')
    path = Path(path)
    if path.parent.resolve() != path.parent or path.is_symlink():
        raise ValueError('Verknüpfte Konfigurationspfade sind nicht erlaubt.')
    parent = path.parent.stat()
    if parent.st_uid != os.geteuid() or parent.st_mode & 0o022:
        raise ValueError('Konfigurationsverzeichnis muss dem Administrator gehören und schreibgeschützt für andere sein.')
    lockfd = os.open(str(path)+'.assistant.lock', os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:
        lockstat=os.fstat(lockfd)
        if lockstat.st_uid != os.geteuid() or not stat.S_ISREG(lockstat.st_mode) or lockstat.st_nlink != 1 or lockstat.st_mode & 0o077:
            raise ValueError('Unsichere Sperrdatei. Nichts geändert.')
        fcntl.flock(lockfd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
        with os.fdopen(fd,'rb') as source:
            info=os.fstat(source.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > 1048576:
                raise ValueError('Konfiguration muss eine eigene reguläre Datei mit Rechten 600 sein. Nichts geändert.')
            original=source.read(1048577)
        text=original.decode('utf-8')
        lines=text.splitlines(keepends=True)
        pattern=re.compile(r'^\s*(?:export\s+)?(?:'+ '|'.join(NAMES) +r')\s*=')
        retained=''.join(line for line in lines if not pattern.match(line))
        if retained and not retained.endswith('\n'): retained+='\n'
        next_text=retained+f'SHOP_ASSISTANT_API_KEY={key}\nSHOP_ASSISTANT_MODEL={model}\nSHOP_ASSISTANT_ENABLED=true\n'
        backupfd,backup=tempfile.mkstemp(prefix=path.name+'.before-assistant-',dir=path.parent)
        with os.fdopen(backupfd,'wb') as dest: dest.write(original);dest.flush();os.fsync(dest.fileno())
        tempfd,temp=tempfile.mkstemp(prefix=path.name+'.next-',dir=path.parent)
        try:
            with os.fdopen(tempfd,'wb') as dest: dest.write(next_text.encode('utf-8'));dest.flush();os.fsync(dest.fileno())
            # Refuse a concurrent replacement even by another configuration tool.
            current=path.stat(follow_symlinks=False)
            if (current.st_ino,current.st_mtime_ns,current.st_size)!=(info.st_ino,info.st_mtime_ns,info.st_size):
                raise ValueError('Konfiguration wurde gleichzeitig geändert. Nichts überschrieben.')
            os.replace(temp,path)
            dirfd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
            try: os.fsync(dirfd)
            finally: os.close(dirfd)
        finally:
            if os.path.exists(temp): os.unlink(temp)
    finally: os.close(lockfd)

def main():
    if os.geteuid()!=0: raise ValueError('Bitte direkt als Administrator auf dem Netcup-Server ausführen.')
    if not os.isatty(0): raise ValueError('Interaktive Serverkonsole erforderlich. Keine Schlüssel per Kommandozeile übergeben.')
    print('Bringness Shop-Assistent: sichere Serverkonfiguration. Der Schlüssel wird nicht angezeigt.')
    model=input('Freigeschaltete OpenAI-Modellkennung: ').strip()
    with warnings.catch_warnings():
        warnings.simplefilter('error',getpass.GetPassWarning)
        key=getpass.getpass('OpenAI-API-Schlüssel (unsichtbar): ')
    update_config(CONFIG,key,model)
    print('Geschützt gespeichert. Die bestehende Anwendung läuft unverändert weiter.')
    print('Als Nächstes die POS-Anwendung über Netcup operations neu bereitstellen, damit die neue Umgebung geladen wird.')

if __name__=='__main__':
    try: main()
    except (ValueError,OSError,UnicodeError,getpass.GetPassWarning,EOFError):
        print('Konfiguration nicht abgeschlossen. Dateirechte, Administratorzugang und Eingabe prüfen. Keine geheimen Werte ausgegeben.')
        raise SystemExit(1)
