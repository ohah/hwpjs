#!/usr/bin/env python3
"""Restore/verify the required historical raw corpus from complete local Git stores."""

import argparse
import json
from pathlib import Path
import sys

from hwpx_package_corpus.dataset import restore_dataset, verify_dataset
from hwpx_package_corpus.git_source import GitSource
from hwpx_package_corpus.manifest import CorpusError, load_manifest, MANIFEST_SHA256


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, epilog=(
        "No fetch, checkout, format conversion, Native execution or overwrite. "
        "On failure any new partial output is retained; use a fresh path for retry. "
        "Git stores and all output ancestors must be locally available. "
        "This tool does not run or certify the Native suite."))
    parser.add_argument("--own-git-dir", type=Path, required=True, help="own repository .git/object store")
    parser.add_argument("--reference-git-dir", type=Path, required=True, help="separate raw source .git/object store")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--output", type=Path, help="NEW dataset directory; its parent must exist without symlinks")
    action.add_argument("--verify", type=Path, help="verify an existing exact dataset AND original commit:path metadata")
    args = parser.parse_args(argv)
    try:
        manifest = Path(__file__).resolve().parents[1] / "src/testing/hwpx-package-historical-484.json"
        entries = load_manifest(manifest)
        sources = {"own": GitSource(args.own_git_dir), "reference": GitSource(args.reference_git_dir)}
        if args.verify is not None:
            for entry in entries:
                sources[entry["origin"]].verify_entry(entry)
            result = verify_dataset(args.verify, entries)
        else:
            result = restore_dataset(args.output, entries, sources)
        print(json.dumps(dict(result, status="verified", manifestSHA256=MANIFEST_SHA256,
                              action="verify" if args.verify is not None else "restore")))
        return 0
    except (CorpusError, OSError) as exc:
        print("historical corpus FAILED: " + str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
