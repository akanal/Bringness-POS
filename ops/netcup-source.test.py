import hashlib
import importlib.util
import io
import pathlib
import subprocess
import tarfile
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("source_transfer", ROOT / "netcup-source.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
REVISION = "a" * 40
FILES = ["package.json", "server/start.js", "apps/web/public/pos/index.html", "db/schema.sql"]


def archive(extra=None, revision=REVISION):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz", format=tarfile.PAX_FORMAT,
                      pax_headers={"comment": revision}) as tf:
        for name in FILES:
            data = b"fixture"
            info = tarfile.TarInfo("source/" + name)
            info.size = len(data)
            tf.addfile(info, io.BytesIO(data))
        if extra:
            tf.addfile(extra, io.BytesIO(b"x" * extra.size) if extra.isfile() else None)
    return output.getvalue()


class TransferTest(unittest.TestCase):
    def transfer(self, data, revision=REVISION, digest=None, size=None):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            module.receive(io.BytesIO(data), root / "source.tgz", root / "source", revision,
                           digest or hashlib.sha256(data).hexdigest(), len(data) if size is None else size)
            return {str(p.relative_to(root / "source")): p.read_bytes()
                    for p in (root / "source").rglob("*") if p.is_file()}

    def test_valid_archive(self):
        self.assertEqual(set(self.transfer(archive())), set(FILES))

    def test_real_git_archive_carries_the_exact_commit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            def git(*args):
                return subprocess.check_output(["git", "-C", str(root), *args], stderr=subprocess.DEVNULL)
            git("init")
            for name in FILES:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("fixture")
            git("add", ".")
            git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture")
            revision = git("rev-parse", "HEAD").decode().strip()
            data = git("archive", "--format=tar.gz", "--prefix=source/", revision)
            self.assertEqual(set(self.transfer(data, revision=revision)), set(FILES))

    def test_changed_hash(self):
        with self.assertRaises(ValueError):
            self.transfer(archive(), digest="0" * 64)

    def test_wrong_commit(self):
        with self.assertRaises(ValueError):
            self.transfer(archive(revision="b" * 40))

    def test_truncated_or_extra_input(self):
        data = archive()
        for size in [len(data) - 1, len(data) + 1]:
            with self.subTest(size=size), self.assertRaises(ValueError):
                self.transfer(data, size=size)

    def test_limits(self):
        for size in [0, -1, module.MAX_ARCHIVE + 1]:
            with self.subTest(size=size), self.assertRaises(ValueError):
                self.transfer(archive(), size=size)

    def test_unsafe_paths(self):
        for name in ["/etc/passwd", "source/../escape", "elsewhere/file", "source/a\\b"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.transfer(archive(tarfile.TarInfo(name)))

    def test_links_and_special_files(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.FIFOTYPE]:
            info = tarfile.TarInfo("source/link")
            info.type = kind
            info.linkname = "/etc/passwd"
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                self.transfer(archive(info))

    def test_duplicate_names(self):
        with self.assertRaises(ValueError):
            self.transfer(archive(tarfile.TarInfo("source/package.json")))

    def test_incomplete_source(self):
        with self.assertRaises(ValueError):
            self.transfer(archive(), revision="invalid")
        data = io.BytesIO()
        with tarfile.open(fileobj=data, mode="w:gz", pax_headers={"comment": REVISION}) as tf:
            info = tarfile.TarInfo("source/")
            info.type = tarfile.DIRTYPE
            tf.addfile(info)
        with self.assertRaises(ValueError):
            self.transfer(data.getvalue())

    def test_cli_errors_do_not_echo_payload(self):
        result = subprocess.run(["python3", str(ROOT / "netcup-source.py"), "/invalid", "/invalid", REVISION,
                                 "0" * 64, "12"], input=b"private-data", capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(b"private-data", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
