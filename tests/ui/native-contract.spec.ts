import {chooseTool} from './helpers/navigation';
// These are synthetic IPC contract tests. They do not establish native runtime or gameplay verification.
import { test, expect, type Page } from '@playwright/test';

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
        if(command==='plugin:window|is_maximized')return !!mock.maximized;
        if(command==='plugin:window|toggle_maximize'){mock.maximized=!mock.maximized;return null;}
        if(command==='plugin:window|unmaximize'){mock.maximized=false;return null;}
        if(command==='plugin:window|maximize'){mock.maximized=true;return null;}
        if (command === 'bootstrap') return structuredClone(bootstrap);
        if (command === 'open_project') {if(mock.delayOpen){const delay=mock.delayOpen;mock.delayOpen=0;await new Promise(resolve=>setTimeout(resolve,delay));}return structuredClone(projects[args.id]);}
        if (command === 'claim_project_document' || command === 'release_project_document') return null;
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
          return null;
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
  await expect(page.getByRole('heading', { name: 'Your worlds, reimagined.' })).toBeVisible();
}
async function openFixture(page: Page) {
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: 'Synthetic baseline', exact: true }) })
    .click();
  await chooseTool(page,"Tag editor");
  await expect(page.getByRole('heading', { name: 'test', exact: true })).toBeVisible();
}

test('C35 drawers remember each workspace and fullscreen preserves editing tools',async({page})=>{
 await page.setViewportSize({width:1280,height:720});await mockDesktop(page);
 await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})}).click();
 const viewport=page.getByTestId('viewport');await expect(viewport).toBeVisible();
 await expect(page.locator('.gs-navigation-drawer')).toBeHidden();const original=await viewport.boundingBox();
 await page.getByRole('button',{name:'Toggle Inspector',exact:true}).click();await expect(page.getByRole('region',{name:'Inspector panel',exact:true})).toBeVisible();
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
 await page.keyboard.press('Escape');await expect(page.locator('html')).toHaveAttribute('data-gs-fullscreen','false');await page.getByRole('button',{name:'Toggle Inspector',exact:true}).click();await expect(page.getByRole('region',{name:'Inspector panel',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close Inspector',exact:true}).click();await expect(page.getByRole('region',{name:'Inspector panel',exact:true})).toBeHidden();
});

test('object tags open in a hideable drawer without changing workspace, camera layout or history',async({page})=>{
 await mockDesktop(page);await page.evaluate(()=>{const open=(window as any).__sparkMock.projects.a;open.project.scene=[{id:'test-object',name:'Selected test weapon',kind:'Weapon',tagId:1,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,sourceOffset:8,rotationOffset:null,assetId:null}];open.inspection.objects=structuredClone(open.project.scene);});
 await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})}).click();
 const viewport=page.getByTestId('viewport'),before=await viewport.boundingBox();
 await page.getByRole('button',{name:'Toggle Objects',exact:true}).click();
 await page.getByRole('button',{name:'Selected test weapon',exact:true}).click();
 const drawer=page.getByRole('region',{name:'Object tags panel',exact:true});await expect(drawer).toBeVisible();
 await expect(drawer.getByLabel('Velocity',{exact:true})).toBeVisible();
 expect(await viewport.boundingBox()).toEqual(before);await expect(page.getByRole('combobox',{name:'Editing target',exact:true})).toBeVisible();
 const value=drawer.getByLabel('Velocity',{exact:true});await value.fill('23');await value.press('Enter');
 await page.getByRole('button',{name:'Close Object tags',exact:true}).click();await expect(drawer).toBeHidden();
 await page.getByRole('button',{name:'Toggle Object tags',exact:true}).click();await expect(drawer.getByLabel('Velocity',{exact:true})).toHaveValue('23');expect(await viewport.boundingBox()).toEqual(before);
 await page.keyboard.press('Control+z');await expect(value).toHaveValue('10');await page.keyboard.press('Control+y');await expect(value).toHaveValue('23');
 await page.getByRole('button',{name:'Close Object tags',exact:true}).click();await page.getByRole('button',{name:'Fullscreen editing',exact:true}).click();
 await page.getByRole('button',{name:'Toggle Object tags',exact:true}).click();await expect(drawer).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-gs-fullscreen','true');
});

