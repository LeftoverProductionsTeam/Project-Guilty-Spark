"""Destructive-maintenance contracts use new temporary workspaces only."""
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('qa_vault',Path(__file__).with_name('qa-vault.py'))
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)


class OwnedTestDirectory:
    """Pin the newly allocated directory, not its possibly aliased spelling.

    Windows runners may give tempfile a short/junction-backed parent. Resolve
    once at allocation and verify the same directory identity before removal.
    There is deliberately no finalizer that could bypass a refused cleanup.
    """
    def __init__(self):
        self.name = tempfile.mkdtemp(prefix='spark-vault-test-')
        self.root = v.resolved(self.name)
        if self.root.parent != v.resolved(tempfile.gettempdir()):
            raise ValueError('Allocated test root leaves the intended temporary parent')
        meta = os.stat(v.native(self.root), follow_symlinks=False)
        self.identity = (meta.st_dev, meta.st_ino)

    def cleanup(self):
        current = v.resolved(self.name)
        if current != self.root:
            raise ValueError('Temporary test root changed')
        if not os.path.lexists(v.native(current)):
            return
        meta = os.stat(v.native(current), follow_symlinks=False)
        if (not stat.S_ISDIR(meta.st_mode)
                or getattr(meta, 'st_file_attributes', 0) & 0x400
                or (meta.st_dev, meta.st_ino) != self.identity):
            raise ValueError('Temporary test root identity changed')
        shutil.rmtree(v.native(self.root))


