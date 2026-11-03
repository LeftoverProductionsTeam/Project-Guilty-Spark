import {chooseTool,openDrawer} from './helpers/navigation';
// These are synthetic IPC contract tests. They do not establish native runtime or gameplay verification.
import { test, expect, type Page } from '@playwright/test';

test('C61 build notifications use source-bound metadata and retain unsaved edits without reopening map buffers',async({page})=>{
  await mockDesktop(page);await openFixture(page);const field=page.getByLabel('Velocity',{exact:true});await field.fill('39');await field.press('Tab');
  await page.evaluate(()=>{const m=(window as any).__sparkMock;m.calls.length=0;m.emit('spark:library-changed');});
  await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.calls.some((r:any)=>r.command==='project_build_history'))).toBe(true);
  await expect(field).toHaveValue('39');expect(await page.evaluate(()=>(window as any).__sparkMock.calls.filter((r:any)=>r.command==='open_project').length)).toBe(0);
  await page.evaluate(()=>{const w=window as any,original=w.__TAURI_INTERNALS__.invoke;w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{const value=await original(command,args);return command==='project_build_history'?{...value,sourceSha256:'wrong source'}:value;};w.__sparkMock.emit('spark:library-changed');});
  await expect(page.getByText(/Build history does not match this project source\. Your working draft is retained\./)).toBeVisible();await expect(field).toHaveValue('39');
});

test('C61 Inspector puts selected transforms before global settings and keeps all renderer controls reachable',async({page})=>{
  await page.setViewportSize({width:1280,height:720});await mockDesktop(page);
  await page.evaluate(()=>{(window as any).__sparkMock.projects.a.project.scene=[{id:'synthetic-selection',name:'Synthetic selected object',kind:'Scenery',tagId:null,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,sourceOffset:null,rotationOffset:null,assetId:null}];});
  await openFixture(page);await chooseTool(page,'Level editor');
  await openDrawer(page,'Objects');await page.locator('.object-name').first().click();await openDrawer(page,'Inspector');
  const panel=page.getByRole('region',{name:'Inspector panel',exact:true}),selected=panel.locator('.world-inspector-selection');
  await expect(selected).toBeVisible();const selection=await selected.boundingBox(),global=await panel.locator('.gs-render-features').boundingBox();expect(selection!.y).toBeLessThan(global!.y);
  await panel.locator('.gs-render-features>summary').click();await panel.getByLabel('Enable renderer enhancements',{exact:true}).check();
  const controls=panel.locator('.gs-render-feature-controls');await expect(controls.getByLabel('Bloom strength',{exact:true})).toBeVisible();
  const bloom=controls.getByLabel('Bloom strength',{exact:true}),before=await bloom.inputValue();await bloom.focus();await page.keyboard.press('End');await expect(bloom).toHaveValue('2');
  expect(await controls.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);await page.keyboard.press('Control+z');
  await expect(bloom).toHaveValue(before);
});

test('C60 late library replies cannot overwrite a newer snapshot or an open map edit',async({page})=>{
  await mockDesktop(page);await openFixture(page);const field=page.getByLabel('Velocity',{exact:true});await field.fill('31');await field.press('Tab');
  await page.evaluate(()=>{
    const w=window as any,original=w.__TAURI_INTERNALS__.invoke;w.__libraryRefreshProbe={pending:[]};
    w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
      if(command!=='bootstrap')return original(command,args);
      const value=await original(command,args);
      return new Promise(resolve=>{w.__libraryRefreshProbe.pending.push({done:false,finish:(title:string)=>{const next=structuredClone(value);next.entries.find((row:any)=>row.id==='b').title=title;resolve(next);}});});
    };
  });
  await page.evaluate(()=>(window as any).__sparkMock.emit('spark:imported'));
  await expect.poll(()=>page.evaluate(()=>(window as any).__libraryRefreshProbe.pending.length)).toBe(1);
  await page.evaluate(()=>(window as any).__sparkMock.emit('spark:imported'));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const overlapping=await page.evaluate(()=>(window as any).__libraryRefreshProbe.pending.length>1);
  if(overlapping){
    await page.evaluate(()=>(window as any).__libraryRefreshProbe.pending[1].finish('Newest library snapshot'));
    await chooseTool(page,'Map library');await expect(page.getByRole('heading',{name:'Newest library snapshot',exact:true})).toBeVisible();
    await page.evaluate(()=>(window as any).__libraryRefreshProbe.pending[0].finish('Stale library snapshot'));
  }else{
    await page.evaluate(()=>(window as any).__libraryRefreshProbe.pending[0].finish('Stale library snapshot'));
    await expect.poll(()=>page.evaluate(()=>(window as any).__libraryRefreshProbe.pending.length)).toBe(2);
    await page.evaluate(()=>(window as any).__libraryRefreshProbe.pending[1].finish('Newest library snapshot'));await chooseTool(page,'Map library');
  }
  await expect(page.getByRole('heading',{name:'Newest library snapshot',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Stale library snapshot',exact:true})).toHaveCount(0);
  await page.getByRole('tab',{name:'Synthetic baseline',exact:true}).click();await chooseTool(page,'Tag editor');await expect(field).toHaveValue('31');
});

test('C59 Online separates game hosting, compatible joins and source collaboration',async({page})=>{
  await mockDesktop(page);await page.goto('/');await chooseTool(page,'Online');
  await page.getByRole('button',{name:'Host game',exact:true}).click();
  await expect(page.getByRole('region',{name:'Hosting and servers',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Collaborate',exact:true}).click();
  await expect(page.getByRole('region',{name:'Hosting and servers',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Collaborate on source',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Set up editor collaboration',exact:true}).click();
  await expect(page.getByRole('region',{name:'Co-edit setup panel',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close Co-edit setup',exact:true}).click();
  await page.getByRole('button',{name:'Join server',exact:true}).click();
  await expect(page.getByRole('region',{name:'Collaborate on source',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Host game',exact:true})).toHaveCount(1);
});

async function mockDesktop(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('guilty-spark-first-run-seen-v1', 'yes');
    const w = window as any;
    const settings = {
      steamDirectory: null,
      mccDirectory: null,
      invaderDirectory: null,
      resourceDirectory: null,
      metadataTemplateDirectory: null,
      nativeExecutable: null,
      autoBuild: false,
      ...JSON.parse(localStorage.getItem('spark-test-settings')??'{}'),
    };
    const make = (id: string, title: string, value: number) => ({
      project: {
        schemaVersion: 1,
        id,
        title,
        createdAt: '',
        modifiedAt: '',
        source: {
          originalPath: 'fixture.map',
          preservedPath: 'fixture.map',
          sha256: id.repeat(64),
          cacheVersion: 7,
          engine: 'Synthetic test fixture',
          scenarioPath: 'levels/test',
        },
        provenance: {
          creator: 'Synthetic test fixture',
          community: '',
          releaseYear: null,
          description: '',
          sourceUrl: '',
          permissions: '',
        },
        scene: [],
        assets: [],
        tagEdits: [],
        history: [],
        builds: [],
      },
      inspection: {
        header: {
          version: 7,
          engine: 'Synthetic test fixture',
          name: 'test',
          build: '',
          scenarioType: 1,
          fileSize: 100,
          declaredSize: 100,
          tagOffset: 1,
          tagSize: 1,
          crc32: 0,
          flags: 0,
          demoLayout: false,
          compressed: false,
          extended: false,
          legacyTagSizeRepair: false,
        },
        sha256: id.repeat(64),
        tags: [
          {
            id: 1,
            index: 0,
            class: 'weap',
            path: 'weapons/test',
            dataOffset: 4,
            external: false,
            fields: [
              {
                key: 'velocity',
                label: 'Velocity',
                offset: 4,
                kind: 'f32',
                value,
                min: 0,
                max: 100,
                unit: 'units/s',
                targetClass: null,
              },
            ],
            references: [],
          },
        ],
        objects: [],
        mesh: { positions: [], indices: [], label: 'Synthetic fixture', source: 'synthetic' },
        encounters: [],
        scripts: [],
        resources: [],
        diagnostics: [],
        scenarioPath: 'levels/test',
      },
    });
    const projects: Record<string, any> = {
      a: make('a', 'Synthetic baseline', 10),
      b: make('b', 'Synthetic candidate', 25),
      c: make('c', 'Synthetic third donor', 30),
    };
    const forgeFixture=localStorage.getItem('spark-test-forge');
    if(forgeFixture)projects.a.project.quickForge=JSON.parse(forgeFixture);
    const appliedBsp = localStorage.getItem('spark-test-applied-bsp');
    if (appliedBsp) projects.a.project.bspAssembly = JSON.parse(appliedBsp);
    const bootstrap = {
      apiVersion: 1,
      installation: {
        steamPath: null,
        steamExecutable: null,
        mccPath: null,
        halo1Installed: false,
        libraries: [],
        editingTools: null,
        manifestPath: null,
        running: false,
        diagnostics: [],
      },
      managed: null,
      settings,
      entries: Object.values(projects).map((open) => ({
        id: open.project.id,
        title: open.project.title,
        engine: 'Synthetic',
        version: 7,
        sha256: open.inspection.sha256,
        modifiedAt: '2026-01-01',
        creator: 'Test fixture',
        tagCount: 1,
        objectCount: 0,
        status: 'imported',
        projectPath: 'synthetic',
        scenarioType: 1,
      })),
      dataDirectory: 'Synthetic test fixture',
      inboxDirectory: 'Synthetic local Inbox',
      diagnostics: [],
      logs: [],
    };
    const callbacks = new Map<number, (event: any) => unknown>();
    const events = new Map<number, { event: string; handler: number }>();
    // Synthetic IPC contract only. Durable files, process recovery and window
    // leases are covered by test-window-history-native.mjs against the real app.
    const windowHistories = new Map<string, any>();
    let sequence = 0;
    const mock = (w.__sparkMock = {
      projects,
      calls: [] as any[],
      failSave: false,
      failSettings: false,
      delayOpen: 0,
      saved: null as any,
      session:null as any,
      sprint:{enabled:false,sprinting:false,config:{hotkey:'ShiftLeft',multiplier:1.75},observed:{playerDatum:1,multiplier:1,canSprint:false,reason:'Move forward to sprint'},error:null,detail:'Synthetic native sprint state'} as any,
      camera:{enabled:false,active:false,restorePending:false,shortcut:{enabled:true,key:'F6'},config:{back:.4,right:.3,up:.15},observed:{available:true,reason:'Native on-foot camera available',weaponThirdPerson:false,trackCount:1},error:null,detail:'Synthetic native camera state'} as any,
      emit: async (event: string) => {
        for (const [id, item] of events)
          if (item.event === event) await callbacks.get(item.handler)?.({ id, event, payload: null });
      },
    });
    w.isTauri = true;
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (_event: string, id: number) => events.delete(id),
    };
    w.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' } },
      transformCallback: (callback: (event: any) => unknown) => {
        callbacks.set(++sequence, callback);
        return sequence;
      },
      invoke: async (command: string, args: any = {}) => {
        mock.calls.push({ command, args });
        if (command === 'plugin:event|listen') {
          events.set(++sequence, args);
          return sequence;
        }
        if (command === 'plugin:event|unlisten') return null;
        if(command==='plugin:window|is_fullscreen')return !!mock.fullscreen;
        if(command==='plugin:window|set_fullscreen'){mock.fullscreen=args.value;return null;}
        if(command==='plugin:window|current_monitor')return {name:'Synthetic display',size:{width:1280,height:720},position:{x:0,y:0},workArea:{position:{x:0,y:0},size:{width:1280,height:680}},scaleFactor:1};
        if(command==='plugin:window|set_fullscreen_on_monitor'){if(args.value.x!==0||args.value.y!==0)throw Error('Wrong synthetic display');mock.fullscreen=true;return null;}
        if(command==='plugin:window|is_maximized')return !!mock.maximized;
        if(command==='plugin:window|toggle_maximize'){mock.maximized=!mock.maximized;return null;}
        if(command==='plugin:window|unmaximize'){mock.maximized=false;return null;}
        if(command==='plugin:window|maximize'){mock.maximized=true;return null;}
        if (command === 'bootstrap') return structuredClone(bootstrap);
        if (command === 'open_workspace_window') return 'synthetic-workspace-window';
        if (command === 'open_project_window') {
          if(mock.enforceTransfer){mock.transferredId=args.id;await new Promise(resolve=>setTimeout(resolve,80));}
          return 'synthetic-map-window';
        }
        if (command === 'project_build_history') {const p=projects[args.id].project;return structuredClone({projectId:p.id,sourceSha256:p.source?.sha256??null,builds:p.builds});}
        if (command === 'open_project') {if(mock.delayOpen){const delay=mock.delayOpen;mock.delayOpen=0;await new Promise(resolve=>setTimeout(resolve,delay));}return structuredClone(projects[args.id]);}
        if (command === 'prepare_native_asset_import') {
          const source = projects[args.sourceProjectId];
          const tag = source?.inspection.tags.find((tag: any) => tag.id === args.tagId);
          if (!tag || source.inspection.sha256 !== args.sourceSha256) throw Error('Synthetic asset identity mismatch');
          return {id:'synthetic-import', sourceProjectId:args.sourceProjectId,sourceSha256:args.sourceSha256,tagId:tag.id,tagClass:tag.class,tagPath:tag.path,nativePath:'synthetic-import/'+tag.path,receiptSha256:'c'.repeat(64),fileCount:1};
        }
        if (command === 'claim_project_document' || command === 'release_project_document') return null;
        if (command === 'read_workspace_history') return {writable:true,owner:'main',history:structuredClone(windowHistories.get(args.projectId)??null)};
        if (command === 'commit_workspace_history') {
          if(mock.transferredId===args.projectId)throw Error('Editing moved to another window');
          const previous=windowHistories.get(args.projectId);
          if(args.revision!==(previous?.revision??0))throw Error('Synthetic revision conflict');
          const snapshots=new Map((previous?.snapshots??[]).map((s:any)=>[s.key,s]));
          for(const snapshot of args.snapshots)snapshots.set(snapshot.key,structuredClone(snapshot));
          const keys=new Set([args.head.current,...args.head.past,...args.head.future]);
          const next={revision:args.revision+1,head:structuredClone(args.head),snapshots:[...snapshots.values()].filter((s:any)=>keys.has(s.key))};
          windowHistories.set(args.projectId,next);return next.revision;
        }
        if(command==='retain_workspace_draft')return 'C:/synthetic/rejected-draft.json';
        if (command === 'auto_connect_classic_textures') return null;
        if (command === 'auto_connect_sound_resources') return null;
        if (command === 'external_map_watch_start' || command === 'external_map_watch_poll') return {watchId:args.projectId??args.watchId,projectId:args.projectId??args.watchId,path:'C:/synthetic/external.map',status:'watching',candidate:null,message:'Watching a synthetic input; no real filesystem is read.'};
        if (command === 'external_map_watch_stop') return null;
        if (command === 'runtime_workbench_report') {
          const actionNames = [['play','Play Halo'],['testScene','Test Scene'],['editLevel','Edit level'],['editTags','Edit tags'],['build','Build'],['publish','Publish'],['findGames','Find games'],['host','Host'],['legacy','Legacy tools']];
          return {report:{schemaVersion:1,profileId:'synthetic',target:{family:'halo1',edition:'synthetic',platform:'windows',distribution:'synthetic',architecture:'x86_64'},capabilities:[],diagnostics:[],playerScale:{goalPlayers:128,checkpoints:[2,8,16,32,64,128],acceptedGamePlayers:null}},profiles:[],sourceIssue:'Synthetic source not built',toolsIssue:'Synthetic kit not configured',actions:actionNames.map(([id,label])=>({id,label,operation:id,availability: id==='findGames'?'ready':'setupRequired',description:'Synthetic operation',nextAction:'Set up the matching runtime',requiresConfirmation:false})),processes:[]};
        }
        if (command === 'runtime_tool_processes') return [];
        if (command === 'live_mcc_cleanup_status') return {hasSession:false,sessionToken:null,pending:[],detail:'No synthetic session'};
        if (command === 'community_listing') {
          const timestamp=Math.floor(Date.now()/1000);
          const servers=['a','b'].map((id,index)=>({id:id.repeat(64),provider:'Synthetic Delta List',source:'synthetic',name:`Synthetic game ${index+1}`,map:{family:'xbox',name:'bloodgulch',pack:null,displayName:'Blood Gulch'},gameType:'Slayer',mode:'multiplayer',players:2,advertisedCapacity:128,open:true,locked:false,inProgress:true,legacyNetworkVersion:43,protocol:'delta',build:null,platform:null,hosting:'synthetic',region:null,providerVerified:false,fetchedAtUnix:timestamp,advertisementAgeSeconds:0}));
          const result={listing:{provider:'synthetic',fetchedAtUnix:timestamp,expiresAtUnix:timestamp+30,servers,rejectedRows:0,diagnostics:[]},stale:false,refreshAfterUnix:timestamp+30,fetching:false,error:null};
          if(w.__sparkMock.deferListing)return new Promise(resolve=>{w.__sparkMock.finishListing=()=>resolve(result);});
          return result;
        }
        if (command === 'community_join_preflight') {
          const result={readiness:'blocked',runtimeId:args.runtimeId,registrationId:'synthetic',issues:[{code:'wrongRuntime',summary:'This synthetic game needs a compatible community runtime',setupRoute:'Runtime adapters'}],limitations:['Synthetic contract only; no game was launched'],connectionOutcome:'unobserved'};
          if(w.__sparkMock.deferJoinCheck)return new Promise(resolve=>{w.__sparkMock.finishJoinCheck=()=>resolve(result);});
          return result;
        }
        if (command === 'bsp_assembly_options') return [{index:0,name:'Synthetic campaign interior',triangles:12}];
        if (command === 'plan_bsp_assembly') {
          const plan = {schemaVersion:1,donorProjectId:args.donorProjectId,donorTitle:projects[args.donorProjectId].project.title,donorSource:structuredClone(projects[args.donorProjectId].project.source),donorTagsDirectory:'C:/synthetic/tags',donorBspIndex:args.donorBspIndex,translation:[20,0,0],yawDegrees:0,tunnelPoints:[[0,0,0],[20,0,0]],tunnelWidth:2,tunnelHeight:1.6,tunnelShaderPath:'synthetic/stone'};
          if(w.__sparkMock.deferBspPlan) return new Promise(resolve=>{w.__sparkMock.finishBspPlan=()=>resolve(plan);});
          return plan;
        }
        if (command === 'preview_bsp_assembly') {
          if(!projects[args.projectId].project.bspAssembly)throw new Error('Assembly was not saved');
          const report={inputTriangles:24,outputTriangles:36,generatedUvFaces:0,walkSamples:42,portalCount:2,donorScenery:projects[args.projectId].project.bspAssembly.includeDonorScenery?3:0,warnings:['Synthetic clearance only; no game was run.']};
          if(w.__sparkMock.deferBspPreview) return new Promise((resolve,reject)=>{w.__sparkMock.finishBspPreview=(success=true)=>success?resolve(report):reject(new Error('Synthetic stale clearance failure'));});
          return report;
        }
        if (command === 'save_project') {
          if (mock.failSave) throw new Error('Synthetic save failure');
          mock.saved = structuredClone(args.project);
          projects[args.project.id].project = structuredClone(args.project);
          const p=projects[args.project.id].project;
          return {id:p.id,title:p.title,engine:p.source.engine,version:p.source.cacheVersion,sha256:p.source.sha256,modifiedAt:'saved-receipt-'+p.id,creator:p.provenance.creator,tagCount:projects[p.id].inspection.tags.length,objectCount:p.scene.length,status:'preserved',projectPath:p.id+'.gsproject',scenarioType:1};
        }
        if(command==='quickforge_preview')return {positions:[],normals:[],uvs:[],indices:[],parts:[]};
        if(command==='quickforge_validate')return {valid:true,issues:[],vertices:0,triangles:0,closedComponents:0,sourceSha256:'a'.repeat(64)};
        if(command==='live_mcc_sprint_status')return structuredClone(mock.sprint);
        if(command==='live_mcc_sprint_configure'){mock.sprint={...mock.sprint,enabled:args.enabled,sprinting:false,config:args.config};return structuredClone(mock.sprint);}
        if(command==='live_mcc_camera_status')return structuredClone(mock.camera);
        if(command==='live_mcc_camera_toggle'){const enabled=!mock.camera.enabled;mock.camera={...mock.camera,enabled,active:enabled,config:enabled?(args.config??mock.camera.config):mock.camera.config,observed:{...mock.camera.observed,weaponThirdPerson:enabled}};return structuredClone(mock.camera);}
        if(command==='live_mcc_camera_shortcut'){mock.camera={...mock.camera,shortcut:args.shortcut};return structuredClone(mock.camera);}
        if(command==='live_mcc_camera_configure'){mock.camera={...mock.camera,enabled:args.enabled,active:args.enabled,config:args.config,observed:{...mock.camera.observed,weaponThirdPerson:args.enabled}};return structuredClone(mock.camera);}
        if(command==='forge_session_status')return structuredClone(mock.session);
        if(command==='forge_studio_pending')return null;
        if(command==='forge_session_host'){
          const view={sessionId:'11111111-1111-4111-8111-111111111111',revision:0,document:args.document,peers:1,lastAuthor:'host',detail:'Synthetic source session'};
          mock.session={projectId:args.projectId,projectTitle:projects[args.projectId].project.title,sessionId:view.sessionId,role:'host',transport:args.transport,endpoint:'127.0.0.1:32145',key:'a'.repeat(32),view,lan:args.lan};return structuredClone(mock.session);
        }
        if(command==='forge_session_poll'||command==='forge_session_resume')return structuredClone(mock.session.view);
        if(command==='forge_session_leave'){mock.session=null;return null;}
        if(command==='steam_module_status'||command==='choose_steam_module')return {configured:false,appId:480,testMode:true,cancelled:command==='choose_steam_module',detail:'Choose the optional module to enable Steam test transport.'};
        if(command==='runtime_hosting_plan')return {mapTitle:args.projectId?projects[args.projectId].project.title:null,scenarioType:1,cacheVersion:7,plan:{title:'Synthetic MCC Custom Games guide',status:'documented',testStatus:'notRun',automatic:false,steps:['Use Halo CE Custom Games for this multiplayer map.'],limitations:['Two physical game clients were not tested.'],sources:[]}};
        if (command === 'close_application') return null;
        if (command === 'choose_setting_path') return 'C:/synthetic/selected';
        if (command === 'save_settings') {
          if(mock.failSettings)throw new Error('Synthetic settings write failed');
          Object.assign(settings, args.settings);
          localStorage.setItem('spark-test-settings',JSON.stringify(settings));
          return structuredClone(bootstrap);
        }
        if(command==='halo_setup_report')return {schemaVersion:1,runtimes:[],kits:[],mccInstalled:false,invaderConfigured:false};
        if (command === 'export_project' || command === 'choose_project_resources') return null;
        if (command === 'compatibility') throw new Error('Synthetic compatibility error');
        if (command === 'launch_readiness') throw new Error('Synthetic readiness error');
        if (command === 'inspect_template') throw new Error('Synthetic template error');
        if (command === 'discover_halo_connections') return [];
        if (command === 'tool_ecosystem_report') return { projectId: args.projectId, context: { runtimeId: args.runtimeId, sourceKind: 'Synthetic source' }, sourceIssue: null, tools: [] };
        if (command === 'runtime_report')
          return [
            {
              schemaVersion: 1,
              adapterVersion: 1,
              id: 'mccSteam',
              name: 'Synthetic runtime',
              hostPlatform: 'windows',
              installation: null,
              capabilities: [
                {
                  key: 'liveEditing',
                  status: 'unknown',
                  evidence: 'application',
                  testStatus: 'blocked',
                  detail: 'No test bridge',
                  sources: [],
                },
              ],
              mapFamilies: [],
              diagnostics: [],
            },
          ];
        const manifest = {
          schemaVersion: 1,
          adapterVersion: 1,
          runtimeId: 'mccSteam',
          platform: 'windows',
          runtimeBuild: null,
          networkVersion: null,
          executableSha256: null,
          mode: 'mccCustomMultiplayer',
          antiCheatDisabled: null,
          map: { sha256: 'a'.repeat(64), cacheVersion: 7, scenarioType: 1 },
          resources: [],
          packageSha256: null,
          sourceSha256: 'a'.repeat(64),
          buildToolVersion: null,
          buildVerified: false,
          resourceSetVerified: false,
        };
        if (command === 'create_peer_manifest' || command === 'choose_peer_manifest') return manifest;
        if (command === 'compare_peer_manifest')
          return {
            schemaVersion: 1,
            status: 'blocked',
            scope: 'manifestComparisonOnly',
            gameplayVerified: false,
            checks: [{ key: 'buildProof', status: 'blocked', detail: 'Synthetic missing proof' }],
            diagnostics: [],
          };
        throw new Error(`Unexpected synthetic IPC call: ${command}`);
      },
    };
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'One Halo. Every World. Every Tool. Together.' })).toBeVisible();
}
async function openFixture(page: Page) {
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: 'Synthetic baseline', exact: true }) })
    .click();
  await chooseTool(page,"Tag editor");
  await expect(page.getByRole('heading', { name: 'test', exact: true })).toBeVisible();
}


test('one Learning center retains guides, glossary and Academy while returning to edited maps',async({page})=>{
  await mockDesktop(page);await openFixture(page);
  const field=page.getByRole('spinbutton',{name:'Velocity',exact:true});await field.fill('27');await field.press('Tab');
  await chooseTool(page,'Learning center');
  await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();
  const drawer=page.locator('.gs-navigation-drawer');
  await expect(drawer.getByRole('button',{name:'Learning center',exact:true})).toHaveCount(1);
  await expect(drawer.getByRole('button',{name:'How-to & Glossary',exact:true})).toHaveCount(0);
  await expect(drawer.getByRole('button',{name:'Modding Academy',exact:true})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tablist',{name:'Learning sections'}).getByRole('tab')).toHaveCount(3);
  await page.getByRole('button',{name:'Convert a classic map to MCC',exact:true}).click();
  await page.getByRole('button',{name:'Open Build & playtest',exact:true}).click();
  await expect(page.getByRole('heading',{name:'From archive to in-game.',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back to previous workspace',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Convert a classic map to MCC',exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Glossary',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search glossary',exact:true}).fill('Race vehicle');
  await expect(page.locator('.gs-glossary dt')).toHaveText(['Race vehicle and teleporter flags']);
  await page.getByRole('tab',{name:'Academy',exact:true}).click();
  await page.getByRole('button',{name:/07 Halo Modding Brain: the original magic/}).click();
  await expect(page.locator('.gs-lesson-intro h2')).toHaveText('07 Halo Modding Brain: the original magic');
  await expect(page.locator('.gs-legacy-lab')).toHaveCount(0);
  await page.getByText('Classic workflows & companion tools',{exact:true}).click();
  const techniques=page.getByRole('group',{name:'Classic Halo modding technique',exact:true});
  await expect(techniques).toBeVisible();await techniques.getByRole('button').nth(1).click();
  const technique=await techniques.locator('[aria-pressed="true"]').textContent();
  await page.getByText('Classic workflows & companion tools',{exact:true}).click();
  await page.getByText('Classic workflows & companion tools',{exact:true}).click();
  await expect(techniques.locator('[aria-pressed="true"]')).toHaveText(technique!);
  await page.getByRole('button',{name:'Pop out lesson',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.calls.filter((c:any)=>c.command==='open_workspace_window').at(-1)?.args)).toEqual({workspace:'academy',context:'legacyPhilosophy'});
  await chooseTool(page,'Tag editor');await expect(field).toHaveValue('27');
  await page.getByRole('button',{name:'Back to previous workspace',exact:true}).click();
  await expect(page.getByRole('tab',{name:'Academy',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('.gs-lesson-intro h2')).toHaveText('07 Halo Modding Brain: the original magic');
  await page.getByRole('tab',{name:'Glossary',exact:true}).click();
  await expect(page.getByRole('searchbox',{name:'Search glossary',exact:true})).toHaveValue('Race vehicle');
  await page.getByRole('searchbox',{name:'Search glossary',exact:true}).fill('zzzz-unavailable');await expect(page.getByText('No matching terms. Try a shorter word or clear the search.')).toBeVisible();
  await page.getByRole('button',{name:'Clear search',exact:true}).click();expect(await page.locator('.gs-glossary dt').count()).toBe(50);
  await page.reload();await chooseTool(page,'Learning center');
  await expect(page.getByRole('tab',{name:'Glossary',exact:true})).toHaveAttribute('aria-selected','true');
  await page.getByRole('tab',{name:'Guides',exact:true}).focus();await page.keyboard.press('End');
  await expect(page.getByRole('tab',{name:'Academy',exact:true})).toBeFocused();
  await page.getByRole('tab',{name:'Guides',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Convert a classic map to MCC',exact:true})).toBeVisible();
  await page.setViewportSize({width:800,height:650});
  expect(await page.locator('.learning-center').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
});

test('each workspace exposes one pop-out and retains Learning and Settings sections',async({page})=>{
  await mockDesktop(page);
  const routes:[string,string][]=[['Map library','library'],['Start here','get-started'],['Features & workflows','features'],['Learning center','learning'],['Community maps','map-finder'],['Community Thanks','community'],['Compare variants','compare'],['Firefight rules','firefight'],['Creator Studio','creator'],['Build & playtest','build'],['Online','runtimes'],['Asset workshop','assets'],['AI & scenario','scenario'],['Machinima','machinima'],['Tag editor','tags'],['Level editor','quickforge'],['Preservation record','preservation'],['Settings & tools','settings']];
  for(const [name,workspace] of routes){
    await chooseTool(page,name);const popout=page.getByRole('button',{name:'Pop out workspace',exact:true});await expect(popout).toHaveCount(1);await popout.click();
    await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.calls.filter((call:any)=>call.command==='open_workspace_window').at(-1)?.args.workspace)).toBe(workspace);
  }
  await page.getByRole('tab',{name:'Dependencies & setup',exact:true}).click();await page.getByRole('button',{name:'Pop out workspace',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.calls.filter((call:any)=>call.command==='open_workspace_window').at(-1)?.args)).toEqual({workspace:'settings',section:'dependencies',context:null});
  await page.getByRole('tab',{name:'Interface Studio',exact:true}).click();await page.getByRole('button',{name:'Pop out workspace',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.calls.filter((call:any)=>call.command==='open_workspace_window').at(-1)?.args)).toEqual({workspace:'settings',section:'interface',context:null});
  await chooseTool(page,'Learning center');await page.getByRole('tab',{name:'Glossary',exact:true}).click();await page.getByRole('button',{name:'Pop out workspace',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.calls.filter((call:any)=>call.command==='open_workspace_window').at(-1)?.args)).toEqual({workspace:'learning',section:'glossary',context:null});
});

test('popping out a map editor saves the focused edit before transferring its document',async({page})=>{
  await mockDesktop(page);await openFixture(page);
  await page.evaluate(()=>{(window as any).__sparkMock.enforceTransfer=true;});
  const field=page.getByRole('spinbutton',{name:'Velocity',exact:true});await field.fill('28');
  await page.getByRole('button',{name:'Pop out workspace',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.saved?.tagEdits?.[0]?.value)).toBe(28);
  await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.calls.findIndex((call:any)=>call.command==='open_project_window'))).toBeGreaterThan(0);
  const calls=await page.evaluate(()=>(window as any).__sparkMock.calls);
  const move=calls.findIndex((call:any)=>call.command==='open_project_window');expect(move).toBeGreaterThan(0);
  expect(calls.slice(0,move).some((call:any)=>call.command==='save_project')).toBe(true);
  expect(calls[move].args).toEqual({id:'a',workspace:'tags'});
  await expect(page.getByRole('heading',{name:'One Halo. Every World. Every Tool. Together.',exact:true})).toBeVisible();
  const afterTransfer=await page.evaluate(()=>(window as any).__sparkMock.calls);
  expect(afterTransfer.slice(move+1).filter((call:any)=>call.command==='commit_workspace_history')).toEqual([]);
  await expect(page.getByText('Editing moved to another window',{exact:true})).toHaveCount(0);
});

test('explicit pop-out routes survive completed onboarding and legacy help links stay usable',async({page})=>{
  await mockDesktop(page);
  await page.evaluate(()=>localStorage.setItem('spark-test-settings',JSON.stringify({onboardingCompleted:true})));
  await page.goto('/?workspace=get-started');await expect(page.getByRole('heading',{name:'Your workbench is ready',exact:true})).toBeVisible();
  await page.goto('/?workspace=settings&section=dependencies');await expect(page.getByRole('tab',{name:'Dependencies & setup',exact:true})).toHaveAttribute('aria-selected','true');
  await page.goto('/?workspace=learning&section=glossary');await expect(page.getByRole('tab',{name:'Glossary',exact:true})).toHaveAttribute('aria-selected','true');
  await page.goto('/?workspace=academy&lesson=legacyPhilosophy');await expect(page.locator('.gs-lesson-intro h2')).toHaveText('07 Halo Modding Brain: the original magic');
  await page.goto('/?workspace=how-to');await expect(page.getByRole('tab',{name:'Guides',exact:true})).toHaveAttribute('aria-selected','true');
});

test('one Back and Forward pair restores the workflow without undoing project edits',async({page})=>{
  await mockDesktop(page);await openFixture(page);
  const field=page.getByRole('spinbutton',{name:'Velocity',exact:true});await field.fill('27');await field.press('Tab');
  const back=page.getByRole('button',{name:'Back to previous workspace',exact:true}),forward=page.getByRole('button',{name:'Forward to next workspace',exact:true});
  for(const name of ['Compare variants','Firefight rules','Creator Studio','Build & playtest','Online','Settings & tools','Learning center','Tag editor']){
    await chooseTool(page,name);await expect(back).toHaveCount(1);await expect(forward).toHaveCount(1);
    await expect(page.locator('.gs-workspace-tools').getByRole('button',{name:'Undo (Ctrl+Z)',exact:true})).toHaveCount(0);
  }
  await expect(field).toHaveValue('27');await chooseTool(page,'Map library');await chooseTool(page,'Features & workflows');
  await back.click();await expect(page.getByRole('heading',{name:'One Halo. Every World. Every Tool. Together.',exact:true})).toBeVisible();
  await back.click();await expect(field).toHaveValue('27');
  await expect(forward).toHaveAttribute('title',/Map library/);
  await forward.click();await expect(page.getByRole('heading',{name:'One Halo. Every World. Every Tool. Together.',exact:true})).toBeVisible();
  await forward.click();await expect(forward).toBeDisabled();
  await page.keyboard.press('Alt+ArrowLeft');await expect(page.getByRole('heading',{name:'One Halo. Every World. Every Tool. Together.',exact:true})).toBeVisible();
  await page.keyboard.press('Alt+ArrowLeft');await expect(field).toHaveValue('27');
  await page.keyboard.press('Control+z');await expect(field).toHaveValue('10');await page.keyboard.press('Control+y');await expect(field).toHaveValue('27');
  await openDrawer(page,'Changes');
  const changes=page.getByRole('region',{name:'Changes panel',exact:true});await expect(changes.getByRole('group',{name:'Project edit history',exact:true})).toBeVisible();
  await changes.getByRole('button',{name:'Undo (Ctrl+Z)',exact:true}).click();await expect(field).toHaveValue('10');await page.keyboard.press('Control+y');await expect(field).toHaveValue('27');
  await page.getByRole('button',{name:'Close Changes',exact:true}).click();
  await chooseTool(page,'Community Thanks');await expect(forward).toBeDisabled();
});

test('workflow navigation restores each map draft and skips a closed map',async({page})=>{
  await mockDesktop(page);await openFixture(page);
  const field=page.getByRole('spinbutton',{name:'Velocity',exact:true});await field.fill('27');await field.press('Tab');
  await chooseTool(page,'Map library');await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic candidate',exact:true})}).click();
  await chooseTool(page,'Tag editor');await expect(field).toHaveValue('25');await field.fill('39');await field.press('Tab');
  await page.getByRole('tab',{name:/Synthetic baseline/}).click();await expect(field).toHaveValue('27');
  const back=page.getByRole('button',{name:'Back to previous workspace',exact:true}),forward=page.getByRole('button',{name:'Forward to next workspace',exact:true});
  await expect(back).toHaveAttribute('title',/Synthetic candidate/);await back.click();await expect(field).toHaveValue('39');
  await expect(page.getByRole('tab',{name:/Synthetic candidate/})).toHaveAttribute('aria-selected','true');
  await forward.click();await expect(field).toHaveValue('27');
  await page.getByRole('button',{name:'Save and close Synthetic candidate',exact:true}).click();await expect(page.getByRole('tab',{name:/Synthetic candidate/})).toHaveCount(0);
  await back.click();await expect(page.getByRole('heading',{name:'One Halo. Every World. Every Tool. Together.',exact:true})).toBeVisible();
});

test('workflow navigation includes settings tabs and commits a typed field before keyboard Back',async({page})=>{
  await mockDesktop(page);await openFixture(page);await chooseTool(page,'Settings & tools');
  const tools=page.getByRole('tab',{name:'Games & tools',exact:true}),deps=page.getByRole('tab',{name:'Dependencies & setup',exact:true});
  await deps.click();await expect(deps).toHaveAttribute('aria-selected','true');await page.keyboard.press('Alt+ArrowLeft');await expect(tools).toHaveAttribute('aria-selected','true');
  await page.keyboard.press('Alt+ArrowRight');await expect(deps).toHaveAttribute('aria-selected','true');
  await chooseTool(page,'Tag editor');const field=page.getByRole('spinbutton',{name:'Velocity',exact:true});await field.fill('28');
  await page.keyboard.press('Alt+ArrowLeft');await expect(deps).toHaveAttribute('aria-selected','true');await page.keyboard.press('Alt+ArrowRight');await expect(field).toHaveValue('28');
});

test('C35 drawers remember each workspace and fullscreen preserves editing tools',async({page})=>{
 await page.setViewportSize({width:1280,height:720});await mockDesktop(page);
 await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})}).click();
 const viewport=page.getByTestId('viewport');await expect(viewport).toBeVisible();
 await expect(page.locator('.gs-navigation-drawer')).toBeHidden();const original=await viewport.boundingBox();
 await openDrawer(page,'Inspector');await expect(page.getByRole('region',{name:'Inspector panel',exact:true})).toBeVisible();
 const overlaid=await viewport.boundingBox();expect(overlaid!.width).toBeCloseTo(original!.width,0);
 await page.getByLabel('Inspector drawer options',{exact:true}).click();await page.getByLabel('Inspector position').selectOption('float');await page.getByLabel('Inspector size').fill('430');
 await page.getByLabel('Inspector drawer options',{exact:true}).click();
 await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();await chooseTool(page,"Tag editor");await expect(page.getByRole('region',{name:'Inspector panel',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();await chooseTool(page,"Level editor");await expect(page.getByRole('region',{name:'Inspector panel',exact:true})).toBeVisible();await expect(page.getByLabel('Inspector position')).toHaveValue('float');
 await expect(page.getByRole('button',{name:'Focus mode',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Fullscreen editing',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-gs-fullscreen','true');
 await expect(page.getByRole('region',{name:'Inspector panel',exact:true})).toBeVisible();await expect(page.getByRole('tablist',{name:'Open maps',exact:true})).toBeVisible();await expect(page.locator('.viewport-toolbar')).toBeVisible();await expect(page.locator('.runtime-dock')).toBeVisible();
 const full=await viewport.boundingBox();expect(full!.height).toBeGreaterThan(original!.height+8);
 const windowButtons=await page.getByRole('group',{name:'Window controls',exact:true}).boundingBox();expect(windowButtons!.y).toBeLessThanOrEqual(6);
 await page.keyboard.press('Escape');await expect(page.getByRole('region',{name:'Inspector panel',exact:true})).toBeHidden();await expect(page.locator('html')).toHaveAttribute('data-gs-fullscreen','true');
 await page.keyboard.press('Escape');await expect(page.locator('html')).toHaveAttribute('data-gs-fullscreen','false');await openDrawer(page,'Inspector');await expect(page.getByRole('region',{name:'Inspector panel',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close Inspector',exact:true}).click();await expect(page.getByRole('region',{name:'Inspector panel',exact:true})).toBeHidden();
});

test('object tags open in a hideable drawer without changing workspace, camera layout or history',async({page})=>{
 await mockDesktop(page);await page.evaluate(()=>{const open=(window as any).__sparkMock.projects.a;open.project.scene=[{id:'test-object',name:'Selected test weapon',kind:'Weapon',tagId:1,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,sourceOffset:8,rotationOffset:null,assetId:null}];open.inspection.objects=structuredClone(open.project.scene);});
 await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})}).click();
 const viewport=page.getByTestId('viewport'),before=await viewport.boundingBox();
 await openDrawer(page,'Objects');
 await page.getByRole('button',{name:'Selected test weapon',exact:true}).click();
 const drawer=page.getByRole('region',{name:'Object tags panel',exact:true});await expect(drawer).toBeVisible();
 await expect(drawer.getByLabel('Velocity',{exact:true})).toBeVisible();
 expect(await viewport.boundingBox()).toEqual(before);await expect(page.getByRole('combobox',{name:'Editing target',exact:true})).toBeVisible();
 const value=drawer.getByLabel('Velocity',{exact:true});await value.fill('23');await value.press('Enter');
 await page.getByRole('button',{name:'Close Object tags',exact:true}).click();await expect(drawer).toBeHidden();
 await openDrawer(page,'Object tags');await expect(drawer.getByLabel('Velocity',{exact:true})).toHaveValue('23');expect(await viewport.boundingBox()).toEqual(before);
 await page.keyboard.press('Control+z');await expect(value).toHaveValue('10');await page.keyboard.press('Control+y');await expect(value).toHaveValue('23');
 await page.getByRole('button',{name:'Close Object tags',exact:true}).click();await page.getByRole('button',{name:'Fullscreen editing',exact:true}).click();
 await openDrawer(page,'Object tags');await expect(drawer).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-gs-fullscreen','true');
});

test('object tag dependencies stay selected through session updates until a new object request',async({page})=>{
 await mockDesktop(page);await page.evaluate(()=>{const open=(window as any).__sparkMock.projects.a;open.project.scene=[{id:'dependency-object',name:'Dependency test weapon',kind:'Weapon',tagId:1,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,sourceOffset:8,rotationOffset:null,assetId:null}];open.inspection.objects=structuredClone(open.project.scene);open.inspection.tags[0].references=[{label:'Model',targetId:2}];open.inspection.tags.push({id:2,index:1,class:'mod2',path:'models/dependency',external:false,fields:[],references:[]});});
 await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})}).click();
 await openDrawer(page,'Objects');await page.getByRole('button',{name:'Dependency test weapon',exact:true}).click();
 const drawer=page.getByRole('region',{name:'Object tags panel',exact:true});
 await drawer.getByRole('button',{name:'Model → dependency',exact:true}).click();await expect(drawer.locator('.viewport-tag-path')).toHaveText('models/dependency');
 await page.getByRole('slider',{name:'Map sound volume',exact:true}).fill('0.52');await expect(drawer.locator('.viewport-tag-path')).toHaveText('models/dependency');
 await drawer.getByRole('button',{name:'Back to object tag',exact:true}).click();await expect(drawer.getByLabel('Velocity',{exact:true})).toBeVisible();
});

test('map audio preferences survive tag drawers, fullscreen and map switches independently',async({page})=>{
 await mockDesktop(page);await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})}).click();
 const volume=page.getByRole('slider',{name:'Map sound volume',exact:true});await expect(volume).toHaveValue('0.35');
 await volume.fill('0.61');await page.getByRole('button',{name:'Mute map sounds',exact:true}).click();await expect(page.getByRole('button',{name:'Unmute map sounds',exact:true})).toHaveAttribute('aria-pressed','true');
 await openDrawer(page,'Object tags');await expect(page.getByRole('region',{name:'Object tags panel',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close Object tags',exact:true}).click();await expect(volume).toHaveValue('0.61');
 await page.keyboard.press('F11');await expect(volume).toBeInViewport();await expect(page.getByRole('button',{name:'Unmute map sounds',exact:true})).toBeInViewport();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();await chooseTool(page,'Map library');await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic candidate',exact:true})}).click();
 await expect(volume).toHaveValue('0.35');await expect(page.getByRole('button',{name:'Mute map sounds',exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Synthetic baseline',exact:true}).click();await expect(volume).toHaveValue('0.61');await expect(page.getByRole('button',{name:'Unmute map sounds',exact:true})).toBeVisible();
});

test('cross-map model placement opens source tags and keeps undo and save in that source map',async({page})=>{
 await mockDesktop(page);await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic candidate',exact:true})}).click();
 await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();await chooseTool(page,'Map library');await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})}).click();
 await openDrawer(page,'Asset library');
 const library=page.getByRole('region',{name:'Asset library panel',exact:true});await library.getByLabel('Asset library map',{exact:true}).selectOption('b');
 await expect(page.getByTestId('viewport').locator('canvas')).toBeVisible();
 await library.getByRole('button',{name:'Add test at view',exact:true}).click();await expect(page.locator('.viewport-object-actions strong')).toHaveText('test');
 await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.calls.filter((call: any)=>call.command==='prepare_native_asset_import').length)).toBe(1);
 await page.getByRole('button',{name:'Close Asset library',exact:true}).click();await page.locator('.viewport-object-actions').getByRole('button',{name:'Object tags',exact:true}).click();
 const tags=page.getByRole('region',{name:'Object tags panel',exact:true});await expect(tags).toContainText('Synthetic candidate');const value=tags.getByLabel('Velocity',{exact:true});await expect(value).toHaveValue('25');await value.fill('39');await value.press('Enter');await value.focus();await page.keyboard.press('Control+z');await expect(value).toHaveValue('25');await value.focus();await page.keyboard.press('Control+y');await expect(value).toHaveValue('39');await value.focus();await expect(value).toBeFocused();await page.keyboard.press('Control+s');
 await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.saved?.id)).toBe('b');await expect(page.getByRole('tab',{name:'Synthetic baseline',exact:true})).toHaveAttribute('aria-selected','true');
});

