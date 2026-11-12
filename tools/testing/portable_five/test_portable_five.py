"""Tool tests: byte reproduction and constrained IO. No Native/browser builds."""
import sys
sys.dont_write_bytecode = True
import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock
import author_fixtures as author
import oracle
import paths


class PortableFive(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files = author.build()
        cls.manifest = paths.expected()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='portable-five-test-', dir=paths.TEMP_ROOT)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.fixtures = self.root.joinpath(*paths.SUFFIX)
        self.fixtures.mkdir(parents=True)
        for name in paths.CHECKED:
            (self.fixtures/name).write_bytes(self.files[name])

    def run_author(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = author.main(list(args))
        return code, out.getvalue(), err.getvalue()

    def test_generated_exact_pinned_bytes(self):
        paths.exact_generated(self.files, self.manifest)
        self.assertEqual(len(self.files), 11)
        self.assertEqual(author.build(), self.files)

    def test_independent_oracle(self):
        result = oracle.verify(self.files)
        self.assertEqual(result['paragraphs'], 2)
        self.assertEqual(result['borderDeclarations'], 0)

    def test_check_is_read_only_and_exact(self):
        before = {n:(self.fixtures/n).read_bytes() for n in paths.CHECKED}
        with mock.patch.object(paths.os, 'mkdir', side_effect=AssertionError('check mkdir')), mock.patch.object(paths.os, 'write', side_effect=AssertionError('check write')):
            code, out, err = self.run_author('--check', '--fixtures', str(self.fixtures))
        self.assertEqual((code, err), (0, ''))
        self.assertEqual(json.loads(out)['writes'], 0)
        self.assertEqual(before, {n:(self.fixtures/n).read_bytes() for n in paths.CHECKED})

    def test_check_rejects_same_size_sha_drift_without_repair(self):
        file = self.fixtures/'table-wire.hwp'
        changed = file.read_bytes()[:-1] + b'\0'
        self.assertNotEqual(changed, self.files['table-wire.hwp'])
        file.write_bytes(changed)
        code, out, err = self.run_author('--check', '--fixtures', str(self.fixtures))
        self.assertEqual(code, 1)
        self.assertEqual(out, '')
        self.assertIn('exact SHA mismatch', err)
        self.assertEqual(file.read_bytes(), changed)

    def test_missing_input_is_failure_not_skip(self):
        (self.fixtures/'pixel.gif').unlink()
        code, out, _ = self.run_author('--check', '--fixtures', str(self.fixtures))
        self.assertEqual((code, out), (1, ''))

    def test_oversized_input_rejected_before_payload_read(self):
        (self.fixtures/'background.hwpx').write_bytes(b'x'*70000)
        with mock.patch.object(paths.os, 'read', side_effect=AssertionError('oversized file read')):
            code, out, err = self.run_author('--check', '--fixtures', str(self.fixtures))
        self.assertEqual((code, out), (1, ''))
        self.assertIn('size mismatch', err)

    def test_fresh_explicit_output_and_check(self):
        output = self.root/'new'
        code, out, err = self.run_author('--output', str(output))
        self.assertEqual((code, err), (0, ''))
        generated = Path(json.loads(out)['fixtures'])
        self.assertEqual(generated, output.joinpath(*paths.SUFFIX))
        self.assertEqual({p.name:p.read_bytes() for p in generated.iterdir()}, self.files)
        self.assertEqual(self.run_author('--check', '--fixtures', str(generated))[0], 0)

    def test_default_output_is_exclusive_new_and_unique(self):
        owned = []
        try:
            for _ in range(2):
                code, out, err = self.run_author()
                self.assertEqual((code, err), (0, ''))
                result = json.loads(out)
                owned.append(Path(result['output']))
                self.assertTrue(result['exclusiveNewDirectory'])
                self.assertEqual(self.run_author('--check', '--fixtures', result['fixtures'])[0], 0)
            self.assertNotEqual(owned[0], owned[1])
        finally:
            # Only roots this test just created successfully; no shared source/cache.
            for root in owned:
                shutil.rmtree(root)

    def test_existing_output_is_never_modified(self):
        output = self.root/'existing'
        output.mkdir()
        marker = output/'marker'
        marker.write_bytes(b'keep')
        code, out, _ = self.run_author('--output', str(output))
        self.assertEqual((code, out), (1, ''))
        self.assertEqual(list(output.iterdir()), [marker])
        self.assertEqual(marker.read_bytes(), b'keep')

    def test_parent_symlink_output_never_followed(self):
        target = self.root/'target'
        target.mkdir()
        alias = self.root/'alias'
        alias.symlink_to(target, target_is_directory=True)
        code, _, _ = self.run_author('--output', str(alias/'new'))
        self.assertEqual(code, 1)
        self.assertEqual(list(target.iterdir()), [])

    def test_parent_symlink_input_never_followed(self):
        alias = self.root/'alias'
        alias.symlink_to(self.root, target_is_directory=True)
        raw = str(alias.joinpath(*paths.SUFFIX))
        with mock.patch.object(paths.os, 'read', side_effect=AssertionError('parent symlink read')):
            self.assertEqual(self.run_author('--check', '--fixtures', raw)[0], 1)
        # A symlink at the final directory is rejected too.
        alias.unlink()
        real = self.root/'real'
        self.fixtures.rename(real)
        self.fixtures.symlink_to(real, target_is_directory=True)
        with mock.patch.object(paths.os, 'read', side_effect=AssertionError('symlink read')):
            self.assertEqual(self.run_author('--check', '--fixtures', str(self.fixtures))[0], 1)

    def test_symlink_file_is_not_read(self):
        gif = self.fixtures/'pixel.gif'
        gif.unlink()
        gif.symlink_to(self.root/'not-opened')
        self.assertEqual(self.run_author('--check', '--fixtures', str(self.fixtures))[0], 1)

    def test_protected_and_unrelated_paths_rejected_before_io(self):
        suffix = '/src/testing/fixtures/portable-five'
        protected = (
            '/x/legacy/hwpers/data'+suffix,
            '/x/LeGaCy/HwPeRs/data'+suffix,
            '/x/tests/hwpx/title-column-roundtrip.test.mjs'+suffix,
            '/x/hwpers_test4_complex_table.hwp'+suffix,
            '/x/reference/rhwp/samples'+suffix,
            '/x/.git'+suffix,
            '/x/node_modules'+suffix,
        )
        with mock.patch.object(paths.os, 'open', side_effect=AssertionError('protected open')), mock.patch.object(paths.os, 'mkdir', side_effect=AssertionError('protected mkdir')), mock.patch.object(Path, 'resolve', side_effect=AssertionError('protected resolve')), mock.patch.object(Path, 'stat', side_effect=AssertionError('protected stat')):
            for value in protected:
                with self.subTest(path=value), self.assertRaises(ValueError):
                    paths.fixture_path(value)
                with self.subTest(output=value), self.assertRaises(ValueError):
                    paths.output_path(value)

    def test_malformed_paths_fail_before_io(self):
        with mock.patch.object(paths.os, 'open', side_effect=AssertionError('path open')):
            for value in ('relative', '/x/../src/testing/fixtures/portable-five', '/x/./src/testing/fixtures/portable-five', '/x//src/testing/fixtures/portable-five', '/x/\0/src/testing/fixtures/portable-five'):
                with self.subTest(path=value), self.assertRaises(ValueError):
                    paths.fixture_path(value)
            with self.assertRaises(ValueError):
                paths.output_path('/Users/not-a-temp-output')

    def test_incompatible_cli_options_reject_before_io(self):
        with mock.patch.object(paths, 'expected', side_effect=AssertionError('unexpected IO')):
            for args in (('--check','--output',str(self.root/'new')), ('--fixtures',str(self.fixtures))):
                with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as raised:
                    author.main(list(args))
                self.assertEqual(raised.exception.code, 2)

    def test_mutated_generator_cannot_write(self):
        wrong = dict(self.files)
        wrong['pixel.gif'] = b'x'*35
        with mock.patch.object(author, 'build', return_value=wrong):
            code, out, err = self.run_author('--output', str(self.root/'must-not-exist'))
        self.assertEqual((code, out), (1, ''))
        self.assertIn('generated SHA', err)
        self.assertFalse((self.root/'must-not-exist').exists())

    def test_cli_without_B_does_not_create_bytecode(self):
        script = Path(author.__file__)
        self.assertFalse((script.parent/'__pycache__').exists())
        result = subprocess.run([sys.executable, str(script), '--check', '--fixtures', str(self.fixtures)], text=True, capture_output=True)
        self.assertEqual((result.returncode, result.stderr), (0, ''))
        self.assertEqual(json.loads(result.stdout)['writes'], 0)
        self.assertFalse((script.parent/'__pycache__').exists())

    def test_cli_protected_paths_rejected_before_manifest_or_input_io(self):
        forbidden = '/forbidden/legacy/hwpers/src/testing/fixtures/portable-five'
        with mock.patch.object(paths, 'expected', side_effect=AssertionError('manifest IO before path rejection')), mock.patch.object(paths.os, 'open', side_effect=AssertionError('protected open')):
            self.assertEqual(self.run_author('--check', '--fixtures', forbidden)[0], 1)
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(oracle.main(['--fixtures', forbidden]), 1)

    def test_generation_write_failure_closes_and_does_not_touch_inputs(self):
        before = {n:(self.fixtures/n).read_bytes() for n in paths.CHECKED}
        with mock.patch.object(paths.os, 'write', side_effect=OSError('injected write failure')):
            code, out, err = self.run_author('--output', str(self.root/'failed-new-output'))
        self.assertEqual((code, out), (1, ''))
        self.assertIn('injected write failure', err)
        self.assertEqual(before, {n:(self.fixtures/n).read_bytes() for n in paths.CHECKED})

    def test_independent_corruption_counterexamples(self):
        es = oracle.entries('chart.hwpx', self.files)
        es['Chart/chart1.xml'] = es['Chart/chart1.xml'].replace(oracle.NS['chart'].encode(), b'urn:foreign')
        with self.assertRaises(ValueError): oracle.gap(es)
        es = oracle.entries('chart.hwpx', self.files)
        es['Contents/section0.xml'] = es['Contents/section0.xml'].replace(b'width="12345"', b'width="999"')
        with self.assertRaises(ValueError): oracle.geometry(es)
        es = oracle.entries('background.hwpx', self.files)
        es['Contents/header.xml'] = es['Contents/header.xml'].replace(b'image17', b'wrong')
        with self.assertRaises(ValueError): oracle.background(es)
        gif = bytearray(self.files['pixel.gif']); gif[31] ^= 1
        with self.assertRaises(ValueError): oracle.gif_bytes(gif)
        es = oracle.entries('runless.hwpx', self.files)
        es['Contents/header.xml'] = es['Contents/header.xml'].replace(b'charPrIDRef="43"', b'charPrIDRef="0"')
        with self.assertRaises(ValueError): oracle.runless(es)
        es = oracle.entries('background.hwpx', self.files)
        es['Contents/content.hpf'] = es['Contents/content.hpf'].replace(b'id="section"', b'id="header"')
        with self.assertRaises(ValueError): oracle.package(es)


if __name__ == '__main__':
    unittest.main()