class VaultTests(unittest.TestCase):
    def setUp(self):
        self.temp = OwnedTestDirectory()
        self.addCleanup(self.temp.cleanup)
        v.WORKSPACE = self.temp.root
        self.source = v.WORKSPACE/'.local/run'
        self.source.mkdir(parents=True)
        for name, data in [('world.map',b'native map test bytes'),('halo.exe',b'owned executable test bytes'),('config.toml',b'option=true')]:
            (self.source/name).write_bytes(data)
        self.plan = v.WORKSPACE/'plan.json'
        self.plan.write_text(json.dumps(['.local/run']),encoding='utf-8')
        self.vault = v.WORKSPACE/'.local/vault'

    def test_cleanup_accepts_equivalent_native_spelling(self):
        owned = OwnedTestDirectory()
        self.addCleanup(owned.cleanup)
        (owned.root/'fixture.txt').write_bytes(b'owned test data')
        owned.name = v.native(owned.root)
        owned.cleanup()
        self.assertFalse(owned.root.exists())
        self.assertTrue((self.source/'world.map').exists())

    def test_cleanup_refuses_a_different_directory(self):
        owned = OwnedTestDirectory()
        self.addCleanup(owned.cleanup)
        original = owned.name
        try:
            owned.name = str(self.source)
            with self.assertRaisesRegex(ValueError, 'root changed'):
                owned.cleanup()
            self.assertTrue((self.source/'world.map').exists())
            self.assertTrue(owned.root.exists())
        finally:
            owned.name = original

    def test_cleanup_refuses_a_replaced_directory_at_the_same_path(self):
        owned = OwnedTestDirectory()
        self.addCleanup(owned.cleanup)
        moved = owned.root.with_name(owned.root.name+'-original')
        owned.root.rename(moved)
        try:
            owned.root.mkdir()
            marker = owned.root/'replacement.txt'
            marker.write_bytes(b'new directory must remain')
            with self.assertRaisesRegex(ValueError, 'identity changed'):
                owned.cleanup()
            self.assertEqual(marker.read_bytes(), b'new directory must remain')
            self.assertTrue(moved.exists())
        finally:
            # Only the one test-created marker and its otherwise empty new
            # directory are removed; unexpected additions make rmdir refuse.
            if owned.root.exists():
                (owned.root/'replacement.txt').unlink(missing_ok=True)
                owned.root.rmdir()
            moved.rename(owned.root)

    def prepared(self):
        v.prepare(self.plan,self.vault)

    def proven(self):
        self.prepared()
        return v.prove_restore(self.vault,v.WORKSPACE/'.local/probe',
                               ['.local/run/'+name for name in ['world.map','halo.exe','config.toml']])

    def test_prepare_never_removes_expanded_data(self):
        self.prepared()
        self.assertEqual(len(list(self.source.iterdir())),3)
        self.assertFalse((self.vault/'cleanup-receipt.json').exists())

    def test_finish_requires_independent_restore_and_inactive_confirmation(self):
        self.prepared()
        with self.assertRaises(ValueError):v.finish(self.vault)
        with self.assertRaises(FileNotFoundError):v.finish(self.vault,True)
        self.assertEqual(len(list(self.source.iterdir())),3)

    def test_roundtrip_deduplicates_and_restores_independent_files(self):
        (self.source/'same.map').write_bytes((self.source/'world.map').read_bytes())
        self.proven()
        catalog=json.loads((self.vault/'catalog.json').read_text(encoding='utf-8'))
        self.assertEqual(len(catalog['blobs']),3)
        self.assertEqual(len(catalog['files']),4)
        result=v.finish(self.vault,True)
        self.assertEqual(result['filesRemoved'],4)
        self.assertFalse(self.source.exists())
        v.restore(self.vault,None)
        self.assertEqual((self.source/'same.map').read_bytes(),(self.source/'world.map').read_bytes())
        self.assertEqual((self.source/'same.map').stat().st_nlink,1)

    def test_changed_newer_and_new_files_remain(self):
        self.proven()
        (self.source/'world.map').write_bytes(b'new edited map')
        unchanged=self.source/'halo.exe'
        meta=unchanged.stat();os.utime(unchanged,ns=(meta.st_atime_ns,meta.st_mtime_ns+10_000_000))
        (self.source/'new.txt').write_bytes(b'new file after snapshot')
        result=v.finish(self.vault,True)
        self.assertEqual(len(result['retainedNewerFiles']),2)
        self.assertEqual((self.source/'world.map').read_bytes(),b'new edited map')
        self.assertTrue((self.source/'halo.exe').exists())
        self.assertTrue((self.source/'new.txt').exists())

    def test_changed_existing_file_is_never_overwritten(self):
        self.prepared();(self.source/'world.map').write_bytes(b'new work')
        with self.assertRaises(ValueError):v.restore(self.vault,'.local/run/world.map')
        self.assertEqual((self.source/'world.map').read_bytes(),b'new work')

    def test_corrupt_volume_refuses_all_source_removal(self):
        self.proven()
        volume=next(self.vault.glob('*.zip'))
        with volume.open('ab') as stream:stream.write(b'corrupt')
        with self.assertRaises(ValueError):v.finish(self.vault,True)
        self.assertEqual(len(list(self.source.iterdir())),3)

    def test_catalog_corruption_and_stale_proof_refuse_removal(self):
        self.proven()
        (self.vault/'catalog.json').write_bytes(b'{}')
        with self.assertRaises(ValueError):v.finish(self.vault,True)
        self.assertTrue((self.source/'world.map').exists())

    def test_changed_restoration_probe_refuses_removal(self):
        proof=self.proven()
        Path(proof['samples'][0]['restoredPath']).write_bytes(b'changed proof')
        with self.assertRaises(ValueError):v.finish(self.vault,True)
        self.assertEqual(len(list(self.source.iterdir())),3)

    def test_unsafe_roots_and_worktrees_are_refused(self):
        for relative in ['.local','../other','.local/../escape','.git/objects','.local/.git/objects',r'.local/run/..\escape','.local/run/file:stream']:
            with self.subTest(relative=relative),self.assertRaises(ValueError):v.checked(relative)
        (self.source/'.git').write_text('gitdir: elsewhere',encoding='utf-8')
        with self.assertRaises(ValueError):self.prepared()
        self.assertTrue((self.source/'world.map').exists())

    def test_overlapping_roots_are_refused(self):
        self.plan.write_text(json.dumps(['.local/run','.local/run/sub']),encoding='utf-8')
        with self.assertRaises(ValueError):self.prepared()

    def test_nested_worktree_source_is_protected_but_private_qa_is_allowed(self):
        root=v.WORKSPACE/'.local/nested';root.mkdir()
        (root/'.git').write_text('gitdir: private Git location',encoding='utf-8')
        source=root/'src';source.mkdir();(source/'app.rs').write_text('unique source',encoding='utf-8')
        self.plan.write_text(json.dumps(['.local/nested/src']),encoding='utf-8')
        with self.assertRaises(ValueError):self.prepared()
        self.assertEqual((source/'app.rs').read_text(encoding='utf-8'),'unique source')
        qa=root/'.local/run';qa.mkdir(parents=True)
        self.assertEqual(v.private_qa_root(qa),qa)

    def test_merged_snapshot_restores_absent_old_children_without_old_vault(self):
        parent=v.WORKSPACE/'.local/group';parent.mkdir()
        self.source.rename(parent/'run');self.source=parent/'run'
        self.plan.write_text(json.dumps(['.local/group/run']),encoding='utf-8')
        self.prepared()
        v.prove_restore(self.vault,v.WORKSPACE/'.local/probe-old',['.local/group/run/world.map'])
        v.finish(self.vault,True)
        self.assertFalse(self.source.exists())
        (parent/'new.txt').write_bytes(b'new native evidence')
        present=sum(meta.st_size for _,meta in v.walk(parent))
        self.plan.write_text(json.dumps(['.local/group']),encoding='utf-8')
        second=v.WORKSPACE/'.local/vault-second'
        v.prepare(self.plan,second,self.vault,True)
        catalog=json.loads((second/'catalog.json').read_text(encoding='utf-8'))
        self.assertEqual(catalog['inheritedVerifiedSnapshot']['bytesAlreadyAbsent'],59)
        v.prove_restore(second,v.WORKSPACE/'.local/probe-new',['.local/group/run/world.map','.local/group/new.txt'])
        result=v.finish(second,True)
        self.assertEqual(result['newlyRemovedBytes'],present)
        self.assertEqual(result['originalCopiesAbsentBeforeResumeBytes'],59)
        self.vault.rename(v.WORKSPACE/'.local/old-vault-unavailable')
        v.restore(second,None)
        self.assertEqual((self.source/'world.map').read_bytes(),b'native map test bytes')
        self.assertEqual((parent/'new.txt').read_bytes(),b'new native evidence')

    def test_seed_merge_keeps_current_changed_file_as_current_snapshot(self):
        self.prepared();(self.source/'world.map').write_bytes(b'current edited world')
        second=v.WORKSPACE/'.local/vault-second'
        v.prepare(self.plan,second,self.vault,True)
        catalog=json.loads((second/'catalog.json').read_text(encoding='utf-8'))
        row=next(r for r in catalog['files'] if r[0].endswith('/world.map'))
        import hashlib
        self.assertEqual(row[2],hashlib.sha256(b'current edited world').hexdigest())
        self.assertEqual((self.source/'world.map').read_bytes(),b'current edited world')

    def test_seed_merge_requires_verified_prior_catalog(self):
        with self.assertRaises(ValueError):v.prepare(self.plan,self.vault,None,True)

    def test_long_native_paths_roundtrip_with_full_resolution(self):
        long=self.source
        for i in range(7):long=long/('native-source-component-'+str(i)+'x'*18)
        os.makedirs(v.native(long),exist_ok=True)
        file=long/'long-native-fixture.bin'
        with open(v.native(file),'xb') as stream:stream.write(b'long path source evidence')
        relative=file.relative_to(v.WORKSPACE).as_posix()
        self.assertEqual(v.checked(relative),file)
        self.prepared()
        v.prove_restore(self.vault,v.WORKSPACE/'.local/long-proof',[relative])
        result=v.finish(self.vault,True)
        self.assertEqual(result['filesRemoved'],4)
        v.restore(self.vault,relative)
        with open(v.native(file),'rb') as stream:self.assertEqual(stream.read(),b'long path source evidence')

    def test_retention_is_outcome_specific_and_never_deletes(self):
        import datetime
        policy=json.loads(Path(__file__).with_name('retention-policy.json').read_text(encoding='utf-8'))
        rows=[{'root':'.local/run'+str(i),'workflow':'native','status':status,'active':False,
               'sourceCommit':'a'*40,'finishedAt':'2026-01-01T00:00:00Z'}
              for i,status in enumerate(['passed']*3+['failed']*5)]
        result=v.retention_plan(rows,policy,datetime.datetime(2026,2,10,tzinfo=datetime.timezone.utc))
        self.assertEqual(len(result['archiveReview']),2)
        self.assertFalse(result['automaticDeletion'])
        self.assertEqual(len(list(self.source.iterdir())),3)

    def test_active_unknown_fixture_and_recent_failures_stay(self):
        import datetime
        policy=json.loads(Path(__file__).with_name('retention-policy.json').read_text(encoding='utf-8'))
        rows=[{'root':'.local/run'+str(i),'workflow':'native','status':'failed','active':False,
               'sourceCommit':'a'*40,'finishedAt':'2026-02-01T00:00:00Z'} for i in range(6)]
        rows[0]['active']=True;rows[1]['protected']=True;rows[2]['status']='incomplete'
        result=v.retention_plan(rows,policy,datetime.datetime(2026,2,10,tzinfo=datetime.timezone.utc))
        self.assertEqual(result['archiveReview'],[])
        self.assertEqual(len(result['keep']),6)


