"""Destructive-maintenance contracts use new temporary workspaces only."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
import unittest

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


if __name__=='__main__':unittest.main()
