import { describe, expect, it } from 'vitest';
import { emptyCreatorStudio, exportHaloCeServerInit, exportStudioEvidence, validateCreatorStudio } from './creatorStudio';

describe('Project-integrated Creator Studio', () => {
  it('starts private without fabricated gameplay evidence', () => {
    const doc = emptyCreatorStudio();
    expect(validateCreatorStudio(doc)).toEqual([]);
    expect(doc.server.publicListing).toBe(false);
    expect(doc.playtests).toEqual([]);
  });
  it('builds safe, reviewable CE-only map rotation and not a live server', () => {
    const doc = emptyCreatorStudio();
    doc.server.rotation.push({ id: 'r1', map: 'bloodgulch', gameVariant: 'slayer' });
    const text = exportHaloCeServerInit(doc);
    expect(text).toContain('sv_public 0');
    expect(text).toContain('sv_mapcycle_add bloodgulch slayer');
    expect(text).not.toContain('sv_rcon_password');
    doc.server.rotation[0].gameVariant = 'Team Slayer';
    expect(exportHaloCeServerInit(doc)).toContain('sv_mapcycle_add bloodgulch "Team Slayer"');
    doc.server.runtime = 'mcc';
    expect(() => exportHaloCeServerInit(doc)).toThrow(/no verified/);
  });
  it('refuses control-character and newline command injection', () => {
    const doc = emptyCreatorStudio();
    doc.server.rotation.push({ id: 'r1', map: 'bloodgulch\nsv_public 1', gameVariant: 'slayer' });
    expect(validateCreatorStudio(doc).length).toBeGreaterThan(0);
    expect(() => exportHaloCeServerInit(doc)).toThrow(/Unsafe/);
    doc.server.rotation[0].map = 'bloodgulch';
    doc.server.name = 'LAN"\nsv_public 1';
    expect(() => exportHaloCeServerInit(doc)).toThrow(/Unsafe/);
  });
  it('refuses PASS without manually reported evidence', () => {
    const doc = emptyCreatorStudio();
    doc.playtests.push({id: 'test1', caseId: 'NET-001', target:'Halo CE', verdict:'pass', performedAt:'', evidence:'', notes:'', manuallyReported:true});
    expect(validateCreatorStudio(doc)).not.toEqual([]);
    doc.playtests[0].evidence = 'Observed 2-client session, recording #abc';
    expect(validateCreatorStudio(doc)).toEqual([]);
    const report = JSON.parse(exportStudioEvidence(doc,{id:'one',title:'Test',source:null},'2026-10-25T00:00:00Z'));
    expect(report.liveGameVerifiedAutomatically).toBe(false);
    expect(report.server.status).toBe('draftNotDeployed');
  });
  it('rejects out-of-range camera coordinates and duplicate IDs', () => {
    const doc = emptyCreatorStudio();
    doc.shots.push({id:'a',name:'intro',durationMs:4000,cameraPosition:[1,2,10000],lookAt:[0,0,0],fov:60,subtitle:''});
    expect(validateCreatorStudio(doc).length).toBeGreaterThan(0);
    doc.shots[0].cameraPosition = [1,2,3];
    doc.missions.push({id:'a',title:'Start',objective:'Go',trigger:'manual',encounterName:''});
    expect(validateCreatorStudio(doc).length).toBeGreaterThan(0);
  });
  it('accepts the native optional camera-marker null on save/reopen',()=>{const doc=emptyCreatorStudio();doc.shots.push({id:'native',name:'Shot',durationMs:3000,cameraPosition:[1,2,3],lookAt:[0,0,0],fov:60,subtitle:'',cameraMarker:null});expect(validateCreatorStudio(doc)).toEqual([]);});
});