class ProviderIndexTests(unittest.TestCase):
    def setUp(self):
        self.temp = OwnedTestDirectory()
        self.addCleanup(self.temp.cleanup)
        v.WORKSPACE = self.temp.root
        self.root = v.WORKSPACE/'preserved'
        self.root.mkdir()
        self.payloads = [b'original native-format fixture bytes', b'{"history":"original project"}']
        self.hashes = [hashlib.sha256(data).hexdigest() for data in self.payloads]
        self.zip = self.root/'recovery-archives/retained/payload.zip'
        self.zip.parent.mkdir(parents=True)
        with zipfile.ZipFile(self.zip, 'x', zipfile.ZIP_DEFLATED) as archive:
            for checksum, payload in zip(self.hashes, self.payloads):
                archive.writestr(checksum, payload)
        self.zip_hash = hashlib.sha256(self.zip.read_bytes()).hexdigest()
        self.raw = self.root/'raw/project.json'
        self.raw.parent.mkdir()
        self.raw.write_bytes(self.payloads[1])
        os.chmod(self.raw, stat.S_IREAD)
        self.addCleanup(lambda: os.chmod(self.raw, stat.S_IREAD | stat.S_IWRITE) if self.raw.exists() else None)
        self.catalog = self.root/'recovery-archives/legacy/catalog.json'
        self.catalog.parent.mkdir()
        self.catalog_data = json.dumps({'schemaVersion': 1, 'roots': ['.local/old-run'],
            'files': [['.local/old-run/world.map', len(self.payloads[0]), self.hashes[0], 1790000000000000001, 33206],
                      ['.local/old-run/project.gsproject', len(self.payloads[1]), self.hashes[1], 1790000000000000002, 33206]],
            'blobs': {checksum: 'obsolete.zip' for checksum in self.hashes},
            'volumes': [{'file': 'obsolete.zip', 'bytes': self.zip.stat().st_size, 'sha256': self.zip_hash}],
            'contentVerified': True}, separators=(',', ':')).encode()
        self.catalog.write_bytes(self.catalog_data)
        self.prefix = self.zip.read_bytes()[:75]
        self.prefix_hash = hashlib.sha256(self.prefix).hexdigest()
        self.data = {'schemaVersion': 1, 'kind': 'spark-preservation-index',
            'workspace': str(v.WORKSPACE), 'root': str(self.root),
            'objects': {
                self.hashes[0]: {'kind': 'zip-member', 'path': 'recovery-archives/retained/payload.zip',
                    'bytes': len(self.payloads[0]), 'member': self.hashes[0],
                    'containerSha256': self.zip_hash, 'containerBytes': self.zip.stat().st_size},
                self.hashes[1]: {'kind': 'raw', 'path': 'raw/project.json', 'bytes': len(self.payloads[1])},
                self.zip_hash: {'kind': 'raw', 'path': 'recovery-archives/retained/payload.zip', 'bytes': self.zip.stat().st_size},
                self.prefix_hash: {'kind': 'range', 'path': 'recovery-archives/retained/payload.zip',
                    'bytes': len(self.prefix), 'offset': 0, 'containerSha256': self.zip_hash,
                    'containerBytes': self.zip.stat().st_size, 'sha256': self.prefix_hash}},
            'files': {'recovery-archives/legacy/obsolete.zip': {'sha256': self.zip_hash, 'bytes': self.zip.stat().st_size},
                      'recovery-archives/interrupted.zip': {'kind': 'range', 'path': 'recovery-archives/retained/payload.zip',
                          'bytes': len(self.prefix), 'offset': 0, 'containerSha256': self.zip_hash,
                          'containerBytes': self.zip.stat().st_size, 'sha256': self.prefix_hash}},
            'legacyVaults': {'recovery-archives/legacy': {'catalogPath': 'recovery-archives/legacy/catalog.json',
                'catalogSha256': hashlib.sha256(self.catalog_data).hexdigest(),
                'volumes': [{'file': 'obsolete.zip', 'bytes': self.zip.stat().st_size, 'sha256': self.zip_hash}]}}}
        self.index = v.WORKSPACE/'provider-index.json'
        self.pin = self.write_index()

    def write_index(self):
        data = json.dumps(self.data).encode()
        self.index.write_bytes(data)
        return hashlib.sha256(data).hexdigest()

    def test_raw_zip_range_and_independent_writable_copies(self):
        with v.ProviderIndex(self.index, self.pin) as reader:
            for number, checksum in enumerate([*self.hashes, self.prefix_hash, self.hashes[0]]):
                target = v.WORKSPACE/'artifacts/recovered'/str(number)
                result = reader.request({'sha256': checksum, 'destination': str(target)}, True)
                self.assertEqual(result['sourceSha256'], checksum)
                self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(), checksum)
                self.assertEqual(target.stat().st_nlink, 1)
                self.assertTrue(target.stat().st_mode & stat.S_IWRITE)
                self.assertTrue(result['fullReadback'])
            self.assertEqual(len(reader.containers()), 2)
        (v.WORKSPACE/'artifacts/recovered/0').write_bytes(b'edited independent copy')
        self.assertEqual(self.raw.read_bytes(), self.payloads[1])
        with zipfile.ZipFile(self.zip) as archive:
            self.assertEqual(archive.read(self.hashes[0]), self.payloads[0])
        self.assertFalse((v.WORKSPACE/'.local').exists())

    def test_legacy_alias_restores_without_original_volume_or_local(self):
        del self.data['objects'][self.hashes[0]]
        pin = self.write_index()
        target = v.WORKSPACE/'artifacts/history-recovery'
        result = v.recover_vault(self.index, pin, 'recovery-archives/legacy', target, '.local/old-run')
        self.assertTrue(result['complete'])
        self.assertEqual((target/'legacy-local/old-run/world.map').read_bytes(), self.payloads[0])
        self.assertEqual((target/'legacy-local/old-run/project.gsproject').read_bytes(), self.payloads[1])
        self.assertEqual(self.catalog.read_bytes(), self.catalog_data)
        self.assertFalse((self.catalog.parent/'obsolete.zip').exists())
        self.assertFalse((v.WORKSPACE/'.local').exists())

    def test_index_pin_and_unsafe_provider_paths_fail(self):
        with self.assertRaises(ValueError):
            v.ProviderIndex(self.index, '0'*64)
        for path in ['../escape', '/absolute', 'C:/escape', 'raw/file:stream', 'raw/../escape']:
            self.data['objects'][self.hashes[1]]['path'] = path
            with self.subTest(path=path), self.assertRaises(ValueError):
                v.ProviderIndex(self.index, self.write_index())

    def test_existing_and_protected_destinations_are_never_overwritten(self):
        target = v.WORKSPACE/'artifacts/existing'
        target.parent.mkdir()
        target.write_bytes(b'current authored data')
        with v.ProviderIndex(self.index, self.pin) as reader:
            for destination in [target, self.raw, v.WORKSPACE/'src/new.rs', v.WORKSPACE/'.local/new.map']:
                with self.subTest(destination=destination), self.assertRaises(ValueError):
                    reader.request({'sha256': self.hashes[0], 'destination': str(destination)}, True)
        self.assertEqual(target.read_bytes(), b'current authored data')
        self.assertEqual(self.raw.read_bytes(), self.payloads[1])
        self.assertFalse((v.WORKSPACE/'.local').exists())

    def test_changed_container_and_truncated_zip_fail(self):
        with self.zip.open('ab') as stream:
            stream.write(b'changed container')
        with v.ProviderIndex(self.index, self.pin) as reader, self.assertRaises(ValueError):
            reader.request({'sha256': self.hashes[0]})
        self.zip.write_bytes(self.zip.read_bytes()[:40])
        descriptor = self.data['objects'][self.hashes[0]]
        descriptor['containerBytes'] = self.zip.stat().st_size
        descriptor['containerSha256'] = hashlib.sha256(self.zip.read_bytes()).hexdigest()
        with v.ProviderIndex(self.index, self.write_index()) as reader, self.assertRaises(zipfile.BadZipFile):
            reader.request({'sha256': self.hashes[0]})

    def test_corrupt_member_refuses_even_with_updated_container_pin(self):
        data = bytearray(self.zip.read_bytes())
        with zipfile.ZipFile(self.zip) as archive:
            info = archive.getinfo(self.hashes[0])
            offset = info.header_offset
        import struct
        name, extra = struct.unpack_from('<HH', data, offset+26)
        data[offset+30+name+extra+2] ^= 0xff
        self.zip.write_bytes(data)
        descriptor = self.data['objects'][self.hashes[0]]
        descriptor['containerSha256'] = hashlib.sha256(data).hexdigest()
        with v.ProviderIndex(self.index, self.write_index()) as reader, self.assertRaises(Exception):
            reader.request({'sha256': self.hashes[0]})

    @unittest.skipUnless(os.name == 'nt', 'Windows sharing contract')
    def test_open_provider_denies_source_change_or_replacement(self):
        with v.ProviderIndex(self.index, self.pin) as reader:
            reader.request({'sha256': self.hashes[0]})
            with self.assertRaises(PermissionError):
                with self.zip.open('ab') as stream:
                    stream.write(b'not permitted')
            with self.assertRaises(PermissionError):
                self.zip.rename(self.zip.with_suffix('.moved'))

    def test_linked_provider_and_destination_ancestors_refused(self):
        external = v.WORKSPACE/'external'; external.mkdir()
        (external/'sentinel').write_bytes(b'original untouched')
        link = self.root/'linked'
        subprocess = __import__('subprocess')
        subprocess.run(['node', '-e', "require('fs').symlinkSync(process.argv[1],process.argv[2],'junction')", str(external), str(link)], check=True, capture_output=True)
        self.data['objects'][self.hashes[1]]['path'] = 'linked/sentinel'
        self.data['objects'][self.hashes[1]]['bytes'] = 18
        with v.ProviderIndex(self.index, self.write_index()) as reader, self.assertRaises(ValueError):
            reader.request({'sha256': self.hashes[1]})
        self.assertEqual((external/'sentinel').read_bytes(), b'original untouched')

    def test_genuine_ndjson_batch_and_receipt(self):
        import subprocess, sys
        requests = [{'id': n, 'sha256': checksum, 'destination': str(v.WORKSPACE/'artifacts/batch'/str(n))}
                    for n, checksum in enumerate(self.hashes)]
        command = [sys.executable, '-B', str(Path(v.__file__)), '--workspace', str(v.WORKSPACE),
                   'recover-object', str(self.index), '--index-sha256', self.pin, '--requests', '-']
        result = subprocess.run(command, input=''.join(json.dumps(r)+'\n' for r in requests), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        rows = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual(rows[0]['type'], 'ready')
        self.assertEqual([r['id'] for r in rows[1:]], [0, 1])
        self.assertTrue(all(r['ok'] and r['independentRegularFile'] for r in rows[1:]))
        source = v.WORKSPACE/'requests.json'; source.write_text(json.dumps([{'sha256': h} for h in self.hashes]))
        receipt = v.WORKSPACE/'artifacts/verification.json'
        command = [sys.executable, '-B', str(Path(v.__file__)), '--workspace', str(v.WORKSPACE),
                   'verify-provider-index', str(self.index), '--index-sha256', self.pin, '--requests', str(source), '--receipt', str(receipt)]
        result = subprocess.run(command, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        proof = json.loads(receipt.read_text())
        self.assertTrue(proof['complete'] and proof['fullReadback'])
        self.assertEqual(len(proof['objects']), 2)
        self.assertTrue(proof['objects'][0]['crcVerified'])

    def component_receipts(self):
        components = []
        for number, checksum in enumerate(self.hashes):
            result = v.verify_provider_index(self.index, self.pin, [{'sha256': checksum}])
            path = v.WORKSPACE/f'component-{number}.json'
            data = json.dumps(result).encode(); path.write_bytes(data)
            components.append({'path': str(path), 'sha256': hashlib.sha256(data).hexdigest()})
        return components

    def test_genuine_utf8_jsonl_with_isolated_windows_interpreter(self):
        import subprocess, sys
        target = v.WORKSPACE/'artifacts/caf\u00e9-\u4e16\u754c.map'
        request = {'id': 'unicode', 'sha256': self.hashes[0], 'destination': str(target)}
        command = [sys.executable, '-I', str(Path(v.__file__)), '--workspace', str(v.WORKSPACE),
                   'recover-object', str(self.index), '--index-sha256', self.pin, '--requests', '-']
        result = subprocess.run(command, input=(json.dumps(request, ensure_ascii=False)+'\n').encode('utf-8'),
                                capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode('utf-8'))
        rows = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual(rows[-1]['destination'], str(target))
        self.assertEqual(target.read_bytes(), self.payloads[0])
        self.assertEqual(target.stat().st_nlink, 1)
        self.assertFalse((v.WORKSPACE/'.local').exists())

    def test_merge_completed_pinned_batches_without_payload_rereads(self):
        from unittest import mock
        components = self.component_receipts()
        with mock.patch.object(v._ReadGuard, 'hash', side_effect=AssertionError('Payload reread during metadata merge')):
            result = v.merge_provider_receipts(self.index, self.pin, components, [{'sha256': h} for h in self.hashes])
        self.assertTrue(result['complete'] and result['fullReadback'])
        self.assertEqual(result['expectedUniqueObjects'], 2)
        self.assertFalse(result['payloadsRehashedDuringMerge'])
        self.assertEqual(len(result['componentReceipts']), 2)
        self.assertEqual(len(result['containers']), 2)

    def test_merge_refuses_missing_objects_and_changed_container_metadata(self):
        components = self.component_receipts()
        requests = [{'sha256': h} for h in self.hashes]
        with self.assertRaisesRegex(ValueError, 'missing'):
            v.merge_provider_receipts(self.index, self.pin, components[:1], requests)
        with self.zip.open('ab') as stream: stream.write(b'changed after verification')
        with self.assertRaisesRegex(ValueError, 'metadata changed'):
            v.merge_provider_receipts(self.index, self.pin, components, requests)

    def test_merge_refuses_rewritten_component_and_wrong_index_proof(self):
        components = self.component_receipts()
        path = Path(components[0]['path'])
        original = path.read_bytes(); data = json.loads(original)
        data['indexSha256'] = '0'*64
        path.write_bytes(json.dumps(data).encode())
        with self.assertRaisesRegex(ValueError, 'receipt SHA'):
            v.merge_provider_receipts(self.index, self.pin, components, [{'sha256': h} for h in self.hashes])
        components[0]['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
        with self.assertRaisesRegex(ValueError, 'same-index'):
            v.merge_provider_receipts(self.index, self.pin, components, [{'sha256': h} for h in self.hashes])


class SealObjectTests(unittest.TestCase):
    def setUp(self):
        self.temp = OwnedTestDirectory()
        self.addCleanup(self.temp.cleanup)
        v.WORKSPACE = self.temp.root
        self.root = v.WORKSPACE/'preserved'
        (self.root/'recovery-archives').mkdir(parents=True)
        self.data = [b'original native bytes '*700, b'previous good helper bytes '*650]
        self.rows = []
        self.sources = []
        guards = v._PathGuards()
        try:
            for payload in self.data:
                checksum = hashlib.sha256(payload).hexdigest()
                source = self.root/'immutable-assets/blobs'/checksum[:2]/checksum
                source.parent.mkdir(parents=True, exist_ok=True)
                source.write_bytes(payload)
                reader = v._ReadGuard(source, guards)
                try:
                    self.rows.append({'relative': source.relative_to(v.WORKSPACE).as_posix(),
                        'sha256': checksum, **reader.identity, 'links': 1})
                finally: reader.close()
                self.sources.append(source)
        finally: guards.close()
        self.manifest = v.WORKSPACE/'source-plan.json'
        self.manifest.write_text(json.dumps({'schemaVersion': 1, 'kind': 'spark-preserved-object-source-plan',
            'workspace': str(v.WORKSPACE), 'sourceDeletionPerformed': False, 'files': self.rows}))
        self.pin = hashlib.sha256(self.manifest.read_bytes()).hexdigest()
        self.policy = {'preservedNewBytes': 1024**2, 'preservedVolumeInputBytes': 20000,
                       'preservedMinimumFreeBytes': 0, 'preservedMaxBytes': 64*1024**3}

    def test_copy_only_seals_bounded_volumes_and_restores_exact_objects(self):
        output = self.root/'recovery-archives/sealed'
        result = v.seal_objects(self.manifest, self.pin, output, policy=self.policy)
        self.assertTrue(result['complete'] and result['fullReadback'])
        self.assertFalse(result['sourceDeletionPerformed'])
        self.assertEqual(len(result['volumes']), 2)
        self.assertLess(result['newCompressedBytes'], self.policy['preservedNewBytes'])
        self.assertFalse((self.root/'recovery-archives/.seal-objects.lock').exists())
        for row in self.rows:
            descriptor = result['objects'][row['sha256']]
            with zipfile.ZipFile(self.root/descriptor['path']) as archive:
                self.assertEqual(hashlib.sha256(archive.read(descriptor['member'])).hexdigest(), row['sha256'])
        self.assertEqual([p.read_bytes() for p in self.sources], self.data)
        self.assertFalse((v.WORKSPACE/'.local').exists())

    def test_existing_verified_provider_reused_without_new_payload_copy(self):
        first = v.seal_objects(self.manifest, self.pin, self.root/'recovery-archives/first', policy=self.policy)
        index = v.WORKSPACE/'existing.json'
        index.write_text(json.dumps({'schemaVersion': 1, 'kind': 'spark-preservation-index',
            'root': str(self.root), 'objects': first['objects'], 'files': {}, 'legacyVaults': {}}))
        pin = hashlib.sha256(index.read_bytes()).hexdigest()
        second = v.seal_objects(self.manifest, self.pin, self.root/'recovery-archives/second',
            index=index, index_sha256=pin, policy=self.policy)
        self.assertEqual(second['newCompressedBytes'], 0)
        self.assertEqual(len(second['volumes']), 0)
        self.assertEqual(len(second['references']), 2)
        self.assertTrue(all(r['verification']['fullReadback'] for r in second['references']))

    def test_changed_source_retained_and_unresolved_lock_blocks_growth(self):
        self.sources[0].write_bytes(b'new authored data')
        output = self.root/'recovery-archives/changed'
        with self.assertRaisesRegex(ValueError, 'Source changed'):
            v.seal_objects(self.manifest, self.pin, output, policy=self.policy)
        self.assertEqual(self.sources[0].read_bytes(), b'new authored data')
        self.assertFalse((output/'seal-receipt.json').exists())
        lock = self.root/'recovery-archives/.seal-objects.lock'
        self.assertEqual(json.loads(lock.read_text())['status'], 'failed')
        with self.assertRaisesRegex(ValueError, 'active or unresolved'):
            v.seal_objects(self.manifest, self.pin, self.root/'recovery-archives/another', policy=self.policy)
        self.assertFalse((self.root/'recovery-archives/another').exists())

    def test_budget_refusal_preserves_sources_and_never_adopts_partial(self):
        output = self.root/'recovery-archives/budget'
        with self.assertRaisesRegex(ValueError, 'budget exceeded'):
            v.seal_objects(self.manifest, self.pin, output, max_new_compressed_bytes=65536, policy=self.policy)
        self.assertEqual([p.read_bytes() for p in self.sources], self.data)
        self.assertFalse((output/'seal-receipt.json').exists())
        self.assertEqual(len(list(output.glob('objects-*.zip'))), 0)

    def test_interruption_retains_originals_and_explicit_failure_ownership(self):
        from unittest import mock
        output = self.root/'recovery-archives/interrupted'
        with mock.patch.object(v, '_rename_new', side_effect=KeyboardInterrupt), self.assertRaises(KeyboardInterrupt):
            v.seal_objects(self.manifest, self.pin, output, policy=self.policy)
        self.assertEqual([p.read_bytes() for p in self.sources], self.data)
        self.assertFalse((output/'seal-receipt.json').exists())
        self.assertEqual(len(list(output.glob('objects-*.zip'))), 0)
        self.assertEqual(json.loads((self.root/'recovery-archives/.seal-objects.lock').read_text())['status'], 'failed')

    def test_manifest_pin_and_source_ownership_checked_before_copy(self):
        output = self.root/'recovery-archives/pin'
        with self.assertRaisesRegex(ValueError, 'SHA differs'):
            v.seal_objects(self.manifest, '0'*64, output, policy=self.policy)
        self.assertFalse(output.exists())
        self.assertFalse((self.root/'recovery-archives/.seal-objects.lock').exists())


if __name__=='__main__':unittest.main()
