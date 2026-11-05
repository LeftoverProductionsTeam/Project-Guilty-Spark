"""Private, deduplicated cold-QA archive. Never used for public release payloads.
Each archived copy restores as independent regular files, never as hardlinks.
Archive SHA and every unique member SHA are verified before any deletion. Every
source is hashed again immediately before deleting it. Changed files stay expanded.
"""
import argparse, atexit, hashlib, json, os, pathlib, stat, subprocess, time, zipfile

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


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace',required=True,help='Owning workspace; sources must be explicitly below .local')
    sub = parser.add_subparsers(dest='command',required=True)
    create = sub.add_parser('prepare');create.add_argument('plan');create.add_argument('vault');create.add_argument('--seed');create.add_argument('--merge-seed-catalog',action='store_true')
    recover = sub.add_parser('restore');recover.add_argument('vault');recover.add_argument('--only')
    prove = sub.add_parser('prove-restore');prove.add_argument('vault');prove.add_argument('destination');prove.add_argument('samples',nargs='+')
    prune = sub.add_parser('finish');prune.add_argument('vault');prune.add_argument('--confirm-inactive',action='store_true')
    retain = sub.add_parser('retention');retain.add_argument('manifests');retain.add_argument('--policy',default=str(pathlib.Path(__file__).with_name('retention-policy.json')))
    args = parser.parse_args()
    WORKSPACE = pathlib.Path(args.workspace).resolve()
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