test('map audio preferences survive tag drawers, fullscreen and map switches independently',async({page})=>{
 await mockDesktop(page);await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})}).click();
 const volume=page.getByRole('slider',{name:'Map sound volume',exact:true});await expect(volume).toHaveValue('0.35');
 await volume.fill('0.61');await page.getByRole('button',{name:'Mute map sounds',exact:true}).click();await expect(page.getByRole('button',{name:'Unmute map sounds',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Toggle Object tags',exact:true}).click();await expect(page.getByRole('region',{name:'Object tags panel',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close Object tags',exact:true}).click();await expect(volume).toHaveValue('0.61');
 await page.keyboard.press('F11');await expect(volume).toBeInViewport();await expect(page.getByRole('button',{name:'Unmute map sounds',exact:true})).toBeInViewport();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();await chooseTool(page,'Map library');await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic candidate',exact:true})}).click();
 await expect(volume).toHaveValue('0.35');await expect(page.getByRole('button',{name:'Mute map sounds',exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Synthetic baseline',exact:true}).click();await expect(volume).toHaveValue('0.61');await expect(page.getByRole('button',{name:'Unmute map sounds',exact:true})).toBeVisible();
});

test('cross-map model placement opens source tags and keeps undo and save in that source map',async({page})=>{
 await mockDesktop(page);await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic candidate',exact:true})}).click();
 await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();await chooseTool(page,'Map library');await page.locator('.map-card').filter({has:page.getByRole('heading',{name:'Synthetic baseline',exact:true})}).click();
 await page.getByRole('button',{name:'Toggle Asset library',exact:true}).click();
 const library=page.getByRole('region',{name:'Asset library panel',exact:true});await library.getByLabel('Asset library map',{exact:true}).selectOption('b');
 await expect(page.getByTestId('viewport').locator('canvas')).toBeVisible();
 await library.getByRole('button',{name:'Add test at view',exact:true}).click();await expect(page.locator('.viewport-object-actions strong')).toHaveText('test');
 await page.getByRole('button',{name:'Close Asset library',exact:true}).click();await page.locator('.viewport-object-actions').getByRole('button',{name:'Object tags',exact:true}).click();
 const tags=page.getByRole('region',{name:'Object tags panel',exact:true});await expect(tags).toContainText('Synthetic candidate');const value=tags.getByLabel('Velocity',{exact:true});await expect(value).toHaveValue('25');await value.fill('39');await value.press('Enter');await value.focus();await page.keyboard.press('Control+z');await expect(value).toHaveValue('25');await value.focus();await page.keyboard.press('Control+y');await expect(value).toHaveValue('39');await value.focus();await page.keyboard.press('Control+s');
 await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.saved?.id)).toBe('b');await expect(page.getByRole('tab',{name:'Synthetic baseline',exact:true})).toHaveAttribute('aria-selected','true');
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
 await page.mouse.move(100,2);await page.getByRole('button',{name:'Toggle Inspector',exact:true}).click();await expect(page.getByRole('region',{name:'Inspector panel',exact:true})).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-gs-fullscreen','true');await page.keyboard.press('Escape');await expect(page.getByRole('region',{name:'Inspector panel',exact:true})).toBeHidden();await expect(page.locator('html')).toHaveAttribute('data-gs-fullscreen','true');
 await page.keyboard.press('Control+Backslash');await expect(page.locator('.gs-navigation-drawer')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('.gs-navigation-drawer')).toBeHidden();await expect(page.locator('html')).toHaveAttribute('data-gs-fullscreen','true');
 await page.keyboard.press('Escape');await expect(page.locator('html')).toHaveAttribute('data-gs-fullscreen','false');
 await expect(page.getByRole('tab',{name:'Synthetic baseline',exact:true})).toBeVisible();
 const calls=await page.evaluate(()=>(window as any).__sparkMock.calls.filter((c:any)=>c.command==='plugin:window|set_fullscreen').map((c:any)=>c.args.value));expect(calls).toEqual([true,false]);
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
 expect(await page.evaluate(()=>(window as any).__sparkMock.calls.filter((c:any)=>['plugin:window|unmaximize','plugin:window|set_fullscreen','plugin:window|maximize'].includes(c.command)).map((c:any)=>[c.command,c.args.value??null]))).toEqual([['plugin:window|unmaximize',null],['plugin:window|set_fullscreen',true],['plugin:window|set_fullscreen',false],['plugin:window|maximize',null]]);
});

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
 await page.getByRole('button',{name:'Toggle Camera',exact:true}).click();const speed=page.getByRole('spinbutton',{name:'Camera movement speed',exact:true});
 expect(Number(await speed.inputValue())).toBeGreaterThan(12);await speed.focus();const resting=JSON.parse((await canvas.getAttribute('data-gs-camera'))!);await page.keyboard.press('e');await page.waitForTimeout(350);const typed=JSON.parse((await canvas.getAttribute('data-gs-camera'))!);expect(typed.position).toEqual(resting.position);expect(typed.quaternion).toEqual(resting.quaternion);
});

