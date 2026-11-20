"""Synthetic local Git objects only; no real document or external repository."""

import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from hwpx_package_corpus.dataset import restore_dataset, verify_dataset
from hwpx_package_corpus.git_source import GitSource
from hwpx_package_corpus.manifest import COHORT, CorpusError, load_manifest


class RestoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="corpus-synthetic-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.entries, self.sources, self.raw = [], {}, {}
        for origin in ("own", "reference"):
            repo = self.root / (origin + ".git")
            subprocess.run(["git", "init", "--bare", str(repo)], check=True,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            raw = b"not a normalized archive\0\xff\r\n" + origin.encode()
            blob = self.git(repo, ["hash-object", "-w", "--stdin"], raw).strip().decode()
            source = ("legacy/rust/crates/hwp-core/tests/fixtures/" if origin == "own" else "samples/") + "synthetic space.hwpx"
            mode = "100644" if origin == "own" else "100755"
            tree = self.git(repo, ["mktree"], mode.encode() + b" blob " + blob.encode() + b"\tsynthetic space.hwpx\n").strip()
            for part in reversed(source.split("/")[:-1]):
                tree = self.git(repo, ["mktree"], b"040000 tree " + tree + b"\t" + part.encode() + b"\n").strip()
            commit = self.git(repo, ["commit-tree", tree.decode()], b"synthetic raw only\n").strip().decode()
            self.entries.append({"path": origin + "/" + source, "sourcePath": source, "origin": origin,
                                 "originCommit": commit, "mode": mode, "bytes": len(raw),
                                 "gitBlobSHA1": blob, "sha256": hashlib.sha256(raw).hexdigest()})
            self.sources[origin] = GitSource(repo)
            self.raw[origin] = raw
        self.output = self.root / "new-output"

    def git(self, repo, args, data=None):
        env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        env.update({"GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull,
                    "GIT_AUTHOR_NAME": "Synthetic", "GIT_AUTHOR_EMAIL": "synthetic@example.invalid",
                    "GIT_COMMITTER_NAME": "Synthetic", "GIT_COMMITTER_EMAIL": "synthetic@example.invalid"})
        return subprocess.run(["git", "--git-dir", str(repo)] + args, input=data,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, env=env).stdout

    def manifest(self, mutate=lambda x: None):
        value = {"schema": 1, "cohort": COHORT, "ownCount": 1, "referenceCount": 1,
                 "entries": copy.deepcopy(self.entries)}
        mutate(value)
        path = self.root / "synthetic-manifest.json"
        raw = json.dumps(value).encode()
        path.write_bytes(raw)
        return load_manifest(path, hashlib.sha256(raw).hexdigest(), {"own": 1, "reference": 1})

    def test_roundtrip_preserves_arbitrary_malformed_bytes(self):
        entries = self.manifest()
        result = restore_dataset(self.output, entries, self.sources)
        self.assertEqual(result, {"files": 2, "bytes": sum(map(len, self.raw.values()))})
        self.assertEqual(verify_dataset(self.output, entries), result)
        for e in entries:
            self.assertEqual((self.output / e["path"]).read_bytes(), self.raw[e["origin"]])

    def test_manifest_digest_is_required(self):
        self.manifest()
        with self.assertRaisesRegex(CorpusError, "SHA256"):
            load_manifest(self.root / "synthetic-manifest.json")

    def test_manifest_path_boundaries(self):
        for path in ("../escape.hwpx", "/escape.hwpx", "reference//samples/a.hwpx",
                     "reference/samples/../a.hwpx", "reference/samples/a\\b.hwpx",
                     "reference/samples/a\n.hwpx", "reference/samples/a:evil.hwpx"):
            with self.subTest(path=path), self.assertRaises(CorpusError):
                self.manifest(lambda m: m["entries"][1].update(path=path))

    def test_manifest_source_namespace_and_protection(self):
        for source in ("code/implementation.hwpx", "samples/hwpers_test4_complex_table.hwp", "samples/a.py"):
            with self.subTest(source=source), self.assertRaises(CorpusError):
                self.manifest(lambda m: m["entries"][1].update(sourcePath=source, path="reference/" + source))

    def test_manifest_duplicates_and_bad_fields(self):
        mutations = [lambda m: m["entries"].__setitem__(1, m["entries"][0].copy()),
                     lambda m: m["entries"][0].update(bytes=True),
                     lambda m: m["entries"][0].update(mode="120000"),
                     lambda m: m["entries"][0].update(sha256="0"),
                     lambda m: m.update(ownCount=2),
                     lambda m: m.update(schema=True),
                     lambda m: m["entries"][0].update(extra="ignored?")]
        for mutate in mutations:
            with self.subTest(mutate=mutate), self.assertRaises(CorpusError):
                self.manifest(mutate)

    def test_duplicate_json_key_rejected(self):
        path = self.root / "duplicate.json"
        raw = b'{"schema":1,"schema":1}'
        path.write_bytes(raw)
        with self.assertRaisesRegex(CorpusError, "duplicate JSON"):
            load_manifest(path, hashlib.sha256(raw).hexdigest(), {"own": 1, "reference": 1})

    def test_exact_origin_metadata_before_output(self):
        for key, value in (("mode", "100644"), ("gitBlobSHA1", "0" * 40),
                           ("sourcePath", "samples/missing.hwpx"), ("originCommit", "0" * 40), ("bytes", 999)):
            entries = copy.deepcopy(self.entries)
            entries[1][key] = value
            with self.subTest(key=key), self.assertRaises(CorpusError):
                restore_dataset(self.output, entries, self.sources)
            self.assertFalse(self.output.exists())

    def test_existing_destination_never_overwritten(self):
        self.output.mkdir()
        sentinel = self.output / "user-wip"
        sentinel.write_bytes(b"keep")
        with self.assertRaises(FileExistsError):
            restore_dataset(self.output, self.entries, self.sources)
        self.assertEqual(sentinel.read_bytes(), b"keep")

    def test_existing_file_never_overwritten(self):
        self.output.write_bytes(b"keep")
        with self.assertRaises(FileExistsError):
            restore_dataset(self.output, self.entries, self.sources)
        self.assertEqual(self.output.read_bytes(), b"keep")

    def test_symlink_output_and_parent_rejected(self):
        real = self.root / "real"
        real.mkdir()
        self.output.symlink_to(real, target_is_directory=True)
        with self.assertRaises(FileExistsError):
            restore_dataset(self.output, self.entries, self.sources)
        with self.assertRaises(OSError):
            restore_dataset(self.output / "nested", self.entries, self.sources)
        self.assertEqual(list(real.iterdir()), [])

    def test_partial_output_is_preserved_on_failure(self):
        entries = copy.deepcopy(self.entries)
        entries[1]["sha256"] = "0" * 64
        with self.assertRaisesRegex(CorpusError, "SHA256"):
            restore_dataset(self.output, entries, self.sources)
        self.assertEqual((self.output / entries[0]["path"]).read_bytes(), self.raw["own"])
        with self.assertRaises(FileExistsError):
            restore_dataset(self.output, self.entries, self.sources)

    def restored(self):
        restore_dataset(self.output, self.entries, self.sources)
        return self.output / self.entries[0]["path"]

    def test_verify_missing(self):
        self.restored().unlink()
        with self.assertRaisesRegex(CorpusError, "missing"):
            verify_dataset(self.output, self.entries)

    def test_verify_changed_same_size(self):
        path = self.restored()
        data = path.read_bytes()
        path.write_bytes(bytes([data[0] ^ 1]) + data[1:])
        with self.assertRaisesRegex(CorpusError, "SHA256"):
            verify_dataset(self.output, self.entries)

    def test_verify_git_blob_independently(self):
        self.restored()
        entries = copy.deepcopy(self.entries)
        entries[0]["gitBlobSHA1"] = "0" * 40
        with self.assertRaisesRegex(CorpusError, "Git blob SHA1"):
            verify_dataset(self.output, entries)

    def test_verify_mode(self):
        self.restored().chmod(0o755)
        with self.assertRaisesRegex(CorpusError, "mode/size"):
            verify_dataset(self.output, self.entries)

    def test_verify_extras(self):
        self.restored()
        for directory in (False, True):
            path = self.output / "extra"
            if directory:
                path.mkdir()
            else:
                path.write_bytes(b"extra")
            with self.assertRaisesRegex(CorpusError, "extra"):
                verify_dataset(self.output, self.entries)
            if directory:
                path.rmdir()
            else:
                path.unlink()

    def test_verify_symlink_file(self):
        path = self.restored()
        path.unlink()
        path.symlink_to(self.root / "absent")
        with self.assertRaisesRegex(CorpusError, "symlink"):
            verify_dataset(self.output, self.entries)

    def test_verify_symlink_directory(self):
        self.restored()
        (self.output / "reference").rename(self.root / "moved")
        (self.output / "reference").symlink_to(self.root / "moved", target_is_directory=True)
        with self.assertRaisesRegex(CorpusError, "symlink"):
            verify_dataset(self.output, self.entries)

    def test_promisor_rejected_without_object_reads(self):
        repo = self.sources["reference"].git_dir
        self.git(repo, ["config", "remote.fake.promisor", "true"])
        with self.assertRaisesRegex(CorpusError, "promisor"):
            GitSource(repo)

    def test_hostile_git_environment_ignored(self):
        saved = os.environ.get("GIT_OBJECT_DIRECTORY")
        os.environ["GIT_OBJECT_DIRECTORY"] = str(self.root / "nonexistent")
        try:
            source = GitSource(self.sources["own"].git_dir)
            self.assertEqual(source.read_entry(self.entries[0]), self.raw["own"])
        finally:
            if saved is None:
                del os.environ["GIT_OBJECT_DIRECTORY"]
            else:
                os.environ["GIT_OBJECT_DIRECTORY"] = saved

    def test_help_does_not_require_repositories(self):
        result = subprocess.run([sys.executable, "-B", str(Path(__file__).resolve().parents[1] / "restore-hwpx-package-corpus.py"), "--help"],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertEqual(result.returncode, 0)
        self.assertIn(b"--verify", result.stdout)
        self.assertIn(b"No fetch", result.stdout)


if __name__ == "__main__":
    unittest.main()
