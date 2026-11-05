"""Private, deduplicated cold-QA archive. Never used for public release payloads.
Each archived copy restores as independent regular files, never as hardlinks.
Archive SHA and every unique member SHA are verified before any deletion. Every
source is hashed again immediately before deleting it. Changed files stay expanded.
"""
import argparse, atexit, contextlib, hashlib, io, json, os, pathlib, re, stat, subprocess, sys, time, zipfile

# Promoted from the verified C49 private helper; archive schema 1 is unchanged.
# C62 adds a non-destructive prepare checkpoint and independent restore gate.
WORKSPACE = pathlib.Path.cwd().resolve()
HASHER = None

def native(path):
    text = str(pathlib.Path(path).absolute())
    return '\\\\?\\' + text if os.name == 'nt' and not text.startswith('\\\\?\\') else text


def resolved(path):
    # Resolve the actual long Windows path, not a MAX_PATH-truncated parent.
    # Keep comparisons in the same ordinary drive-path spelling as WORKSPACE.
    value = pathlib.Path(native(path)).resolve()
    return pathlib.Path(str(value).removeprefix('\\\\?\\')) if os.name == 'nt' else value

def digest_file(path):
    return digest_files([path])[0]

def digest_files(paths):
    global HASHER
    if HASHER is None:
        worker=pathlib.Path(__file__).with_name('vault-hash-server.cjs')
        HASHER=subprocess.Popen(['node',str(worker)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        atexit.register(lambda: HASHER.terminate())
        HASHER.stdin.write(json.dumps(native(worker))+'\n');HASHER.stdin.flush()
        test=json.loads(HASHER.stdout.readline())
        if test.get('sha256')!=hashlib.sha256(worker.read_bytes()).hexdigest(): raise ValueError('Independent hash-provider parity failed')
    HASHER.stdin.write(json.dumps([native(path) for path in paths])+'\n');HASHER.stdin.flush()
    result=json.loads(HASHER.stdout.readline())
    if result.get('error') or len(result.get('hashes',[]))!=len(paths) or any(len(h)!=64 for h in result.get('hashes',[])):
        raise ValueError('Hash read failed: '+str(result))
    return result['hashes']

def batches(items,size):
    group=[];amount=0
    for item in items:
        if group and (len(group)>=128 or amount+size(item)>256*1024**2):yield group;group=[];amount=0
        group.append(item);amount+=size(item)
    if group:yield group

def private_parts(relative):
    if '\\' in relative or ':' in relative or any(ord(c)<32 for c in relative):
        raise ValueError('Only canonical private relative paths are eligible')
    parts = pathlib.PurePosixPath(relative).parts
    if len(parts) < 2 or parts[0] != '.local' or any(p in {'.', '..', '.git', '.toolchain', '.research'} for p in parts):
        raise ValueError('Only an explicitly selected private QA path is eligible')
    return parts


def checked(relative):
    parts = private_parts(relative)
    path = WORKSPACE.joinpath(*parts)
    actual = resolved(path)
    if actual!=path.absolute() or not actual.is_relative_to(resolved(WORKSPACE) / '.local'):
        raise ValueError('Resolved target leaves the private workspace')
    return path


def private_qa_root(path):
    # Nested worktrees may own private QA below their own .local, but their
    # source, Git directory and public build inputs never become archive roots.
    for parent in [path,*path.parents]:
        if not parent.is_relative_to(WORKSPACE):
            break
        if os.path.exists(native(parent/'.git')):
            parts = path.relative_to(parent).parts
            if not parts or parts[0] != '.local':
                raise ValueError('Source worktree is not a private QA root')
    return path

def walk(path):
    stack = [path]
    while stack:
        at = stack.pop()
        with os.scandir(native(at)) as entries:
            for entry in entries:
                if entry.is_symlink() or entry.is_junction() or getattr(entry.stat(follow_symlinks=False), 'st_file_attributes', 0) & 0x400 or entry.name == '.git':
                    raise ValueError('Link or source worktree encountered: ' + entry.path)
                child = at / entry.name
                if entry.is_dir(follow_symlinks=False): stack.append(child)
                elif entry.is_file(follow_symlinks=False): yield child, entry.stat(follow_symlinks=False)
                else: raise ValueError('Non-regular source encountered')

def prepare(plan_file, vault, seed=None, merge_seed_catalog=False):
    roots = json.loads(pathlib.Path(plan_file).read_text(encoding='utf-8'))
    paths = [(name, private_qa_root(checked(name))) for name in roots]
    if len(set(roots)) != len(roots) or any(a != b and a.is_relative_to(b) for _, a in paths for _, b in paths):
        raise ValueError('Overlapping or duplicate archive roots')
    vault = pathlib.Path(vault).resolve()
    if not vault.is_relative_to(WORKSPACE.resolve() / '.local') or any(vault.is_relative_to(p.resolve()) for _, p in paths):
        raise ValueError('Archive storage must remain outside source trees inside .local')
    vault.mkdir(parents=True, exist_ok=False)
    records, blobs, volumes, raw_bytes = [], {}, [], 0
    inherited = None
    if merge_seed_catalog:
        if not seed:
            raise ValueError('Merging prior file records requires a verified seed archive')
        _, inherited, inherited_sha = verified_catalog(seed)
    if seed:
        import shutil
        for file in sorted(pathlib.Path(seed).glob('*.zip')):
            try:
                with zipfile.ZipFile(file) as candidate:
                    members=candidate.infolist()
                    for info in members:
                        if len(info.filename)!=64 or any(c not in '0123456789abcdef' for c in info.filename):
                            raise ValueError('Unexpected seed payload')
                        h=hashlib.sha256()
                        with candidate.open(info) as stream:
                            for block in iter(lambda:stream.read(2**20),b''):h.update(block)
                        if h.hexdigest()!=info.filename:raise ValueError('Seed payload differs')
                name=f'seed-{len(volumes):03}.zip'
                shutil.copyfile(file,vault/name)
                if digest_file(file)!=digest_file(vault/name):raise ValueError('Seed copy differs')
                volumes.append(name)
                for info in members:blobs[info.filename]=name
            except zipfile.BadZipFile:
                print(json.dumps({'incompleteStagingZipRetained':str(file)}),flush=True)
    current = None
    try:
        for relative, root in paths:
            for group in batches(walk(root),lambda row:row[1].st_size):
                checksums=digest_files([file for file,meta in group])
                for (file, meta),checksum in zip(group,checksums):
                    if checksum not in blobs:
                        if current is None or current.fp.tell() > 1024**3:
                            if current: current.close()
                            volume = f'payload-{len(volumes):03}.zip'
                            volumes.append(volume)
                            current = zipfile.ZipFile(vault / volume, 'x', zipfile.ZIP_DEFLATED, compresslevel=3, allowZip64=True)
                        h = hashlib.sha256()
                        with open(native(file), 'rb') as source, current.open(checksum, 'w', force_zip64=True) as destination:
                            for block in iter(lambda: source.read(2**20), b''):
                                h.update(block); destination.write(block)
                        if h.hexdigest() != checksum: raise ValueError('Source changed while archiving')
                        blobs[checksum] = volume
                    records.append([file.relative_to(WORKSPACE).as_posix(), meta.st_size, checksum, meta.st_mtime_ns, meta.st_mode])
                    raw_bytes += meta.st_size
                    if len(records) % 10000 == 0:
                        print(json.dumps({'stage':'archive','files':len(records),'GiB':round(raw_bytes/2**30,2),'unique':len(blobs)}),flush=True)
    finally:
        if current: current.close()
    inherited_files, inherited_bytes = 0, 0
    if inherited is not None:
        current_names = {row[0] for row in records}
        for row in inherited['files']:
            relative,size,checksum,*_ = row
            if relative in current_names or not any(relative.startswith(root+'/') for root in roots):
                continue
            # The old payload has already been fully verified/copied above. A
            # larger cold snapshot can now restore missing earlier children in
            # one operation without counting them as newly reclaimed bytes.
            if os.path.lexists(native(checked(relative))):
                raise ValueError('Uninventoried current work appeared: '+relative)
            if checksum not in blobs:
                raise ValueError('Inherited payload is absent from copied seed volumes')
            records.append(row);current_names.add(relative)
            raw_bytes += size;inherited_files += 1;inherited_bytes += size
    manifest = {'schemaVersion':1,'purpose':'Private cold QA, not distributable Halo content',
                'roots':roots,'files':records,'blobs':blobs,'volumes':[], 'rawBytes':raw_bytes,
                'contentVerified':False,'rawFoldersRemoved':False}
    if inherited is not None:
        manifest['inheritedVerifiedSnapshot'] = {'catalogSha256':inherited_sha,
            'filesAlreadyAbsent':inherited_files,'bytesAlreadyAbsent':inherited_bytes,
            'allRequiredPayloadsCopiedHere':True,'requiresOtherVaultForRestore':False}
    for volume in volumes:
        with zipfile.ZipFile(vault / volume) as packed:
            for info in packed.infolist():
                h = hashlib.sha256()
                with packed.open(info) as stream:
                    for block in iter(lambda:stream.read(2**20),b''): h.update(block)
                if h.hexdigest() != info.filename: raise ValueError('Archived blob hash differs')
        manifest['volumes'].append({'file':volume,'bytes':(vault/volume).stat().st_size,'sha256':digest_file(vault/volume)})
    manifest['contentVerified'] = True
    text = json.dumps(manifest,separators=(',',':')).encode()
    (vault/'catalog.json').write_bytes(text)
    (vault/'catalog.sha256').write_text(hashlib.sha256(text).hexdigest()+'  catalog.json\n')
    # Full restoration probe for an actual maximum-size native/runtime file.
    largest = max(records,key=lambda r:r[1])
    with zipfile.ZipFile(vault/blobs[largest[2]]) as packed, packed.open(largest[2]) as source:
        probe=vault/'restore-probe.bin'
        with probe.open('xb') as destination:
            for block in iter(lambda:source.read(2**20),b''): destination.write(block)
    if digest_file(probe)!=largest[2]: raise ValueError('Independent restoration probe failed')
    probe.unlink()
    print(json.dumps({'stage':'verified','files':len(records),'uniqueBlobs':len(blobs),'rawGiB':raw_bytes/2**30,
                      'archiveGiB':sum(v['bytes'] for v in manifest['volumes'])/2**30}),flush=True)
    result={'prepared':True,'catalogSha256':hashlib.sha256(text).hexdigest(),
            'rawBytes':raw_bytes,'archiveBytes':sum(v['bytes'] for v in manifest['volumes']),
            'files':len(records),'uniqueBlobs':len(blobs),'expandedCopiesRemoved':False,
            'bytesAlreadyAbsentBeforePreparation':inherited_bytes}
    (vault/'prepared-receipt.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result),flush=True)


def restore(vault, only):
    vault=pathlib.Path(vault).resolve()
    if not any((vault/name).is_file() for name in ['prepared-receipt.json','cleanup-receipt.json']): raise ValueError('A verified preparation or completed cleanup receipt is required')
    data=(vault/'catalog.json').read_bytes()
    if hashlib.sha256(data).hexdigest()!=(vault/'catalog.sha256').read_text(encoding='utf-8').split()[0]: raise ValueError('Catalog differs')
    catalog=json.loads(data)
    if not catalog['contentVerified'] or (only and not any(only==r or only.startswith(r+'/') for r in catalog['roots'])):
        raise ValueError('Unverified catalog or unknown root')
    if only and not any(p==only or p.startswith(only+'/') for p,*_ in catalog['files']):
        raise ValueError('Requested source is absent from the archive')
    for root in catalog['roots']:
        private_qa_root(checked(root))
    for volume in catalog['volumes']:
        if digest_file(vault/volume['file'])!=volume['sha256']: raise ValueError('Archive volume differs')
    opened={}
    try:
        for relative,size,checksum,mtime,mode in catalog['files']:
            if only and relative!=only and not relative.startswith(only+'/'): continue
            destination=checked(relative)
            if os.path.exists(native(destination)):
                if digest_file(destination)!=checksum: raise ValueError('Refusing to replace changed work: '+relative)
                continue
            os.makedirs(native(destination.parent),exist_ok=True)
            volume=catalog['blobs'][checksum]
            if volume not in opened: opened[volume]=zipfile.ZipFile(vault/volume)
            with opened[volume].open(checksum) as source, open(native(destination),'xb') as target:
                for block in iter(lambda:source.read(2**20),b''): target.write(block)
            if digest_file(destination)!=checksum: raise ValueError('Restored bytes differ')
            os.utime(native(destination),ns=(mtime,mtime));os.chmod(native(destination),mode)
    finally:
        for archive in opened.values(): archive.close()
    print('Restored independent verified files; no hardlinks or overwrites.')


def verified_catalog(vault):
    vault = pathlib.Path(vault).resolve()
    data = (vault/'catalog.json').read_bytes()
    checksum = hashlib.sha256(data).hexdigest()
    if checksum != (vault/'catalog.sha256').read_text(encoding='utf-8').split()[0]:
        raise ValueError('Catalog changed')
    catalog = json.loads(data)
    if not catalog['contentVerified']:
        raise ValueError('Unverified archive')
    for root in catalog['roots']:
        private_qa_root(checked(root))
    volume_names = {volume['file'] for volume in catalog['volumes']}
    if any(name not in volume_names for name in catalog['blobs'].values()):
        raise ValueError('Payload volume is absent from the verified inventory')
    for relative, size, digest, *_ in catalog['files']:
        # These are catalog strings, not file operations. All selected roots
        # resolve above; restore/finish still resolve each actual destination or
        # present source before any read/write/unlink. Avoid hundreds of
        # thousands of redundant filesystem resolutions merely to inspect SHA-
        # bound metadata, including children already absent in prior snapshots.
        private_parts(relative)
        if not any(relative.startswith(root+'/') for root in catalog['roots']):
            raise ValueError('Catalog file outside selected roots')
        if size < 0 or len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
            raise ValueError('Invalid content identity')
        if digest not in catalog['blobs']:
            raise ValueError('Catalog content is absent from verified payloads')
    for volume in catalog['volumes']:
        if pathlib.PurePath(volume['file']).name != volume['file'] or '/' in volume['file'] or '\\' in volume['file']:
            raise ValueError('Invalid volume name')
        if digest_file(vault/volume['file']) != volume['sha256']:
            raise ValueError('Verified archive volume changed')
    return vault, catalog, checksum


def prove_restore(vault, destination, samples):
    """Restore real selected files through the existing recovery path before pruning."""
    vault, catalog, checksum = verified_catalog(vault)
    destination = pathlib.Path(destination).absolute()
    if resolved(destination) != destination or not destination.is_relative_to(WORKSPACE/'.local'):
        raise ValueError('Recovery proof must be a new independent private workspace')
    if any(destination.is_relative_to(checked(root)) or checked(root).is_relative_to(destination) for root in catalog['roots']):
        raise ValueError('Recovery proof overlaps source data')
    destination.mkdir(exist_ok=False)
    rows = {row[0]: row for row in catalog['files']}
    if not samples or len(set(samples)) != len(samples) or any(p not in rows for p in samples):
        raise ValueError('Select distinct exact archived sample paths')
    report = []
    original = WORKSPACE
    try:
        # Rebind only this isolated recovery destination; the catalog stays unchanged.
        globals()['WORKSPACE'] = destination
        for relative in samples:
            restore(vault, relative)
            target = checked(relative)
            meta = os.stat(native(target), follow_symlinks=False)
            row = rows[relative]
            if meta.st_nlink != 1 or meta.st_size != row[1] or digest_file(target) != row[2]:
                raise ValueError('Independent file restoration failed')
            report.append({'file':relative,'bytes':row[1],'sha256':row[2],
                           'restoredPath':str(target),'independentRegularFile':True})
    finally:
        globals()['WORKSPACE'] = original
    receipt = {'complete':True,'catalogSha256':checksum,'samples':report,
               'sourceCopiesRemoved':False,'existingWorkOverwritten':False}
    (vault/'restore-proof.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
    return receipt


def finish(vault, confirm_inactive=False):
    """C49 resume semantics: changed or newer work stays expanded, even if byte-equal."""
    if not confirm_inactive:
        raise ValueError('Check owning processes, then pass --confirm-inactive')
    vault, catalog, checksum = verified_catalog(vault)
    if not vault.is_relative_to(WORKSPACE/'.local') or any(vault.is_relative_to(checked(r)) for r in catalog['roots']):
        raise ValueError('Archive storage must remain outside selected sources')
    if (vault/'cleanup-receipt.json').exists():
        raise ValueError('Cleanup already completed')
    proof = json.loads((vault/'restore-proof.json').read_text(encoding='utf-8'))
    if not proof.get('complete') or proof.get('catalogSha256') != checksum or not proof.get('samples'):
        raise ValueError('Independent recovery proof is missing or stale')
    rows = {row[0]:row for row in catalog['files']}
    for sample in proof['samples']:
        row = rows.get(sample['file'])
        path = pathlib.Path(sample['restoredPath'])
        if not row or sample['sha256'] != row[2] or resolved(path) != path.absolute():
            raise ValueError('Invalid restored sample identity')
        meta = os.stat(native(path),follow_symlinks=False)
        if not stat.S_ISREG(meta.st_mode) or meta.st_nlink != 1 or meta.st_size != row[1] or digest_file(path) != row[2]:
            raise ValueError('Restored sample no longer matches')
    present, absent = [], 0
    for row in catalog['files']:
        path = WORKSPACE.joinpath(*private_parts(row[0]))
        try:
            meta = os.stat(native(path),follow_symlinks=False)
        except FileNotFoundError:
            absent += row[1]
            continue
        # A missing record cannot be removed. Present records must still pass
        # the full resolved-path/reparse check before entering the removal set.
        path = checked(row[0])
        if not stat.S_ISREG(meta.st_mode):
            raise ValueError('Non-regular source appeared')
        present.append(row)
    retained, removed, count = [], 0, 0
    for group in batches(present,lambda row:row[1]):
        hashes = digest_files([checked(row[0]) for row in group])
        for (relative,size,digest,mtime,mode),actual in zip(group,hashes):
            path = checked(relative)
            meta = os.stat(native(path),follow_symlinks=False)
            if not stat.S_ISREG(meta.st_mode) or meta.st_size != size or meta.st_mtime_ns != mtime or actual != digest:
                retained.append({'file':relative,'archivedSha256':digest,'currentSha256':actual,
                                 'currentBytes':meta.st_size,'contentChanged':actual!=digest})
                continue
            # Repeat path/metadata checks after hashing; never recursively delete a source.
            os.chmod(native(path),stat.S_IWRITE|stat.S_IREAD)
            os.unlink(native(path))
            removed += size
            count += 1
            if count % 10000 == 0:
                print(json.dumps({'stage':'remove-verified-copies','files':count,'removedGiB':removed/2**30}),flush=True)
    for relative in catalog['roots']:
        root = checked(relative)
        if os.path.isdir(native(root)):
            for directory,_,_ in os.walk(native(root),topdown=False,followlinks=False):
                path = pathlib.Path(directory.removeprefix('\\\\?\\'))
                if resolved(path) != path.absolute():
                    raise ValueError('Directory reparse point appeared')
                if not os.listdir(directory):
                    os.rmdir(directory)
        note = root.with_name(root.name+'.ARCHIVED.json')
        note.write_text(json.dumps({'oldSnapshotArchived':True,'originalRoot':relative,
                                   'newerFilesRetained':any(r['file'].startswith(relative+'/') for r in retained),
                                   'vault':vault.relative_to(WORKSPACE).as_posix(),
                                   'restore':'Use qa-vault.py restore; changed existing files are never overwritten.'},indent=2),encoding='utf-8')
    result = {'complete':True,'catalogSha256':checksum,'sourceSnapshotBytes':catalog['rawBytes'],
              'originalCopiesAbsentBeforeResumeBytes':absent,'newlyRemovedBytes':removed,
              'archiveBytes':sum(v['bytes'] for v in catalog['volumes']),
              'netLogicalBytesReclaimed':removed-sum(v['bytes'] for v in catalog['volumes']),
              'filesPreservedInArchive':len(catalog['files']),'filesRemoved':count,
              'retainedNewerFiles':retained,'archiveUnchanged':True,'hardlinksCreated':False}
    (vault/'cleanup-receipt.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    return result


def retention_plan(records, policy, now=None):
    """Read-only suggestions from explicit owner manifests, never a deletion plan."""
    import datetime
    now = now or datetime.datetime.now(datetime.timezone.utc)
    result = {'automaticDeletion':False,'archiveReview':[],'keep':[],'warnings':[]}
    total = sum(row.get('logicalBytes',0) for row in records)
    if total > policy['warnProjectLogicalBytes']:
        result['warnings'].append('Reviewed QA storage exceeds the configured project budget')
    groups = {}
    for row in records:
        supplied = pathlib.Path(row['root'])
        relative = supplied.relative_to(WORKSPACE).as_posix() if supplied.is_absolute() else row['root']
        checked(relative)
        row = {**row,'root':relative}
        status = row.get('status','unknown')
        if row.get('active',True) or row.get('protected',False) or status not in ['passed','failed'] or not row.get('sourceCommit') or not row.get('workflow'):
            result['keep'].append({'root':row['root'],'reason':'Active, protected, unknown or incomplete evidence'})
            continue
        groups.setdefault((row.get('workflow','unknown'),status),[]).append(row)
        if row.get('logicalBytes',0) > policy['warnRunLogicalBytes']:
            result['warnings'].append('Large run: '+row['root'])
    for (_,status),rows in groups.items():
        rows.sort(key=lambda r:r.get('finishedAt',''),reverse=True)
        count = policy['failedRunsPerWorkflow' if status=='failed' else 'successfulRunsPerWorkflow']
        days = policy['archiveFailedAfterDays' if status=='failed' else 'archiveSuccessfulAfterDays']
        for index,row in enumerate(rows):
            try:
                ended = datetime.datetime.fromisoformat(row['finishedAt'].replace('Z','+00:00'))
                old = (now-ended).total_seconds() >= days*86400
            except (KeyError,TypeError,ValueError):
                old = False
            if index>=count and old:
                result['archiveReview'].append({'root':row['root'],'reason':'Outside configured retention; ownership, inactivity, archive and restore verification still required'})
            else:
                result['keep'].append({'root':row['root'],'reason':'Within outcome-specific retention or missing reliable timestamp'})
    return result


# These provider operations extend the same private archive format. They never
# remove data, restore into .local, or turn immutable payloads into writable links.
_MAX_OBJECT = 8 * 1024**3
_MAX_RECOVERY = 16 * 1024**3
_MAX_REQUESTS = 150000


def _sha(value):
    if not isinstance(value, str) or not re.fullmatch('[0-9a-f]{64}', value):
        raise ValueError('Expected a lowercase SHA-256 identity')
    return value


def _size(value, maximum=_MAX_OBJECT):
    if type(value) is not int or not 0 <= value <= maximum:
        raise ValueError('Invalid or excessive byte count')
    return value


def _relative(value):
    if (not isinstance(value, str) or not value or '\\' in value or ':' in value
            or any(ord(c) < 32 for c in value)):
        raise ValueError('Expected a safe preserved-relative path')
    parts = value.split('/')
    if any(not p or p in {'.', '..'} or p.endswith(('.', ' '))
           or re.match(r'^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)', p, re.I)
           for p in parts):
        raise ValueError('Unsafe preserved-relative path')
    return parts


def _identity(meta):
    return {'dev': str(meta.st_dev & 0xffffffff if os.name == 'nt' else meta.st_dev),
            'ino': str(meta.st_ino & 0xffffffffffffffff if os.name == 'nt' else meta.st_ino), 'bytes': meta.st_size,
            'mtimeNs': str(meta.st_mtime_ns), 'ctimeNs': str(meta.st_ctime_ns)}


def _opened_identity(stream):
    if os.name != 'nt':
        return _identity(os.fstat(stream.fileno()))
    # Python 3.13's stat and fstat disagree about legacy st_ctime on Windows.
    # Read actual NTFS change time and the same 32-bit volume/file IDs as Node.
    import ctypes, msvcrt
    class Info(ctypes.Structure):
        _fields_ = [(name, ctypes.c_uint32) for name in
                    ['attributes', 'creationLow', 'creationHigh', 'accessLow', 'accessHigh',
                     'writeLow', 'writeHigh', 'volume', 'sizeHigh', 'sizeLow', 'links', 'indexHigh', 'indexLow']]
    class Basic(ctypes.Structure):
        _fields_ = [('creation', ctypes.c_int64), ('access', ctypes.c_int64),
                    ('write', ctypes.c_int64), ('change', ctypes.c_int64), ('attributes', ctypes.c_uint32)]
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    handle = ctypes.c_void_p(msvcrt.get_osfhandle(stream.fileno()))
    info, basic = Info(), Basic()
    if not kernel.GetFileInformationByHandle(handle, ctypes.byref(info)):
        raise ctypes.WinError(ctypes.get_last_error())
    if not kernel.GetFileInformationByHandleEx(handle, 0, ctypes.byref(basic), ctypes.sizeof(basic)):
        raise ctypes.WinError(ctypes.get_last_error())
    if info.attributes & 0x410:
        raise ValueError('Opened provider is a directory or reparse object')
    unix_ns = lambda ticks: str((ticks-116444736000000000)*100)
    return {'dev': str(info.volume), 'ino': str((info.indexHigh << 32) | info.indexLow),
            'bytes': (info.sizeHigh << 32) | info.sizeLow,
            'mtimeNs': unix_ns((info.writeHigh << 32) | info.writeLow), 'ctimeNs': unix_ns(basic.change)}


def _ordinary(meta, directory=False):
    if getattr(meta, 'st_file_attributes', 0) & 0x400:
        raise ValueError('Reparse objects are not recovery providers or destinations')
    if not (stat.S_ISDIR(meta.st_mode) if directory else stat.S_ISREG(meta.st_mode)):
        raise ValueError('Expected an ordinary directory' if directory else 'Expected an ordinary file')


class _PathGuards:
    """Windows directory handles deny rename/delete while readers use paths."""
    def __init__(self):
        self.directories = {}

    def directory(self, supplied, create=False):
        path = pathlib.Path(supplied).absolute()
        for at in reversed([path, *path.parents]):
            if at in self.directories:
                continue
            if len(self.directories) >= 4096:
                raise ValueError('Recovery directory-handle bound exceeded')
            try:
                meta = os.stat(native(at), follow_symlinks=False)
            except FileNotFoundError:
                if not create:
                    raise
                os.mkdir(native(at))
                meta = os.stat(native(at), follow_symlinks=False)
            _ordinary(meta, True)
            if resolved(at) != at:
                raise ValueError('Aliased recovery path refused')
            if os.name == 'nt':
                import ctypes
                kernel = ctypes.WinDLL('kernel32', use_last_error=True)
                kernel.CreateFileW.argtypes = [ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32,
                                               ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p]
                kernel.CreateFileW.restype = ctypes.c_void_p
                handle = kernel.CreateFileW(native(at), 0x80000000, 3, None, 3, 0x02200000, None)
                if handle == ctypes.c_void_p(-1).value:
                    raise ctypes.WinError(ctypes.get_last_error())
                after = os.stat(native(at), follow_symlinks=False)
                if (after.st_dev, after.st_ino) != (meta.st_dev, meta.st_ino):
                    kernel.CloseHandle(ctypes.c_void_p(handle))
                    raise ValueError('Directory replaced while acquiring recovery guard')
                try:
                    _ordinary(after, True)
                except Exception:
                    kernel.CloseHandle(ctypes.c_void_p(handle))
                    raise
                self.directories[at] = ('windows', handle)
            else:
                fd = os.open(at, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_DIRECTORY', 0))
                if (os.fstat(fd).st_dev, os.fstat(fd).st_ino) != (meta.st_dev, meta.st_ino):
                    os.close(fd)
                    raise ValueError('Directory replaced while acquiring recovery guard')
                self.directories[at] = ('posix', fd)
        return path

    def close(self):
        for kind, handle in reversed(list(self.directories.values())):
            if kind == 'windows':
                import ctypes
                ctypes.WinDLL('kernel32', use_last_error=True).CloseHandle(ctypes.c_void_p(handle))
            else:
                os.close(handle)
        self.directories.clear()


class _ReadGuard:
    def __init__(self, path, directories):
        self.path = pathlib.Path(path).absolute()
        directories.directory(self.path.parent)
        before = os.stat(native(self.path), follow_symlinks=False)
        _ordinary(before)
        if os.name == 'nt':
            import ctypes, msvcrt
            kernel = ctypes.WinDLL('kernel32', use_last_error=True)
            kernel.CreateFileW.argtypes = [ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32,
                                           ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p]
            kernel.CreateFileW.restype = ctypes.c_void_p
            handle = kernel.CreateFileW(native(self.path), 0x80000000, 1, None, 3, 0x00200000, None)
            if handle == ctypes.c_void_p(-1).value:
                raise ctypes.WinError(ctypes.get_last_error())
            try:
                fd = msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY)
            except Exception:
                kernel.CloseHandle(ctypes.c_void_p(handle))
                raise
        else:
            fd = os.open(self.path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
        self.stream = os.fdopen(fd, 'rb')
        self.identity = _opened_identity(self.stream)
        if any(self.identity[k] != _identity(before)[k] for k in ['dev', 'ino', 'bytes', 'mtimeNs']):
            self.close()
            raise ValueError('Provider replaced while opening it')
        try:
            self.check()
        except Exception:
            self.close()
            raise

    def check(self):
        current = os.stat(native(self.path), follow_symlinks=False)
        _ordinary(current)
        if (self.identity != _opened_identity(self.stream)
                or any(self.identity[k] != _identity(current)[k] for k in ['dev', 'ino', 'bytes', 'mtimeNs'])):
            raise ValueError('Recovery provider changed while being read')

    def hash(self):
        self.stream.seek(0)
        checksum = hashlib.sha256()
        for block in iter(lambda: self.stream.read(2**20), b''):
            checksum.update(block)
        self.check()
        self.stream.seek(0)
        return checksum.hexdigest()

    def close(self):
        self.stream.close()


class ProviderIndex:
    """One pinned index and bounded protected readers, shared across a batch."""
    def __init__(self, index, expected_sha256):
        self.guards = _PathGuards()
        self.readers, self.zips = {}, {}
        self.index_path = pathlib.Path(index).absolute()
        self.index_sha256 = _sha(expected_sha256)
        try:
            guard = _ReadGuard(self.index_path, self.guards)
            try:
                if guard.identity['bytes'] > 128 * 1024**2:
                    raise ValueError('Provider-index size bound exceeded')
                data = guard.stream.read()
                guard.check()
                if hashlib.sha256(data).hexdigest() != self.index_sha256:
                    raise ValueError('Provider index differs from its explicit SHA pin')
                self.index = json.loads(data)
                self.index_guard = guard
            except Exception:
                guard.close()
                raise
            if self.index.get('schemaVersion') != 1 or self.index.get('kind') != 'spark-preservation-index':
                raise ValueError('Unknown preservation-index schema')
            self.root = pathlib.Path(self.index['root']).absolute()
            if self.root != pathlib.Path(self.index['root']) or self.root != WORKSPACE/'preserved':
                raise ValueError('Provider root must be the explicit canonical preserved directory')
            if 'workspace' in self.index and pathlib.Path(self.index['workspace']).absolute() != WORKSPACE:
                raise ValueError('Provider index belongs to another workspace')
            self.guards.directory(self.root)
            self.objects = self.index.get('objects', {})
            self.files = self.index.get('files', {})
            self.legacy_vaults = self.index.get('legacyVaults', {})
            if not all(isinstance(v, dict) for v in (self.objects, self.files, self.legacy_vaults)):
                raise ValueError('Provider tables must be keyed objects')
            if len(self.objects) > 250000 or len(self.files) > 250000 or len(self.legacy_vaults) > 4096:
                raise ValueError('Provider-index entry bound exceeded')
            for checksum, provider in self.objects.items():
                self._descriptor(provider, _sha(checksum), allow_range=True)
            for name, value in self.files.items():
                _relative(name)
                if value.get('kind') == 'range':
                    self._descriptor(value, _sha(value['sha256']), allow_range=True)
                else:
                    _sha(value['sha256']); _size(value['bytes'])
                    if value['sha256'] not in self.objects:
                        raise ValueError('File alias has no explicit object provider')
                    if value['bytes'] != self.objects[value['sha256']]['bytes']:
                        raise ValueError('File alias size differs from its object')
            for name, value in self.legacy_vaults.items():
                _relative(name); _relative(value['catalogPath']); _sha(value['catalogSha256'])
                if not isinstance(value.get('volumes'), list):
                    raise ValueError('Legacy vault must retain original volume metadata')
                for volume in value['volumes']:
                    if len(_relative(volume['file'])) != 1:
                        raise ValueError('Original volume must be a basename')
                    _sha(volume['sha256']); _size(volume['bytes'])
        except Exception:
            self.close()
            raise

    def _descriptor(self, provider, checksum, allow_range=False):
        if not isinstance(provider, dict):
            raise ValueError('Provider descriptor must be an object')
        _size(provider['bytes']); _relative(provider['path'])
        kind = provider.get('kind')
        if kind == 'zip-member':
            _relative(provider['member']); _sha(provider['containerSha256']); _size(provider['containerBytes'])
        elif kind == 'range' and allow_range:
            _sha(provider['containerSha256']); _size(provider['containerBytes'])
            _size(provider.get('offset', 0))
            if provider.get('offset', 0) + provider['bytes'] > provider['containerBytes']:
                raise ValueError('Range leaves its pinned container')
        elif kind != 'raw':
            raise ValueError('Unsupported immutable provider kind')
        return checksum

    def _file(self, relative, checksum, size):
        _relative(relative); _sha(checksum); _size(size)
        key = str(self.root.joinpath(*relative.split('/')))
        if key not in self.readers:
            if len(self.readers) >= 128:
                raise ValueError('Open-provider bound exceeded; use another bounded batch')
            reader = _ReadGuard(pathlib.Path(key), self.guards)
            try:
                if reader.identity['bytes'] != size or reader.hash() != checksum:
                    raise ValueError('Pinned provider/container hash or size differs')
            except Exception:
                reader.close(); raise
            self.readers[key] = (reader, checksum, relative)
        reader, actual, _ = self.readers[key]
        if actual != checksum or reader.identity['bytes'] != size:
            raise ValueError('Conflicting container identity')
        reader.check()
        return reader

    def resolve(self, request):
        if ('sha256' in request) == ('file' in request):
            raise ValueError('Choose one SHA object or original preserved file alias')
        if 'sha256' in request:
            checksum = _sha(request['sha256'])
            if checksum not in self.objects:
                raise ValueError('Object absent from the pinned provider index')
            return checksum, self.objects[checksum], {'table': 'objects', 'key': checksum}
        name = request['file']; _relative(name)
        value = self.files.get(name)
        if value is None:
            raise ValueError('File absent from the pinned provider index')
        checksum = value['sha256']
        if value.get('kind') == 'range':
            return checksum, value, {'table': 'files', 'key': name}
        return checksum, self.objects[checksum], {'table': 'objects', 'key': checksum}

    @contextlib.contextmanager
    def _payload(self, checksum, provider):
        kind = provider['kind']
        if kind == 'raw':
            reader = self._file(provider['path'], checksum, provider['bytes'])
            reader.stream.seek(0)
            yield reader.stream
            reader.check()
        elif kind == 'range':
            reader = self._file(provider['path'], provider['containerSha256'], provider['containerBytes'])
            reader.stream.seek(provider.get('offset', 0))
            yield reader.stream
            reader.check()
        else:
            reader = self._file(provider['path'], provider['containerSha256'], provider['containerBytes'])
            if provider['path'] not in self.zips:
                self.zips[provider['path']] = zipfile.ZipFile(reader.stream, 'r')
            archive = self.zips[provider['path']]
            matches = [info for info in archive.infolist() if info.filename == provider['member']]
            if len(matches) != 1:
                raise ValueError('Requested member absent or duplicated')
            info = matches[0]
            if (info.is_dir() or info.file_size != provider['bytes'] or info.flag_bits & 1
                    or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                    or stat.S_ISLNK(info.external_attr >> 16)):
                raise ValueError('Requested ZIP member is not the pinned regular payload')
            with archive.open(info, 'r') as source:
                yield source
            reader.check()

    def read(self, checksum, provider, destination=None):
        checksum = _sha(checksum); self._descriptor(provider, checksum, allow_range=True)
        target = None
        if destination is not None:
            destination = _recovery_destination(destination, self.root, self.guards)
            target = open(native(destination), 'x+b')
        try:
            h, count = hashlib.sha256(), 0
            with self._payload(checksum, provider) as source:
                remaining = provider['bytes']
                while remaining:
                    block = source.read(min(2**20, remaining))
                    if not block:
                        raise ValueError('Truncated recovery object')
                    remaining -= len(block); count += len(block); h.update(block)
                    if target:
                        target.write(block)
                # Reading the final ZIP EOF runs its independent CRC check.
                if provider['kind'] != 'range' and source.read(1):
                    raise ValueError('Recovery object has trailing bytes')
            if count != provider['bytes'] or h.hexdigest() != checksum:
                raise ValueError('Recovered object SHA or size differs')
            if target:
                target.flush(); os.fsync(target.fileno())
                meta = os.fstat(target.fileno())
                if not stat.S_ISREG(meta.st_mode) or meta.st_nlink != 1 or meta.st_size != count:
                    raise ValueError('Recovery did not create an independent regular file')
                target.seek(0)
                restored = hashlib.sha256()
                for block in iter(lambda: target.read(2**20), b''):
                    restored.update(block)
                if restored.hexdigest() != checksum:
                    raise ValueError('Independent restored-file readback differs')
            return {'sha256': checksum, 'sourceSha256': checksum, 'bytes': count,
                    'provider': dict(provider), 'indexSha256': self.index_sha256,
                    'fullReadback': True, 'crcVerified': provider['kind'] == 'zip-member',
                    **({'destination': str(destination), 'independentRegularFile': True,
                        'existingWorkOverwritten': False} if destination is not None else {})}
        finally:
            if target:
                target.close()

    def request(self, request, recover=False):
        checksum, provider, reference = self.resolve(request)
        if recover and 'destination' not in request:
            raise ValueError('Recovery requires an explicit new destination file')
        result = self.read(checksum, provider, request.get('destination') if recover else None)
        result.update({'id': request.get('id'), 'ok': True, 'providerRef': reference})
        return result

    def containers(self):
        return [{'path': relative, 'sha256': checksum, **reader.identity}
                for reader, checksum, relative in self.readers.values()]

    def close(self):
        for archive in getattr(self, 'zips', {}).values():
            archive.close()
        for reader, _, _ in getattr(self, 'readers', {}).values():
            reader.close()
        guard = getattr(self, 'index_guard', None)
        if guard:
            guard.close(); self.index_guard = None
        self.guards.close()

    def __enter__(self): return self
    def __exit__(self, *_): self.close()


def _recovery_destination(destination, preserved_root, guards):
    destination = pathlib.Path(destination).absolute()
    if any(part.lower() in {'.local', '.git', '.toolchain', 'node_modules'} for part in destination.parts):
        raise ValueError('Recovery cannot recreate retired or source-control/dependency trees')
    if destination.is_relative_to(preserved_root):
        raise ValueError('Recovery output must not modify protected preserved storage')
    if destination.is_relative_to(WORKSPACE) and not destination.is_relative_to(WORKSPACE/'artifacts'):
        raise ValueError('Use an explicit fresh artifacts destination, not canonical source')
    guards.directory(destination.parent, create=True)
    if os.path.lexists(native(destination)):
        raise ValueError('Recovery destination already exists; nothing is overwritten')
    return destination


def verify_provider_index(index, expected_sha256, requests=None):
    with ProviderIndex(index, expected_sha256) as provider:
        rows = []
        total = 0
        for number, request in enumerate(requests or []):
            if number >= _MAX_REQUESTS:
                raise ValueError('Request count bound exceeded')
            result = provider.request(request)
            total += result['bytes']
            if total > _MAX_RECOVERY:
                raise ValueError('Verification batch byte bound exceeded')
            rows.append(result)
        return {'schemaVersion': 1, 'kind': 'spark-provider-verification',
                'indexPath': str(provider.index_path), 'indexSha256': provider.index_sha256,
                'complete': True, 'fullReadback': requests is not None,
                'objects': rows, 'containers': provider.containers(),
                'sourceMutationPerformed': False}


def _legacy_rows(stream):
    """Read legacy tuple rows incrementally, retaining Python's exact integer timestamps."""
    text = io.TextIOWrapper(stream, encoding='utf-8')
    try:
        buffer = ''
        while True:
            chunk = text.read(65536)
            if not chunk:
                raise ValueError('Truncated legacy catalog header')
            buffer += chunk
            match = re.search(r'"files"\s*:\s*\[', buffer)
            if match:
                header = json.loads(buffer[:match.start()].rstrip().rstrip(',') + '}')
                buffer = buffer[match.end():]
                break
            if len(buffer) > 1024**2 or not buffer:
                raise ValueError('Unknown or excessive legacy catalog header')
        yield ('header', header)
        decoder = json.JSONDecoder()
        while True:
            buffer = buffer.lstrip(' \r\n\t,')
            if buffer.startswith(']'):
                return
            try:
                row, end = decoder.raw_decode(buffer)
            except json.JSONDecodeError:
                chunk = text.read(65536)
                if not chunk or len(buffer) > 1024**2:
                    raise ValueError('Truncated or excessive legacy catalog row')
                buffer += chunk
                continue
            yield ('file', row)
            buffer = buffer[end:]
    finally:
        text.detach()


def recover_vault(index, expected_sha256, vault_relative, destination, only):
    """Recover an explicitly selected original file/tree; no implicit whole SDK restore."""
    _relative(vault_relative); private_parts(only)
    with ProviderIndex(index, expected_sha256) as provider:
        entry = provider.legacy_vaults.get(vault_relative)
        if entry is None:
            raise ValueError('Legacy vault absent from the pinned index')
        catalog_path = provider.root.joinpath(*_relative(entry['catalogPath']))
        catalog = _ReadGuard(catalog_path, provider.guards)
        try:
            if catalog.identity['bytes'] > 512 * 1024**2 or catalog.hash() != entry['catalogSha256']:
                raise ValueError('Original legacy catalog differs')
            rows, total = [], 0
            for kind, row in _legacy_rows(catalog.stream):
                if kind == 'header':
                    if row.get('schemaVersion') != 1 or not any(only == r or only.startswith(r+'/') for r in row['roots']):
                        raise ValueError('Unknown legacy catalog or selection outside original roots')
                elif row[0] == only or row[0].startswith(only+'/'):
                    private_parts(row[0]); _size(row[1]); _sha(row[2])
                    total += row[1]
                    if len(rows) >= _MAX_REQUESTS or total > _MAX_RECOVERY:
                        raise ValueError('Selected historical recovery exceeds its bounded budget')
                    rows.append(row)
            if not rows:
                raise ValueError('Selected historical file/tree is absent')
            catalog.check()
            destination = pathlib.Path(destination).absolute()
            _recovery_destination(destination, provider.root, provider.guards)
            os.mkdir(native(destination)); provider.guards.directory(destination)
            result, names = [], set()
            for relative, size, checksum, *_ in rows:
                mapped = ['legacy-local' if p == '.local' else p for p in private_parts(relative)]
                name = '/'.join(mapped)
                if name.lower() in names:
                    raise ValueError('Duplicate recovery destination in original catalog')
                names.add(name)
                if checksum in provider.objects:
                    descriptor = provider.objects[checksum]
                    reference = {'table': 'objects', 'key': checksum}
                else:
                    # The original volume may be absent only when its exact
                    # whole-file SHA alias is explicitly pinned in this index.
                    original_volume = None
                    for volume in entry['volumes']:
                        candidate = vault_relative + '/' + volume['file']
                        physical = provider.root.joinpath(*candidate.split('/'))
                        if not os.path.lexists(native(physical)):
                            alias = provider.files.get(candidate)
                            if not alias or alias.get('sha256') != volume['sha256']:
                                continue
                            alias_provider = provider.objects.get(volume['sha256'])
                            if not alias_provider or alias_provider.get('kind') != 'raw':
                                continue
                            candidate = alias_provider['path']
                        reader = provider._file(candidate, volume['sha256'], volume['bytes'])
                        reader.stream.seek(0)
                        with zipfile.ZipFile(reader.stream) as archive:
                            if checksum in archive.namelist():
                                original_volume = (candidate, volume)
                                break
                    if original_volume is None:
                        raise ValueError('No pinned provider or original volume contains the requested object')
                    candidate, volume = original_volume
                    descriptor = {'kind': 'zip-member', 'path': candidate, 'member': checksum,
                                  'bytes': size, 'containerSha256': volume['sha256'],
                                  'containerBytes': volume['bytes']}
                    reference = {'table': 'legacyVaults', 'key': vault_relative}
                if descriptor['bytes'] != size:
                    raise ValueError('Provider size differs from original historical record')
                item = provider.read(checksum, descriptor, destination.joinpath(*mapped))
                item.update({'originalPath': relative, 'providerRef': reference})
                result.append(item)
            return {'schemaVersion': 1, 'complete': True, 'indexSha256': expected_sha256,
                    'catalogSha256': entry['catalogSha256'], 'files': result,
                    'sourceMutationPerformed': False, 'linksCreated': False,
                    'originalLocalPathsRecreated': False}
        finally:
            catalog.close()


def _request_records(source):
    if source == '-':
        # Node writes UTF-8 JSONL. Windows redirected Python stdin otherwise
        # defaults to the ANSI code page, including under isolated mode (-I).
        binary = getattr(sys.stdin, 'buffer', None)
        while True:
            line = binary.readline(65537) if binary is not None else sys.stdin.readline(65537)
            if not line:
                break
            if len(line) > 65536:
                raise ValueError('NDJSON request line bound exceeded')
            if isinstance(line, bytes):
                line = line.decode('utf-8', errors='strict')
            if line.strip():
                value = json.loads(line)
                if not isinstance(value, dict):
                    raise ValueError('Each NDJSON request must be an object')
                yield value
        return
    with open(native(source), 'rb') as stream:
        data = stream.read(32 * 1024**2 + 1)
    if len(data) > 32 * 1024**2:
        raise ValueError('Request JSON size bound exceeded')
    values = json.loads(data)
    values = values.get('requests') if isinstance(values, dict) else values
    if not isinstance(values, list) or any(not isinstance(row, dict) for row in values):
        raise ValueError('Request JSON must contain an explicit array of request objects')
    yield from values


def _new_json(path, value):
    guards = _PathGuards()
    try:
        path = _recovery_destination(path, WORKSPACE/'preserved', guards)
        with open(native(path), 'xb') as stream:
            stream.write((json.dumps(value, indent=2)+'\n').encode('utf-8'))
            stream.flush(); os.fsync(stream.fileno())
    finally:
        guards.close()


def _rename_new(source, destination):
    """Publish a verified new object without replacing an existing pathname."""
    import ctypes
    if os.name == 'nt':
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.MoveFileW.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p]
        if not kernel.MoveFileW(native(source), native(destination)):
            raise ctypes.WinError(ctypes.get_last_error())
    elif sys.platform.startswith('linux'):
        libc = ctypes.CDLL(None, use_errno=True)
        if not hasattr(libc, 'renameat2'):
            raise ValueError('This platform lacks atomic no-replace publication')
        if libc.renameat2(-100, os.fsencode(source), -100, os.fsencode(destination), 1):
            raise OSError(ctypes.get_errno(), 'No-replace publication failed')
    else:
        raise ValueError('Atomic no-replace archive publication is unavailable on this platform')


def _preserved_bytes(root):
    pending, total, files = [root], 0, 0
    while pending:
        at = pending.pop()
        with os.scandir(native(at)) as entries:
            for entry in entries:
                meta = entry.stat(follow_symlinks=False)
                if entry.is_symlink() or getattr(meta, 'st_file_attributes', 0) & 0x400:
                    raise ValueError('Reparse path in preservation budget inventory')
                if stat.S_ISDIR(meta.st_mode): pending.append(pathlib.Path(entry.path))
                elif stat.S_ISREG(meta.st_mode): total += meta.st_size; files += 1
                else: raise ValueError('Unknown preservation-budget object')
                if files > 250000 or len(pending) > 250000:
                    raise ValueError('Preservation-budget inventory bound exceeded')
    return total


class _CompressedBudget:
    def __init__(self, maximum, minimum_free, root):
        self.maximum, self.minimum_free, self.root = maximum, minimum_free, root
        self.written = 0

    def admit(self, predicted):
        import shutil
        if predicted < 0 or self.written + predicted > self.maximum:
            raise ValueError('New compressed-object budget exceeded before writing')
        if shutil.disk_usage(native(self.root)).free - predicted < self.minimum_free:
            raise ValueError('Preservation minimum-free-space budget exceeded')


class _BudgetFile:
    def __init__(self, stream, budget):
        self.stream, self.budget, self.length = stream, budget, 0
    def write(self, data):
        growth = max(0, self.stream.tell() + len(data) - self.length)
        self.budget.admit(growth)
        count = self.stream.write(data)
        actual = max(0, self.stream.tell() - self.length)
        self.length += actual; self.budget.written += actual
        return count
    def __getattr__(self, name): return getattr(self.stream, name)


def _remove_owned_lock(path, expected):
    """Only the generated lock is removed; never a source, volume or partial."""
    if os.name == 'nt':
        import ctypes, msvcrt
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.CreateFileW.argtypes = [ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32,
                                       ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p]
        kernel.CreateFileW.restype = ctypes.c_void_p
        handle = kernel.CreateFileW(native(path), 0x80010000, 0, None, 3, 0x00200000, None)
        if handle == ctypes.c_void_p(-1).value: raise ctypes.WinError(ctypes.get_last_error())
        fd = msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY)
        with os.fdopen(fd, 'rb') as stream:
            current = _opened_identity(stream)
            if any(current[k] != expected[k] for k in ['dev', 'ino']):
                raise ValueError('Owned sealing lock was replaced; retained')
            marker_bytes = stream.read()
            marker = json.loads(marker_bytes)
            if marker.get('owner') != expected['owner'] or hashlib.sha256(marker_bytes).hexdigest() != expected['markerSha256']:
                raise ValueError('Owned sealing lock content changed; retained')
            disposition = ctypes.c_int(1)
            if not kernel.SetFileInformationByHandle(ctypes.c_void_p(handle), 4,
                    ctypes.byref(disposition), ctypes.sizeof(disposition)):
                raise ctypes.WinError(ctypes.get_last_error())
    else:
        meta = os.stat(native(path), follow_symlinks=False)
        if any(_identity(meta)[k] != expected[k] for k in ['dev', 'ino']):
            raise ValueError('Owned sealing lock was replaced; retained')
        marker_bytes = path.read_bytes()
        if (json.loads(marker_bytes).get('owner') != expected['owner']
                or hashlib.sha256(marker_bytes).hexdigest() != expected['markerSha256']):
            raise ValueError('Owned sealing lock changed; retained')
        path.unlink()


def seal_objects(manifest, manifest_sha256, output, max_new_compressed_bytes=None,
                 index=None, index_sha256=None, policy=None):
    """Copy only selected immutable byte objects into bounded schema1 ZIPs.

    Failed partials and the failed lock remain owned for explicit review. There
    is no automatic resume, pruning, registry manager, or source removal.
    """
    import shutil, uuid
    policy = policy or json.loads(pathlib.Path(__file__).with_name('retention-policy.json').read_bytes())
    maximum = min(_size(max_new_compressed_bytes if max_new_compressed_bytes is not None else policy['preservedNewBytes']),
                  _size(policy['preservedNewBytes']))
    volume_limit = _size(policy['preservedVolumeInputBytes'], 1024**3)
    minimum_free = _size(policy['preservedMinimumFreeBytes'])
    maximum_total = _size(policy['preservedMaxBytes'], 1024**4)
    if maximum == 0 or volume_limit == 0: raise ValueError('Sealing budgets must be positive')
    if bool(index) != bool(index_sha256): raise ValueError('Existing provider reuse requires index and explicit SHA pin')
    guards, existing = _PathGuards(), None
    lock_path = WORKSPACE/'preserved/recovery-archives/.seal-objects.lock'
    lock_stream, lock_identity, active_zip, active_stream = None, None, None, None
    output = pathlib.Path(output).absolute()
    try:
        preserved = WORKSPACE/'preserved'
        guards.directory(preserved/'recovery-archives')
        if output.parent != preserved/'recovery-archives' or not output.name or output.name.startswith('.'):
            raise ValueError('Use one fresh owned child of preserved/recovery-archives')
        if os.path.lexists(native(output)): raise ValueError('Sealing output already exists; partials are never adopted')
        source_plan = _ReadGuard(pathlib.Path(manifest).absolute(), guards)
        try:
            if source_plan.identity['bytes'] > 64*1024**2 or source_plan.hash() != _sha(manifest_sha256):
                raise ValueError('Exact source-plan SHA differs')
            plan = json.load(source_plan.stream)
        finally: source_plan.close()
        if (plan.get('schemaVersion') != 1 or plan.get('kind') != 'spark-preserved-object-source-plan'
                or pathlib.Path(plan['workspace']).absolute() != WORKSPACE or plan.get('sourceDeletionPerformed') is not False):
            raise ValueError('Unknown or destructive source plan')
        rows = plan['files']
        if not isinstance(rows, list) or not rows or len(rows) > _MAX_REQUESTS:
            raise ValueError('Expected a bounded explicit nonempty source list')
        names, checksums, raw_total = set(), set(), 0
        for row in rows:
            parts = _relative(row['relative']); checksum = _sha(row['sha256']); size = _size(row['bytes'], 2*1024**3)
            if len(parts) < 3 or parts[0] != 'preserved' or parts[1] not in {'native-tags', 'immutable-assets', 'development-builds'}:
                raise ValueError('Only explicit raw CAS/development objects may be sealed; no archives/SDK/root copies')
            if row['relative'].lower() in names or checksum in checksums:
                raise ValueError('Source plan must deduplicate paths and SHA identities')
            if pathlib.PurePosixPath(row['relative']).suffix.lower() in {'.zip', '.gz', '.7z', '.tar', '.tgz', '.zst'}:
                raise ValueError('Nested archive input is not admitted')
            for field in ['dev', 'ino', 'mtimeNs', 'ctimeNs']:
                if not re.fullmatch('[0-9]+', str(row[field])): raise ValueError('Source identity is incomplete')
            names.add(row['relative'].lower()); checksums.add(checksum); raw_total += size
        if raw_total > _MAX_RECOVERY: raise ValueError('Exact raw-input read budget exceeded')
        if index: existing = ProviderIndex(index, index_sha256)
        owner = str(uuid.uuid4())
        marker = {'schemaVersion': 1, 'kind': 'spark-owned-object-sealing-lock', 'owner': owner,
                  'pid': os.getpid(), 'manifestSha256': manifest_sha256, 'output': str(output),
                  'status': 'active', 'automaticResume': False}
        try: lock_stream = open(native(lock_path), 'x+b')
        except FileExistsError: raise ValueError('An active or unresolved owned sealing lock exists; review it explicitly')
        marker_bytes = (json.dumps(marker)+'\n').encode()
        lock_stream.write(marker_bytes); lock_stream.flush(); os.fsync(lock_stream.fileno())
        lock_identity = {**_opened_identity(lock_stream), 'owner': owner,
                         'markerSha256': hashlib.sha256(marker_bytes).hexdigest()}
        before_bytes = _preserved_bytes(preserved)
        if before_bytes + maximum > maximum_total: raise ValueError('Global preserved headroom is insufficient for the reserved sealing budget')
        if shutil.disk_usage(native(preserved)).free - maximum < minimum_free:
            raise ValueError('Insufficient free disk space for the reserved bounded operation')
        os.mkdir(native(output)); guards.directory(output)
        def write_json(name, value):
            data = (json.dumps(value, indent=2)+'\n').encode()
            if len(data) > 16*1024**2: raise ValueError('Sealing metadata size bound exceeded')
            if _preserved_bytes(preserved) + len(data) > maximum_total: raise ValueError('Preserved metadata budget exceeded')
            with open(native(output/name), 'xb') as target:
                target.write(data); target.flush(); os.fsync(target.fileno())
        write_json('ownership.json', {**{k: value for k, value in marker.items() if k != 'status'},
                   'kind': 'spark-private-sealed-objects', 'workspace': str(WORKSPACE),
                   'rawInputBytes': raw_total, 'maximumNewCompressedBytes': maximum})
        budget = _CompressedBudget(maximum, minimum_free, preserved)
        volumes, objects, references, volume_rows, all_sources = [], {}, [], [], []
        raw_in_volume, partial = 0, None
        def finalize():
            nonlocal active_zip, active_stream, volume_rows, raw_in_volume, partial
            if active_zip is None: return
            active_zip.close(); active_zip = None
            active_stream.flush(); os.fsync(active_stream.fileno()); active_stream.close(); active_stream = None
            volume_number = len(volumes); name = f'objects-{volume_number:03}.zip'; final = output/name
            verification = _ReadGuard(partial, guards)
            try:
                checksum = verification.hash(); size = verification.identity['bytes']
                with zipfile.ZipFile(verification.stream) as archive:
                    infos = archive.infolist(); expected = {r['sha256']: r for r in volume_rows}
                    if len(infos) != len(expected): raise ValueError('Sealed volume has an unexpected member set')
                    for info in infos:
                        row = expected.get(info.filename)
                        if row is None or info.file_size != row['bytes']: raise ValueError('Sealed volume member differs')
                        h, total = hashlib.sha256(), 0
                        with archive.open(info) as member:
                            for block in iter(lambda: member.read(2**20), b''): h.update(block); total += len(block)
                        if h.hexdigest() != row['sha256'] or total != row['bytes']:
                            raise ValueError('Independent sealed payload readback failed')
                verification.check()
            finally: verification.close()
            _rename_new(partial, final)
            relative = final.relative_to(preserved).as_posix()
            for row in volume_rows:
                objects[row['sha256']] = {'kind': 'zip-member', 'path': relative,
                    'containerSha256': checksum, 'containerBytes': size, 'member': row['sha256'], 'bytes': row['bytes']}
            receipt = {'schemaVersion': 1, 'kind': 'spark-sealed-object-volume', 'complete': True,
                'manifestSha256': manifest_sha256, 'file': name, 'path': relative, 'sha256': checksum,
                'bytes': size, 'rawInputBytes': raw_in_volume, 'objects': [r['sha256'] for r in volume_rows],
                'sourceIdentities': volume_rows, 'fullReadback': True, 'crcVerified': True, 'sourceDeletionPerformed': False}
            write_json(f'volume-{volume_number:03}-receipt.json', receipt)
            volumes.append(receipt); volume_rows = []; raw_in_volume = 0; partial = None
        for row in rows:
            source = WORKSPACE.joinpath(*row['relative'].split('/'))
            reader = _ReadGuard(source, guards)
            try:
                if any(reader.identity[k] != row[k] for k in ['dev', 'ino', 'bytes', 'mtimeNs', 'ctimeNs']):
                    raise ValueError('Source changed since the exact hash inventory: '+row['relative'])
                if row.get('links') is not None and os.fstat(reader.stream.fileno()).st_nlink != row['links']:
                    raise ValueError('Source link ownership changed')
                if reader.stream.read(4) in {b'PK\x03\x04', b'PK\x05\x06'}:
                    raise ValueError('An archive payload cannot be nested into object sealing')
                if reader.hash() != row['sha256']: raise ValueError('Source bytes differ from pinned manifest')
                all_sources.append(dict(row))
                reusable = existing.objects.get(row['sha256']) if existing else None
                if reusable and not (reusable['kind'] == 'raw' and reusable['path'] == source.relative_to(preserved).as_posix()):
                    proof = existing.read(row['sha256'], reusable)
                    references.append({'source': dict(row), 'verification': proof})
                    objects[row['sha256']] = dict(reusable)
                    continue
                if active_zip is not None and raw_in_volume + row['bytes'] > volume_limit: finalize()
                if active_zip is None:
                    partial = output/f'.objects-{len(volumes):03}-{uuid.uuid4()}.partial'
                    active_stream = open(native(partial), 'x+b')
                    active_zip = zipfile.ZipFile(_BudgetFile(active_stream, budget), 'w', zipfile.ZIP_DEFLATED,
                                                 compresslevel=3, allowZip64=True)
                # Conservative source-size reservation precedes compression;
                # actual high-water compressed growth is checked on every write.
                budget.admit(row['bytes'] + max(65536, row['bytes']//1000) + 1024)
                reader.stream.seek(0); h = hashlib.sha256(); count = 0
                with active_zip.open(row['sha256'], 'w', force_zip64=True) as target:
                    for block in iter(lambda: reader.stream.read(2**20), b''):
                        h.update(block); count += len(block); target.write(block)
                reader.check()
                if count != row['bytes'] or h.hexdigest() != row['sha256']:
                    raise ValueError('Source changed during compression')
                raw_in_volume += count; volume_rows.append(dict(row))
            finally: reader.close()
        finalize()
        receipt = {'schemaVersion': 1, 'kind': 'spark-sealed-object-receipt', 'complete': True,
            'workspace': str(WORKSPACE), 'output': str(output), 'manifestPath': str(pathlib.Path(manifest).absolute()),
            'manifestSha256': manifest_sha256, 'rawInputBytes': raw_total, 'sourceFiles': len(rows),
            'sourceIdentities': all_sources, 'objects': objects, 'volumes': volumes, 'references': references,
            'newCompressedBytes': budget.written, 'maximumNewCompressedBytes': maximum,
            'volumeInputLimit': volume_limit, 'singleObjectLimit': 2*1024**3,
            'existingIndexSha256': index_sha256, 'fullReadback': True, 'crcVerified': True,
            'sourceDeletionPerformed': False, 'readyForDeletion': False, 'automaticResume': False}
        write_json('seal-receipt.json', receipt)
        lock_stream.close(); lock_stream = None
        _remove_owned_lock(lock_path, lock_identity); lock_identity = None
        return receipt
    except BaseException as exc:
        if active_zip is not None:
            try: active_zip.close()
            except Exception: pass
        if active_stream is not None:
            try: active_stream.close()
            except Exception: pass
        if lock_stream is not None:
            try:
                marker.update({'status': 'failed', 'error': str(exc)[:2048], 'originalSourcesRetained': True})
                lock_stream.seek(0); lock_stream.truncate()
                lock_stream.write((json.dumps(marker)+'\n').encode()); lock_stream.flush(); os.fsync(lock_stream.fileno())
            finally: lock_stream.close()
        raise
    finally:
        if existing: existing.close()
        guards.close()


def merge_provider_receipts(index, expected_sha256, components, requests):
    """Merge pinned completed readbacks; reconcile native metadata, not payloads.

    The retirement worker must still reopen, hash and protect every retained
    container before deletion. This operation never weakens recovery batch caps.
    """
    if not isinstance(components, list) or not components or len(components) > 128:
        raise ValueError('Choose a bounded explicit list of pinned component receipts')
    with ProviderIndex(index, expected_sha256) as provider:
        wanted, merged, containers, pins = {}, {}, {}, []
        for number, request in enumerate(requests):
            if number >= _MAX_REQUESTS: raise ValueError('Aggregate request count bound exceeded')
            checksum, descriptor, reference = provider.resolve(request)
            expected = (descriptor, reference)
            if checksum in wanted and wanted[checksum] != expected:
                raise ValueError('Conflicting expected object references')
            wanted[checksum] = expected
        if not wanted: raise ValueError('Aggregate requires explicit expected objects')
        for component in components:
            path = pathlib.Path(component['path']).absolute()
            checksum = _sha(component['sha256'])
            guard = _ReadGuard(path, provider.guards)
            try:
                if guard.identity['bytes'] > 64*1024**2: raise ValueError('Component receipt bound exceeded')
                data = guard.stream.read(); guard.check()
                if hashlib.sha256(data).hexdigest() != checksum: raise ValueError('Component receipt SHA differs')
                receipt = json.loads(data)
            finally: guard.close()
            if (receipt.get('schemaVersion') != 1 or receipt.get('kind') != 'spark-provider-verification'
                    or receipt.get('complete') is not True or receipt.get('fullReadback') is not True
                    or receipt.get('indexSha256') != provider.index_sha256
                    or pathlib.Path(receipt['indexPath']).absolute() != provider.index_path
                    or receipt.get('sourceMutationPerformed') is not False):
                raise ValueError('Component is not a complete same-index verification')
            if len(receipt['objects']) > _MAX_REQUESTS or sum(_size(row['bytes']) for row in receipt['objects']) > _MAX_RECOVERY:
                raise ValueError('Component exceeds the original verification batch bounds')
            for row in receipt['objects']:
                sha256 = _sha(row['sha256'])
                expected = wanted.get(sha256)
                if expected is None: raise ValueError('Unexpected verified object')
                descriptor, reference = expected
                if (row.get('ok') is not True or row.get('fullReadback') is not True
                        or row.get('sourceSha256') != sha256 or row.get('bytes') != descriptor['bytes']
                        or row.get('provider') != descriptor or row.get('providerRef') != reference
                        or row.get('indexSha256') != provider.index_sha256
                        or row.get('crcVerified') is not (descriptor['kind'] == 'zip-member')):
                    raise ValueError('Component object proof differs from the pinned provider')
                if sha256 in merged:
                    for key in ['sourceSha256', 'bytes', 'provider', 'providerRef', 'fullReadback', 'crcVerified']:
                        if merged[sha256][key] != row[key]: raise ValueError('Conflicting duplicate object proofs')
                else: merged[sha256] = row
            for row in receipt['containers']:
                _relative(row['path']); _sha(row['sha256']); _size(row['bytes'])
                for key in ['dev', 'ino', 'mtimeNs', 'ctimeNs']:
                    if not re.fullmatch('[0-9]+', str(row[key])): raise ValueError('Incomplete container identity')
                if row['path'] in containers and containers[row['path']] != row:
                    raise ValueError('Container identity changed between verification batches')
                containers[row['path']] = row
            pins.append({'path': str(path), 'sha256': checksum, 'objects': len(receipt['objects'])})
        if set(merged) != set(wanted): raise ValueError('Expected objects are missing from completed component receipts')
        required_containers = {}
        for object_sha256, (descriptor, _) in wanted.items():
            if descriptor['kind'] == 'raw':
                # The object SHA is the expected raw container identity.
                expected = (object_sha256, descriptor['bytes'])
            else: expected = (descriptor['containerSha256'], descriptor['containerBytes'])
            if descriptor['path'] in required_containers and required_containers[descriptor['path']] != expected:
                raise ValueError('Conflicting required container identities')
            required_containers[descriptor['path']] = expected
        for relative, expected in required_containers.items():
            row = containers.get(relative)
            if row is None or (row['sha256'], row['bytes']) != expected:
                raise ValueError('Completed proof lacks the pinned container identity')
            guard = _ReadGuard(provider.root.joinpath(*relative.split('/')), provider.guards)
            try:
                if any(guard.identity[key] != row[key] for key in ['dev', 'ino', 'bytes', 'mtimeNs', 'ctimeNs']):
                    raise ValueError('Container metadata changed since readback; verify that container again')
                guard.check()
            finally: guard.close()
        return {'schemaVersion': 1, 'kind': 'spark-provider-verification',
                'indexPath': str(provider.index_path), 'indexSha256': provider.index_sha256,
                'complete': True, 'fullReadback': True, 'objects': list(merged.values()),
                'containers': [containers[path] for path in required_containers],
                'componentReceipts': pins, 'expectedUniqueObjects': len(wanted),
                'containerMetadataRechecked': True, 'payloadsRehashedDuringMerge': False,
                'requiresFreshProtectedContainerHashBeforeRetirement': True,
                'sourceMutationPerformed': False}


def provider_command(args):
    if args.command == 'recover-vault':
        result = recover_vault(args.index, args.index_sha256, args.vault, args.destination, args.only)
        if args.receipt:
            _new_json(args.receipt, result)
        print(json.dumps(result), flush=True)
        return
    with ProviderIndex(args.index, args.index_sha256) as provider:
        if args.requests:
            requests = _request_records(args.requests)
        elif args.command == 'recover-object':
            if not args.checksum or not args.destination:
                raise ValueError('Choose SHA + new destination or explicit --requests')
            requests = iter([{'sha256': args.checksum, 'destination': args.destination}])
        elif args.all_objects:
            requests = ({'sha256': checksum} for checksum in provider.objects)
        else:
            requests = iter([])
        if args.requests == '-':
            print(json.dumps({'type': 'ready', 'indexSha256': provider.index_sha256}), flush=True)
        results, total = [], 0
        for number, request in enumerate(requests):
            try:
                if number >= _MAX_REQUESTS:
                    raise ValueError('Recovery request count bound exceeded')
                _, descriptor, _ = provider.resolve(request)
                total += descriptor['bytes']
                if total > _MAX_RECOVERY:
                    raise ValueError('Recovery batch byte bound exceeded')
                result = provider.request(request, recover=args.command == 'recover-object')
            except Exception as exc:
                if args.requests == '-':
                    print(json.dumps({'id': request.get('id'), 'ok': False, 'error': str(exc)}), flush=True)
                raise
            results.append(result)
            if args.requests == '-':
                print(json.dumps(result), flush=True)
        report = {'schemaVersion': 1, 'kind': 'spark-provider-verification',
                  'indexPath': str(provider.index_path), 'indexSha256': provider.index_sha256,
                  'complete': True, 'fullReadback': bool(results), 'objects': results,
                  'containers': provider.containers(), 'sourceMutationPerformed': False}
        if args.receipt:
            _new_json(args.receipt, report)
        if args.requests != '-':
            print(json.dumps(report if args.command == 'verify-provider-index' else results[0] if len(results) == 1 else report), flush=True)


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace',required=True,help='Owning workspace; sources must be explicitly below .local')
    sub = parser.add_subparsers(dest='command',required=True)
    create = sub.add_parser('prepare');create.add_argument('plan');create.add_argument('vault');create.add_argument('--seed');create.add_argument('--merge-seed-catalog',action='store_true')
    recover = sub.add_parser('restore');recover.add_argument('vault');recover.add_argument('--only')
    prove = sub.add_parser('prove-restore');prove.add_argument('vault');prove.add_argument('destination');prove.add_argument('samples',nargs='+')
    prune = sub.add_parser('finish');prune.add_argument('vault');prune.add_argument('--confirm-inactive',action='store_true')
    retain = sub.add_parser('retention');retain.add_argument('manifests');retain.add_argument('--policy',default=str(pathlib.Path(__file__).with_name('retention-policy.json')))
    for operation in ['recover-object', 'verify-provider-index']:
        command = sub.add_parser(operation)
        command.add_argument('index'); command.add_argument('--index-sha256', required=True)
        command.add_argument('--requests', help='Explicit JSON array file, or - for NDJSON stdin')
        command.add_argument('--receipt', help='New verification receipt outside protected storage')
        if operation == 'recover-object':
            command.add_argument('checksum', nargs='?'); command.add_argument('destination', nargs='?')
        else:
            command.add_argument('--all-objects', action='store_true')
    recover_indexed = sub.add_parser('recover-vault')
    recover_indexed.add_argument('index'); recover_indexed.add_argument('vault'); recover_indexed.add_argument('destination')
    recover_indexed.add_argument('--index-sha256', required=True); recover_indexed.add_argument('--only', required=True)
    recover_indexed.add_argument('--receipt')
    merge = sub.add_parser('merge-provider-receipts')
    merge.add_argument('index'); merge.add_argument('--index-sha256', required=True)
    merge.add_argument('--components', required=True, help='JSON array of {path,sha256} completed receipts')
    merge.add_argument('--requests', required=True, help='Original explicit expected request array')
    merge.add_argument('--receipt', required=True)
    seal = sub.add_parser('seal-objects')
    seal.add_argument('manifest'); seal.add_argument('output'); seal.add_argument('--manifest-sha256', required=True)
    seal.add_argument('--max-new-compressed-bytes', type=int)
    seal.add_argument('--index'); seal.add_argument('--index-sha256')
    args = parser.parse_args()
    WORKSPACE = pathlib.Path(args.workspace).resolve()
    if args.command == 'merge-provider-receipts':
        try:
            components = list(_request_records(args.components))
            result = merge_provider_receipts(args.index, args.index_sha256, components, _request_records(args.requests))
            _new_json(args.receipt, result)
            print(json.dumps({'complete': True, 'objects': len(result['objects']),
                'containers': len(result['containers']), 'components': len(components),
                'receipt': args.receipt, 'payloadsRehashedDuringMerge': False}), flush=True)
        except Exception as exc:
            print(json.dumps({'ok': False, 'error': str(exc)}), file=sys.stderr, flush=True); sys.exit(1)
        sys.exit(0)
    if args.command == 'seal-objects':
        try:
            result = seal_objects(args.manifest, args.manifest_sha256, args.output,
                                  args.max_new_compressed_bytes, args.index, args.index_sha256)
            print(json.dumps({'complete': True, 'output': result['output'],
                'receipt': str(pathlib.Path(result['output'])/'seal-receipt.json'),
                'sourceFiles': result['sourceFiles'], 'rawInputBytes': result['rawInputBytes'],
                'newCompressedBytes': result['newCompressedBytes'], 'volumes': len(result['volumes']),
                'reusedObjects': len(result['references']), 'sourceDeletionPerformed': False}), flush=True)
        except Exception as exc:
            print(json.dumps({'ok': False, 'error': str(exc), 'sourceDeletionPerformed': False}), file=sys.stderr, flush=True)
            sys.exit(1)
        sys.exit(0)
    if args.command in {'recover-object', 'verify-provider-index', 'recover-vault'}:
        try:
            provider_command(args)
        except Exception as exc:
            print(json.dumps({'ok': False, 'error': str(exc)}), file=sys.stderr, flush=True)
            sys.exit(1)
        sys.exit(0)
    # Historical catalogs remain readable for recovery, but old command lines
    # must not regenerate the removed development tree. Retention is read-only;
    # new archive/probe writes require the repaired generated-data locations.
    if args.command in {'prepare', 'prove-restore'}:
        output = pathlib.Path(args.vault if args.command == 'prepare' else args.destination).absolute()
        if '.local' in output.parts:
            parser.error('Obsolete .local output is disabled. Preserve/read the existing archive; use the current artifacts/ recovery workflow for new output.')
    if args.command == 'restore':
        parser.error('Legacy in-place restore would recreate .local. Preserve this archive and recover to a reviewed artifacts/ or preserved/ destination instead; no archive bytes were changed.')
    if args.command=='prepare': prepare(args.plan,args.vault,args.seed,args.merge_seed_catalog)
    elif args.command=='restore': restore(args.vault,args.only)
    elif args.command=='prove-restore': print(json.dumps(prove_restore(args.vault,args.destination,args.samples)),flush=True)
    elif args.command=='finish': print(json.dumps(finish(args.vault,args.confirm_inactive)),flush=True)
    else: print(json.dumps(retention_plan(json.loads(pathlib.Path(args.manifests).read_text(encoding='utf-8')),json.loads(pathlib.Path(args.policy).read_text(encoding='utf-8'))),indent=2))