test('Ctrl+S commits a focused donor-tag draft into its own project without changing the active map',async({page})=>{
 await mockDesktop(page);await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic candidate',exact:true})}).click();
 await chooseTool(page,'Map library');await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})}).click();
 await openDrawer(page,'Asset library');
 const library=page.getByRole('region',{name:'Asset library panel',exact:true});await library.getByLabel('Asset library map',{exact:true}).selectOption('b');
 await library.getByRole('button',{name:'Add test at view',exact:true}).click();
 await page.getByRole('button',{name:'Close Asset library',exact:true}).click();await page.locator('.viewport-object-actions').getByRole('button',{name:'Object tags',exact:true}).click();
 const tags=page.getByRole('region',{name:'Object tags panel',exact:true});await expect(tags).toContainText('Synthetic candidate');
 await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.projects.a.project.scene.length)).toBe(1);
 const activeBefore=await page.evaluate(()=>JSON.stringify((window as any).__sparkMock.projects.a.project));
 const value=tags.getByRole('spinbutton',{name:'Velocity',exact:true});await value.fill('43');await value.press('Control+s');
 await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.projects.b.project.tagEdits[0]?.value)).toBe(43);
 await expect(page.getByRole('tab',{name:'Synthetic baseline',exact:true})).toHaveAttribute('aria-selected','true');
 expect(await page.evaluate(()=>JSON.stringify((window as any).__sparkMock.projects.a.project))).toBe(activeBefore);
 await expect(value).toBeFocused();
});

