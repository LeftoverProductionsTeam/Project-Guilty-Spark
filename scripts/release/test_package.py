import copy
import importlib.util
import json
import os
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('release_package', Path(__file__).with_name('package.py'))
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


def pe(machine, nsis=False):
    data = bytearray(53000 if nsis else 128)
    data[:2] = b'MZ'
    struct.pack_into('<I', data, 60, 64)
    data[64:68] = b'PE\0\0'
    struct.pack_into('<H', data, 68, machine)
    if nsis:
        data[52744:52756] = b'NullsoftInst'
    return data


class PackageAcceptance(unittest.TestCase):
    """Synthetic packaging tests, never native application or gameplay evidence."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        self.run_git('init', '-q')
        for file, data in {
            '.gitattributes': '* text=auto eol=lf\n',
            '.gitignore': 'target/\n',
            'package.json': '{"version":"0.4.1"}',
            'src-tauri/tauri.conf.json': '{"version":"0.4.1","bundle":{"targets":["nsis"]}}',
            'Cargo.toml': '[workspace.package]\nversion="0.4.1"\n',
            'Cargo.lock': '\n'.join(f'[[package]]\nname="{n}"\nversion="0.4.1"\n' for n in
                                     ['guilty-spark', 'spark-core', 'spark-steam-bridge']),
            'LICENSE': 'Synthetic packaging test license',
            'THIRD_PARTY_NOTICES.md': 'Synthetic packaging test notices',
            'src/app.txt': 'Original source stays available',
        }.items():
            destination = self.repo / file
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(data)
        self.run_git('add', '.')
        self.run_git('-c', 'user.name=Release Test', '-c', 'user.email=release-test@example.invalid',
                     'commit', '-qm', 'Synthetic packaging fixture')
        self.commit = self.run_git('rev-parse', 'HEAD').strip()
        self.binary = self.repo / 'target/release/GuiltySpark.exe'
        self.binary.parent.mkdir(parents=True)
        self.binary.write_bytes(pe(0x8664))
        setup = self.repo / 'target/release/bundle/nsis/Project Guilty Spark_0.4.1_x64-setup.exe'
        setup.parent.mkdir(parents=True)
        setup.write_bytes(pe(0x14c, True))
        self.output = self.root / 'output'

    def tearDown(self):
        # Git creates read-only object files on Windows; tests own this entire temporary repository.
        import stat
        for directory, _, files in os.walk(self.root):
            for name in files:
                os.chmod(Path(directory) / name, stat.S_IWRITE | stat.S_IREAD)
        self.temp.cleanup()

    def run_git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], stderr=subprocess.DEVNULL).decode()

    def stage(self):
        return package.stage(self.repo, self.commit, 1, 'windows-x64', self.output)

    def test_staging_is_not_acceptance_and_portable_keeps_exact_app(self):
        manifest = self.stage()
        self.assertFalse(manifest['verification']['complete'])
        self.assertEqual(manifest['executableSha256'], package.sha(self.binary.read_bytes()))
        package.verify_artifacts(self.output, manifest)
        with self.assertRaises(ValueError):
            package.verify(self.output)

    def test_dirty_or_wrong_commit_and_stale_versions_refuse_packaging(self):
        with self.assertRaisesRegex(ValueError, 'differs'):
            package.source_info(self.repo, 'a' * 40, 1)
        (self.repo / 'src/app.txt').write_text('Unsaved work')
        with self.assertRaisesRegex(ValueError, 'Commit all'):
            self.stage()
        self.assertFalse(self.output.exists())

    def test_private_paths_and_game_payloads_are_not_source_assets(self):
        for name in ['.local/private.txt', 'src/a.map', 'public/halo.dll', '../secret',
                     'D:/private', 'src\\secret', '.env', 'docs/private.pem', 'other/map.bin']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                package.public_source_path(name)

    def test_configured_sidecars_cannot_silently_go_missing(self):
        file = self.repo / 'src-tauri/tauri.conf.json'
        file.write_text('{"version":"0.4.1","bundle":{"externalBin":["missing"]}}')
        self.run_git('add', '.')
        self.run_git('-c', 'user.name=Release Test', '-c', 'user.email=release-test@example.invalid',
                     'commit', '-qm', 'Require sidecar')
        self.commit = self.run_git('rev-parse', 'HEAD').strip()
        with self.assertRaisesRegex(ValueError, 'sidecars'):
            self.stage()

    def test_corrupt_missing_renamed_or_changed_assets_fail_integrity(self):
        manifest = self.stage()
        first = self.output / manifest['artifacts'][0]['file']
        first.write_bytes(first.read_bytes()[:-1])
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            package.verify_artifacts(self.output, manifest)

    def test_x86_application_and_fake_linux_are_refused(self):
        self.binary.write_bytes(pe(0x14c))
        with self.assertRaisesRegex(ValueError, 'x64'):
            self.stage()
        with self.assertRaisesRegex(ValueError, 'Linux x64 ELF'):
            package.elf_x64(pe(0x8664))

    def test_seal_requires_all_gates_and_exact_native_and_installed_hashes(self):
        manifest = self.stage()
        gates = {'sourceCommit': self.commit, 'platform': 'windows-x64', 'complete': True,
                 'gates': [{'id': name, 'exitCode': 0} for name in package.GATES]}
        startup = {'sourceCommit': self.commit, 'applicationVersion': '0.4.1',
                   'executableSha256': manifest['executableSha256'], 'complete': True, 'mockedIpc': False}
        install = {'complete': True, 'installerSha256': manifest['artifacts'][0]['sha256'],
                   'installedExecutableSha256': manifest['executableSha256']}
        for name, value in [('gates', gates), ('startup', startup), ('install', install)]:
            (self.root / (name + '.json')).write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError, 'installation'):
            package.seal(self.output, self.root / 'gates.json', self.root / 'startup.json')
        bad = copy.deepcopy(startup)
        bad['executableSha256'] = '0' * 64
        (self.root / 'bad.json').write_text(json.dumps(bad))
        with self.assertRaisesRegex(ValueError, 'Installed app'):
            package.seal(self.output, self.root / 'gates.json', self.root / 'startup.json',
                         self.root / 'install.json', self.root / 'bad.json')
        package.seal(self.output, self.root / 'gates.json', self.root / 'startup.json',
                     self.root / 'install.json', self.root / 'startup.json')
        package.verify(self.output)
        (self.output / 'unexpected.map').write_bytes(b'unexpected')
        with self.assertRaisesRegex(ValueError, 'Unexpected public'):
            package.verify(self.output)


if __name__ == '__main__':
    unittest.main()
