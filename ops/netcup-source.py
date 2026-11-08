"""Receive a bounded git archive over authenticated SSH; no GitHub token on Netcup."""
import hashlib
import pathlib
import re
import sys
import tarfile

MAX_ARCHIVE = 100 * 1024 * 1024
MAX_CONTENT = 500 * 1024 * 1024


def receive(stream, archive, destination, revision, digest, size):
    if not re.fullmatch(r"[0-9a-f]{40}", revision) or not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise ValueError("Invalid source identity")
    if not 0 < size <= MAX_ARCHIVE:
        raise ValueError("Invalid archive size")
    total = 0
    checksum = hashlib.sha256()
    with archive.open("xb") as output:
        while total < size:
            chunk = stream.read(min(65536, size - total))
            if not chunk:
                raise ValueError("Incomplete source transfer")
            output.write(chunk)
            checksum.update(chunk)
            total += len(chunk)
    if stream.read(1) or checksum.hexdigest() != digest:
        raise ValueError("Source checksum or length mismatch")
    with tarfile.open(archive, "r:gz") as source:
        if source.pax_headers.get("comment") != revision:
            raise ValueError("Archive revision mismatch")
        members = []
        seen = set()
        expanded = 0
        for item in source:
            path = pathlib.PurePosixPath(item.name)
            if (path.is_absolute() or ".." in path.parts or "\\" in item.name
                    or not path.parts or path.parts[0] != "source"
                    or not (item.isfile() or item.isdir())):
                raise ValueError("Unsafe source entry")
            relative = path.parts[1:]
            if not relative:
                if not item.isdir():
                    raise ValueError("Invalid archive root")
                continue
            name = "/".join(relative)
            if name in seen or len(seen) >= 20000 or item.size > 50 * 1024 * 1024:
                raise ValueError("Duplicate or oversized source entry")
            seen.add(name)
            expanded += item.size
            if expanded > MAX_CONTENT:
                raise ValueError("Source content limit exceeded")
            members.append((item, relative))
        required = {"package.json", "server/start.js", "apps/web/public/pos/index.html", "db/schema.sql"}
        if not required.issubset({"/".join(p) for m, p in members if m.isfile()}):
            raise ValueError("Incomplete application source")
        destination.mkdir(mode=0o700)
        for item, relative in members:
            target = destination.joinpath(*relative)
            if item.isdir():
                target.mkdir(parents=True, exist_ok=True, mode=0o755)
            else:
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
                with source.extractfile(item) as data, target.open("xb") as output:
                    while chunk := data.read(65536):
                        output.write(chunk)
                target.chmod(0o755 if item.mode & 0o111 else 0o644)


if __name__ == "__main__":
    try:
        receive(sys.stdin.buffer, pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]),
                sys.argv[3], sys.argv[4], int(sys.argv[5]))
    except Exception:
        # Do not echo archive paths, user content, tokens or private diagnostics.
        sys.exit("Source transfer validation failed")
