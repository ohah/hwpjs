"""Only exact commit:path metadata and explicitly authorized raw blob objects."""

import os
from pathlib import Path
import subprocess

from .manifest import CorpusError, check_bytes


class GitSource:
    def __init__(self, git_dir):
        self.git_dir = Path(git_dir).absolute()
        if not self.git_dir.is_dir():
            raise CorpusError("Git object store missing: " + str(self.git_dir))
        # Do not inherit GIT_OBJECT_DIRECTORY, alternates, config overrides,
        # worktree or a caller's replacement-object settings.
        self.env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        self.env.update({"GIT_NO_LAZY_FETCH": "1", "GIT_NO_REPLACE_OBJECTS": "1",
                         "GIT_OPTIONAL_LOCKS": "0", "GIT_TERMINAL_PROMPT": "0",
                         "GIT_LITERAL_PATHSPECS": "1", "GIT_CONFIG_NOSYSTEM": "1",
                         "GIT_CONFIG_GLOBAL": os.devnull})
        # Old Git versions must also fail locally instead of fetching a missing
        # promisor object. Local complete stores only; no fetch/checkout command.
        result = self._run(["config", "--local", "--get-regexp", r"^(extensions\.partialclone|remote\..*\.promisor)$"], (0, 1))
        if result:
            raise CorpusError("partial/promisor stores are not permitted")

    def _run(self, args, allowed=(0,)):
        result = subprocess.run(["git", "--no-replace-objects", "--git-dir", str(self.git_dir)] + args,
                                env=self.env, stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        if result.returncode not in allowed:
            raise CorpusError("local Git command failed (%s): %s" %
                              (args[0], result.stderr.decode("utf-8", "replace").strip()))
        return result.stdout

    def verify_entry(self, entry):
        path = entry["sourcePath"].encode("utf-8")
        expected = (entry["mode"] + " blob " + entry["gitBlobSHA1"]).encode("ascii") + b"\t" + path + b"\0"
        actual = self._run(["ls-tree", "-z", entry["originCommit"], "--", entry["sourcePath"]])
        if actual != expected:
            raise CorpusError("commit:path mode/blob mismatch: " + entry["path"])
        size = self._run(["cat-file", "-s", entry["gitBlobSHA1"]])
        if size != (str(entry["bytes"]) + "\n").encode("ascii"):
            raise CorpusError("Git object size mismatch: " + entry["path"])

    def read_entry(self, entry):
        self.verify_entry(entry)
        raw = self._run(["cat-file", "blob", entry["gitBlobSHA1"]])
        check_bytes(entry, raw)
        return raw