test('Find tools exposes downloads and explicit registered app launch while preserving the edited map',async({page})=>{
 await mockDesktop(page);await openFixture(page);
 const value=page.getByRole('spinbutton',{name:'Velocity',exact:true});await value.fill('37');await value.press('Tab');
 await page.evaluate(()=>{
   const w=window as any,original=w.__TAURI_INTERNALS__.invoke;let selected=false;
   w.__sparkToolLaunches=[];
   w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
     if(command==='tool_ecosystem_report')return {projectId:args.projectId,context:{runtimeId:args.runtimeId,sourceKind:'classicCache',ownedNativeTags:false,host:'windows'},sourceIssue:null,tools:[
       {definition:{id:'guerilla',label:'Guerilla',mode:'externalGui',integration:'sourceHandoff',purpose:'Native tag editor',caveat:'Managed map source is separate',maintainer:'Official',sourceUrl:'https://learn.microsoft.com/en-us/halo-master-chief-collection/',license:'Separate install',inputs:['nativeH1'],platforms:['windows'],runtimes:['mccSteam'],handler:'editTags'},assessment:{state:'sourceUnsupported',executableFound:true,canUseWorkflow:false,detail:'Launch app or build source'},executable:'C:/synthetic/guerilla.exe'},
       {definition:{id:'reclaimer',label:'Reclaimer',mode:'sourceHandoff',integration:'upstreamOnly',purpose:'Inspect assets',caveat:'No managed handoff',maintainer:'Community',sourceUrl:'https://github.com/Gravemind2401/Reclaimer',releaseUrl:'https://github.com/Gravemind2401/Reclaimer/releases',license:'Separate install',inputs:['cache'],platforms:['windows'],runtimes:[],handler:'research'},assessment:{state:'researchOnly',executableFound:false,canUseWorkflow:false,detail:'Launch support is separate from map handoff'},executable:null,userLauncher:selected?{path:'C:/synthetic/Reclaimer.exe',sha256:'a'.repeat(64),architecture:'x86_64',available:true}:null}
     ]};
     if(command==='choose_tool_launcher'){selected=true;return {available:true};}
     if(command==='launch_discovered_tool'){w.__sparkToolLaunches.push(args);return 'Opened selected application';}
     if(command==='open_external_url')return null;
     return original(command,args);
   };
 });
 await page.getByRole('button',{name:/Find tools/}).click();
 const finder=page.getByRole('dialog');await expect(finder.getByRole('button',{name:'Launch Guerilla',exact:true})).toBeEnabled();
 await expect(finder.getByRole('link',{name:'Get Guerilla',exact:true})).toHaveAttribute('href','https://learn.microsoft.com/en-us/halo-master-chief-collection/');
 await finder.getByRole('textbox',{name:'Search workspaces'}).fill('Reclaimer');
 await expect(finder.getByRole('link',{name:'Get Reclaimer',exact:true})).toHaveAttribute('href','https://github.com/Gravemind2401/Reclaimer/releases');
 await finder.getByRole('button',{name:'Locate Reclaimer',exact:true}).click();
 await expect(finder.getByRole('button',{name:'Launch Reclaimer',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>(window as any).__sparkToolLaunches)).toEqual([]);
 await finder.getByRole('button',{name:'Launch Reclaimer',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__sparkToolLaunches)).toEqual([{runtimeId:'mccSteam',projectId:'a',toolId:'reclaimer'}]);
 await page.keyboard.press('Escape');await expect(value).toHaveValue('37');
});

test('C35 empty Level editor asks for an editing context without assuming an installed MCC map',async({page})=>{
 await mockDesktop(page);await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();await chooseTool(page,"Level editor");
 await expect(page.getByRole('heading',{name:'What would you like to work on?',exact:true})).toBeVisible();
 for(const label of['Open a Halo map','Create a new Halo level','Connect to a running Halo game'])await expect(page.getByRole('button',{name:label,exact:true})).toBeVisible();
});

test('one compact header contains map tabs and lowered reachable window actions',async({page})=>{
 await page.setViewportSize({width:1280,height:720});await mockDesktop(page);await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})}).click();
 const header=page.locator('#gs-window-header');await expect(header).toBeVisible();expect((await header.boundingBox())!.height).toBeLessThanOrEqual(40);
 await expect(header.getByRole('tablist',{name:'Open maps',exact:true})).toBeVisible();await expect(page.locator('.main-content > .map-tab-bar')).toHaveCount(0);
 for(const label of ['Window','Focus mode','Collapse top bar','Show top bar'])await expect(page.getByRole('button',{name:label,exact:true})).toHaveCount(0);
 const controls=await page.getByRole('group',{name:'Window controls',exact:true}).boundingBox();const headerBox=await header.boundingBox();expect(Math.abs((controls!.y+controls!.height/2)-(headerBox!.y+headerBox!.height/2))).toBeLessThanOrEqual(1);expect(controls!.height).toBeLessThanOrEqual(28);await page.getByRole('button',{name:'Close window',exact:true}).click({trial:true});
 await expect(header.getByRole('button',{name:/Find tools/})).toBeVisible();
});

test('narrow workspaces expose every drawer and Escape closes its options before the drawer',async({page})=>{
 await page.setViewportSize({width:880,height:720});await mockDesktop(page);
 await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})}).click();
 const viewport=page.getByTestId('viewport'),before=await viewport.boundingBox();
 await page.getByLabel('More workspace drawers',{exact:true}).click();
 await page.getByRole('menuitemcheckbox',{name:'Object tags',exact:true}).click();
 const drawer=page.getByRole('region',{name:'Object tags panel',exact:true});await expect(drawer).toBeVisible();expect(await viewport.boundingBox()).toEqual(before);
 await page.getByLabel('Object tags drawer options',{exact:true}).click();await expect(page.getByLabel('Object tags position',{exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByLabel('Object tags position',{exact:true})).toBeHidden();await expect(drawer).toBeVisible();
 await page.keyboard.press('Escape');await expect(drawer).toBeHidden();expect(await viewport.boundingBox()).toEqual(before);
});

test('the single header reserves map-tab space and keeps overflow drawers reachable after portal mounting',async({page},testInfo)=>{
 await mockDesktop(page);await openFixture(page);await chooseTool(page,'Level editor');
 await chooseTool(page,'Map library');await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic candidate',exact:true})}).click();await chooseTool(page,'Level editor');
 await expect(page.getByRole('tab',{name:'Synthetic candidate',exact:true})).toHaveAttribute('aria-selected','true');
 for(const width of [1920,1440,1280,960,880]){
  await page.setViewportSize({width,height:800});
  const header=page.locator('#gs-window-header');
  await expect.poll(()=>header.evaluate(element=>{
   const rect=element.getBoundingClientRect(),children=[...element.children].map(child=>child.getBoundingClientRect()).filter(child=>child.width>0&&child.height>0);
   return children.every((child,index)=>child.left>=rect.left-1&&child.right<=rect.right+1&&(!index||children[index-1].right<=child.left+1));
  })).toBe(true);
  const tabs=page.getByRole('tablist',{name:'Open maps',exact:true}),active=page.getByRole('tab',{name:'Synthetic candidate',exact:true});
  const bar=await page.locator('.map-tab-bar').boundingBox();expect(bar!.width).toBeGreaterThanOrEqual(168);
  await expect.poll(async()=>{const list=await tabs.boundingBox(),button=await active.locator('..').boundingBox();return button!.x>=list!.x-1&&button!.x+button!.width<=list!.x+list!.width+1;}).toBe(true);
  const more=page.getByLabel('More workspace drawers',{exact:true});await expect(more).toBeVisible();await more.click();
  const menu=page.getByRole('menu',{name:'Workspace drawers',exact:true});await expect(menu).toBeInViewport();
  await menu.getByRole('menuitemcheckbox',{name:'Object tags',exact:true}).click();await expect(page.getByRole('region',{name:'Object tags panel',exact:true})).toBeVisible();
  await expect(active).toHaveAttribute('aria-selected','true');await page.keyboard.press('Escape');
  if(width===1920||width===880)await page.screenshot({path:testInfo.outputPath(`header-space-${width}.png`)});
 }
});

test('Maps and Tools menus keep full names, exclusive popups and each map edit',async({page})=>{
 await mockDesktop(page);await openFixture(page);
 const value=page.getByRole('spinbutton',{name:'Velocity',exact:true});await value.fill('41');await value.press('Tab');
 await chooseTool(page,'Level editor');await chooseTool(page,'Map library');
 await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic candidate',exact:true})}).click();await chooseTool(page,'Level editor');
 const maps=page.getByLabel('Choose open map',{exact:true}),tools=page.getByLabel('More workspace drawers',{exact:true});
 await tools.click();await expect(page.getByRole('menu',{name:'Workspace drawers'}).getByRole('group',{name:'Edit & inspect'})).toBeVisible();
 await maps.click();await expect(page.getByRole('menu',{name:'Workspace drawers'})).toBeHidden();
 const menu=page.getByRole('menu',{name:'Open map switcher'});await expect(menu.getByRole('menuitemradio')).toHaveCount(2);
 await menu.getByRole('searchbox',{name:'Search open maps'}).fill('baseline');await expect(menu.getByRole('menuitemradio')).toHaveCount(1);
 await expect(page.getByRole('tab',{name:'Synthetic candidate',exact:true})).toHaveAttribute('aria-selected','true');
 await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(maps).toBeFocused();
 await maps.click();await menu.getByRole('searchbox',{name:'Search open maps'}).fill('baseline');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 await expect(page.getByRole('tab',{name:/Synthetic baseline/})).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('tab',{name:/Synthetic baseline/})).toBeFocused();
 await chooseTool(page,'Tag editor');await expect(value).toHaveValue('41');
 await tools.click();await expect(menu).toBeHidden();await page.keyboard.press('Escape');await expect(tools).toBeFocused();
});

test('the Spark corner visual clears the curved frame and stays above window glass without blocking input',async({page})=>{
 await mockDesktop(page);
 await page.evaluate(()=>{document.documentElement.style.setProperty('--gs-window-opacity','.35');document.documentElement.style.setProperty('--gs-window-tint-strength','.5');});
 const emblem=page.locator('.gs-spark-emblem'),button=page.getByRole('button',{name:'Toggle workspace navigation',exact:true});
 await expect(emblem).toHaveCSS('opacity','1');await expect(page.locator('.gs-window-content')).toHaveCSS('opacity','0.35');
 expect(await emblem.evaluate(element=>element.parentElement===document.body)).toBe(true);
 await expect(emblem).toHaveCSS('pointer-events','none');
 await expect(button).toHaveCSS('margin-left','0px');
 for(const width of [1440,960]){
  await page.setViewportSize({width,height:800});
  await expect.poll(async()=>{const mark=await emblem.boundingBox(),hit=await button.boundingBox();return !!mark&&!!hit&&Math.abs(mark.x-Math.max(0,hit.x-24))<1&&Math.abs(mark.y-Math.max(0,hit.y-24))<1&&mark.x>=0&&mark.y>=0&&mark.x+mark.width<=width;}).toBe(true);
  if(await button.getAttribute('aria-expanded')!=='true')await button.click();
  await expect(page.locator('.gs-navigation-drawer')).toBeVisible();
  await button.click();await expect(page.locator('.gs-navigation-drawer')).toBeHidden();
  await page.getByRole('button',{name:'HOME',exact:true}).click();await expect(page.locator('.library-page')).toBeVisible();
 }
});

test('tag classes expand their matching tags and keep the selected editor when folded',async({page})=>{
 await mockDesktop(page);await openFixture(page);
 const group=page.getByRole('button',{name:/class \(weap\)/});await expect(group).toHaveAttribute('aria-expanded','true');
 await expect(page.getByLabel('Velocity',{exact:true})).toBeVisible();
 await group.click();await expect(group).toHaveAttribute('aria-expanded','false');await expect(page.getByLabel('Velocity',{exact:true})).toBeVisible();
 await group.click();await expect(page.getByRole('group',{name:'Weapon tags',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Collapse all classes',exact:true}).click();await expect(page.locator('.tag-row')).toHaveCount(0);
 await page.getByLabel('Search tags',{exact:true}).fill('test');await expect(group).toHaveAttribute('aria-expanded','true');await expect(page.locator('.tag-row')).toHaveCount(1);
 await page.locator('.tag-row').click();await expect(page.getByLabel('Velocity',{exact:true})).toHaveValue('10');
 await page.getByText('Complete native tag editing',{exact:true}).click();await expect(page.getByRole('button',{name:'Open native tag editor',exact:true})).toBeVisible();
});

test('custom tag names stay map-owned, saved and undoable without changing source IDs',async({page})=>{
  await mockDesktop(page);await openFixture(page);
  const rename=page.locator('.tag-detail .tag-rename-panel');await rename.locator('summary').click();
  await rename.getByRole('textbox',{name:'Custom tag name',exact:true}).fill('My custom pistol');
  await rename.getByRole('button',{name:'Rename tag',exact:true}).click();
  await expect(page.locator('.tag-detail-heading h2')).toHaveText('My custom pistol');
  await expect(page.locator('.tag-row[aria-pressed=true]')).toContainText('My custom pistol');
  await page.keyboard.press('Control+z');await expect(page.locator('.tag-detail-heading h2')).toHaveText('test');
  await page.keyboard.press('Control+y');await expect(page.locator('.tag-detail-heading h2')).toHaveText('My custom pistol');
  await page.keyboard.press('Control+s');
  await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.saved?.tagRenames)).toEqual([{sourceTagId:1,path:'weapons/My custom pistol'}]);
  expect(await page.evaluate(()=>(window as any).__sparkMock.projects.a.inspection.tags[0].path)).toBe('weapons/test');
  await chooseTool(page,'Compare variants');await chooseTool(page,'Tag editor');
  await expect(page.locator('.tag-detail-heading h2')).toHaveText('My custom pistol');
  await rename.locator('summary').click();
  await rename.getByRole('textbox',{name:'Custom tag name',exact:true}).fill('../escape');
  await rename.getByRole('button',{name:'Rename tag',exact:true}).click();
  await expect(rename.getByRole('alert')).toContainText('relative tag path');
});

test('ordinary save consumes its project receipt without bootstrapping unrelated state',async({page})=>{
  await mockDesktop(page);await openFixture(page);
  const value=page.getByLabel('Velocity',{exact:true});
  await value.fill('31');
  const before=await page.evaluate(()=>(window as any).__sparkMock.calls.filter((row:any)=>row.command==='bootstrap').length);
  await value.press('Control+s');
  await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.saved?.tagEdits[0]?.value)).toBe(31);
  await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__sparkMock.calls.filter((row:any)=>row.command==='bootstrap').length)).toBe(before);
  await chooseTool(page,'Map library');
  await expect(page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})})).toContainText('Synthetic baseline');
  await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})}).click();
  await chooseTool(page,'Tag editor');await expect(value).toHaveValue('31');
  await page.keyboard.press('Control+z');await expect(value).toHaveValue('10');
});

test('switching tags never leaves a duplicate panel from the previous tag',async({page})=>{
 await mockDesktop(page);await page.evaluate(()=>{const tags=(window as any).__sparkMock.projects.a.inspection.tags,tag=structuredClone(tags[0]);tag.id=501;tag.index=501;tag.path='weapons/alternate';tags.push(tag);});await openFixture(page);
 await expect(page.locator('.tag-duplicate-panel')).toHaveCount(1);
 await page.locator('.tag-row').filter({has:page.getByText('alternate',{exact:true})}).click();
 await expect(page.locator('.tag-duplicate-panel')).toHaveCount(1);await expect(page.getByLabel('Duplicate tag path',{exact:true})).toHaveValue('weapons/alternate_copy');
 await page.locator('.tag-row').filter({has:page.getByText('test',{exact:true})}).click();
 await expect(page.locator('.tag-duplicate-panel')).toHaveCount(1);await expect(page.getByLabel('Duplicate tag path',{exact:true})).not.toHaveValue('weapons/alternate_copy');
});

test('C35 F11 uses native fullscreen and Escape closes navigation before restoring editing',async({page})=>{
 await page.setViewportSize({width:1280,height:720});await mockDesktop(page);
 await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})}).click();
 const viewport=page.getByTestId('viewport');await expect(viewport).toBeVisible();const original=await viewport.boundingBox(),normalStrip=await page.getByRole('navigation',{name:'Workspace panels',exact:true}).boundingBox();
 await page.keyboard.press('F11');await expect(page.locator('html')).toHaveAttribute('data-gs-fullscreen','true');
 const full=await viewport.boundingBox();expect(full!.width).toBeGreaterThan(1240);expect(full!.height).toBeGreaterThan(original!.height);const fullStrip=await page.getByRole('navigation',{name:'Workspace panels',exact:true}).boundingBox();expect(fullStrip!.height).toBeLessThan(normalStrip!.height);expect(fullStrip!.height).toBeLessThanOrEqual(32);await expect(page.getByRole('button',{name:'Close window',exact:true})).toBeInViewport();await expect(page.getByRole('button',{name:'Exit fullscreen',exact:true})).toBeInViewport();await expect(page.getByRole('tablist',{name:'Open maps'})).toBeVisible();await expect(page.locator('.viewport-toolbar')).toBeVisible();await expect(page.locator('.runtime-dock')).toBeVisible();
 await page.mouse.move(100,2);await openDrawer(page,'Inspector');await expect(page.getByRole('region',{name:'Inspector panel',exact:true})).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-gs-fullscreen','true');await page.keyboard.press('Escape');await expect(page.getByRole('region',{name:'Inspector panel',exact:true})).toBeHidden();await expect(page.locator('html')).toHaveAttribute('data-gs-fullscreen','true');
 await page.keyboard.press('Control+Backslash');await expect(page.locator('.gs-navigation-drawer')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('.gs-navigation-drawer')).toBeHidden();await expect(page.locator('html')).toHaveAttribute('data-gs-fullscreen','true');
 await page.keyboard.press('Escape');await expect(page.locator('html')).toHaveAttribute('data-gs-fullscreen','false');
 await expect(page.getByRole('tab',{name:'Synthetic baseline',exact:true})).toBeVisible();
 const calls=await page.evaluate(()=>(window as any).__sparkMock.calls.filter((c:any)=>['plugin:window|set_fullscreen','plugin:window|set_fullscreen_on_monitor'].includes(c.command)).map((c:any)=>[c.command,c.args.value]));expect(calls).toEqual([['plugin:window|set_fullscreen_on_monitor',{type:'Physical',x:0,y:0}],['plugin:window|set_fullscreen',false]]);
});

test('drawers keep the existing themes and leave the map interactive without a screen cover',async({page})=>{
 await page.setViewportSize({width:1280,height:720});await mockDesktop(page);
 await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})}).click();
 for(const theme of ['dark-glow','covenant']){
  await page.evaluate(theme=>document.documentElement.dataset.gsTheme=theme,theme);
  await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();
  const drawer=page.locator('#gs-workspace-navigation');await expect(drawer).toBeVisible();
  await expect(page.locator('.gs-navigation-backdrop,.gs-header-backdrop')).toHaveCount(0);
  const viewport=page.getByTestId('viewport'),before=await viewport.boundingBox();
  const target={x:before!.x+before!.width*.75,y:before!.y+before!.height*.6};
  expect(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('[data-testid="viewport"]'),target)).toBe(true);
  if(theme==='covenant')expect(await drawer.evaluate(e=>getComputedStyle(e).backgroundImage)).toContain('linear-gradient');
  await page.mouse.click(target.x,target.y);await expect(drawer).toBeHidden();await expect(viewport).toBeVisible();
  const after=await viewport.boundingBox();expect(after).toEqual(before);
 }
 await expect(page.getByRole('button',{name:'Close window',exact:true})).toHaveCount(1);
});

test('fullscreen from maximized restores the original mode and keeps mouse window actions reachable',async({page})=>{
 await mockDesktop(page);await page.getByRole('button',{name:'Maximize window',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).__sparkMock.maximized)).toBe(true);
 await page.getByRole('button',{name:'Fullscreen editing',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-gs-fullscreen','true');
 expect(await page.evaluate(()=>(window as any).__sparkMock.maximized)).toBe(false);
 await expect(page.getByRole('button',{name:'Close window',exact:true})).toBeInViewport();
 await expect(page.locator('#gs-window-header')).toBeVisible();
 await expect(page.locator('#gs-window-header')).toBeVisible();
 await expect(page.getByRole('button',{name:'Close window',exact:true})).toHaveCount(1);
 await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-gs-fullscreen','false');
 expect(await page.evaluate(()=>(window as any).__sparkMock.maximized)).toBe(true);
 expect(await page.evaluate(()=>(window as any).__sparkMock.calls.filter((c:any)=>['plugin:window|unmaximize','plugin:window|set_fullscreen','plugin:window|set_fullscreen_on_monitor','plugin:window|maximize'].includes(c.command)).map((c:any)=>[c.command,c.args.value??null]))).toEqual([['plugin:window|unmaximize',null],['plugin:window|set_fullscreen_on_monitor',{type:'Physical',x:0,y:0}],['plugin:window|set_fullscreen',false],['plugin:window|maximize',null]]);
});

async function includeCommunityRuntime(page:Page){
  await page.evaluate(()=>{const w=window as any,original=w.__TAURI_INTERNALS__.invoke;w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
    const result=await original(command,args);
    return command==='runtime_report'?[...result,{...result[0],id:'openCe',name:'Synthetic OpenCE'}]:result;
  };});
}

async function mockBitmapRepair(page:Page){
 await page.addInitScript(()=>localStorage.setItem('spark-test-settings',JSON.stringify({hekFlavor:'h1aEk',hekDirectory:'kit',hekTagsDirectory:'sdk',invaderDirectory:'invader'})));
 await mockDesktop(page);await page.evaluate(()=>{const w=window as any,original=w.__TAURI_INTERNALS__.invoke,p=w.__sparkMock.projects.a.project;p.source.cacheVersion=609;w.__sparkMock.projects.a.inspection.header.version=609;
 const missing=['scenery/dust.bitmap','powerups/camo.bitmap','powerups/shield.bitmap'];
 const receipt={schemaVersion:1,status:'ready-source-tagset',sourceSha256:p.source.sha256,originalSdk:'sdk',tagsDirectory:'prepared-tags',sdkFiles:100,files:missing.map(path=>({path,source:'classic/'+path,bytes:180,sha256:'c'.repeat(64)})),sourcePreserved:true,playableOutput:false};
 w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
  if(command==='compatibility'){const stored=w.__sparkMock.projects[args.id].project;const ready=stored.buildTargets?.find((t:any)=>t.id===stored.activeBuildTarget)?.tagsDirectory==='prepared-tags'&&stored.conversionProfile==='mcc-multiplayer-ui';return{target:'MCC',pipeline:'Synthetic contract',ready,blockers:ready?[]:['Missing classic bitmap sources'],warnings:[],bitmapDependencies:args.id==='a'?{required:430,available:ready?430:427,missing:ready?[]:missing.map(path=>({path,reason:'Synthetic missing bitmap'})),invalid:[],listTruncated:false}:null};}
  if(command==='prepare_bitmap_tagset_repair'){w.__sparkMock.repairSource=args.sourceTags;const result={planId:'review',projectId:args.projectId,expiresAtUnix:Date.now()/1000+180,sourceSha256:p.source.sha256,sdkTags:'sdk',sourceTags:args.sourceTags,files:receipt.files};if(w.__sparkMock.deferBitmapReview)return new Promise(resolve=>{w.__sparkMock.finishBitmapReview=()=>resolve(result);});return result;}
  if(command==='create_bitmap_tagset_repair'){w.__sparkMock.repairCreated=args.confirmed;return{jobId:'repair-job',projectId:'a',status:'copying',message:'Creating separate source',receipt:null};}
  if(command==='bitmap_tagset_repair_status')return{jobId:'repair-job',projectId:'a',status:'ready',message:'Ready source, not a map',receipt};
  return original(command,args);
 };
 });
 await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})}).click();await chooseTool(page,'Build & playtest');
}
test('bitmap repair reviews exact sources, selects a separate target and refreshes saved checks',async({page})=>{
 await mockBitmapRepair(page);const repair=page.getByRole('region',{name:'Classic bitmap dependency repair',exact:true});await expect(repair).toContainText('427 of 430');await expect(page.getByRole('button',{name:'Convert map to MCC',exact:true})).toBeDisabled();
 await page.getByRole('checkbox',{name:'Use MCC multiplayer UI dependencies',exact:true}).check();await repair.getByRole('textbox',{name:'Matching classic tags folder',exact:true}).fill('C:/classic/tags');await repair.getByRole('button',{name:'Save & review matching bitmap tags',exact:true}).click();await expect(repair.getByRole('heading',{name:'Review 3 matching source files',exact:true})).toBeVisible();await repair.getByRole('button',{name:'Cancel review',exact:true}).click();expect(await page.evaluate(()=>(window as any).__sparkMock.repairCreated)).toBeUndefined();
 await repair.getByRole('button',{name:'Save & review matching bitmap tags',exact:true}).click();await repair.getByRole('button',{name:'Create separate repaired tagset',exact:true}).click();await repair.getByRole('button',{name:'Use repaired tagset for this map',exact:true}).click();await expect(page.getByRole('button',{name:'Save & refresh checks',exact:true})).toBeVisible();await page.getByRole('button',{name:'Save & refresh checks',exact:true}).click();await expect(page.getByRole('button',{name:'Convert map to MCC',exact:true})).toBeEnabled();
 const saved=await page.evaluate(()=>(window as any).__sparkMock.saved);expect(saved.activeBuildTarget).toBeTruthy();expect(saved.buildTargets[0].tagsDirectory).toBe('prepared-tags');expect(saved.conversionProfile).toBe('mcc-multiplayer-ui');expect(saved.source.sha256).toBe('a'.repeat(64));expect(saved.scene).toEqual([]);
});
test('a delayed bitmap-source review cannot replace another map workflow',async({page})=>{
 await mockBitmapRepair(page);await page.evaluate(()=>{(window as any).__sparkMock.deferBitmapReview=true;});const repair=page.getByRole('region',{name:'Classic bitmap dependency repair',exact:true});await repair.getByRole('textbox',{name:'Matching classic tags folder',exact:true}).fill('C:/classic/tags');await repair.getByRole('button',{name:'Save & review matching bitmap tags',exact:true}).click();await expect.poll(()=>page.evaluate(()=>typeof(window as any).__sparkMock.finishBitmapReview)).toBe('function');
 await chooseTool(page,'Map library');await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic candidate',exact:true})}).click();await chooseTool(page,'Build & playtest');await page.evaluate(()=>(window as any).__sparkMock.finishBitmapReview());await expect(page.getByRole('heading',{name:'Review 3 matching source files',exact:true})).toHaveCount(0);expect(await page.evaluate(()=>(window as any).__sparkMock.repairCreated)).toBeUndefined();
});

