import { describe, expect, it } from 'vitest';
import { canHandoff, listingExpired, relocateRuntimeRegistration } from './runtimeWorkbench';
import type { CommunityJoinAssessment, CommunityListingView } from './runtimeWorkbench';

const view: CommunityListingView = {
  listing: {
    provider: 'synthetic',
    fetchedAtUnix: 100,
    expiresAtUnix: 130,
    servers: [],
    rejectedRows: 0,
    diagnostics: [],
  },
  stale: false,
  refreshAfterUnix: 130,
  fetching: false,
  error: null,
};
const assessment: CommunityJoinAssessment = {
  readiness: 'readyForRuntimeCheck',
  runtimeId: 'openCe',
  registrationId: 'synthetic',
  issues: [],
  limitations: ['No game connection was tested'],
  connectionOutcome: 'unobserved',
  preflightId: 'synthetic',
  executableSha256: 'a'.repeat(64),
  expiresAtUnix: 130,
};
describe('community invitation freshness', () => {
  it('requires a current listing and native eligibility together', () => {
    expect(canHandoff(assessment, view, 129999)).toBe(true);
    expect(canHandoff({ ...assessment, readiness: 'blocked' }, view, 129999)).toBe(false);
    expect(canHandoff(null, view, 129999)).toBe(false);
    expect(canHandoff(assessment, null, 129999)).toBe(false);
    expect(canHandoff({ ...assessment, preflightId: null }, view, 129999)).toBe(false);
  });
  it('expires at the exact boundary and refuses a stale fallback after refresh failure', () => {
    expect(listingExpired(view, 130000)).toBe(true);
    expect(canHandoff(assessment, view, 130000)).toBe(false);
    expect(canHandoff(assessment, { ...view, stale: true, error: 'Provider unavailable' }, 120000)).toBe(
      false,
    );
  });
});


describe('runtime folder relocation',()=>{
 const installed={id:'owned',runtimeId:'openCe' as const,root:'D:/Old/OpenCE',executable:'D:/Old/OpenCE/halo.exe',dataRoot:'D:/Old/OpenCE/data',version:'335',networkVersion:null};
 it('moves internal executable and map paths together without changing protocol declarations',()=>{
  const moved=relocateRuntimeRegistration(installed,'D:/Runtimes/OpenCE');expect(moved).toEqual({...installed,root:'D:/Runtimes/OpenCE',executable:'D:/Runtimes/OpenCE/halo.exe',dataRoot:'D:/Runtimes/OpenCE/data'});expect(installed.root).toBe('D:/Old/OpenCE');
 });
 it('preserves separately selected data and rejects sibling-prefix ownership',()=>{
  expect(relocateRuntimeRegistration({...installed,dataRoot:'D:/Old/OpenCE-other/maps'},'E:/Games/OpenCE').dataRoot).toBe('D:/Old/OpenCE-other/maps');
  expect(relocateRuntimeRegistration({...installed,root:'d:/old/OPENCE/',dataRoot:'D:/OLD/opence/maps'},'E:/New').dataRoot).toBe('E:/New/maps');
 });
 it('fills the correct Custom Edition executable for a fresh folder choice',()=>{
  expect(relocateRuntimeRegistration({...installed,runtimeId:'haloCustomEdition',root:'',executable:'',dataRoot:null},'D:/Runtimes/Halo Custom Edition')).toEqual({...installed,runtimeId:'haloCustomEdition',root:'D:/Runtimes/Halo Custom Edition',executable:'D:/Runtimes/Halo Custom Edition/haloce.exe',dataRoot:'D:/Runtimes/Halo Custom Edition'});
 });
});

it('labels installed OpenH1 and Faber separately without changing their validated adapter identity',async()=>{
 const {runtimeProfileName,runtimeProfileLabel}=await import('./runtimeWorkbench');
 const profile={id:'engine-openh1-build-1845',runtimeId:'openCe' as const,root:'C:/Owned/engines/openh1',executable:'C:/Owned/engines/openh1/halo.exe',dataRoot:'C:/Owned/Maps',version:'build-1845',networkVersion:null};
 expect(runtimeProfileName(profile)).toBe('OpenH1');expect(runtimeProfileLabel(profile)).toBe('OpenH1 · openh1');
 expect(runtimeProfileName({...profile,id:'engine-faber-v2.3.4',root:'C:/Owned/Faber',version:'v2.3.4'})).toBe('Faber');
 expect(profile.runtimeId).toBe('openCe');
});