test('C35 drawers fit emulated DPI layouts while preserving the map workspace',async({page})=>{
 await mockDesktop(page);await openFixture(page);const session=await page.context().newCDPSession(page);
 for(const scale of[1,1.25,1.5,2]){await session.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:scale,mobile:false});expect(await page.evaluate(()=>devicePixelRatio)).toBe(scale);const drawer=page.locator('.gs-navigation-drawer');if(!await drawer.isVisible())await page.getByRole('button',{name:'Toggle workspace navigation',exact:true}).click();expect(await drawer.evaluate(e=>e.scrollWidth-e.clientWidth)).toBe(0);await page.keyboard.press('Escape');await expect(page.getByRole('heading',{name:'test',exact:true})).toBeVisible();}
 await session.send('Emulation.clearDeviceMetricsOverride');
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
  await chooseTool(page,"Play & servers");await page.locator('input[aria-label="Game invitation"]').fill('halo://join/'+'a'.repeat(64));
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
});await page.getByRole('button',{name:'Toggle Changes',exact:true}).click();}
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

test('community games appear on first open and an obsolete requirement check cannot lock the browser', async ({page}) => {
  await mockDesktop(page); await openFixture(page);
  await page.evaluate(() => {(window as any).__sparkMock.deferListing = true;});
  await chooseTool(page,"Play & servers");
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
  await page.evaluate(()=>{const w=window as any,original=w.__TAURI_INTERNALS__.invoke;w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
    if(command==='community_listing'&&args.refresh){return {listing:null,fetching:true,stale:true,error:null,refreshAfterUnix:Math.floor(Date.now()/1000)+30};}
    return original(command,args);
  };});
  await chooseTool(page,"Play & servers");await expect(page.getByRole('list',{name:'Advertised games'}).getByRole('listitem')).toHaveCount(2);
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
  await chooseTool(page,"Map library");await expect(page.getByRole('heading',{name:'Your worlds, reimagined.',exact:true})).toBeVisible();
  await page.evaluate(()=>(window as any).__finishSetup());
  await expect(page.getByRole('heading',{name:'Your worlds, reimagined.',exact:true})).toBeVisible();
  await chooseTool(page,"Start here");await expect(page.getByRole('heading',{name:'Your editing tools',exact:true})).toBeVisible();
});
test('hosting uses the selected map and gameplay presets retain fixed left and right gun controls',async({page})=>{
  await mockDesktop(page);await openFixture(page);await chooseTool(page,"Play & servers");
  await page.getByRole('button',{name:'Hosting & servers',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Synthetic MCC Custom Games guide',exact:true})).toBeVisible();
  await expect(page.getByText('Use Halo CE Custom Games for this multiplayer map.',{exact:true})).toBeVisible();
  const calls=await page.evaluate(()=>(window as any).__sparkMock.calls.filter((call:any)=>call.command==='runtime_hosting_plan'));expect(calls.at(-1).args.projectId).toBe('a');
  await page.getByRole('button',{name:'Gameplay controls',exact:true}).click();
  await page.getByRole('checkbox',{name:'Request dual wield support',exact:true}).check();
  await page.getByRole('combobox',{name:'Dual-wield hotkey',exact:true}).selectOption('KeyV');
  await expect(page.getByText('Left gun · independent primary trigger',{exact:true})).toBeVisible();
  await expect(page.getByText('Right gun · independent secondary trigger',{exact:true})).toBeVisible();
  await chooseTool(page,"Tag editor");await chooseTool(page,"Play & servers");
  await expect(page.getByRole('combobox',{name:'Dual-wield hotkey',exact:true})).toHaveValue('KeyV');
  await expect(page.getByText('Changing a preset does not enable them in the running game.',{exact:false})).toBeVisible();
});

test('native camera position edits persist across tools and restore through the adapter',async({page})=>{
  await mockDesktop(page);await openFixture(page);await chooseTool(page,"Play & servers");await page.getByRole('button',{name:'Gameplay controls',exact:true}).click();
  const camera=page.locator('.native-camera-controls');await camera.locator('summary').click();
  await camera.getByRole('button',{name:'Enable third-person camera',exact:true}).click();await expect(camera.getByText('Third-person camera active',{exact:false})).toBeVisible();
  await camera.getByRole('spinbutton',{name:'Camera shoulder offset',exact:true}).fill('-0.45');await camera.getByRole('spinbutton',{name:'Camera shoulder offset',exact:true}).press('Enter');await camera.getByRole('button',{name:'Apply camera position',exact:true}).click();
  await chooseTool(page,"Tag editor");await chooseTool(page,"Play & servers");await camera.locator('summary').click();
  await expect(camera.getByRole('spinbutton',{name:'Camera shoulder offset',exact:true})).toHaveValue('-0.45');
  await camera.getByRole('button',{name:'Restore original camera',exact:true}).click();await expect(camera.getByText('Original camera selected',{exact:false})).toBeVisible();
  const calls=await page.evaluate(()=>(window as any).__sparkMock.calls.filter((c:any)=>c.command==='live_mcc_camera_configure'));expect(calls.map((c:any)=>c.args.enabled)).toEqual([true,true,false]);expect(calls[1].args.config.right).toBe(-.45);
});

test('the dedicated camera button toggles without opening settings and uses current native state',async({page})=>{
  await mockDesktop(page);await openFixture(page);
  await chooseTool(page,"Play & servers");
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
  await page.getByRole('button',{name:'Toggle Map sounds',exact:true}).click();
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
  await openFixture(page);await chooseTool(page,"Level editor");await page.getByRole('button',{name:'Toggle Map sounds',exact:true}).click();await page.getByRole('combobox',{name:'Map sound tag',exact:true}).selectOption('999');
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
  await openFixture(page);await chooseTool(page,'Level editor');await page.getByRole('button',{name:'Toggle Map sounds',exact:true}).click();
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

test('shared QuickForge survives tool changes and pauses a divergent local draft on restore',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('spark-test-forge',JSON.stringify({schemaVersion:1,name:'Synthetic forge',template:'emptyArena',runtimeId:'mccSteam',gameMode:'slayer',skyPath:null,buildQuality:'draft',geometry:[],materials:[],placements:[],spawns:[],objectives:[]})));
  await mockDesktop(page);await openFixture(page);await chooseTool(page,"Level editor");
  await expect(page.locator('.forge-topbar')).toHaveCount(0);
  await expect(page.locator('.forge-center > .forge-live-panel')).toHaveCount(0);
  const viewport=await page.locator('.forge-viewport').boundingBox();
  const session=page.getByRole('region',{name:'QuickForge session panel',exact:true});
  const revealSession=async()=>{
    if(await session.isVisible())return;
    await page.locator('.gs-layout-menu > summary').click();
    await page.locator('.gs-layout-menu').getByLabel('QuickForge session',{exact:true}).check();
    await page.locator('.gs-layout-menu > summary').click();
  };
  await revealSession();
  expect(await page.locator('.forge-viewport').boundingBox()).toEqual(viewport);
  const sharing=page.locator('details.forge-live-panel').filter({has:page.locator('summary').filter({hasText:'Shared QuickForge'})});await sharing.locator('summary').first().click();
  await page.getByRole('button',{name:'Host editing session',exact:true}).click();await expect(page.getByRole('button',{name:'Leave session',exact:true})).toBeVisible();
  await chooseTool(page,"Tag editor");
  expect(await page.evaluate(()=>(window as any).__sparkMock.calls.filter((call:any)=>call.command==='forge_session_leave').length)).toBe(0);
  await page.evaluate(()=>{(window as any).__sparkMock.session.view.document.name='Another editor changed the name';});
  await chooseTool(page,"Level editor");await revealSession();await sharing.locator('summary').first().click();
  await expect(page.getByText('Paused · local draft retained',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Export local draft',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Leave session',exact:true}).click();
  const calls=await page.evaluate(()=>(window as any).__sparkMock.calls.filter((call:any)=>call.command==='forge_session_leave'));expect(calls).toHaveLength(1);expect(calls[0].args).toEqual({projectId:'a',sessionId:'11111111-1111-4111-8111-111111111111'});
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
  await chooseTool(page,"Level editor");await page.getByRole('button',{name:'Connect to a running Halo game',exact:true}).click();await page.getByRole('combobox',{name:'Editing target',exact:true}).selectOption('live');await page.getByRole('button',{name:'Toggle Game connection',exact:true}).click();await page.getByRole('checkbox',{name:'I launched MCC using Anti-Cheat Disabled in Steam'}).check();await page.getByRole('button',{name:'Connect current Halo 1 session',exact:true}).click();await page.getByRole('combobox',{name:'Live Halo object',exact:true}).selectOption('12');
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
  await chooseTool(page,"Settings & tools");const limit=page.getByRole('spinbutton',{name:'Undo history limit',exact:true});await expect(limit).toHaveValue('100');
  await limit.fill('150');await limit.press('Tab');await expect.poll(()=>page.evaluate(()=>localStorage.getItem('guilty-spark-undo-limit-v1'))).toBe('150');
  await page.reload();await chooseTool(page,"Settings & tools");await expect(page.getByRole('spinbutton',{name:'Undo history limit',exact:true})).toHaveValue('150');
});
test('onboarding keeps a failed save on its step and remembers completed Halo and tool choices',async({page})=>{
  await mockDesktop(page);await page.goto('/');await chooseTool(page,"Start here");
  await page.evaluate(()=>(window as any).__sparkMock.failSettings=true);
  await page.getByRole('button',{name:'Continue to tools',exact:true}).click();await expect(page.locator('.gs-first-setup').getByRole('alert')).toContainText('settings write failed');await expect(page.getByRole('heading',{name:'Which Halo are you working with?',exact:true})).toBeVisible();
  await page.evaluate(()=>(window as any).__sparkMock.failSettings=false);await page.getByRole('button',{name:'Continue to tools',exact:true}).click();
  await page.getByRole('textbox',{name:'Setup Map Builder folder',exact:true}).fill('C:/owned/HCEEK');await page.getByRole('combobox',{name:'Setup editing kit generation',exact:true}).selectOption('h1aEk');await page.getByRole('textbox',{name:'Setup Editable Halo Tags folder',exact:true}).fill('C:/owned/working-tags');await page.getByRole('button',{name:'Save setup & open help',exact:true}).click();
  await expect(page.getByRole('heading',{name:'How-to & Glossary',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Your worlds, reimagined.',exact:true})).toBeVisible();await chooseTool(page,"Start here");await expect(page.getByRole('heading',{name:'Your workbench is ready',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Change Halo or tools',exact:true}).click();await page.getByRole('button',{name:'Continue to tools',exact:true}).click();await expect(page.getByRole('textbox',{name:'Setup Editable Halo Tags folder',exact:true})).toHaveValue('C:/owned/working-tags');
});
test('feature search preserves multiple open maps and each map undo history',async({page})=>{
  await mockDesktop(page);await openFixture(page);const velocity=page.getByRole('spinbutton',{name:'Velocity',exact:true});await velocity.fill('24');await velocity.press('Tab');
  await chooseTool(page,"Map library");await page.locator('.map-card').filter({hasText:'Synthetic candidate'}).click();await chooseTool(page,"Tag editor");
  await chooseTool(page,"Features & workflows");await expect(page.getByRole('heading',{name:'What can Spark do?',exact:true})).toBeVisible();await expect(page.locator('.feature-map-context')).toContainText('Synthetic candidate');await expect(page.locator('.feature-map-context')).toContainText('2 open maps');
  await page.getByRole('searchbox',{name:'Find a Spark feature',exact:true}).fill('multiple maps');await expect(page.getByRole('heading',{name:'Multiple maps & windows',exact:true})).toBeVisible();await page.getByRole('searchbox',{name:'Find a Spark feature',exact:true}).fill('zzzz-unavailable');await expect(page.getByText('No features match this search.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Show all features',exact:true}).click();
  await page.getByRole('tab',{name:/Synthetic baseline/}).click();await chooseTool(page,"Tag editor");await expect(velocity).toHaveValue('24');await velocity.focus();await page.keyboard.press('Control+z');await expect(velocity).toHaveValue('10');await page.getByRole('tab',{name:/Synthetic candidate/}).click();await expect(velocity).toHaveValue('25');
});
test('maps retain independent tag views, tool profiles and last workspace; a late load respects navigation',async({page})=>{
  await mockDesktop(page);await openFixture(page);const search=page.getByRole('textbox',{name:'Search tags',exact:true});await search.fill('test');await page.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('weap');
  await page.getByRole('button',{name:'Toggle Project setup',exact:true}).click();await page.locator('.gs-map-tools>summary').click();await page.locator('.gs-map-tools .gs-build-targets>summary').click();await page.locator('.gs-map-tools').getByRole('button',{name:'Add MCC target',exact:true}).click();const aFields=page.locator('.gs-map-tools fieldset').getByRole('textbox');await aFields.nth(0).fill('Map A kit');await aFields.nth(1).fill('C:/MapA/HCEEK');await aFields.nth(2).fill('C:/MapA/tags');
  await chooseTool(page,"Map library");await page.evaluate(()=>(window as any).__sparkMock.delayOpen=600);await page.locator('.map-card').filter({hasText:'Synthetic candidate'}).click();await chooseTool(page,"Features & workflows");await expect(page.getByRole('tab',{name:/Synthetic candidate/})).toBeVisible();await expect(page.getByRole('heading',{name:'What can Spark do?',exact:true})).toBeVisible();await expect(page.locator('.gs-map-tools')).toContainText('default tools');
  await chooseTool(page,"Tag editor");await expect(search).toHaveValue('');await search.fill('candidate');
  await page.getByRole('tab',{name:/Synthetic baseline/}).click();await expect(search).toHaveValue('test');await expect(page.getByRole('combobox',{name:'Filter tag class',exact:true})).toHaveValue('weap');await expect(page.locator('.gs-map-tools fieldset').getByRole('textbox').nth(0)).toHaveValue('Map A kit');await expect(page.locator('.gs-map-tools fieldset').getByRole('textbox').nth(2)).toHaveValue('C:/MapA/tags');
  await chooseTool(page,"Level editor");await page.getByRole('tab',{name:/Synthetic candidate/}).click();await expect(search).toHaveValue('candidate');await page.getByRole('tab',{name:/Synthetic baseline/}).click();await expect(page.getByRole('combobox',{name:'Editing target',exact:true})).toBeVisible();
});
test('settings Browse survives a bootstrap refresh without erasing other drafts', async ({ page }) => {
  await mockDesktop(page);
  await chooseTool(page,"Settings & tools");
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
  await expect(
    page.getByText('Unchanged tag names are not proof of identical asset data.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Difference status' }).selectOption('unknown');
  await expect(page.locator('.difference-row')).toHaveCount(1);
  await expect(page.locator('.difference-row')).toContainText('BSP mesh');
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
  await mockDesktop(page);await openFixture(page);await chooseTool(page,"Level editor");if(!await page.getByRole('region',{name:'Construction panel',exact:true}).isVisible())await page.getByRole('button',{name:'Toggle Construction',exact:true}).click();await page.locator('.bsp-assembly>summary').click();await page.getByRole('button',{name:'Plan connected tunnel',exact:true}).click();const width=page.getByRole('spinbutton',{name:'Tunnel width',exact:true});await width.fill('4');await width.press('Tab');await chooseTool(page,"Features & workflows");await chooseTool(page,"Level editor");await expect(page.getByRole('spinbutton',{name:'Tunnel width',exact:true})).toHaveValue('4');await page.getByRole('button',{name:'Apply connection',exact:true}).click();await expect(page.getByRole('button',{name:'Remove connection',exact:true})).toBeEnabled();await page.keyboard.press('Control+z');await expect(page.getByRole('button',{name:'Remove connection',exact:true})).toHaveCount(0);await page.keyboard.press('Control+Shift+z');await expect(page.getByRole('button',{name:'Remove connection',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Check tunnel clearance',exact:true}).click();await expect(page.locator('.bsp-assembly')).toContainText('42 points');expect(await page.evaluate(()=>(window as any).__sparkMock.saved.bspAssembly.tunnelWidth)).toBe(4);
  await chooseTool(page,"Map library");await page.locator('.map-card').filter({hasText:'Synthetic candidate'}).click();await chooseTool(page,"Level editor");if(!await page.getByRole('region',{name:'Construction panel',exact:true}).isVisible())await page.getByRole('button',{name:'Toggle Construction',exact:true}).click();await page.locator('.bsp-assembly>summary').click();await expect(page.getByRole('button',{name:'Remove connection',exact:true})).toHaveCount(0);await page.getByRole('tab',{name:'Synthetic baseline',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'Tunnel width',exact:true})).toHaveValue('4');
});
test('donor scenery participates in undo and changing a BSP transform clears stale clearance', async ({ page }) => {
  await mockDesktop(page);
  await openFixture(page);
  await chooseTool(page,"Level editor");
  if(!await page.getByRole('region',{name:'Construction panel',exact:true}).isVisible())await page.getByRole('button',{name:'Toggle Construction',exact:true}).click();await page.locator('.bsp-assembly>summary').click();
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
  if(!await page.getByRole('region',{name:'Construction panel',exact:true}).isVisible())await page.getByRole('button',{name:'Toggle Construction',exact:true}).click();await page.locator('.bsp-assembly>summary').click();
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
  if(!await page.getByRole('region',{name:'Construction panel',exact:true}).isVisible())await page.getByRole('button',{name:'Toggle Construction',exact:true}).click();await page.locator('.bsp-assembly>summary').click();
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
  if(!await page.getByRole('region',{name:'Construction panel',exact:true}).isVisible())await page.getByRole('button',{name:'Toggle Construction',exact:true}).click();await page.locator('.bsp-assembly>summary').click();
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
  if(!await page.getByRole('region',{name:'Construction panel',exact:true}).isVisible())await page.getByRole('button',{name:'Toggle Construction',exact:true}).click();await page.locator('.bsp-assembly>summary').click();
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
  await chooseTool(page,"Play & servers");
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
          /launch|install_package|initialize_mcc/.test(call.command) && call.command !== 'launch_readiness',
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
  await page.getByRole('button', {name:'Toggle Game connection',exact:true}).click();
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
  await chooseTool(page,'Level editor');await page.getByRole('button',{name:'Connect to a running Halo game',exact:true}).click();await page.getByRole('combobox',{name:'Editing target',exact:true}).selectOption('live');await page.getByRole('button',{name:'Toggle Game connection',exact:true}).click();
  await page.getByRole('checkbox',{name:'I launched MCC using Anti-Cheat Disabled in Steam'}).check();await page.getByRole('button',{name:'Connect current Halo 1 session',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__threadRelease.reads)).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('button',{name:'Toggle in-game third person',exact:true})).toBeDisabled();
  await page.locator('.native-sprint-controls>summary').click();await expect(page.getByRole('button',{name:'Enable native sprint',exact:true})).toBeDisabled();
  await page.getByRole('combobox',{name:'Live Halo object',exact:true}).selectOption('12');await expect(page.getByRole('button',{name:'Apply live object position',exact:true})).toBeDisabled();
  const release=page.getByRole('button',{name:'Retry thread release & disconnect',exact:true});await release.click();await expect(page.getByText('Synthetic thread release still incomplete',{exact:false})).toBeVisible();await expect(release).toBeEnabled();
  await page.evaluate(()=>{(window as any).__threadRelease.fail=false;});await release.click();await expect(page.getByText('Synthetic owned thread release acknowledged and temporary data restored.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__threadRelease.calls)).toEqual(['synthetic-thread-connection','synthetic-thread-connection']);
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
  await page.getByRole('combobox',{name:'Editing target',exact:true}).selectOption('live');await page.getByRole('button',{name:'Toggle Game connection',exact:true}).click();
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