test('saved native tool tags have a stable-save review and separate build workflow',async({page})=>{
 await mockDesktop(page);
 await page.evaluate(()=>{const w=window as any,original=w.__TAURI_INTERNALS__.invoke;w.__sparkMock.tagPhase='unchanged';w.__sparkMock.tagWatch=null;w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
  if(command==='runtime_workbench_report'){const report=await original(command,args);report.sourceIssue=null;report.toolsIssue=null;report.workingSource=args.projectId?{buildId:'owned-build',tagsDirectory:'owned/tags'}:null;return report;}
  if(command==='working_tag_watch_start'){w.__sparkMock.tagWatch=args.projectId;return {watchId:'watch',projectId:args.projectId,buildId:'owned-build',tagsDirectory:'owned/tags',status:'unchanged',basis:'compiledBuild',revision:0,totalFiles:2240,changedFiles:0,changes:[],listTruncated:false,hashesReadLastScan:2240};}
  if(command==='working_tag_watch_poll'){const phase=w.__sparkMock.tagPhase;return {watchId:'watch',projectId:w.__sparkMock.tagWatch,buildId:'owned-build',tagsDirectory:'owned/tags',status:phase,basis:'compiledBuild',revision:1,totalFiles:2240,changedFiles:phase==='changed'?1:0,changes:phase==='changed'?[{kind:'modified',path:'levels/test/test.scenario'}]:[],listTruncated:false,hashesReadLastScan:phase==='changed'?1:0,...(w.__sparkMock.invalidSave?{integrity:{checkedFiles:0,invalidFiles:1,pendingFiles:0,unverifiedFiles:0,findings:[{path:'levels/test/test.scenario',state:'invalid',detail:'Native payload CRC differs from its header'}],listTruncated:false},writerContext:'Writer unknown; last launched tool context does not prove who wrote this file.'}:{})};}
  if(command==='working_tag_watch_stop')return null;
  if(command==='build_working_tags'){w.__sparkMock.toolBuildProject=args.projectId;return 'synthetic-job';}
  return original(command,args);
 };});
 await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})}).click();
 await page.getByRole('button',{name:'Runtime and tool details',exact:true}).click();
 const tags=page.getByRole('region',{name:'Saved tool tag changes',exact:true});await expect(tags).toContainText('Watching 2,240 tag files');
 await page.evaluate(()=>{(window as any).__sparkMock.tagPhase='saving';});await tags.getByRole('button',{name:'Scan tool tags now',exact:true}).click();await expect(tags).toContainText('Waiting for a stable save');await expect(page.getByRole('button',{name:'Build working tag edits',exact:true})).toBeDisabled();
 await page.evaluate(()=>{(window as any).__sparkMock.tagPhase='changed';});await tags.getByRole('button',{name:'Scan tool tags now',exact:true}).click();await expect(tags).toContainText('1 changed tag file');await tags.locator('summary').click();await expect(tags).toContainText('levels/test/test.scenario');await expect(page.getByRole('button',{name:'1 saved tool edit',exact:true})).toBeVisible();
 await page.evaluate(()=>{(window as any).__sparkMock.invalidSave=true;});await tags.getByRole('button',{name:'Scan tool tags now',exact:true}).click();await expect(tags).toContainText('Native save failed integrity checks');await expect(tags).toContainText('Writer unknown');await expect(page.getByRole('button',{name:'Build working tag edits',exact:true})).toBeDisabled();await expect(page.getByText('Native save integrity warning · 1 files',{exact:true})).toBeVisible();
 await page.evaluate(()=>{(window as any).__sparkMock.invalidSave=false;});await tags.getByRole('button',{name:'Scan tool tags now',exact:true}).click();await expect(tags.getByText('Native save failed integrity checks',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Build working tag edits',exact:true}).click();expect(await page.evaluate(()=>(window as any).__sparkMock.toolBuildProject)).toBe('a');await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).__sparkMock.saved)).toBeNull();
});

async function mockBspAudio(page:Page){
  await mockDesktop(page);await page.evaluate(()=>{
    const w=window as any,original=w.__TAURI_INTERNALS__.invoke;
    const state=w.__bspAudio={build:'owned-build',fail:false,calls:[] as any[]};
    const dependency={path:'sound/forest.sound_looping',sha256:'c'.repeat(64)},environment={path:'sound/stone.sound_environment',sha256:'d'.repeat(64)};
    w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
      if(command==='runtime_workbench_report'){const report=await original(command,args);report.sourceIssue=null;report.toolsIssue=null;report.workingSource={buildId:state.build,tagsDirectory:'owned/tags'};return report;}
      if(command==='inspect_bsp_audio_workspace')return {parentBuildId:state.build,inspection:{sourceSha256:'a'.repeat(64),bsps:[{index:0,tagPath:'levels/test/bsp',portalCount:1,backgroundPalette:[],environmentPalette:[],clusters:[{index:0,background:null,environment:null,bounds:[[0,0,0],[1,1,1]]},{index:1,background:null,environment:null,bounds:null}]}]},bspTagHashes:{'levels/test/bsp.scenario_structure_bsp':'b'.repeat(64)},backgrounds:[dependency],environments:[environment]};
      if(command==='build_working_tags'){state.calls.push(structuredClone(args));if(state.fail)throw Error('Synthetic working BSP changed after inspection');return 'synthetic-audio-job';}
      return original(command,args);
    };
  });
  await openFixture(page);await page.getByRole('button',{name:'Runtime and tool details',exact:true}).click();await page.locator('.bsp-audio-editor>summary').click();await page.getByRole('button',{name:'Inspect BSP audio',exact:true}).click();
}
test('BSP audio bindings use the inspected parent and survive reopening before a separate native build',async({page})=>{
  await mockBspAudio(page);
  await page.getByRole('combobox',{name:'BSP background loop',exact:true}).selectOption('sound/forest.sound_looping');await page.getByRole('combobox',{name:'BSP sound environment',exact:true}).selectOption('sound/stone.sound_environment');await page.getByRole('button',{name:'Stage all 2 clusters',exact:true}).click();
  await expect(page.locator('.bsp-audio-editor')).toContainText('2 staged cluster bindings');
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Runtime and tool details',exact:true}).click();await page.locator('.bsp-audio-editor>summary').click();await expect(page.locator('.bsp-audio-editor')).toContainText('2 staged cluster bindings');
  await page.getByRole('button',{name:'Inspect BSP audio',exact:true}).click();
  await page.getByRole('button',{name:'Build BSP audio revision',exact:true}).click();const calls=await page.evaluate(()=>(window as any).__bspAudio.calls);expect(calls).toHaveLength(1);expect(calls[0].projectId).toBe('a');expect(calls[0].bspAudio.parentBuildId).toBe('owned-build');expect(calls[0].bspAudio.changes.map((c:any)=>c.cluster)).toEqual([0,1]);expect(calls[0].bspAudio.changes[0].environment.sha256).toBe('d'.repeat(64));expect(await page.evaluate(()=>(window as any).__sparkMock.saved)).toBeNull();
});
test('a failed BSP audio build retains its draft and a replaced parent requires review',async({page})=>{
  await mockBspAudio(page);await page.getByRole('button',{name:'Stage cluster binding',exact:true}).click();await page.evaluate(()=>{(window as any).__bspAudio.fail=true;});await page.getByRole('button',{name:'Build BSP audio revision',exact:true}).click();await expect(page.getByText('Synthetic working BSP changed after inspection',{exact:false})).toBeVisible();await expect(page.locator('.bsp-audio-editor')).toContainText('1 staged cluster binding');
  await page.evaluate(()=>{(window as any).__bspAudio.build='new-build';});await page.getByRole('button',{name:'Refresh inspection',exact:true}).click();await page.locator('.bsp-audio-editor>summary').click();await page.getByRole('button',{name:'Inspect BSP audio',exact:true}).click();await expect(page.locator('.bsp-audio-editor')).toContainText('older working build');await expect(page.getByRole('button',{name:'Build BSP audio revision',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Clear BSP audio draft',exact:true}).click();await expect(page.getByRole('button',{name:'Stage cluster binding',exact:true})).toBeEnabled();
});

test('C35 viewport navigation uses Q/E and RMB wheel speed without stealing text input',async({page})=>{
 await mockDesktop(page);await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})}).click();
 const canvas=page.getByTestId('viewport').locator('canvas');await expect.poll(()=>canvas.getAttribute('data-gs-camera')).toBeTruthy();
 const box=await canvas.boundingBox();await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down({button:'right'});
 await expect(canvas).toHaveAttribute('data-gs-fly-active','true');const before=JSON.parse((await canvas.getAttribute('data-gs-camera'))!);
 await page.keyboard.down('e');await page.waitForTimeout(250);await page.keyboard.up('e');await page.waitForTimeout(300);const after=JSON.parse((await canvas.getAttribute('data-gs-camera'))!);expect(after.position[2]).toBeGreaterThan(before.position[2]+.5);
 await page.mouse.wheel(0,-120);await expect(canvas.locator('..')).toHaveAttribute('data-nav-speed',/Camera speed/);await page.mouse.up({button:'right'});
 await openDrawer(page,'Camera');const speed=page.getByRole('spinbutton',{name:'Camera movement speed',exact:true});
 expect(Number(await speed.inputValue())).toBeGreaterThan(12);await speed.focus();const resting=JSON.parse((await canvas.getAttribute('data-gs-camera'))!);await page.keyboard.press('e');await page.waitForTimeout(350);const typed=JSON.parse((await canvas.getAttribute('data-gs-camera'))!);expect(typed.position).toEqual(resting.position);expect(typed.quaternion).toEqual(resting.quaternion);
});

test('C35 drawers fit emulated DPI layouts while preserving the map workspace',async({page})=>{
 await mockDesktop(page);await openFixture(page);const session=await page.context().newCDPSession(page);
 for(const scale of[1,1.25,1.5,2]){await session.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:scale,mobile:false});expect(await page.evaluate(()=>devicePixelRatio)).toBe(scale);const drawer=page.locator('.gs-navigation-drawer');if(!await drawer.isVisible())await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();expect(await drawer.evaluate(e=>e.scrollWidth-e.clientWidth)).toBe(0);await page.keyboard.press('Escape');await expect(page.getByRole('heading',{name:'test',exact:true})).toBeVisible();}
 await session.send('Emulation.clearDeviceMetricsOverride');
});

test('native handoff warnings keep updating with tool controls closed and across workspaces', async ({page}) => {
  await mockDesktop(page); await openFixture(page);
  await page.evaluate(() => {
    const w=window as any, prior=w.__TAURI_INTERNALS__.invoke;
    w.__sparkMock.handoffBad=false; w.__sparkMock.handoffPolls=0;
    w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
      if(command==='baboon_report') return {installed:{version:'0.3.2',directory:'C:/fixture',executable:'C:/fixture/Baboon.exe',executableSha256:'a'.repeat(64)},sourceReady:true,sessionId:'synthetic-handoff',compatibleKits:[]};
      if(command==='baboon_poll') {
        w.__sparkMock.handoffPolls++;
        const bad=w.__sparkMock.handoffBad;
        return {sessionId:args.sessionId,tag:'weapons/test.weapon',running:false,processId:null,revisions:[],changes:{status:bad?'changed':'unchanged',revision:bad?1:0,changedFiles:bad?1:0,totalFiles:1,changes:[],listTruncated:false},integrity:{checkedFiles:0,nativeParserCheckedFiles:0,invalidFiles:bad?1:0,pendingFiles:0,unverifiedFiles:0,findings:bad?[{path:'weapons/test.weapon',state:'invalid',detail:'Synthetic malformed save; actual writer unknown.'}]:[],listTruncated:false}};
      }
      return prior(command,args);
    };
    window.dispatchEvent(new CustomEvent('guilty-spark-baboon-session',{detail:{projectId:'a'}}));
  });
  await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.handoffPolls)).toBeGreaterThan(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(()=>(window as any).__sparkMock.handoffBad=true);
  const warning=page.locator('.runtime-dock-tag-changes[role="alert"]');
  await expect(warning).toContainText('Native save integrity warning',{timeout:10000});
  await chooseTool(page,'Tag editor');
  await expect(warning).toBeVisible();
  await warning.click();
  await expect(page.getByRole('dialog').getByText('Native save failed integrity checks',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close runtime details',exact:true}).click();
  await page.evaluate(()=>(window as any).__sparkMock.handoffBad=false);
  await expect(warning).toHaveCount(0,{timeout:10000});
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('dependency setup offers a reviewed official install action without launching on inspection or cancel',async({page})=>{
  await mockDesktop(page);await openFixture(page);
  await page.evaluate(()=>{const w=window as any,original=w.__TAURI_INTERNALS__.invoke;w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
    if(command==='dependency_report')return {schemaVersion:1,runtimeId:args.runtimeId,projectId:args.projectId,platform:'windows',diagnostics:[],items:[{id:'h1a',label:'Halo CE Mod Tools · MCC',state:'setupRequired',detail:'Install the official editing kit in Steam.',path:null,sha256:null,architecture:null,actions:[{id:'h1a.install',kind:'installH1aViaSteam',label:'Install Halo CE Mod Tools in Steam',target:'steam://install/1532190',requiresReview:true}]}]};
    if(command==='prepare_dependency_action')return {id:'fixture-preview',actionId:'h1a.install',runtimeId:args.runtimeId,projectId:args.projectId,label:'Review Steam install',uri:'steam://install/1532190',executable:'C:/synthetic/Steam.exe',executableArchitecture:'x86',executableSha256:'a'.repeat(64),arguments:['steam://install/1532190'],expiresAtUnix:Math.floor(Date.now()/1000)+90,detail:'Synthetic review only'};
    if(command==='discard_dependency_action'){w.__sparkMock.discardedDependency=true;return null;}
    if(command==='run_dependency_action'){w.__sparkMock.installedDependency=true;return {outcome:'handoffUnobserved',detail:'Synthetic Steam UI handoff; no installer ran'};}
    return original(command,args);
  };});
  await chooseTool(page,"Settings & tools");await page.getByRole('tab',{name:'Dependencies & setup',exact:true}).click();
  await expect(page.getByText('Setup needed',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Install Halo CE Mod Tools in Steam',exact:true}).click();
  await expect(page.getByRole('button',{name:'Open Steam install UI',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Cancel dependency action',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).__sparkMock.installedDependency??false)).toBe(false);
  expect(await page.evaluate(()=>(window as any).__sparkMock.discardedDependency)).toBe(true);
  await page.getByRole('button',{name:'Install Halo CE Mod Tools in Steam',exact:true}).click();
  await page.getByRole('checkbox',{name:/I reviewed this destination/}).check();await page.getByRole('button',{name:'Open Steam install UI',exact:true}).click();
  await expect(page.getByRole('region',{name:'Dependencies and setup'}).getByRole('status')).toContainText('Synthetic Steam UI handoff');
});

test('an MCC invitation check explains the missing foreign protocol bridge and never offers a false join',async({page})=>{
  await mockDesktop(page);await openFixture(page);
  await page.evaluate(()=>{const w=window as any,original=w.__TAURI_INTERNALS__.invoke;w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
    if(command==='invitation_prepare')return {id:null,expiresAtUnix:0,executable:null,executableSha256:null,dataRoot:null,route:{client:args.client,kind:'nativeCommunity',canHandoff:false,translationStatus:'mccProtocolBridgeMissing',detail:'The selected MCC client does not implement this protocol.',requirements:[],gameplayVerified:false}};
    return original(command,args);
  };});
  await chooseTool(page,"Online");await page.getByRole('button',{name:'Join server',exact:true}).click();await page.locator('.compact-invitation>summary').click();await page.locator('input[aria-label="Game invitation"]').fill('halo://join/'+'a'.repeat(64));
  await page.getByRole('button',{name:'Check invitation & adapter',exact:true}).click();
  await expect(page.getByText(/MCC-to-OpenCE\/Chupathingy\/WebRTC gameplay translation is not implemented/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Hand invitation to client',exact:true})).toHaveCount(0);
  await expect(page.locator('input[aria-label="Game invitation"]')).toHaveValue('');
});

async function prepareExternalRevision(page:Page){await page.evaluate(()=>{
  const w=window as any,m=w.__sparkMock;const opened=structuredClone(m.projects.a);opened.project.id='d';opened.project.title='Synthetic external revision';opened.project.source.sha256='d'.repeat(64);opened.inspection.sha256='d'.repeat(64);opened.inspection.tags[0].fields[0].value=33;m.projects.d=opened;
  const original=w.__TAURI_INTERNALS__.invoke;w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
    if(command==='external_map_watch_poll'&&args.watchId==='a'&&m.changedExternal)return {watchId:'a',projectId:'a',path:'C:/synthetic/external.map',status:'changed',candidate:{sha256:'d'.repeat(64),cacheVersion:7,scenarioPath:'levels/test',matchesSource:true,fileSize:100},message:'Synthetic external save ready'};
    if(command==='external_map_change_import'){m.changedExternal=false;return {previousProjectId:'a',watchedPath:'C:/synthetic/external.map',opened:structuredClone(m.projects.d),deduplicated:false};}
    return original(command,args);
  };
});await openDrawer(page,'Changes');}
test('external saves refresh a clean map and retain its tag view without changing another open map',async({page})=>{
  await mockDesktop(page);await openFixture(page);await prepareExternalRevision(page);
  await expect(page.getByLabel('External map changes')).toContainText('1 map monitored');
  await page.evaluate(()=>{(window as any).__sparkMock.changedExternal=true;});await page.getByRole('button',{name:'Scan now',exact:true}).click();
  await expect(page.getByRole('tab',{name:/Synthetic external revision/})).toBeVisible();
  await expect(page.getByRole('tab',{name:/Synthetic baseline/})).toHaveCount(0);
  await expect(page.getByRole('spinbutton').first()).toHaveValue('33');
});
test('external saves preserve a Spark tag draft and open the changed map separately',async({page})=>{
  await mockDesktop(page);await openFixture(page);await prepareExternalRevision(page);
  await page.getByRole('spinbutton').first().fill('20');await page.getByRole('spinbutton').first().blur();
  await expect(page.getByLabel('External map changes')).toContainText('1 map monitored');
  await page.evaluate(()=>{(window as any).__sparkMock.changedExternal=true;});await page.getByRole('button',{name:'Scan now',exact:true}).click();
  await expect(page.getByRole('button',{name:'Open changed map and keep Spark edits',exact:true})).toBeVisible();
  await expect(page.getByRole('tab',{name:/Synthetic external revision/})).toHaveCount(0);
  await page.getByRole('button',{name:'Open changed map and keep Spark edits',exact:true}).click();await expect(page.getByRole('tab',{name:/Synthetic external revision/})).toBeVisible();
  await page.getByRole('tab',{name:/Synthetic baseline/}).click();await chooseTool(page,"Tag editor");await expect(page.getByRole('spinbutton').first()).toHaveValue('20');
});

test('in-app downloads open all imported maps and retain an already open edited draft',async({page})=>{
  await mockDesktop(page);await openFixture(page);await page.getByRole('spinbutton').first().fill('20');await page.getByRole('spinbutton').first().blur();
  await page.evaluate(()=>{const w=window as any,original=w.__TAURI_INTERNALS__.invoke;w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
    const status={id:'synthetic-download',phase:'imported',bytes:100,total:100,sourceUrl:'https://example.com',detail:'Synthetic preserved download',projectIds:['a','b']};
    if(command==='prepare_map_download'||command==='map_download_status')return status;
    if(command==='download_and_import_maps')return [structuredClone(w.__sparkMock.projects.a),structuredClone(w.__sparkMock.projects.b)];
    return original(command,args);
  };});
  await chooseTool(page,"Community maps");await page.getByLabel('Direct map download URL').fill('https://example.com/arena.zip');await page.getByLabel('Downloaded map action').selectOption('tags');await page.getByRole('button',{name:'Download & import map',exact:true}).click();
  await expect(page.getByRole('tab',{name:/Synthetic candidate/})).toBeVisible();await expect(page.getByRole('tab',{name:/Synthetic baseline/})).toBeVisible();await expect(page.getByRole('spinbutton').first()).toHaveValue('20');
});

test('community games load after selecting a runtime and Join, and an obsolete check cannot lock the browser', async ({page}) => {
  await mockDesktop(page); await openFixture(page);
  await includeCommunityRuntime(page);
  await page.evaluate(() => {(window as any).__sparkMock.deferListing = true;});
  await chooseTool(page,"Online");
  expect(await page.evaluate(()=>(window as any).__sparkMock.calls.some((call:any)=>call.command==='community_listing'))).toBe(false);
  await page.getByLabel('Runtime adapter',{exact:true}).selectOption('openCe');
  await page.getByRole('button',{name:'Join server',exact:true}).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__sparkMock.finishListing)).toBe('function');
  await page.evaluate(() => (window as any).__sparkMock.finishListing());
  const games = page.getByRole('list', {name:'Advertised games'});
  await expect(games.getByRole('listitem')).toHaveCount(2);
  await games.getByRole('listitem').first().click();
  const check = page.getByRole('button', {name:'Check installed runtime & map',exact:true});
  await expect(check).toBeEnabled();
  await page.evaluate(() => {(window as any).__sparkMock.deferJoinCheck = true;});
  await check.click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__sparkMock.finishJoinCheck)).toBe('function');
  await games.getByRole('listitem').nth(1).click();
  await page.evaluate(() => (window as any).__sparkMock.finishJoinCheck());
  await expect(page.getByRole('region', {name:'Selected game requirements'}).getByRole('heading',{name:'Synthetic game 2',exact:true})).toBeVisible();
  await expect(check).toBeEnabled();
  await expect(page.getByText('Requirements need attention',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button', {name:'Hand invitation to game',exact:true})).toHaveCount(0);
});

test('a second map window receives a shared listing refresh without another HTTPS request',async({page})=>{
  await mockDesktop(page);await openFixture(page);
  await includeCommunityRuntime(page);
  await page.evaluate(()=>{const w=window as any,original=w.__TAURI_INTERNALS__.invoke;w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
    if(command==='community_listing'&&args.refresh){return {listing:null,fetching:true,stale:true,error:null,refreshAfterUnix:Math.floor(Date.now()/1000)+30};}
    return original(command,args);
  };});
  await chooseTool(page,"Online");await page.getByLabel('Runtime adapter',{exact:true}).selectOption('openCe');await page.getByRole('button',{name:'Join server',exact:true}).click();await expect(page.getByRole('list',{name:'Advertised games'}).getByRole('listitem')).toHaveCount(2);
  expect(await page.evaluate(()=>(window as any).__sparkMock.calls.some((item:any)=>item.command==='community_listing'&&item.args.refresh===false))).toBe(true);
});

test('runtime dock remembers each map target and rejects a late tool preview from another map', async ({page}) => {
  await mockDesktop(page); await openFixture(page);
  const dock = page.getByRole('contentinfo', {name:'Runtime & Tools Dock'});
  await dock.getByRole('combobox', {name:'Active map runtime'}).selectOption('openCe');
  await chooseTool(page,"Map library");
  await page.locator('.map-card').filter({hasText:'Synthetic candidate'}).click();
  await expect(dock.getByRole('combobox',{name:'Active map runtime'})).toHaveValue('mccSteam');
  await page.getByRole('tab',{name:/Synthetic baseline/}).click();
  await expect(dock.getByRole('combobox',{name:'Active map runtime'})).toHaveValue('openCe');
  await dock.getByRole('combobox',{name:'Active map runtime'}).selectOption('mccSteam');
  await page.evaluate(() => {
    const w=window as any, original=w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke=async(command:string,args:any) => {
      if(command==='runtime_workbench_report'){const report=await original(command,args);report.actions.find((a:any)=>a.id==='editLevel').availability='ready';return report;}
      if(command==='prepare_runtime_tool')return new Promise(resolve=>{w.__sparkMock.finishToolPreview=()=>resolve({id:'synthetic',runtimeId:'mccSteam',actionId:'editLevel',projectId:'a',buildId:'synthetic',executable:'C:/synthetic/sapien.exe',executableSha256:'a'.repeat(64),workingDirectory:'C:/synthetic/job',tagsDirectory:'C:/synthetic/job/tags',scenarioFile:'C:/synthetic/job/tags/level.scenario',arguments:[],startupScript:null,expiresAtUnix:Math.floor(Date.now()/1000)+90,detail:'Synthetic plan only'});});
      return original(command,args);
    };
  });
  await dock.getByRole('button',{name:'Runtime and tool details',exact:true}).click();
  await page.getByRole('button',{name:'Refresh inspection',exact:true}).click();
  await page.getByRole('button',{name:'Close runtime details',exact:true}).click();
  await dock.getByRole('button',{name:/^Edit level/}).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__sparkMock.finishToolPreview)).toBe('function');
  await page.getByRole('tab',{name:/Synthetic candidate/}).click();
  await page.evaluate(() => (window as any).__sparkMock.finishToolPreview());
  await expect(page.getByRole('heading',{name:'Open Sapien',exact:true})).toHaveCount(0);
  await expect(dock).toContainText('Synthetic candidate');
  expect(await page.evaluate(()=>(window as any).__sparkMock.calls.some((call:any)=>call.command==='launch_runtime_tool'))).toBe(false);
});

test('runtime dock observes an exited tool and makes its action available again', async ({page}) => {
  await mockDesktop(page); await openFixture(page);
  await page.evaluate(() => {
    const w=window as any, original=w.__TAURI_INTERNALS__.invoke;w.__sparkMock.toolRunning=true;
    w.__TAURI_INTERNALS__.invoke=async(command:string,args:any) => {
      const process={id:'synthetic-process',actionId:'editLevel',projectId:'a',processId:42,status:w.__sparkMock.toolRunning?'running':'exited',exitCode:w.__sparkMock.toolRunning?null:0,detail:'Synthetic lifecycle only'};
      if(command==='runtime_tool_processes')return [process];
      if(command==='runtime_workbench_report'){const report=await original(command,args);report.actions.find((a:any)=>a.id==='editLevel').availability=w.__sparkMock.toolRunning?'running':'ready';report.processes=[process];return report;}
      return original(command,args);
    };
  });
  const dock=page.getByRole('contentinfo',{name:'Runtime & Tools Dock'});
  await dock.getByRole('button',{name:'Runtime and tool details',exact:true}).click();
  await page.getByRole('button',{name:'Refresh inspection',exact:true}).click();
  await page.getByRole('button',{name:'Close runtime details',exact:true}).click();
  await expect(dock.getByRole('button',{name:/^Edit level/})).toContainText('Running');
  await page.evaluate(() => {(window as any).__sparkMock.toolRunning=false;});
  await expect(dock.getByRole('button',{name:/^Edit level/})).toContainText('Ready',{timeout:7000});
});

test('campaign tag duplicates stay map-owned and undoable, and UI maps expose their own tags',async({page})=>{
  await mockDesktop(page);
  await page.evaluate(()=>{
    const projects=(window as any).__sparkMock.projects, a=projects.a.inspection;
    a.header.scenarioType=0;
    a.tags.push({id:2,index:1,class:'scnr',path:'levels/a10/a10',dataOffset:24,external:false,
      fields:[],references:[{label:'Campaign weapon',targetId:1,class:'weap',offset:40}]});
    projects.b.inspection.header.scenarioType=2;
    projects.b.inspection.tags.push({id:3,index:1,class:'DeLa',path:'ui/test_widget',dataOffset:48,
      external:false,fields:[],references:[]});
  });
  await openFixture(page);
  await page.locator('.tag-duplicate-panel>summary').click();
  await expect(page.getByRole('combobox',{name:'Duplicate referencing tag',exact:true})).toHaveValue('2');
  await page.getByRole('textbox',{name:'Duplicate tag path',exact:true}).fill('spark/campaign/pistol_copy');
  await page.getByRole('button',{name:'Queue tag duplicate for rebuild',exact:true}).click();
  await expect(page.locator('.tag-duplicate-panel>summary')).toContainText('1 queued');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.tag-duplicate-panel>summary')).toContainText('0 queued');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('.tag-duplicate-panel>summary')).toContainText('1 queued');
  await page.getByRole('combobox',{name:'Select Halo map',exact:true}).selectOption('b');
  await expect(page.getByText('Interface map · browse its actual widgets', {exact:false})).toBeVisible();
  await expect(page.locator('.tag-duplicate-panel>summary')).toContainText('0 queued');
  await page.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('DeLa');
  await page.locator('.tag-row').click();
  await expect(page.getByRole('heading',{name:'test_widget',exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Select Halo map',exact:true}).selectOption('a');
  await expect(page.locator('.tag-duplicate-panel>summary')).toContainText('1 queued');
});

test('an open map still leaves every sidebar tool visible in a short window',async({page})=>{
  await page.setViewportSize({width:1024,height:640});await mockDesktop(page);await openFixture(page);await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();
  await expect(page.locator('.sidebar').getByRole('button',{name:'Interface Studio',exact:true})).toHaveCount(0);
  expect(await page.locator('.sidebar').evaluate(element=>element.scrollHeight-element.clientHeight)).toBe(0);
  await expect(page.getByRole('button',{name:'Export .gsproject',exact:true})).toBeVisible();
  await chooseTool(page,"Settings & tools");await page.getByRole('tab',{name:'Interface Studio',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Make the workbench yours.',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();
  await expect(page.locator('.sidebar').getByRole('button',{name:'Settings & tools',exact:true})).toHaveClass(/selected/);
});
test('slow onboarding saves keep navigation available and do not steal a later route',async({page})=>{
  await mockDesktop(page);await chooseTool(page,"Start here");
  await page.evaluate(()=>{const w=window as any,original=w.__TAURI_INTERNALS__.invoke;w.__TAURI_INTERNALS__.invoke=(command:string,args:any)=>command==='save_settings'?new Promise((resolve,reject)=>{w.__finishSetup=()=>original(command,args).then(resolve,reject);}):original(command,args);});
  await page.getByRole('button',{name:'Continue to tools',exact:true}).click();
  await expect(page.getByRole('button',{name:'Saving Halo choice…',exact:true})).toBeDisabled();
  await chooseTool(page,"Map library");await expect(page.getByRole('heading',{name:'One Halo. Every World. Every Tool. Together.',exact:true})).toBeVisible();
  await page.evaluate(()=>(window as any).__finishSetup());
  await expect(page.getByRole('heading',{name:'One Halo. Every World. Every Tool. Together.',exact:true})).toBeVisible();
  await chooseTool(page,"Start here");await expect(page.getByRole('heading',{name:'Your editing tools',exact:true})).toBeVisible();
});
test('hosting uses the selected map and gameplay presets retain fixed left and right gun controls',async({page})=>{
  await mockDesktop(page);await openFixture(page);await chooseTool(page,"Online");
  await page.getByRole('button',{name:'Host game',exact:true}).click();
  await expect(page.getByRole('region', { name: 'Community host adapter' })).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Synthetic MCC Custom Games guide',exact:true})).toBeVisible();
  await expect(page.getByText('Use Halo CE Custom Games for this multiplayer map.',{exact:true})).toBeVisible();
  const calls=await page.evaluate(()=>(window as any).__sparkMock.calls.filter((call:any)=>call.command==='runtime_hosting_plan'));expect(calls.at(-1).args.projectId).toBe('a');
  await page.getByRole('button',{name:'Gameplay controls',exact:true}).click();
  await page.getByRole('checkbox',{name:'Request dual wield support',exact:true}).check();
  await page.getByRole('combobox',{name:'Dual-wield hotkey',exact:true}).selectOption('KeyV');
  await expect(page.getByText('Left gun · independent primary trigger',{exact:true})).toBeVisible();
  await expect(page.getByText('Right gun · independent secondary trigger',{exact:true})).toBeVisible();
  await chooseTool(page,"Tag editor");await chooseTool(page,"Online");
  await expect(page.getByRole('combobox',{name:'Dual-wield hotkey',exact:true})).toHaveValue('KeyV');
  await expect(page.getByText('Changing a preset does not enable them in the running game.',{exact:false})).toBeVisible();
});
test('home exposes four Halos and connects a discovered client only after an exact-identity action', async ({ page }) => {
  await mockDesktop(page);
  await page.evaluate(() => {
    const w = window as any, original = w.__TAURI_INTERNALS__.invoke;
    w.__connectedDiscoveredHalo = false;
    w.__rejectDetectedHalo = true;
    const reports = async () => {
      const [base] = await original('runtime_report');
      return [base, ...(w.__connectedDiscoveredHalo ? [{ ...base, id: 'openCe', installation: { root: 'C:/synthetic/OpenCE', validation: 'pass' } }] : [])];
    };
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === 'runtime_report') return reports();
      if (command === 'discover_halo_connections') return w.__connectedDiscoveredHalo ? [] : [{ runtimeId: 'openCe', root: 'C:/synthetic/OpenCE', executable: 'C:/synthetic/OpenCE/halo.exe', dataRoot: 'C:/synthetic/OpenCE', executableSha256: 'd'.repeat(64), version: '335', contentReady: true, detail: 'Synthetic detection only' }];
      if (command === 'connect_detected_halo') {
        w.__sparkMock.calls.push({ command, args });
        if (w.__rejectDetectedHalo) throw Error('Detected runtime changed; recheck connections');
        w.__connectedDiscoveredHalo = true;
        return reports();
      }
      return original(command, args);
    };
  });
  await chooseTool(page, 'Settings & tools');
  await page.getByRole('button', { name: 'HOME', exact: true }).click();
  const homes = page.getByRole('group', { name: 'Your Halo installations', exact: true });
  await expect(homes.getByRole('button')).toHaveCount(4);
  await homes.getByRole('button', { name: 'OpenCE · Detected', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'OpenCE tools', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'OpenCE · Detected', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Connect detected Halo', exact: true }).click();
  await expect(page.getByText('Detected runtime changed; recheck connections', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'OpenCE · Detected', exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).__rejectDetectedHalo = false);
  await page.getByRole('button', { name: 'Connect detected Halo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'OpenCE · Connected', exact: true })).toHaveAttribute('data-connected', 'true');
  const requests = await page.evaluate(() => (window as any).__sparkMock.calls.filter((item: any) => item.command === 'connect_detected_halo'));
  expect(requests.at(-1).args).toEqual({ runtimeId: 'openCe', executableSha256: 'd'.repeat(64) });
  await page.getByRole('button', { name: 'HOME', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Your Halo installations', exact: true }).getByRole('button', { name: 'OpenCE · Connected', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__sparkMock.calls.some((item: any) => ['launch_registered_runtime', 'launch_discovered_tool'].includes(item.command)))).toBe(false);
});

test('refreshing discovery during a pending runtime connection does not strand its Connect action', async ({page}) => {
  await mockDesktop(page);
  await page.evaluate(() => {
    const w = window as any, original = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command:string,args:any) => {
      if(command === 'discover_halo_connections') return [{runtimeId:'openCe',root:'C:/synthetic/OpenCE',executable:'C:/synthetic/OpenCE/halo.exe',dataRoot:'C:/synthetic/OpenCE',executableSha256:'d'.repeat(64),version:'335',contentReady:true,detail:'Synthetic detected runtime'}];
      if(command === 'connect_detected_halo') {
        await new Promise<void>(resolve => {w.__releasePendingConnection = resolve;});
        throw Error('Synthetic connection was refused');
      }
      return original(command,args);
    };
  });
  await chooseTool(page,'Settings & tools');
  await page.getByRole('button',{name:'OpenCE · Detected',exact:true}).click();
  await page.getByRole('button',{name:'Connect detected Halo',exact:true}).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__releasePendingConnection)).toBe('function');
  await page.getByRole('button',{name:'Recheck connections',exact:true}).click();
  await expect(page.getByRole('button',{name:'Recheck connections',exact:true})).toBeEnabled();
  await page.evaluate(() => (window as any).__releasePendingConnection());
  await expect(page.getByRole('button',{name:'Connect detected Halo',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'OpenCE · Detected',exact:true})).not.toHaveAttribute('data-connected','true');
});
test('games and tools scopes connected Halo versions, editors and map handoffs', async ({ page }, testInfo) => {
  await mockDesktop(page);
  await openFixture(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    const w = window as any, original = w.__TAURI_INTERNALS__.invoke;
    w.__toolHandoffs = [];
    addEventListener('guilty-spark-runtime-tool', (event: any) => w.__toolHandoffs.push(event.detail));
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === 'runtime_report') {
        const [report] = await original(command, args);
        return ['mccSteam', 'haloCustomEdition', 'haloPc'].map(id => ({ ...report, id, installation: { root: 'C:/synthetic/' + id, validation: id === 'haloPc' ? 'fail' : 'pass', identity: 'userDeclared' } }));
      }
      if (command === 'tool_ecosystem_report') return {
        projectId: args.projectId, context: { runtimeId: args.runtimeId, sourceKind: 'Synthetic native source', ownedNativeTags: true }, sourceIssue: null,
        tools: [{ definition: { id: 'guerilla', label: `Synthetic ${args.runtimeId} editor`, purpose: 'Synthetic UI contract; no external program runs.', caveat: 'No native launch evidence.', maintainer: 'Fixture', sourceUrl: 'https://example.invalid', license: 'Fixture', inputs: ['native tags'], integration: 'managed', handler: 'editTags', version: null }, assessment: { state: 'installed', executableFound: true, compatibleSource: true, executableVerified: true, canUseWorkflow: true, detail: 'Synthetic source ready' }, executable: 'C:/synthetic/editor.exe', installationIssue: null }],
      };
      if (command === 'launch_discovered_tool') { w.__sparkMock.calls.push({ command, args }); return 'Synthetic launcher contract only; no executable started.'; }
      return original(command, args);
    };
  });
  await chooseTool(page, 'Settings & tools');
  await expect(page.getByRole('group', { name: 'Halo versions' }).getByRole('button')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'MCC Halo 1 · Connected', exact: true })).toHaveAttribute('data-connected', 'true');
  await expect(page.getByRole('button', { name: 'OpenCE · Not connected', exact: true })).toHaveAttribute('data-connected', 'false');
  await expect(page.getByRole('button', { name: /Halo PC · / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Custom Edition · Connected', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Custom Edition tools', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Launch Synthetic haloCustomEdition editor', exact: true }).click();
  const calls = await page.evaluate(() => (window as any).__sparkMock.calls.filter((call: any) => call.command === 'launch_discovered_tool'));
  expect(calls.at(-1).args).toEqual({ runtimeId: 'haloCustomEdition', projectId: 'a', toolId: 'guerilla' });
  await page.screenshot({ path: testInfo.outputPath('games-tools-1280.png') });
  await page.getByRole('combobox', { name: 'Map for external tools', exact: true }).selectOption('b');
  await expect(page.getByRole('combobox', { name: 'Map for external tools', exact: true })).toHaveValue('b');
  await expect(page.getByRole('button', { name: 'MCC Halo 1 · Connected', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('combobox', { name: 'Map for external tools', exact: true }).selectOption('a');
  await expect(page.getByRole('button', { name: 'Custom Edition · Connected', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 800, height: 600 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('games-tools-800.png') });
  await page.locator('.gs-tool-options > summary').click();
  await page.getByRole('button', { name: 'Edit map · tag editing', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__toolHandoffs.at(-1))).toEqual({ runtimeId: 'haloCustomEdition', projectId: 'a', actionId: 'editTags' });
});
test('compact library keeps its search and layout when leaving and returning', async ({ page }, testInfo) => {
  await mockDesktop(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Map list', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search library', exact: true }).fill('baseline');
  await expect(page.locator('.map-card')).toHaveCount(1);
  await chooseTool(page, 'Settings & tools');
  await chooseTool(page, 'Map library');
  await expect(page.getByRole('textbox', { name: 'Search library', exact: true })).toHaveValue('baseline');
  await expect(page.getByRole('button', { name: 'Map list', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.map-card')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Search library', exact: true }).fill('not-a-project');
  await page.getByRole('button', { name: 'Show all projects', exact: true }).click();
  await expect(page.locator('.map-card')).toHaveCount(3);
  await expect(page.getByRole('textbox', { name: 'Search library', exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Map list', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: testInfo.outputPath('library-list-1280.png') });
  await page.getByRole('button', { name: 'Compact map tiles', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('library-tiles-1280.png') });
  await page.setViewportSize({ width: 800, height: 600 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Import map or archive', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('library-800.png') });
});
test('host game presents one matching runtime setup and keeps compact controls reachable', async ({ page }, testInfo) => {
  await mockDesktop(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    const w = window as any, original = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === 'runtime_report') {
        const [report] = await original(command, args);
        return [report, ...['openCe', 'chupathingyCe', 'haloCustomEdition'].map(id => ({ ...report, id, name: `Synthetic ${id}` }))];
      }
      if (command === 'ce_host_catalog') return { executableSha256: 'a'.repeat(64), maps: [{ name: 'bloodgulch', sha256: 'b'.repeat(64) }], projectId: null, projectIssue: null };
      if (command === 'ce_host_status') return null;
      return original(command, args);
    };
  });
  await chooseTool(page, 'Online');
  await page.getByRole('button', { name: 'Host game', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Hosting and servers' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Community host adapter' })).toHaveCount(0);
  await page.getByLabel('Runtime adapter', { exact: true }).selectOption('openCe');
  await expect(page.getByRole('region', { name: 'Community host adapter' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Host game', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Community host adapter' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Hosting and servers' })).not.toBeVisible();
  await page.getByLabel('Community host map', { exact: true }).fill('sidewinder');
  await page.getByLabel('Community host maximum players', { exact: true }).fill('8');
  await chooseTool(page, 'Map library');
  await chooseTool(page, 'Online');
  await expect(page.getByLabel('Community host map', { exact: true })).toHaveValue('sidewinder');
  await expect(page.getByLabel('Community host maximum players', { exact: true })).toHaveValue('8');
  await expect(page.getByRole('button', { name: 'Check host adapter', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('host-opence-1280.png') });
  await page.setViewportSize({ width: 800, height: 600 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Check host adapter', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('host-opence-800.png') });
  await page.getByLabel('Runtime adapter', { exact: true }).selectOption('haloCustomEdition');
  await page.getByRole('button', { name: 'Host game', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Custom Edition private host' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Community host adapter' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start private server', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('host-ce-800.png') });
});

test('native camera position edits persist across tools and restore through the adapter',async({page})=>{
  await mockDesktop(page);await openFixture(page);await chooseTool(page,"Online");await page.getByRole('button',{name:'Gameplay controls',exact:true}).click();
  const camera=page.locator('.native-camera-controls');await camera.locator('summary').click();
  await camera.getByRole('button',{name:'Enable third-person camera',exact:true}).click();await expect(camera.getByText('Third-person camera active',{exact:false})).toBeVisible();
  await camera.getByRole('spinbutton',{name:'Camera shoulder offset',exact:true}).fill('-0.45');await camera.getByRole('spinbutton',{name:'Camera shoulder offset',exact:true}).press('Enter');await camera.getByRole('button',{name:'Apply camera position',exact:true}).click();
  await chooseTool(page,"Tag editor");await chooseTool(page,"Online");await camera.locator('summary').click();
  await expect(camera.getByRole('spinbutton',{name:'Camera shoulder offset',exact:true})).toHaveValue('-0.45');
  await camera.getByRole('button',{name:'Restore original camera',exact:true}).click();await expect(camera.getByText('Original camera selected',{exact:false})).toBeVisible();
  const calls=await page.evaluate(()=>(window as any).__sparkMock.calls.filter((c:any)=>c.command==='live_mcc_camera_configure'));expect(calls.map((c:any)=>c.args.enabled)).toEqual([true,true,false]);expect(calls[1].args.config.right).toBe(-.45);
});

test('the dedicated camera button toggles without opening settings and uses current native state',async({page})=>{
  await mockDesktop(page);await openFixture(page);
  await chooseTool(page,"Online");
  await page.getByRole('button',{name:'Gameplay controls',exact:true}).click();
  const camera=page.locator('.native-camera-controls'),button=camera.getByRole('button',{name:'Toggle in-game third person',exact:true});
  await expect(camera.locator('details')).not.toHaveAttribute('open','');
  await expect(button).toHaveText('Switch to third person');await button.click();
  await expect(button).toHaveText('Switch to first person');await expect(button).toHaveAttribute('aria-pressed','true');
  await button.click();await expect(button).toHaveText('Switch to third person');
  // The engine shortcut changed mode between UI polls. The command must toggle
  // the native state atomically rather than invert the old rendered status.
  await page.evaluate(()=>{(window as any).__sparkMock.camera.enabled=true;});
  await button.click();await expect(button).toHaveText('Switch to third person');
  await camera.locator('summary').click();
  await camera.getByRole('combobox',{name:'In-game camera shortcut',exact:true}).selectOption('F7');
  await expect(camera.getByText('F7 · toggle in MCC',{exact:true})).toBeVisible();
  await camera.getByRole('checkbox',{name:'Enable in-game camera shortcut',exact:true}).uncheck();
  await expect(camera.getByText('F7 · toggle in MCC',{exact:true})).toHaveCount(0);
  const calls=await page.evaluate(()=>(window as any).__sparkMock.calls);
  expect(calls.filter((c:any)=>c.command==='live_mcc_camera_toggle')).toHaveLength(3);
  expect(calls.filter((c:any)=>c.command==='live_mcc_camera_configure')).toHaveLength(0);
});

test('custom power-ups retain their tool tab, use map undo and require a rebuild',async({page})=>{
  await mockDesktop(page);await openFixture(page);await chooseTool(page,"Creator Studio");await page.getByRole('tab',{name:'Custom power-ups',exact:true}).click();
  await page.getByRole('button',{name:'Add custom power-up',exact:true}).click();const duration=page.getByRole('spinbutton',{name:'Power-up duration (seconds)',exact:true});await duration.fill('120');await duration.press('Enter');
  await page.getByRole('combobox',{name:'Power-up effect',exact:true}).selectOption('overshield');await chooseTool(page,"Tag editor");await chooseTool(page,"Creator Studio");
  await expect(page.getByRole('tab',{name:'Custom power-ups',exact:true})).toHaveAttribute('aria-selected','true');await expect(duration).toHaveValue('120');await expect(page.getByRole('combobox',{name:'Power-up effect',exact:true})).toHaveValue('overshield');
  await page.getByRole('button',{name:'Remove power-up',exact:true}).click();await expect(page.getByRole('combobox',{name:'Custom power-up',exact:true})).toHaveCount(0);await page.keyboard.press('Control+z');await expect(page.getByRole('combobox',{name:'Custom power-up',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Build map with power-ups',exact:true}).click();await expect(page.getByRole('heading',{name:'From archive to in-game.',exact:true})).toBeVisible();
});

test('Portability Lab compares explicit native targets and preserves the existing build workflow',async({page})=>{
  await mockDesktop(page);
  await page.evaluate(()=>{
    const w=window as any,original=w.__TAURI_INTERNALS__.invoke;
    const profiles=['halo1-mcc-steam','halo1-custom-edition'].map((id,index)=>({profileId:id,label:index?'Halo Custom Edition':'MCC Halo 1',cacheVersions:[index?609:13],implementedAdapter:true,target:{edition:index?'customEdition':'mccHalo1',platform:'windows',architecture:'x86',distribution:'synthetic',extensionIds:[]}}));
    w.__sparkMock.projects.a.project.builds=[{id:'test-build',status:'validated',output:'synthetic.map',timestamp:'Synthetic fixture',target:'mcc-cea'}];
    w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
      if(['inspect_portability','verify_native_preservation','save_portability_report','compare_portability'].includes(command))w.__sparkMock.calls.push({command,args});
      if(command==='portability_profiles')return profiles;
      if(command==='inspect_portability')return {schemaVersion:1,projectId:args.projectId,sourceSha256:'a'.repeat(64),sourceEdition:'Synthetic CE fixture',sourceCacheVersion:609,sourceTags:4,auditedFields:2,limitations:['Synthetic contract; no gameplay proof.'],targets:args.targets.map((id:string)=>({profile:profiles.find(p=>p.profileId===id),cacheFamilyMatches:id==='halo1-custom-edition',compiler:'Synthetic compiler',conversionAvailable:id==='halo1-mcc-steam',buildPreflight:null,findings:id==='halo1-custom-edition'?[{code:'GENERIC_SHADER',severity:'blocker',title:'Requires a different shader for this target',detail:'Native generic shader is unsupported here.',nextAction:'Review a derived Chicago shader.',source:'https://c20.reclaimers.net/h1/tags/',tagIds:[2],affectedTags:1}]:[]}))};
      if(command==='verify_native_preservation')return {sourceSha256:'a'.repeat(64),derivedSha256:'a'.repeat(64),bytes:100,changedBytes:0,permittedRanges:[],untouchedBytesPreserved:true,byteIdentical:true,scope:'Derived extraction input only.'};
      if(command==='save_portability_report')return {json:'Synthetic/portability.json',markdown:'Synthetic/portability.md'};
      if(command==='compare_portability')return {sourceCacheVersion:609,targetCacheVersion:13,unchangedAuditedFields:2,fieldChangeCount:0,unpairedAuditedFields:0,missingTagCount:0,addedTagCount:0,missingTags:[],addedTags:[],fieldChanges:[],scope:'Inspected fields only; gameplay unverified.'};
      return original(command,args);
    };
  });
  await openFixture(page);await chooseTool(page,'Build & playtest');
  await page.getByRole('tab',{name:'Portability Lab',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Map conversion · CE / PC / Demo to MCC Halo 1',exact:true})).toBeHidden();
  await page.getByRole('checkbox',{name:'Halo Custom Edition',exact:false}).check();
  await page.getByRole('button',{name:'Inspect portability',exact:true}).click();
  await expect(page.getByText('Requires a different shader for this target',{exact:false})).toBeVisible();
  await expect(page.getByText('Imported-map conversion to this exact runtime is not implemented.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Verify untouched native bytes',exact:true}).click();
  await expect(page.getByRole('heading',{name:'No-op native bytes are identical',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save JSON & readable report',exact:true}).click();
  await expect(page.getByText('Synthetic/portability.md',{exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Portability comparison build',exact:true}).selectOption('test-build');
  await page.getByRole('button',{name:'Compare semantic changes',exact:true}).click();
  await expect(page.getByText('Inspected fields only; gameplay unverified.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'MCC build workflow',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Map conversion · CE / PC / Demo to MCC Halo 1',exact:true})).toBeVisible();
  const calls=await page.evaluate(()=>(window as any).__sparkMock.calls);
  expect(calls.find((c:any)=>c.command==='inspect_portability').args.targets).toEqual(['halo1-mcc-steam','halo1-custom-edition']);
  expect(calls.some((c:any)=>c.command==='start_build')).toBe(false);
});

test('leaving Portability Lab ignores a delayed source report and retains map edits',async({page})=>{
  await mockDesktop(page);await page.evaluate(()=>{const w=window as any,original=w.__TAURI_INTERNALS__.invoke;w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
    if(command==='portability_profiles')return [{profileId:'halo1-mcc-steam',label:'MCC Halo 1',target:{platform:'windows',architecture:'x86_64'}}];
    if(command==='inspect_portability')return new Promise(resolve=>{w.__finishPortability=()=>resolve({sourceEdition:'Stale old-map report',targets:[],limitations:[],sourceTags:1,auditedFields:1});});
    return original(command,args);
  };});
  await openFixture(page);const velocity=page.getByRole('spinbutton',{name:'Velocity',exact:true});await velocity.fill('42');await velocity.press('Enter');
  await chooseTool(page,'Build & playtest');await page.getByRole('tab',{name:'Portability Lab',exact:true}).click();
  await page.getByRole('button',{name:'Save & inspect portability',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__finishPortability)).toBe('function');
  await chooseTool(page,'Tag editor');await page.evaluate(()=>(window as any).__finishPortability());
  await expect(page.getByRole('spinbutton',{name:'Velocity',exact:true})).toHaveValue('42');
  await expect(page.getByText('Stale old-map report',{exact:false})).toHaveCount(0);
});

test('downloaded maps can open directly in the MCC conversion flow',async({page})=>{
  await mockDesktop(page);await openFixture(page);
  await page.evaluate(()=>{const w=window as any,original=w.__TAURI_INTERNALS__.invoke;w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>command==='import_dialog'?[await original('open_project',{id:'b'})]:original(command,args);});
  await chooseTool(page,"Community maps");await page.getByRole('button',{name:'Import & convert to MCC',exact:true}).click();await expect(page.getByRole('heading',{name:'From archive to in-game.',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Map conversion · CE / PC / Demo to MCC Halo 1',exact:true})).toBeVisible();
  const calls=await page.evaluate(()=>(window as any).__sparkMock.calls);expect(calls.some((c:any)=>c.command==='compatibility'&&c.args.id==='b')).toBe(true);expect(calls.some((c:any)=>c.command==='start_build')).toBe(false);
});

test('automatic sound discovery merges late pins without a folder prompt or losing edits',async({page})=>{
  await mockDesktop(page);
  await page.evaluate(()=>{
    const w=window as any,original=w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
      if(command==='auto_connect_sound_resources')return new Promise(resolve=>{w.__finishSoundDiscovery=async()=>{
        const open=await original('open_project',{id:args.projectId});
        resolve({...open,project:{...open.project,source:{...open.project.source,audioResources:{kind:'classic',directory:'C:/MCC/halo1/maps/custom_edition',sha256:{'sounds.map':'c'.repeat(64)}}}}});
      };});
      return original(command,args);
    };
  });
  await openFixture(page);const field=page.getByRole('spinbutton',{name:'Velocity',exact:true});
  await field.fill('24');await field.press('Tab');
  await page.waitForFunction(()=>typeof (window as any).__finishSoundDiscovery==='function');
  await page.evaluate(()=>(window as any).__finishSoundDiscovery());
  await expect(field).toHaveValue('24');
  await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.saved?.source?.audioResources?.kind)).toBe('classic');
  await page.keyboard.press('Control+z');await expect(field).toHaveValue('10');
  expect(await page.evaluate(()=>(window as any).__sparkMock.calls.some((call:any)=>call.command==='choose_project_resources'))).toBe(false);
});

test('sound settings stay labelled and separated in a narrow drawer without visiting server tools',async({page})=>{
  await mockDesktop(page);await openFixture(page);await chooseTool(page,'Level editor');
  await openDrawer(page,'Map sounds');
  const panel=page.locator('[data-panel-id="map-sounds"]');
  await panel.getByLabel('Map sounds drawer options',{exact:true}).click();
  for(const width of [280,360,520]){
    await panel.getByRole('slider',{name:'Map sounds size',exact:true}).fill(String(width));
    for(const bus of ['ambience','music','effects','dialogue']){
      const group=panel.getByRole('group',{name:bus,exact:true});
      const mute=group.getByRole('checkbox',{name:'Mute',exact:true}),solo=group.getByRole('checkbox',{name:'Solo',exact:true});
      const m=await mute.locator('..').boundingBox(),s=await solo.locator('..').boundingBox();
      expect(m).not.toBeNull();expect(s).not.toBeNull();
      expect(m!.x+m!.width+6<=s!.x||m!.y+m!.height<=s!.y).toBe(true);
      const bounds=await group.boundingBox(),input=await group.getByRole('spinbutton',{name:bus+' bus volume',exact:true}).boundingBox();
      expect(input!.x).toBeGreaterThanOrEqual(bounds!.x);expect(input!.x+input!.width).toBeLessThanOrEqual(bounds!.x+bounds!.width);
    }
    await expect(panel.getByText('Master volume',{exact:true})).toBeVisible();
    await expect(panel.getByText('Voice limit',{exact:true})).toBeVisible();
  }
});

test('map sound events persist through drawers and editing tools, then release on leaving the map',async({page})=>{
  await mockDesktop(page);
  await page.evaluate(async()=>{
    const w=window as any,original=w.__TAURI_INTERNALS__.invoke,open=await original('open_project',{id:'a'});
    open.inspection.tags.push({id:999,index:1,class:'snd!',path:'sound/test_wind',dataOffset:4,external:false,fields:[],references:[]});
    const frames=4410,bytes=new Uint8Array(44+frames*2),view=new DataView(bytes.buffer),text=(at:number,value:string)=>[...value].forEach((c,i)=>bytes[at+i]=c.charCodeAt(0));text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,22050,true);view.setUint32(28,44100,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,frames*2,true);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join(''),sampleHash='c'.repeat(64);
    const RealAudio=window.AudioContext;w.__soundContexts=[];w.AudioContext=class extends RealAudio{constructor(){super();w.__soundContexts.push(this);}};
    w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
      if(command==='open_project'&&args.id==='a'){const actual=await original(command,args);return {...actual,inspection:open.inspection};}
      if(command==='inspect_sound'&&args.tagId===999)return {tagId:999,tagPath:'sound/test_wind',sourceSha256:'a'.repeat(64),warnings:[],permutations:[{pitchRange:0,permutation:0,name:'Verified silent test WAV',format:'PCM',channels:1,sampleRate:22050,byteLength:frames*2,embedded:true,available:true,sha256:sampleHash,durationSeconds:.2,reason:null}]};
      if(command==='preview_sound'&&args.tagId===999)return {name:'Verified silent test WAV',mime:'audio/wav',sha256:hash,bytes:Array.from(bytes),sourceSha256:'a'.repeat(64),sourceSampleSha256:sampleHash};
      return original(command,args);
    };
  });
  await openFixture(page);await chooseTool(page,"Level editor");await openDrawer(page,'Map sounds');await page.getByRole('combobox',{name:'Map sound tag',exact:true}).selectOption('999');
  await page.getByRole('button',{name:'Add selected sound emitter',exact:true}).click();const mixer=page.getByRole('region',{name:'Spatial sound rehearsal',exact:true});
  await expect(page.getByRole('combobox',{name:'Map sound emitter',exact:true})).toBeVisible();await page.getByRole('spinbutton',{name:'Map sound master volume',exact:true}).fill('0');await page.getByRole('spinbutton',{name:'Map sound master volume',exact:true}).press('Enter');
  await page.getByRole('button',{name:'Start sound scene',exact:true}).click();await expect(mixer.getByRole('status')).toContainText('1/24 voices');
  await chooseTool(page,"Tag editor");await expect.poll(()=>page.evaluate(()=>(window as any).__soundContexts.some((c:AudioContext)=>c.state==='running'))).toBe(true);await chooseTool(page,'Map library');await expect.poll(()=>page.evaluate(()=>(window as any).__soundContexts.every((c:AudioContext)=>c.state==='closed'))).toBe(true);
  await chooseTool(page,"Level editor");await expect(page.getByRole('combobox',{name:'Map sound emitter',exact:true})).toBeVisible();await expect(page.getByRole('spinbutton',{name:'Map sound master volume',exact:true})).toHaveValue('0');
});
test('looping source tracks persist across tools and Finish waits for their end clip',async({page})=>{
  await mockDesktop(page);
  await page.evaluate(async()=>{
    const w=window as any,original=w.__TAURI_INTERNALS__.invoke,open=await original('open_project',{id:'a'});
    open.inspection.tags.push({id:1000,index:1,class:'lsnd',path:'sound/test_engine',dataOffset:4,external:false,fields:[],references:[{label:'Track 1 · Loop',targetId:999},{label:'Track 2 · Loop',targetId:996}]});
    const frames=4410,bytes=new Uint8Array(44+frames*2),view=new DataView(bytes.buffer),text=(at:number,value:string)=>[...value].forEach((c,i)=>bytes[at+i]=c.charCodeAt(0));
    text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,22050,true);view.setUint32(28,44100,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,frames*2,true);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
    const RealAudio=window.AudioContext;w.__soundContexts=[];w.AudioContext=class extends RealAudio{constructor(){super();w.__soundContexts.push(this);}};
    w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
      if(command==='open_project'&&args.id==='a'){const actual=await original(command,args);return {...actual,inspection:open.inspection};}
      if(command==='inspect_looping_sound')return {tagId:1000,tagPath:'sound/test_engine',sourceSha256:'a'.repeat(64),loops:true,warnings:[],tracks:[{index:0,gain:.5,startTagId:998,loopTagId:999,endTagId:997,fadeInSeconds:.05,fadeOutSeconds:.1},{index:1,gain:.7,startTagId:998,loopTagId:996,endTagId:997,fadeInSeconds:.05,fadeOutSeconds:.1}]};
      if(command==='inspect_sound')return {tagId:args.tagId,tagPath:'sound/test_engine_sample',sourceSha256:'a'.repeat(64),warnings:[],permutations:[{pitchRange:0,permutation:0,name:'Synthetic silence',format:'PCM',channels:1,sampleRate:22050,byteLength:frames*2,embedded:true,available:true,sha256:'c'.repeat(64),durationSeconds:.2,reason:null}]};
      if(command==='preview_sound')return {name:'Synthetic silence',mime:'audio/wav',sha256:hash,bytes:Array.from(bytes),sourceSha256:'a'.repeat(64),sourceSampleSha256:'c'.repeat(64)};
      return original(command,args);
    };
  });
  await openFixture(page);await chooseTool(page,'Level editor');await openDrawer(page,'Map sounds');
  await page.getByRole('textbox',{name:'Find a map sound',exact:true}).fill('test_engine');await page.getByRole('combobox',{name:'Map sound tag',exact:true}).selectOption('1000');
  await page.getByRole('combobox',{name:'Looping sound track',exact:true}).selectOption('1');await page.getByRole('button',{name:'Add selected sound emitter',exact:true}).click();
  await expect(page.getByText('Authored main track 2 includes source intro/end clips',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Start sound scene',exact:true}).click();
  const mixer=page.getByRole('region',{name:'Spatial sound rehearsal',exact:true});await expect(mixer.getByRole('status')).toContainText('1/24 voices');
  await page.getByRole('button',{name:'Finish sound end clips',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__soundContexts.every((ctx:AudioContext)=>ctx.state==='closed'))).toBe(true);
  await chooseTool(page,'Tag editor');await chooseTool(page,'Level editor');
  await expect(page.getByRole('textbox',{name:'Find a map sound',exact:true})).toHaveValue('test_engine');await expect(page.getByRole('combobox',{name:'Map sound tag',exact:true})).toHaveValue('1000');await expect(page.getByRole('combobox',{name:'Looping sound track',exact:true})).toHaveValue('1');
  await page.getByRole('button',{name:'Use loop sample only',exact:true}).click();await expect(page.getByText('Authored main track 2 includes source intro/end clips',{exact:false})).toHaveCount(0);
  await page.getByRole('button',{name:'Add all source tracks',exact:true}).click();
  const emitters=page.getByRole('combobox',{name:'Map sound emitter',exact:true});
  await expect(emitters.locator('option')).toHaveCount(3);
  await page.keyboard.press('Control+z');await expect(emitters.locator('option')).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');await expect(emitters.locator('option')).toHaveCount(3);
  await page.evaluate(()=>{const w=window as any,previous=w.__TAURI_INTERNALS__.invoke;w.__TAURI_INTERNALS__.invoke=(command:string,args:any)=>command==='inspect_sound'&&args.tagId===996?Promise.resolve({tagId:996,sourceSha256:'a'.repeat(64),permutations:[]}):previous(command,args);});
  await page.getByRole('button',{name:'Add all source tracks',exact:true}).click();
  await expect(mixer.getByText(/Track 2: no playable source sample/)).toBeVisible();
  await expect(emitters.locator('option')).toHaveCount(3);
});

test('shared source stays synchronized across tools with one game connection drawer',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('spark-test-forge',JSON.stringify({schemaVersion:1,name:'Synthetic forge',template:'emptyArena',runtimeId:'mccSteam',gameMode:'slayer',skyPath:null,buildQuality:'draft',geometry:[],materials:[],placements:[],spawns:[],objectives:[]})));
  await mockDesktop(page);await openFixture(page);await chooseTool(page,"Level editor");
  await expect(page.locator('.forge-topbar')).toHaveCount(0);
  await expect(page.locator('.forge-center > .forge-live-panel')).toHaveCount(0);
  const viewport=await page.locator('.forge-viewport').boundingBox();
  const session=page.getByRole('region',{name:'SparkLink panel',exact:true});
  const revealSession=async()=>{
    if(await session.isVisible())return;
    await page.locator('.gs-layout-menu > summary').click();
    await page.locator('.gs-layout-menu').getByLabel('SparkLink',{exact:true}).check();
    await page.locator('.gs-layout-menu > summary').click();
  };
  await revealSession();
  expect(await page.locator('.forge-viewport').boundingBox()).toEqual(viewport);
  const sharing=page.locator('details.forge-live-panel').filter({has:page.locator('summary').filter({hasText:'Shared source'})});await sharing.locator('summary').first().click();
  await page.getByRole('button',{name:'Host editing session',exact:true}).click();await expect(page.getByRole('button',{name:'Leave session',exact:true})).toBeVisible();
  await expect(page.locator('.gs-panel-overflow [role="menuitemcheckbox"][aria-label="Game connection"]')).toHaveCount(1);
  await openDrawer(page,'Game connection');
  await expect(page.getByRole('region',{name:'Game connection panel',exact:true})).toHaveCount(1);
  await expect(page.getByText('Live Halo adapter · MCC',{exact:true})).toBeVisible();
  await chooseTool(page,"Tag editor");
  expect(await page.evaluate(()=>(window as any).__sparkMock.calls.filter((call:any)=>call.command==='forge_session_leave').length)).toBe(0);
  await page.evaluate(()=>{(window as any).__sparkMock.session.view.document.name='Another editor changed the name';});
  await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.calls.filter((call:any)=>call.command==='forge_session_poll').length)).toBeGreaterThan(0);
  await chooseTool(page,"Level editor");await revealSession();
  await expect(page.getByText('Paused · local draft retained',{exact:false})).toHaveCount(0);
  await expect(page.locator('.gs-panel-overflow [role="menuitemcheckbox"][aria-label="Game connection"]')).toHaveCount(1);
  await page.getByRole('button',{name:'Leave session',exact:true}).click();
  const calls=await page.evaluate(()=>(window as any).__sparkMock.calls.filter((call:any)=>call.command==='forge_session_leave'));expect(calls).toHaveLength(1);expect(calls[0].args).toEqual({projectId:'a',sessionId:'11111111-1111-4111-8111-111111111111'});
});

test('shared keyboard history waits for a poll and unfinished undo without losing order', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('spark-test-forge', JSON.stringify({schemaVersion:1,name:'Synthetic forge',template:'emptyArena',runtimeId:'mccSteam',gameMode:'slayer',skyPath:null,buildQuality:'draft',geometry:[],materials:[],placements:[],spawns:[],objectives:[]})));
  await mockDesktop(page);
  await openFixture(page);
  await chooseTool(page, 'Level editor');
  await page.evaluate(() => {
    const w=window as any, previous=w.__TAURI_INTERNALS__.invoke;
    w.__sparkReverseCalls=[];
    w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
      if(command==='forge_session_host') {
        await previous(command,args);
        Object.assign(w.__sparkMock.session.view,{canUndo:true,canRedo:false,role:'owner',encrypted:true,durable:true});
        return structuredClone(w.__sparkMock.session);
      }
      if(command==='forge_session_reverse') {
        w.__sparkReverseCalls.push(args.redo);
        if(!args.redo) await new Promise<void>(resolve=>{w.__sparkReleaseUndo=resolve;});
        const view=w.__sparkMock.session.view;
        view.revision++;view.document.name=args.redo?'Redone shared source':'Undone shared source';
        view.canUndo=args.redo;view.canRedo=!args.redo;view.acknowledgedOperationId=args.operationId;
        return structuredClone(view);
      }
      if(command==='forge_session_poll' && w.__sparkGatePoll) {
        w.__sparkGatePoll=false;
        await new Promise<void>(resolve=>{w.__sparkReleasePoll=resolve;});
      }
      return previous(command,args);
    };
  });
  await page.getByRole('button',{name:'Live Studio · Solo',exact:true}).click();
  await page.getByRole('button',{name:'Host editing session',exact:true}).click();
  await page.locator('.forge-viewport canvas').click({position:{x:50,y:50}});
  await page.evaluate(()=>{(window as any).__sparkGatePoll=true;});
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__sparkReleasePoll)).toBe('function');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  expect(await page.evaluate(()=>(window as any).__sparkReverseCalls)).toEqual([]);
  await page.evaluate(()=>(window as any).__sparkReleasePoll());
  await expect.poll(()=>page.evaluate(()=>(window as any).__sparkReverseCalls)).toEqual([false]);
  expect(await page.evaluate(()=>(window as any).__sparkReverseCalls)).toEqual([false]);
  await page.evaluate(()=>(window as any).__sparkReleaseUndo());
  await expect.poll(()=>page.evaluate(()=>(window as any).__sparkReverseCalls)).toEqual([false,true]);
  await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.session.view.document.name)).toBe('Redone shared source');
});

test('live Ctrl+Z waits for an in-flight game receipt and then supports redo',async({page})=>{
  await mockDesktop(page);
  await page.evaluate(()=>{
    const w=window as any,original=w.__TAURI_INTERNALS__.invoke;
    const object={datum:12,tagDatum:7,kind:0,scale:1,tagPath:'synthetic/biped',position:[1,2,3],velocity:[0,0,0],forward:[1,0,0],up:[0,0,1],parentDatum:4294967295,player:true};
    let connected=false;w.__liveReceipt={pending:false,object,calls:0,token:'first-synthetic-connection'};
    const status=()=>structuredClone({pid:3,sessionToken:w.__liveReceipt.token,activeVehiclePhysics:false,activeSharedScales:false,scaleKeeperError:null,snapshot:{profile:'synthetic',identity:{scenario:'test/map',checksum:123,tagCount:1,scenarioDatum:7},objects:[object]},detail:'Synthetic receipt timing test'});
    w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
      if(command==='live_mcc_connect'){connected=true;return status();}
      if(command==='live_mcc_sample'){if(!connected)throw new Error('No test session');return status();}
      if(command==='live_mcc_move_object'){w.__liveReceipt.pending=true;w.__liveReceipt.calls++;object.position=[...args.operation.position];await new Promise(resolve=>setTimeout(resolve,250));w.__liveReceipt.pending=false;return [{datum:12,applied:true,observedPosition:[...object.position],message:'Synthetic acknowledged move'}];}
      return original(command,args);
    };
  });
  await chooseTool(page,"Level editor");await page.getByRole('button',{name:'Connect to a running Halo game',exact:true}).click();await page.getByRole('combobox',{name:'Editing target',exact:true}).selectOption('live');await openDrawer(page,'Game connection');await page.getByRole('checkbox',{name:'I launched MCC using Anti-Cheat Disabled in Steam'}).check();await page.getByRole('button',{name:'Connect current Halo 1 session',exact:true}).click();await page.getByRole('combobox',{name:'Live Halo object',exact:true}).selectOption('12');
  const x=page.getByRole('spinbutton',{name:'Live position X',exact:true});await x.fill('4');await x.press('Tab');await page.getByRole('button',{name:'Apply live object position',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__liveReceipt.pending)).toBe(true);await page.keyboard.press('Control+z');
  await expect.poll(()=>page.evaluate(()=>(window as any).__liveReceipt.object.position[0])).toBe(1);await expect(page.getByRole('button',{name:'Redo live edit (Ctrl+Y)',exact:true})).toBeEnabled();await page.keyboard.press('Control+y');await expect.poll(()=>page.evaluate(()=>(window as any).__liveReceipt.object.position[0])).toBe(4);await expect.poll(()=>page.evaluate(()=>(window as any).__liveReceipt.calls)).toBe(3);
  await page.evaluate(()=>{(window as any).__liveReceipt.token='reconnected-same-pid-and-map';});
  await expect(page.getByRole('button',{name:'Undo live edit (Ctrl+Z)',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Redo live edit (Ctrl+Y)',exact:true})).toBeDisabled();
});

test('numeric-field Ctrl+Z and both redo shortcuts survive autosave; history limit persists',async({page})=>{
  await mockDesktop(page);await openFixture(page);
  const field=page.getByRole('spinbutton',{name:'Velocity',exact:true});await field.fill('24');await field.press('Tab');
  await expect(field).toHaveValue('24');await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.saved?.tagEdits?.[0]?.value)).toBe(24);
  await field.focus();await page.keyboard.press('Control+z');await expect(field).toHaveValue('10');
  await field.focus();await page.keyboard.press('Control+y');await expect(field).toHaveValue('24');
  await field.focus();await page.keyboard.press('Control+z');await expect(field).toHaveValue('10');
  await field.focus();await page.keyboard.press('Control+Shift+z');await expect(field).toHaveValue('24');
  await chooseTool(page,"Settings & tools");await page.getByText('Advanced folders, backups & preferences', { exact: true }).click();const limit=page.getByRole('spinbutton',{name:'Undo history limit',exact:true});await expect(limit).toHaveValue('100');
  await limit.fill('150');await limit.press('Tab');await expect.poll(()=>page.evaluate(()=>localStorage.getItem('guilty-spark-undo-limit-v1'))).toBe('150');
  await page.reload();await chooseTool(page,"Settings & tools");await expect(page.getByRole('spinbutton',{name:'Undo history limit',exact:true})).toHaveValue('150');
});
test('onboarding keeps a failed save on its step and remembers completed Halo and tool choices',async({page})=>{
  await mockDesktop(page);await page.goto('/');await chooseTool(page,"Start here");
  await page.evaluate(()=>(window as any).__sparkMock.failSettings=true);
  await page.getByRole('button',{name:'Continue to tools',exact:true}).click();await expect(page.locator('.gs-first-setup').getByRole('alert')).toContainText('settings write failed');await expect(page.getByRole('heading',{name:'Which Halo are you working with?',exact:true})).toBeVisible();
  await page.evaluate(()=>(window as any).__sparkMock.failSettings=false);await page.getByRole('button',{name:'Continue to tools',exact:true}).click();
  await page.getByRole('textbox',{name:'Setup Map Builder folder',exact:true}).fill('C:/owned/HCEEK');await page.getByRole('combobox',{name:'Setup editing kit generation',exact:true}).selectOption('h1aEk');await page.getByRole('textbox',{name:'Setup Editable Halo Tags folder',exact:true}).fill('C:/owned/working-tags');await page.getByRole('button',{name:'Save setup & open help',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Learning center',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'One Halo. Every World. Every Tool. Together.',exact:true})).toBeVisible();await chooseTool(page,"Start here");await expect(page.getByRole('heading',{name:'Your workbench is ready',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Change Halo or tools',exact:true}).click();await page.getByRole('button',{name:'Continue to tools',exact:true}).click();await expect(page.getByRole('textbox',{name:'Setup Editable Halo Tags folder',exact:true})).toHaveValue('C:/owned/working-tags');
});

test('onboarding keeps four primary runtimes and does not inherit MCC guidance for Custom Edition', async ({page}) => {
  await mockDesktop(page);
  await page.evaluate(() => localStorage.setItem('spark-test-settings', JSON.stringify({hekFlavor:'h1aEk',hekDirectory:'C:/owned/HCEEK'})));
  await page.goto('/?workspace=get-started');
  const choices = page.getByRole('group',{name:'Your Halo edition',exact:true});
  await expect(choices.getByRole('button')).toHaveCount(4);
  for (const name of ['Halo CE in MCC','Halo Custom Edition','OpenCE','ChupathingyCE'])
    await expect(choices.getByRole('button',{name:new RegExp(name)})).toBeVisible();
  await choices.getByRole('button',{name:/Halo Custom Edition/}).click();
  await page.getByRole('button',{name:'Continue to tools',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Setup editing kit generation',exact:true})).toHaveValue('h1aEk');
  await expect(page.getByRole('textbox',{name:'Setup Map Builder folder',exact:true})).toHaveValue('C:/owned/HCEEK');
  await expect(page.getByRole('link',{name:'Open Steam listing',exact:true})).toHaveCount(0);
  await expect(page.getByText('Choose the editing kit that matches your target:',{exact:false})).toBeVisible();
});

test('settings keyboard navigation keeps focus when a lazy tab loads', async ({page}) => {
  await mockDesktop(page); await page.goto('/'); await chooseTool(page,'Settings & tools');
  const tools = page.getByRole('tab',{name:'Games & tools',exact:true});
  await tools.focus(); await page.keyboard.press('End');
  await expect(page.getByRole('tab',{name:'Interface Studio',exact:true})).toBeFocused();
  await expect(page.getByRole('tab',{name:'Interface Studio',exact:true})).toHaveAttribute('aria-selected','true');
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab',{name:'Dependencies & setup',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab',{name:'Interface Studio',exact:true})).toBeFocused();
  await expect(page.getByRole('tablist',{name:'Settings sections',exact:true}).locator('[tabindex="0"]')).toHaveCount(1);
  await page.getByRole('button',{name:'Pop out workspace',exact:true}).click();
  await expect.poll(() => page.evaluate(() => (window as any).__sparkMock.calls.filter((item:any) => item.command === 'open_workspace_window').at(-1)?.args)).toEqual({workspace:'settings',section:'interface',context:null});
  await page.goto('/?workspace=settings&section=interface');
  await expect(page.getByRole('tab',{name:'Interface Studio',exact:true})).toHaveAttribute('aria-selected','true');
});
test('feature search preserves multiple open maps and each map undo history',async({page})=>{
  await mockDesktop(page);await openFixture(page);const velocity=page.getByRole('spinbutton',{name:'Velocity',exact:true});await velocity.fill('24');await velocity.press('Tab');
  await chooseTool(page,"Map library");await page.locator('.map-card').filter({hasText:'Synthetic candidate'}).click();await chooseTool(page,"Tag editor");
  await chooseTool(page,"Features & workflows");await expect(page.getByRole('heading',{name:'What can Spark do?',exact:true})).toBeVisible();await expect(page.locator('.feature-map-context')).toContainText('Synthetic candidate');await expect(page.locator('.feature-map-context')).toContainText('2 open maps');
  await page.getByRole('searchbox',{name:'Find a Spark feature',exact:true}).fill('multiple maps');await expect(page.getByRole('heading',{name:'Multiple maps & windows',exact:true})).toBeVisible();await page.getByRole('searchbox',{name:'Find a Spark feature',exact:true}).fill('zzzz-unavailable');await expect(page.getByText('No features match this search.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Show all features',exact:true}).click();
  await page.getByRole('tab',{name:/Synthetic baseline/}).click();await chooseTool(page,"Tag editor");await expect(velocity).toHaveValue('24');await velocity.focus();await page.keyboard.press('Control+z');await expect(velocity).toHaveValue('10');await page.getByRole('tab',{name:/Synthetic candidate/}).click();await expect(velocity).toHaveValue('25');
});

test('level views retain their WebGL context across tools and maps while inactive views stop drawing', async ({page}) => {
  await mockDesktop(page); await openFixture(page); await chooseTool(page,'Level editor');
  await expect(page.locator('.world-layout canvas')).toHaveCount(1);
  await expect(page.locator('.world-layout canvas')).toBeVisible();
  await page.locator('.world-layout canvas').evaluate((canvas:HTMLCanvasElement) => {
    const w=window as any,gl=canvas.getContext('webgl2')!;
    w.__keptLevel={canvas,gl,draws:0};
    const original=gl.clear.bind(gl);
    gl.clear=(...args:Parameters<WebGL2RenderingContext['clear']>)=>{w.__keptLevel.draws++;original(...args);};
  });
  await expect.poll(()=>page.evaluate(()=>(window as any).__keptLevel.draws)).toBeGreaterThan(0);
  await chooseTool(page,'Tag editor');
  await expect.poll(()=>page.evaluate(()=>(window as any).__keptLevel.canvas.dataset.gsEditorActivity)).toBe('paused');
  const paused=await page.evaluate(()=>(window as any).__keptLevel.draws);
  await page.waitForTimeout(200);
  expect(await page.evaluate(()=>(window as any).__keptLevel.draws)).toBe(paused);
  expect(await page.evaluate(()=>(window as any).__keptLevel.gl.isContextLost())).toBe(false);
  await page.getByRole('spinbutton',{name:'Velocity',exact:true}).fill('34');
  await page.keyboard.press('Tab');
  await chooseTool(page,'Level editor');
  expect(await page.locator('.world-layout canvas').evaluate(canvas=>canvas===(window as any).__keptLevel.canvas)).toBe(true);
  await chooseTool(page,'Map library');await page.locator('.map-card').filter({hasText:'Synthetic candidate'}).click();await chooseTool(page,'Level editor');
  expect(await page.locator('.world-layout canvas').evaluate(canvas=>canvas===(window as any).__keptLevel.canvas)).toBe(false);
  await page.getByRole('tab',{name:/Synthetic baseline/}).click();await chooseTool(page,'Level editor');
  expect(await page.locator('.world-layout canvas').evaluate(canvas=>canvas===(window as any).__keptLevel.canvas)).toBe(true);
  await expect(page.locator('.gs-panel-overflow [role="menuitemcheckbox"][aria-label="Game connection"]')).toHaveCount(1);
  await expect.poll(()=>page.evaluate(()=>(window as any).__keptLevel.draws)).toBeGreaterThan(paused);
  await chooseTool(page,'Tag editor');await expect(page.getByRole('spinbutton',{name:'Velocity',exact:true})).toHaveValue('34');
});
test('a third map retires the oldest GPU view while retaining its editor, camera and author history',async({page})=>{
 await mockDesktop(page);await openFixture(page);await page.getByRole('spinbutton',{name:'Velocity',exact:true}).fill('34');await page.keyboard.press('Tab');await chooseTool(page,'Level editor');
 const canvas=page.locator('.world-layout canvas');await expect(canvas).toHaveAttribute('data-gs-camera-pose',/.+/);
 await canvas.evaluate((element:HTMLCanvasElement)=>{(window as any).__retiredView={canvas:element,world:element.closest('.world-layout'),gl:element.getContext('webgl2'),pose:JSON.parse(element.dataset.gsCameraPose!)};});
 for(const title of ['Synthetic candidate','Synthetic third donor']){await chooseTool(page,'Map library');await page.locator('.map-card').filter({has:page.getByRole('heading',{name:title,exact:true})}).click();await chooseTool(page,'Level editor');await expect(page.locator('.world-layout canvas')).toBeVisible();}
 await expect.poll(()=>page.evaluate(()=>(window as any).__retiredView.world.querySelector('canvas')===null)).toBe(true);
 await expect.poll(()=>page.evaluate(()=>(window as any).__retiredView.gl.isContextLost())).toBe(true);
 expect(await page.evaluate(()=>(window as any).__retiredView.world.closest('.gs-retained-level-content').dataset.levelGraphics)).toBe('released');
 const opens=await page.evaluate(()=>(window as any).__sparkMock.calls.filter((c:any)=>c.command==='open_project'&&c.args.id==='a').length);
 await page.getByRole('tab',{name:'Synthetic baseline',exact:true}).click();await chooseTool(page,'Level editor');
 await expect(canvas).toHaveAttribute('data-gs-camera-pose',/.+/);
 const restored=await canvas.evaluate((element:HTMLCanvasElement)=>({sameEditor:element.closest('.world-layout')===(window as any).__retiredView.world,newCanvas:element!==(window as any).__retiredView.canvas,live:!element.getContext('webgl2')!.isContextLost(),before:(window as any).__retiredView.pose,after:JSON.parse(element.dataset.gsCameraPose!)}));
 expect(restored.sameEditor).toBe(true);expect(restored.newCanvas).toBe(true);expect(restored.live).toBe(true);
 for(const key of ['position','quaternion','target'] as const)if(restored.before[key])for(let i=0;i<restored.before[key].length;i++)expect(restored.after[key][i]).toBeCloseTo(restored.before[key][i],4);
 expect(await page.evaluate(()=>(window as any).__sparkMock.calls.filter((c:any)=>c.command==='open_project'&&c.args.id==='a').length)).toBe(opens);
 await chooseTool(page,'Tag editor');await expect(page.getByRole('spinbutton',{name:'Velocity',exact:true})).toHaveValue('34');await page.keyboard.press('Control+z');await expect(page.getByRole('spinbutton',{name:'Velocity',exact:true})).toHaveValue('10');
});

test('parked BSP Workshop retains its four-view editor and ignores another map hotkeys',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('spark-test-forge',JSON.stringify({schemaVersion:1,name:'Synthetic forge',template:'emptyArena',runtimeId:'mccSteam',gameMode:'slayer',skyPath:null,buildQuality:'draft',geometry:[],materials:[],placements:[],spawns:[],objectives:[],workshop:{schemaVersion:1,brushes:[],portals:[]}})));
 await mockDesktop(page);await openFixture(page);await chooseTool(page,'Level editor');
 const workshop=page.locator('.bsp-workshop');await expect(workshop.locator('.bsp-view')).toHaveCount(4);await expect(workshop.locator('canvas')).toHaveAttribute('data-gs-camera-pose',/.+/);
 await workshop.locator('canvas').evaluate((canvas:HTMLCanvasElement)=>{(window as any).__keptBsp={editor:canvas.closest('.bsp-workshop'),canvas,gl:canvas.getContext('webgl2'),pose:JSON.parse(canvas.dataset.gsCameraPose!)};});
 await page.keyboard.press('e');await expect(workshop.getByRole('button',{name:'Rotate',exact:true})).toHaveAttribute('aria-pressed','true');
 for(const name of ['Synthetic candidate','Synthetic third donor']){await chooseTool(page,'Map library');await page.locator('.map-card').filter({has:page.getByRole('heading',{name,exact:true})}).click();await chooseTool(page,'Level editor');}
 await expect.poll(()=>page.evaluate(()=>(window as any).__keptBsp.editor.querySelector('canvas')===null)).toBe(true);await expect.poll(()=>page.evaluate(()=>(window as any).__keptBsp.gl.isContextLost())).toBe(true);
 await page.keyboard.press('w');
 await page.getByRole('tab',{name:'Synthetic baseline',exact:true}).click();await chooseTool(page,'Level editor');await expect(workshop.locator('.bsp-view')).toHaveCount(4);await expect(workshop.locator('canvas')).toHaveAttribute('data-gs-camera-pose',/.+/);
 await expect(workshop.getByRole('button',{name:'Rotate',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await workshop.evaluate(element=>element===(window as any).__keptBsp.editor)).toBe(true);expect(await workshop.locator('canvas').evaluate(element=>element!==(window as any).__keptBsp.canvas)).toBe(true);
});

test('idle level views stop drawing and camera gestures resume without unloading content', async ({page}) => {
  await mockDesktop(page); await openFixture(page); await chooseTool(page, 'Level editor');
  const canvas = page.locator('.world-layout canvas');
  await expect(canvas).toHaveAttribute('data-gs-editor-activity', 'idle');
  await canvas.evaluate((element: HTMLCanvasElement) => {
    const w = window as any, gl = element.getContext('webgl2')!;
    w.__idleDraws = 0;
    const clear = gl.clear.bind(gl);
    gl.clear = (...args: Parameters<WebGL2RenderingContext['clear']>) => { w.__idleDraws++; clear(...args); };
  });
  // Count real GL calls after material uploads and orbit damping settle.
  await page.waitForTimeout(700);
  const idle = await page.evaluate(() => (window as any).__idleDraws);
  const before = JSON.parse((await canvas.getAttribute('data-gs-camera'))!);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as any).__idleDraws)).toBe(idle);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await page.mouse.down({button: 'right'});
  await expect(canvas).toHaveAttribute('data-gs-editor-activity', 'interactive');
  await page.keyboard.down('w'); await page.waitForTimeout(350);
  await page.keyboard.up('w'); await page.mouse.up({button: 'right'});
  await expect(canvas).toHaveAttribute('data-gs-editor-activity', 'idle');
  const after = JSON.parse((await canvas.getAttribute('data-gs-camera'))!);
  expect(after.position.some((value: number, index: number) => Math.abs(value - before.position[index]) > 0.1)).toBe(true);
  expect(await page.evaluate(() => (window as any).__idleDraws)).toBeGreaterThan(idle);
  await page.waitForTimeout(700);
  const stopped = await page.evaluate(() => (window as any).__idleDraws);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as any).__idleDraws)).toBe(stopped);
});

test('maps retain independent tag views, tool profiles and last workspace; a late load respects navigation',async({page})=>{
  await mockDesktop(page);await openFixture(page);const search=page.getByRole('textbox',{name:'Search tags',exact:true});await search.fill('test');await page.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('weap');
  await openDrawer(page,'Project setup');await page.locator('.gs-map-tools>summary').click();await page.locator('.gs-map-tools .gs-build-targets>summary').click();await page.locator('.gs-map-tools').getByRole('button',{name:'Add runtime target',exact:true}).click();const aFields=page.locator('.gs-map-tools fieldset').getByRole('textbox');await aFields.nth(0).fill('Map A kit');await aFields.nth(1).fill('C:/MapA/HCEEK');await aFields.nth(2).fill('C:/MapA/tags');
  await chooseTool(page,"Map library");await page.evaluate(()=>(window as any).__sparkMock.delayOpen=600);await page.locator('.map-card').filter({hasText:'Synthetic candidate'}).click();await chooseTool(page,"Features & workflows");await expect(page.getByRole('tab',{name:/Synthetic candidate/})).toBeVisible();await expect(page.getByRole('heading',{name:'What can Spark do?',exact:true})).toBeVisible();await expect(page.locator('.gs-map-tools')).toContainText('default tools');
  await chooseTool(page,"Tag editor");await expect(search).toHaveValue('');await search.fill('candidate');
  await page.getByRole('tab',{name:/Synthetic baseline/}).click();await expect(search).toHaveValue('test');await expect(page.getByRole('combobox',{name:'Filter tag class',exact:true})).toHaveValue('weap');await expect(page.locator('.gs-map-tools fieldset').getByRole('textbox').nth(0)).toHaveValue('Map A kit');await expect(page.locator('.gs-map-tools fieldset').getByRole('textbox').nth(2)).toHaveValue('C:/MapA/tags');
  await chooseTool(page,"Level editor");await page.getByRole('tab',{name:/Synthetic candidate/}).click();await expect(search).toHaveValue('candidate');await page.getByRole('tab',{name:/Synthetic baseline/}).click();await expect(page.getByRole('combobox',{name:'Editing target',exact:true})).toBeVisible();
});
test('settings Browse survives a bootstrap refresh without erasing other drafts', async ({ page }) => {
  await mockDesktop(page);
  await chooseTool(page,"Settings & tools");
  await page.getByText('Advanced folders, backups & preferences', { exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Halo Textures and shared sounds', exact: true })
    .fill('C:/synthetic/resources');
  await page
    .locator('.setting-row')
    .filter({ has: page.getByText('Steam installation', { exact: true }) })
    .getByRole('button', { name: 'Browse' })
    .click();
  await expect(page.getByRole('textbox', { name: 'Steam installation' })).toHaveValue(
    'C:/synthetic/selected',
  );
  await expect(page.getByRole('textbox', { name: 'Halo Textures and shared sounds', exact: true })).toHaveValue(
    'C:/synthetic/resources',
  );
  await page.getByRole('button', { name: 'Apply preferences', exact: true }).first().click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__sparkMock.calls.filter((call: any) => call.command === 'save_settings').length,
      ),
    )
    .toBe(1);
});
test('comparison renders semantic values and warns about undecoded payloads', async ({ page }) => {
  await mockDesktop(page);
  await chooseTool(page,"Compare variants");
  const changed = page.locator('.difference-row').filter({ hasText: 'Velocity' });
  await expect(changed).toContainText('10');
  await expect(changed).toContainText('25');
  await openDrawer(page,'Comparison info');
  await expect(
    page.getByText('Unchanged tag names are not proof of identical asset data.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', {name:'Close Comparison info', exact:true}).click();
  await page.getByRole('combobox', { name: 'Difference status' }).selectOption('unknown');
  await expect(page.locator('.difference-row')).toHaveCount(1);
  await expect(page.locator('.difference-row')).toContainText('BSP mesh');
});

test('compact comparison fits rows to the window and preserves filters, pages and full values', async ({page}, testInfo) => {
  await mockDesktop(page);
  await page.evaluate(() => {
    const projects=(window as any).__sparkMock.projects;
    for (const [id,delta] of [['a',0],['b',1000]] as const) {
      const field=projects[id].inspection.tags[0].fields[0];
      projects[id].inspection.tags[0].fields=Array.from({length:180},(_,i)=>({...field,key:`field-${i}`,label:`Tuning value ${String(i).padStart(3,'0')}`,value:i+delta}));
    }
  });
  const originals=await page.evaluate(()=>JSON.stringify((window as any).__sparkMock.projects));
  await page.setViewportSize({width:1920,height:1080});
  await chooseTool(page,'Compare variants');
  const rows=page.locator('.difference-row'), list=page.locator('.difference-list');
  await expect.poll(()=>rows.count()).toBeGreaterThanOrEqual(20);
  const first=await rows.first().textContent();
  await expect.poll(()=>list.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeLessThanOrEqual(2);
  const largeRows=await rows.count();
  await page.screenshot({path:testInfo.outputPath('compare-1920.png')});
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(rows.first()).not.toHaveText(first!);
  const next=await rows.first().textContent();
  await chooseTool(page,'Features & workflows');await chooseTool(page,'Compare variants');
  await expect(rows.first()).toHaveText(next!);
  await page.getByRole('textbox',{name:'Search differences',exact:true}).fill('Tuning value 042');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).not.toHaveAttribute('open','');
  await rows.first().locator('summary').focus();await page.keyboard.press('Enter');
  await expect(rows.first().locator('.difference-values')).toBeVisible();
  await expect(rows.first().locator('.difference-values')).toContainText('1042');
  await openDrawer(page,'Comparison info');
  const info=page.getByRole('region',{name:'Comparison info panel',exact:true});
  await info.locator('.compare-source-details > summary').click();
  await expect(info.locator('.compare-identities code').first()).toHaveText('a'.repeat(64));
  await expect(info.getByText('Bitmap / sound / model / animation payloads')).toBeVisible();
  await page.getByRole('button',{name:'Close Comparison info',exact:true}).click();
  await page.getByRole('textbox',{name:'Search differences',exact:true}).fill('');
  await page.setViewportSize({width:800,height:600});
  await expect.poll(()=>rows.count()).toBeLessThan(20);
  await expect.poll(()=>rows.count()).toBeGreaterThanOrEqual(5);
  await expect.poll(()=>list.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeLessThanOrEqual(2);
  expect(await page.locator('.compare-page').evaluate(e=>e.scrollWidth<=e.clientWidth&&e.scrollHeight<=e.clientHeight)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('compare-800.png')});
  await testInfo.attach('comparison-layout', {contentType:'application/json',body:Buffer.from(JSON.stringify({largeRows,smallRows:await rows.count(),smallList:await list.evaluate(e=>({height:e.clientHeight,content:e.scrollHeight})),syntheticIpc:true}))});
  expect(await page.evaluate(()=>JSON.stringify((window as any).__sparkMock.projects))).toBe(originals);
});
test('cancelled descriptor export has no success notice and all readiness failures are visible', async ({
  page,
}) => {
  await mockDesktop(page);
  await openFixture(page);
  await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();await page.getByRole('button', { name: 'Export .gsproject' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__sparkMock.calls.filter((call: any) => call.command === 'export_project').length,
      ),
    )
    .toBe(1);
  await expect(page.getByText('Project descriptor exported.', { exact: false })).toHaveCount(0);
  await chooseTool(page,"Build & playtest");
  await expect(page.getByText('Compatibility check: Error: Synthetic compatibility error')).toBeVisible();
  await expect(page.getByText('Launch readiness: Error: Synthetic readiness error')).toBeVisible();
  await expect(page.getByText('Metadata template: Error: Synthetic template error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Install local package', exact: true })).toBeDisabled();
});
test('close guard commits focused fields and stays open after a save failure', async ({ page }) => {
  await mockDesktop(page);
  await openFixture(page);
  await page.getByRole('spinbutton', { name: 'Velocity' }).fill('44');
  await page.evaluate(async () => {
    (window as any).__sparkMock.failSave = true;
    await (window as any).__sparkMock.emit('tauri://close-requested');
  });
  await expect(page.getByRole('alert')).toContainText('window remains open');
  expect(
    await page.evaluate(() =>
      (window as any).__sparkMock.calls.some((call: any) => call.command === 'close_application'),
    ),
  ).toBe(false);
  await page.evaluate(async () => {
    (window as any).__sparkMock.failSave = false;
    await (window as any).__sparkMock.emit('tauri://close-requested');
  });
  expect(await page.evaluate(() => (window as any).__sparkMock.saved.tagEdits)).toEqual([
    { tagId: 1, fieldKey: 'velocity', value: 44 },
  ]);
  expect(
    await page.evaluate(
      () =>
        (window as any).__sparkMock.calls.filter((call: any) => call.command === 'close_application').length,
    ),
  ).toBe(1);
});
test('BSP connection drafts survive tool switches and applied connections undo per map',async({page})=>{
  await mockDesktop(page);await openFixture(page);await chooseTool(page,"Level editor");if(!await page.getByRole('region',{name:'Construction panel',exact:true}).isVisible())await openDrawer(page,'Construction');await page.locator('.bsp-assembly:visible>summary').click();await page.getByRole('button',{name:'Plan connected tunnel',exact:true}).click();const width=page.getByRole('spinbutton',{name:'Tunnel width',exact:true});await width.fill('4');await width.press('Tab');await chooseTool(page,"Features & workflows");await chooseTool(page,"Level editor");await expect(page.getByRole('spinbutton',{name:'Tunnel width',exact:true})).toHaveValue('4');await page.getByRole('button',{name:'Apply connection',exact:true}).click();await expect(page.getByRole('button',{name:'Remove connection',exact:true})).toBeEnabled();await page.keyboard.press('Control+z');await expect(page.getByRole('button',{name:'Remove connection',exact:true})).toHaveCount(0);await page.keyboard.press('Control+Shift+z');await expect(page.getByRole('button',{name:'Remove connection',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Check tunnel clearance',exact:true}).click();await expect(page.locator('.bsp-assembly')).toContainText('42 points');expect(await page.evaluate(()=>(window as any).__sparkMock.saved.bspAssembly.tunnelWidth)).toBe(4);
  await chooseTool(page,"Map library");await page.locator('.map-card').filter({hasText:'Synthetic candidate'}).click();await chooseTool(page,"Level editor");if(!await page.getByRole('region',{name:'Construction panel',exact:true}).isVisible())await openDrawer(page,'Construction');await page.locator('.bsp-assembly:visible>summary').click();await expect(page.getByRole('button',{name:'Remove connection',exact:true})).toHaveCount(0);await page.getByRole('tab',{name:'Synthetic baseline',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'Tunnel width',exact:true})).toHaveValue('4');
});
test('donor scenery participates in undo and changing a BSP transform clears stale clearance', async ({ page }) => {
  await mockDesktop(page);
  await openFixture(page);
  await chooseTool(page,"Level editor");
  if(!await page.getByRole('region',{name:'Construction panel',exact:true}).isVisible())await openDrawer(page,'Construction');await page.locator('.bsp-assembly:visible>summary').click();
  await page.getByRole('button', { name: 'Plan connected tunnel', exact: true }).click();
  const scenery = page.getByRole('checkbox', { name: 'Include donor scenery', exact: true });
  await expect(scenery).not.toBeChecked();
  await scenery.check();
  await page.getByRole('button', { name: 'Apply connection', exact: true }).click();
  await page.getByRole('button', { name: 'Check tunnel clearance', exact: true }).click();
  await expect(page.locator('.bsp-assembly')).toContainText('3 donor scenery placements');
  const checked = page.locator('.bsp-assembly').getByText(/Source clearance checked at/);
  await page.getByRole('spinbutton', { name: 'BSP section yaw', exact: true }).fill('90');
  await page.getByRole('spinbutton', { name: 'BSP section yaw', exact: true }).press('Tab');
  await expect(checked).toHaveCount(0);
  await page.getByRole('button', { name: 'Apply connection', exact: true }).click();
  await page.getByRole('button', { name: 'Check tunnel clearance', exact: true }).click();
  await expect(checked).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Section position X', exact: true }).fill('21');
  await page.getByRole('spinbutton', { name: 'Section position X', exact: true }).press('Tab');
  await expect(checked).toHaveCount(0);
  await scenery.uncheck();
  await page.getByRole('button', { name: 'Apply connection', exact: true }).click();
  await page.keyboard.press('Control+z');
  await expect(scenery).toBeChecked();
  await page.evaluate(() => { (window as any).__sparkMock.deferBspPreview = true; });
  await page.getByRole('button', { name: 'Check tunnel clearance', exact: true }).click();
  await page.waitForFunction(() => !!(window as any).__sparkMock.finishBspPreview);
  await page.getByRole('spinbutton', { name: 'Section position X', exact: true }).fill('22');
  await page.getByRole('spinbutton', { name: 'Section position X', exact: true }).press('Tab');
  await page.evaluate(() => (window as any).__sparkMock.finishBspPreview());
  await expect(page.getByRole('button', { name: 'Apply connection', exact: true })).toBeEnabled();
  await expect(checked).toHaveCount(0);
  await page.getByRole('button', { name: 'Apply connection', exact: true }).click();
  await page.evaluate(() => { delete (window as any).__sparkMock.finishBspPreview; });
  await page.getByRole('button', { name: 'Check tunnel clearance', exact: true }).click();
  await page.waitForFunction(() => !!(window as any).__sparkMock.finishBspPreview);
  await page.getByRole('spinbutton', { name: 'Section position X', exact: true }).fill('23');
  await page.getByRole('spinbutton', { name: 'Section position X', exact: true }).press('Tab');
  await page.evaluate(() => (window as any).__sparkMock.finishBspPreview(false));
  await expect(page.getByRole('button', { name: 'Apply connection', exact: true })).toBeEnabled();
  await expect(page.locator('.bsp-assembly').getByRole('alert')).toHaveCount(0);
});
test('BSP donor choices do not silently replace a draft and entrance rotation preserves its mouth', async ({ page }) => {
  await mockDesktop(page);
  await openFixture(page);
  await chooseTool(page,"Level editor");
  if(!await page.getByRole('region',{name:'Construction panel',exact:true}).isVisible())await openDrawer(page,'Construction');await page.locator('.bsp-assembly:visible>summary').click();
  await page.getByRole('button', { name: 'Plan connected tunnel', exact: true }).click();
  const width = page.getByRole('spinbutton', { name: 'Tunnel width', exact: true });
  await width.fill('4'); await width.press('Tab');
  await page.getByRole('button', { name: 'Apply connection', exact: true }).click();
  await page.getByRole('button', { name: 'Check tunnel clearance', exact: true }).click();
  await expect(page.locator('.bsp-workflow')).toContainText('Check source');
  await page.getByRole('combobox', { name: 'BSP donor map' }).selectOption('c');
  await expect(page.locator('.bsp-selection-warning')).toContainText('This draft connects Synthetic candidate');
  await expect(page.getByRole('button', { name: 'Check tunnel clearance', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Build & playtest connection', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Return to current draft', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'BSP donor map' })).toHaveValue('b');
  await expect(width).toHaveValue('4');
  const mouth = page.getByRole('spinbutton', { name: 'Imported floor X', exact: true });
  await mouth.fill('25'); await mouth.press('Tab');
  await page.getByRole('checkbox', { name: 'Rotate around tunnel entrance', exact: true }).check();
  const yaw = page.getByRole('spinbutton', { name: 'BSP section yaw', exact: true });
  await yaw.fill('90'); await yaw.press('Tab');
  await expect(mouth).toHaveValue('25');
  await expect(page.getByRole('spinbutton', { name: 'Imported floor Y', exact: true })).toHaveValue('0');
  await expect(page.getByRole('spinbutton', { name: 'Section position X', exact: true })).toHaveValue('25');
  await expect(page.getByRole('spinbutton', { name: 'Section position Y', exact: true })).toHaveValue('-5');
  await page.getByRole('button', { name: 'Reset draft to applied connection', exact: true }).click();
  await expect(yaw).toHaveValue('0');
  await expect(mouth).toHaveValue('20');
  await expect(width).toHaveValue('4');
  await page.getByRole('combobox', { name: 'BSP donor map' }).selectOption('c');
  await page.getByRole('button', { name: 'Plan connected tunnel', exact: true }).click();
  await expect(page.locator('.bsp-draft-heading')).toContainText('Synthetic third donor');
  await expect(page.getByRole('button', { name: 'Apply connection', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__sparkMock.saved.bspAssembly.donorProjectId)).toBe('b');
});

test('legacy connection identities preserve an unapplied draft after upgrading', async ({ page }) => {
  await mockDesktop(page); await openFixture(page);
  await chooseTool(page,"Level editor");
  if(!await page.getByRole('region',{name:'Construction panel',exact:true}).isVisible())await openDrawer(page,'Construction');await page.locator('.bsp-assembly:visible>summary').click();
  await page.getByRole('button', { name: 'Plan connected tunnel', exact: true }).click();
  await page.getByRole('button', { name: 'Apply connection', exact: true }).click();
  await page.getByRole('button', { name: 'Check tunnel clearance', exact: true }).click();
  const width = page.getByRole('spinbutton', { name: 'Tunnel width', exact: true });
  await width.fill('6'); await width.press('Tab');
  await page.evaluate(() => {
    const saved = (window as any).__sparkMock.saved.bspAssembly;
    const key = 'guilty-spark-map-session-v1:a';
    const state = JSON.parse(localStorage.getItem(key)!);
    state['bsp.applied'] = JSON.stringify(saved);
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('spark-test-applied-bsp', JSON.stringify(saved));
  });
  await page.reload();
  await chooseTool(page,"Map library");
  await openFixture(page);
  await chooseTool(page,"Level editor");
  await expect(width).toHaveValue('6');
  await expect(page.getByRole('button', { name: 'Apply connection', exact: true })).toBeEnabled();
});

test('a delayed BSP plan cannot resurrect a draft after leaving the workspace', async ({ page }) => {
  await mockDesktop(page); await openFixture(page);
  await chooseTool(page,"Level editor");
  if(!await page.getByRole('region',{name:'Construction panel',exact:true}).isVisible())await openDrawer(page,'Construction');await page.locator('.bsp-assembly:visible>summary').click();
  await page.evaluate(() => { (window as any).__sparkMock.deferBspPlan = true; });
  await page.getByRole('button', { name: 'Plan connected tunnel', exact: true }).click();
  await page.waitForFunction(() => !!(window as any).__sparkMock.finishBspPlan);
  await chooseTool(page,"Features & workflows");
  await expect(page.getByRole('heading', { name: 'What can Spark do?', exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).__sparkMock.finishBspPlan());
  await chooseTool(page,"Level editor");
  await expect(page.locator('.bsp-draft-heading')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Plan connected tunnel', exact: true })).toBeEnabled();
});

test('a delayed replacement plan cannot overwrite edits made while it runs', async ({ page }) => {
  await mockDesktop(page); await openFixture(page);
  await chooseTool(page,"Level editor");
  if(!await page.getByRole('region',{name:'Construction panel',exact:true}).isVisible())await openDrawer(page,'Construction');await page.locator('.bsp-assembly:visible>summary').click();
  await page.getByRole('button', { name: 'Plan connected tunnel', exact: true }).click();
  await page.evaluate(() => { (window as any).__sparkMock.deferBspPlan = true; });
  await page.getByRole('button', { name: 'Plan connected tunnel', exact: true }).click();
  await page.waitForFunction(() => !!(window as any).__sparkMock.finishBspPlan);
  const width = page.getByRole('spinbutton', { name: 'Tunnel width', exact: true });
  await width.fill('5'); await width.press('Tab');
  await page.evaluate(() => (window as any).__sparkMock.finishBspPlan());
  await expect(page.getByRole('button', { name: 'Plan connected tunnel', exact: true })).toBeEnabled();
  await expect(width).toHaveValue('5');
});

test('friends preflight surfaces blocked proof without a network success claim', async ({ page }) => {
  await mockDesktop(page);
  await openFixture(page);
  await chooseTool(page,"Online");
  await page.getByRole('button', { name: 'Runtime adapters', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Steam launch selector', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Friends preflight', exact: true }).click();
  await page.getByRole('button', { name: 'Create manifest', exact: true }).click();
  await page.getByRole('button', { name: 'Import peer manifest', exact: true }).click();
  await page.getByRole('button', { name: 'Compare manifests', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Preflight blocked', exact: true })).toBeVisible();
  await expect(page.getByText('Scope: manifest comparison only. Gameplay verified: no.')).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).__sparkMock.calls.some(
        (call: any) =>
          /launch|install_package|initialize_mcc/.test(call.command) && !['launch_readiness','prepare_launch_voice','play_launch_voice','stop_launch_voice','launch_voice_status'].includes(call.command),
      ),
    ),
  ).toBe(false);
});

async function retainedLiveFixture(page: Page) {
  await mockDesktop(page);
  await page.evaluate(() => {
    const w = window as any, original = w.__TAURI_INTERNALS__.invoke;
    const state = w.__cleanup = { present: true, token: 'old-synthetic-connection', calls: [] as string[], defer: false, pending: false, fail: false, finish: null as null | (() => void) };
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === 'live_mcc_sample') throw Error('Synthetic map changed; snapshot unavailable');
      if (command === 'live_mcc_cleanup_status') return {hasSession: state.present, sessionToken: state.present ? state.token : null, pending: state.present ? ['camera', 'shared sizes'] : [], detail: 'Synthetic retained camera and size journals; source cache unchanged.'};
      if (command === 'live_mcc_disconnect') {
        state.calls.push(args.expectedSession);
        if (args.expectedSession !== state.token) throw Error('The live session changed in another Spark window. Refresh before releasing it.');
        if (state.defer) { state.pending = true; await new Promise<void>(resolve => { state.finish = resolve; }); state.pending = false; }
        if (state.fail) throw Error('Synthetic cleanup could not verify the target; journals retained for retry.');
        state.present = false;
        return {outcome:'retired',retiredTarget:'mapChanged',detail:'Disconnected. Obsolete records retired. No old values were written into the replacement session.'};
      }
      return original(command, args);
    };
  });
  await chooseTool(page, 'Level editor');
  await page.getByRole('button', {name:'Connect to a running Halo game',exact:true}).click();
  await page.getByRole('combobox', {name:'Editing target',exact:true}).selectOption('live');
  await openDrawer(page,'Game connection');
  await expect(page.getByRole('region', {name:'Previous live session',exact:true})).toBeVisible();
}

test('unavailable snapshots retain reachable cleanup and an honest retirement receipt', async ({page}) => {
  await retainedLiveFixture(page);
  const recovery = page.getByRole('region', {name:'Previous live session',exact:true});
  await page.getByRole('checkbox', {name:'I launched MCC using Anti-Cheat Disabled in Steam'}).check();
  const connect = page.getByRole('button', {name:'Connect current Halo 1 session',exact:true});
  await expect(connect).toBeEnabled();
  await page.evaluate(() => {(window as any).__cleanup.defer = true;});
  await recovery.getByRole('button', {name:'Release previous live session',exact:true}).click();
  await expect.poll(() => page.evaluate(() => (window as any).__cleanup.pending)).toBe(true);
  await expect(connect).toBeDisabled();
  await page.evaluate(() => {(window as any).__cleanup.finish();});
  await expect(page.getByText('Disconnected. Obsolete records retired. No old values were written into the replacement session.', {exact:true})).toBeVisible();
  await expect(recovery).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__cleanup.calls)).toEqual(['old-synthetic-connection']);
  await expect(page.getByText('Disconnected. Original vehicle physics restored.', {exact:true})).toHaveCount(0);
});

test('unacknowledged thread release stays visible and retries with the original connection', async ({page}) => {
  await retainedLiveFixture(page);
  await page.evaluate(() => {
    const w=window as any,original=w.__TAURI_INTERNALS__.invoke;w.__cleanup.fail=true;
    w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
      const result=await original(command,args);
      if(command==='live_mcc_cleanup_status'&&result.hasSession)return {...result,pending:['thread release'],threadRelease:{pendingThreads:1,issue:'Synthetic resume not acknowledged'},detail:'Synthetic owned thread increment retained; new edits blocked.'};
      return result;
    };
  });
  const recovery=page.getByRole('region',{name:'Previous live session',exact:true});
  await recovery.getByRole('button',{name:'Check previous session',exact:true}).click();
  await expect(recovery).toContainText('1 recorded thread release remains');
  expect(await page.evaluate(()=>(window as any).__cleanup.calls)).toEqual([]);
  await recovery.getByRole('button',{name:'Retry thread release & cleanup',exact:true}).click();
  await expect(recovery).toContainText('journals retained for retry');
  await expect(recovery.getByRole('button',{name:'Retry thread release & cleanup',exact:true})).toBeEnabled();
  await page.evaluate(()=>{(window as any).__cleanup.fail=false;});
  await recovery.getByRole('button',{name:'Retry thread release & cleanup',exact:true}).click();await expect(recovery).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).__cleanup.calls)).toEqual(['old-synthetic-connection','old-synthetic-connection']);
});

test('connected thread-release faults disable object, sprint and camera writes while disconnect remains usable',async({page})=>{
  await mockDesktop(page);
  await page.evaluate(()=>{
    const w=window as any,original=w.__TAURI_INTERNALS__.invoke;
    const state=w.__threadRelease={connected:false,fail:true,calls:[] as string[],reads:0};
    const object={datum:12,tagDatum:7,kind:0,scale:1,tagPath:'synthetic/biped',position:[1,2,3],velocity:[0,0,0],forward:[1,0,0],up:[0,0,1],parentDatum:4294967295,player:true};
    const status=()=>({pid:3,sessionToken:'synthetic-thread-connection',cleanupPending:true,threadRelease:{pendingThreads:1,issue:'Synthetic thread resume not acknowledged'},activeVehiclePhysics:false,activeSharedScales:false,scaleKeeperError:null,snapshot:{profile:'synthetic',identity:{scenario:'test/map',checksum:123,tagCount:1,scenarioDatum:7},objects:[object]},detail:'Synthetic pending-release contract'});
    w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
      if(command==='live_mcc_connect'){state.connected=true;return status();}
      if(command==='live_mcc_sample'){if(!state.connected)throw Error('No synthetic live session');return status();}
      if(command==='live_mcc_sprint_status'){state.reads++;return {enabled:false,sprinting:false,restorePending:false,config:{hotkey:'ShiftLeft',multiplier:1.75},observed:{playerDatum:12,multiplier:1,canSprint:true,reason:'Synthetic'},error:null,detail:'Synthetic'};}
      if(command==='live_mcc_camera_status'){state.reads++;return {enabled:false,active:false,restorePending:false,config:{back:.4,right:.3,up:.15},shortcut:{enabled:false,key:'F6'},observed:{available:true,reason:'Synthetic',weaponThirdPerson:false,trackCount:1},error:null,detail:'Synthetic'};}
      if(command==='live_mcc_disconnect'){state.calls.push(args.expectedSession);if(state.fail)throw Error('Synthetic thread release still incomplete');state.connected=false;return {outcome:'restored',retiredTarget:null,detail:'Synthetic owned thread release acknowledged and temporary data restored.'};}
      return original(command,args);
    };
  });
  await chooseTool(page,'Level editor');await page.getByRole('button',{name:'Connect to a running Halo game',exact:true}).click();await page.getByRole('combobox',{name:'Editing target',exact:true}).selectOption('live');await openDrawer(page,'Game connection');
  await page.getByRole('checkbox',{name:'I launched MCC using Anti-Cheat Disabled in Steam'}).check();await page.getByRole('button',{name:'Connect current Halo 1 session',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__threadRelease.reads)).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('button',{name:'Toggle in-game third person',exact:true})).toBeDisabled();
  await page.locator('.native-sprint-controls>summary').click();await expect(page.getByRole('button',{name:'Enable native sprint',exact:true})).toBeDisabled();
  await page.getByRole('combobox',{name:'Live Halo object',exact:true}).selectOption('12');await expect(page.getByRole('button',{name:'Apply live object position',exact:true})).toBeDisabled();
  await page.getByRole('combobox',{name:'Active map runtime',exact:true}).selectOption('openCe');
  await expect(page.getByText('This connection remains bound to MCC.',{exact:false})).toBeVisible();
  const release=page.getByRole('button',{name:'Retry thread release & disconnect',exact:true});await release.click();await expect(page.getByText('Synthetic thread release still incomplete',{exact:false})).toBeVisible();await expect(release).toBeEnabled();
  await page.evaluate(()=>{(window as any).__threadRelease.fail=false;});await release.click();await expect(page.getByText('Synthetic owned thread release acknowledged and temporary data restored.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__threadRelease.calls)).toEqual(['synthetic-thread-connection','synthetic-thread-connection']);
});

test('selecting a non-MCC game never enables the MCC connect operation',async({page})=>{
  await mockDesktop(page);
  await chooseTool(page,'Level editor');
  await page.getByRole('button',{name:'Connect to a running Halo game',exact:true}).click();
  await page.getByRole('combobox',{name:'Editing target',exact:true}).selectOption('live');
  await openDrawer(page,'Game connection');
  const consent=page.getByRole('checkbox',{name:'I launched MCC using Anti-Cheat Disabled in Steam',exact:true});
  await consent.check();
  const connect=page.getByRole('button',{name:'Connect current Halo 1 session',exact:true});
  await expect(connect).toBeEnabled();
  for(const runtime of ['haloCustomEdition','openCe','chupathingyCe']){
    await page.getByRole('combobox',{name:'Active map runtime',exact:true}).selectOption(runtime);
    await expect(connect).toBeDisabled();await expect(consent).toBeDisabled();
    await expect(page.getByText('This runtime has no validated Spark Live Link write adapter.',{exact:false})).toBeVisible();
  }
  await page.getByRole('combobox',{name:'Active map runtime',exact:true}).selectOption('mccSteam');
  await expect(connect).toBeEnabled();
});

test('competing live connections and uncertain cleanup preserve retry and the new identity', async ({page}) => {
  await retainedLiveFixture(page);
  const recovery = page.getByRole('region', {name:'Previous live session',exact:true});
  await page.evaluate(() => {(window as any).__cleanup.token = 'new-synthetic-connection';});
  await recovery.getByRole('button', {name:'Release previous live session',exact:true}).click();
  await expect(recovery).toContainText('The live session changed in another Spark window');
  expect(await page.evaluate(() => (window as any).__cleanup.present)).toBe(true);
  await page.evaluate(() => {(window as any).__cleanup.fail = true;});
  await recovery.getByRole('button', {name:'Release previous live session',exact:true}).click();
  await expect(recovery).toContainText('journals retained for retry');
  expect(await page.evaluate(() => (window as any).__cleanup.present)).toBe(true);
  await page.evaluate(() => {(window as any).__cleanup.fail = false;});
  await recovery.getByRole('button', {name:'Release previous live session',exact:true}).click();
  await expect(recovery).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__cleanup.calls)).toEqual(['old-synthetic-connection','new-synthetic-connection','new-synthetic-connection']);
});

test('a late old-session receipt cannot populate new live undo or replay its queued undo', async ({page}) => {
  await mockDesktop(page);
  await page.evaluate(() => {
    const w=window as any, original=w.__TAURI_INTERNALS__.invoke;
    const object={datum:12,tagDatum:7,kind:0,scale:1,tagPath:'synthetic/biped',position:[1,2,3],velocity:[0,0,0],forward:[1,0,0],up:[0,0,1],parentDatum:4294967295,player:true};
    const state=w.__lateLive={connected:false,token:'original-connection',object,pending:false,calls:[] as string[],finish:null as null|(()=>void)};
    const status=()=>structuredClone({pid:3,sessionToken:state.token,activeVehiclePhysics:false,activeSharedScales:false,scaleKeeperError:null,snapshot:{profile:'synthetic',identity:{scenario:'same/map',checksum:123,tagCount:1,scenarioDatum:7},objects:[object]},detail:'Synthetic late receipt contract'});
    w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
      if(command==='live_mcc_connect'){state.connected=true;return status();}
      if(command==='live_mcc_sample'){if(!state.connected)throw Error('No synthetic session');return status();}
      if(command==='live_mcc_move_object'){
        state.calls.push(args.expectedSession);const acknowledged=[...args.operation.position];object.position=acknowledged;state.pending=true;
        await new Promise<void>(resolve=>{state.finish=resolve;});state.pending=false;
        return [{datum:12,applied:true,observedPosition:acknowledged,message:'Old synthetic operation acknowledged'}];
      }
      return original(command,args);
    };
  });
  await chooseTool(page,'Level editor');await page.getByRole('button',{name:'Connect to a running Halo game',exact:true}).click();
  await page.getByRole('combobox',{name:'Editing target',exact:true}).selectOption('live');await openDrawer(page,'Game connection');
  await page.getByRole('checkbox',{name:'I launched MCC using Anti-Cheat Disabled in Steam'}).check();await page.getByRole('button',{name:'Connect current Halo 1 session',exact:true}).click();
  await page.getByRole('combobox',{name:'Live Halo object',exact:true}).selectOption('12');
  const x=page.getByRole('spinbutton',{name:'Live position X',exact:true});await x.fill('4');await x.press('Tab');
  await page.getByRole('button',{name:'Apply live object position',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__lateLive.pending)).toBe(true);await page.keyboard.press('Control+z');
  await page.evaluate(()=>{const s=(window as any).__lateLive;s.token='replacement-connection';s.object.position=[100,2,3];s.finish();});
  await expect(page.getByText('Live connection changed after the edit. Its history was not carried into the new session.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Undo live edit (Ctrl+Z)',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Redo live edit (Ctrl+Y)',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>(window as any).__lateLive.calls)).toEqual(['original-connection']);
  expect(await page.evaluate(()=>(window as any).__lateLive.object.position)).toEqual([100,2,3]);
});
