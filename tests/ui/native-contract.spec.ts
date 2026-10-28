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
        if (command === 'bootstrap') return structuredClone(bootstrap);
        if (command === 'open_project') {if(mock.delayOpen){const delay=mock.delayOpen;mock.delayOpen=0;await new Promise(resolve=>setTimeout(resolve,delay));}return structuredClone(projects[args.id]);}
        if (command === 'claim_project_document' || command === 'release_project_document') return null;
        if (command === 'auto_connect_classic_textures') return null;
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
  await page.getByRole('button', { name: 'Tag editor', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'test', exact: true })).toBeVisible();
}

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
  await page.setViewportSize({width:1024,height:640});await mockDesktop(page);await openFixture(page);
  await expect(page.locator('.sidebar').getByRole('button',{name:'Interface Studio',exact:true})).toHaveCount(0);
  expect(await page.locator('.sidebar').evaluate(element=>element.scrollHeight-element.clientHeight)).toBe(0);
  await expect(page.getByRole('button',{name:'Export .gsproject',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Settings & tools',exact:true}).click();await page.getByRole('tab',{name:'Interface Studio',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Make the workbench yours.',exact:true})).toBeVisible();
  await expect(page.locator('.sidebar').getByRole('button',{name:'Settings & tools',exact:true})).toHaveClass(/selected/);
});
test('slow onboarding saves keep navigation available and do not steal a later route',async({page})=>{
  await mockDesktop(page);await page.getByRole('button',{name:'Start here',exact:true}).click();
  await page.evaluate(()=>{const w=window as any,original=w.__TAURI_INTERNALS__.invoke;w.__TAURI_INTERNALS__.invoke=(command:string,args:any)=>command==='save_settings'?new Promise((resolve,reject)=>{w.__finishSetup=()=>original(command,args).then(resolve,reject);}):original(command,args);});
  await page.getByRole('button',{name:'Continue to tools',exact:true}).click();
  await expect(page.getByRole('button',{name:'Saving Halo choice…',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Map library',exact:true}).click();await expect(page.getByRole('heading',{name:'Your worlds, reimagined.',exact:true})).toBeVisible();
  await page.evaluate(()=>(window as any).__finishSetup());
  await expect(page.getByRole('heading',{name:'Your worlds, reimagined.',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Start here',exact:true}).click();await expect(page.getByRole('heading',{name:'Your editing tools',exact:true})).toBeVisible();
});
test('hosting uses the selected map and gameplay presets retain fixed left and right gun controls',async({page})=>{
  await mockDesktop(page);await openFixture(page);await page.getByRole('button',{name:'Runtimes & friends',exact:true}).click();
  await page.getByRole('button',{name:'Hosting & servers',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Synthetic MCC Custom Games guide',exact:true})).toBeVisible();
  await expect(page.getByText('Use Halo CE Custom Games for this multiplayer map.',{exact:true})).toBeVisible();
  const calls=await page.evaluate(()=>(window as any).__sparkMock.calls.filter((call:any)=>call.command==='runtime_hosting_plan'));expect(calls.at(-1).args.projectId).toBe('a');
  await page.getByRole('button',{name:'Gameplay controls',exact:true}).click();
  await page.getByRole('checkbox',{name:'Request dual wield support',exact:true}).check();
  await page.getByRole('combobox',{name:'Dual-wield hotkey',exact:true}).selectOption('KeyV');
  await expect(page.getByText('Left gun · independent primary trigger',{exact:true})).toBeVisible();
  await expect(page.getByText('Right gun · independent secondary trigger',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Tag editor',exact:true}).click();await page.getByRole('button',{name:'Runtimes & friends',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Dual-wield hotkey',exact:true})).toHaveValue('KeyV');
  await expect(page.getByText('Changing a preset does not enable them in the running game.',{exact:false})).toBeVisible();
});

test('native camera position edits persist across tools and restore through the adapter',async({page})=>{
  await mockDesktop(page);await openFixture(page);await page.getByRole('button',{name:'Runtimes & friends',exact:true}).click();await page.getByRole('button',{name:'Gameplay controls',exact:true}).click();
  const camera=page.locator('.native-camera-controls');await camera.locator('summary').click();
  await camera.getByRole('button',{name:'Enable third-person camera',exact:true}).click();await expect(camera.getByText('Third-person camera active',{exact:false})).toBeVisible();
  await camera.getByRole('spinbutton',{name:'Camera shoulder offset',exact:true}).fill('-0.45');await camera.getByRole('spinbutton',{name:'Camera shoulder offset',exact:true}).press('Enter');await camera.getByRole('button',{name:'Apply camera position',exact:true}).click();
  await page.getByRole('button',{name:'Tag editor',exact:true}).click();await page.getByRole('button',{name:'Runtimes & friends',exact:true}).click();await camera.locator('summary').click();
  await expect(camera.getByRole('spinbutton',{name:'Camera shoulder offset',exact:true})).toHaveValue('-0.45');
  await camera.getByRole('button',{name:'Restore original camera',exact:true}).click();await expect(camera.getByText('Original camera selected',{exact:false})).toBeVisible();
  const calls=await page.evaluate(()=>(window as any).__sparkMock.calls.filter((c:any)=>c.command==='live_mcc_camera_configure'));expect(calls.map((c:any)=>c.args.enabled)).toEqual([true,true,false]);expect(calls[1].args.config.right).toBe(-.45);
});

test('the dedicated camera button toggles without opening settings and uses current native state',async({page})=>{
  await mockDesktop(page);await openFixture(page);
  await page.getByRole('button',{name:'Runtimes & friends',exact:true}).click();
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
  await mockDesktop(page);await openFixture(page);await page.getByRole('button',{name:'Creator Studio',exact:true}).click();await page.getByRole('tab',{name:'Custom power-ups',exact:true}).click();
  await page.getByRole('button',{name:'Add custom power-up',exact:true}).click();const duration=page.getByRole('spinbutton',{name:'Power-up duration (seconds)',exact:true});await duration.fill('120');await duration.press('Enter');
  await page.getByRole('combobox',{name:'Power-up effect',exact:true}).selectOption('overshield');await page.getByRole('button',{name:'Tag editor',exact:true}).click();await page.getByRole('button',{name:'Creator Studio',exact:true}).click();
  await expect(page.getByRole('tab',{name:'Custom power-ups',exact:true})).toHaveAttribute('aria-selected','true');await expect(duration).toHaveValue('120');await expect(page.getByRole('combobox',{name:'Power-up effect',exact:true})).toHaveValue('overshield');
  await page.getByRole('button',{name:'Remove power-up',exact:true}).click();await expect(page.getByRole('combobox',{name:'Custom power-up',exact:true})).toHaveCount(0);await page.keyboard.press('Control+z');await expect(page.getByRole('combobox',{name:'Custom power-up',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Build map with power-ups',exact:true}).click();await expect(page.getByRole('heading',{name:'From archive to in-game.',exact:true})).toBeVisible();
});

test('downloaded maps can open directly in the MCC conversion flow',async({page})=>{
  await mockDesktop(page);await openFixture(page);
  await page.evaluate(()=>{const w=window as any,original=w.__TAURI_INTERNALS__.invoke;w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>command==='import_dialog'?[await original('open_project',{id:'b'})]:original(command,args);});
  await page.getByRole('button',{name:'Community maps',exact:true}).click();await page.getByRole('button',{name:'Import & convert to MCC',exact:true}).click();await expect(page.getByRole('heading',{name:'From archive to in-game.',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Map conversion · CE / PC / Demo to MCC Halo 1',exact:true})).toBeVisible();
  const calls=await page.evaluate(()=>(window as any).__sparkMock.calls);expect(calls.some((c:any)=>c.command==='compatibility'&&c.args.id==='b')).toBe(true);expect(calls.some((c:any)=>c.command==='start_build')).toBe(false);
});

test('map sound events save with the map and stop their audio context on tool changes',async({page})=>{
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
  await openFixture(page);await page.getByRole('button',{name:'Level editor',exact:true}).click();await page.locator('.gs-map-sounds>summary').click();await page.getByRole('combobox',{name:'Map sound tag',exact:true}).selectOption('999');
  await page.getByRole('button',{name:'Add selected sound emitter',exact:true}).click();const mixer=page.getByRole('region',{name:'Spatial sound rehearsal',exact:true});
  await expect(page.getByRole('combobox',{name:'Map sound emitter',exact:true})).toBeVisible();await page.getByRole('spinbutton',{name:'Map sound master volume',exact:true}).fill('0');await page.getByRole('spinbutton',{name:'Map sound master volume',exact:true}).press('Enter');
  await page.getByRole('button',{name:'Start sound scene',exact:true}).click();await expect(mixer.getByRole('status')).toContainText('1/24 voices');
  await page.getByRole('button',{name:'Tag editor',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__soundContexts.every((c:AudioContext)=>c.state==='closed'))).toBe(true);
  await page.getByRole('button',{name:'Level editor',exact:true}).click();await page.locator('.gs-map-sounds>summary').click();await expect(page.getByRole('combobox',{name:'Map sound emitter',exact:true})).toBeVisible();await expect(page.getByRole('spinbutton',{name:'Map sound master volume',exact:true})).toHaveValue('0');
});
test('shared QuickForge survives tool changes and pauses a divergent local draft on restore',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('spark-test-forge',JSON.stringify({schemaVersion:1,name:'Synthetic forge',template:'emptyArena',runtimeId:'mccSteam',gameMode:'slayer',skyPath:null,buildQuality:'draft',geometry:[],materials:[],placements:[],spawns:[],objectives:[]})));
  await mockDesktop(page);await openFixture(page);await page.getByRole('button',{name:'Level editor',exact:true}).click();
  const sharing=page.locator('details.forge-live-panel').filter({has:page.locator('summary').filter({hasText:'Shared QuickForge'})});await sharing.locator('summary').first().click();
  await page.getByRole('button',{name:'Host editing session',exact:true}).click();await expect(page.getByRole('button',{name:'Leave session',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Tag editor',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).__sparkMock.calls.filter((call:any)=>call.command==='forge_session_leave').length)).toBe(0);
  await page.evaluate(()=>{(window as any).__sparkMock.session.view.document.name='Another editor changed the name';});
  await page.getByRole('button',{name:'Level editor',exact:true}).click();await sharing.locator('summary').first().click();
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
    let connected=false;w.__liveReceipt={pending:false,object,calls:0};
    const status=()=>structuredClone({pid:3,activeVehiclePhysics:false,activeSharedScales:false,scaleKeeperError:null,snapshot:{profile:'synthetic',identity:{scenario:'test/map',checksum:123,tagCount:1,scenarioDatum:7},objects:[object]},detail:'Synthetic receipt timing test'});
    w.__TAURI_INTERNALS__.invoke=async(command:string,args:any)=>{
      if(command==='live_mcc_connect'){connected=true;return status();}
      if(command==='live_mcc_sample'){if(!connected)throw new Error('No test session');return status();}
      if(command==='live_mcc_move_object'){w.__liveReceipt.pending=true;w.__liveReceipt.calls++;object.position=[...args.operation.position];await new Promise(resolve=>setTimeout(resolve,250));w.__liveReceipt.pending=false;return [{datum:12,applied:true,observedPosition:[...object.position],message:'Synthetic acknowledged move'}];}
      return original(command,args);
    };
  });
  await page.getByRole('button',{name:'Level editor',exact:true}).click();await page.getByRole('combobox',{name:'Editing target',exact:true}).selectOption('live');await page.getByRole('checkbox',{name:'I launched MCC using Anti-Cheat Disabled in Steam'}).check();await page.getByRole('button',{name:'Connect current Halo 1 session',exact:true}).click();await page.getByRole('combobox',{name:'Live Halo object',exact:true}).selectOption('12');
  const x=page.getByRole('spinbutton',{name:'Live position X',exact:true});await x.fill('4');await x.press('Tab');await page.getByRole('button',{name:'Apply live object position',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__liveReceipt.pending)).toBe(true);await page.keyboard.press('Control+z');
  await expect.poll(()=>page.evaluate(()=>(window as any).__liveReceipt.object.position[0])).toBe(1);await expect(page.getByRole('button',{name:'Redo live edit (Ctrl+Y)',exact:true})).toBeEnabled();await page.keyboard.press('Control+y');await expect.poll(()=>page.evaluate(()=>(window as any).__liveReceipt.object.position[0])).toBe(4);await expect.poll(()=>page.evaluate(()=>(window as any).__liveReceipt.calls)).toBe(3);
});

test('numeric-field Ctrl+Z and both redo shortcuts survive autosave; history limit persists',async({page})=>{
  await mockDesktop(page);await openFixture(page);
  const field=page.getByRole('spinbutton',{name:'Velocity',exact:true});await field.fill('24');await field.press('Tab');
  await expect(field).toHaveValue('24');await expect.poll(()=>page.evaluate(()=>(window as any).__sparkMock.saved?.tagEdits?.[0]?.value)).toBe(24);
  await field.focus();await page.keyboard.press('Control+z');await expect(field).toHaveValue('10');
  await field.focus();await page.keyboard.press('Control+y');await expect(field).toHaveValue('24');
  await field.focus();await page.keyboard.press('Control+z');await expect(field).toHaveValue('10');
  await field.focus();await page.keyboard.press('Control+Shift+z');await expect(field).toHaveValue('24');
  await page.getByRole('button',{name:'Settings & tools',exact:true}).click();const limit=page.getByRole('spinbutton',{name:'Undo history limit',exact:true});await expect(limit).toHaveValue('100');
  await limit.fill('150');await limit.press('Tab');await expect.poll(()=>page.evaluate(()=>localStorage.getItem('guilty-spark-undo-limit-v1'))).toBe('150');
  await page.reload();await page.getByRole('button',{name:'Settings & tools',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'Undo history limit',exact:true})).toHaveValue('150');
});
test('onboarding keeps a failed save on its step and remembers completed Halo and tool choices',async({page})=>{
  await mockDesktop(page);await page.goto('/');await page.getByRole('button',{name:'Start here',exact:true}).click();
  await page.evaluate(()=>(window as any).__sparkMock.failSettings=true);
  await page.getByRole('button',{name:'Continue to tools',exact:true}).click();await expect(page.locator('.gs-first-setup').getByRole('alert')).toContainText('settings write failed');await expect(page.getByRole('heading',{name:'Which Halo are you working with?',exact:true})).toBeVisible();
  await page.evaluate(()=>(window as any).__sparkMock.failSettings=false);await page.getByRole('button',{name:'Continue to tools',exact:true}).click();
  await page.getByRole('textbox',{name:'Setup Map Builder folder',exact:true}).fill('C:/owned/HCEEK');await page.getByRole('combobox',{name:'Setup editing kit generation',exact:true}).selectOption('h1aEk');await page.getByRole('textbox',{name:'Setup Editable Halo Tags folder',exact:true}).fill('C:/owned/working-tags');await page.getByRole('button',{name:'Save setup & open help',exact:true}).click();
  await expect(page.getByRole('heading',{name:'How-to & Glossary',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Your worlds, reimagined.',exact:true})).toBeVisible();await page.getByRole('button',{name:'Start here',exact:true}).click();await expect(page.getByRole('heading',{name:'Your workbench is ready',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Change Halo or tools',exact:true}).click();await page.getByRole('button',{name:'Continue to tools',exact:true}).click();await expect(page.getByRole('textbox',{name:'Setup Editable Halo Tags folder',exact:true})).toHaveValue('C:/owned/working-tags');
});
test('feature search preserves multiple open maps and each map undo history',async({page})=>{
  await mockDesktop(page);await openFixture(page);const velocity=page.getByRole('spinbutton',{name:'Velocity',exact:true});await velocity.fill('24');await velocity.press('Tab');
  await page.getByRole('button',{name:'Map library',exact:true}).click();await page.locator('.map-card').filter({hasText:'Synthetic candidate'}).click();await page.getByRole('button',{name:'Tag editor',exact:true}).click();
  await page.getByRole('button',{name:'Features & workflows',exact:true}).click();await expect(page.getByRole('heading',{name:'What can Spark do?',exact:true})).toBeVisible();await expect(page.locator('.feature-map-context')).toContainText('Synthetic candidate');await expect(page.locator('.feature-map-context')).toContainText('2 open maps');
  await page.getByRole('searchbox',{name:'Find a Spark feature',exact:true}).fill('multiple maps');await expect(page.getByRole('heading',{name:'Multiple maps & windows',exact:true})).toBeVisible();await page.getByRole('searchbox',{name:'Find a Spark feature',exact:true}).fill('zzzz-unavailable');await expect(page.getByText('No features match this search.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Show all features',exact:true}).click();
  await page.getByRole('tab',{name:/Synthetic baseline/}).click();await page.getByRole('button',{name:'Tag editor',exact:true}).click();await expect(velocity).toHaveValue('24');await velocity.focus();await page.keyboard.press('Control+z');await expect(velocity).toHaveValue('10');await page.getByRole('tab',{name:/Synthetic candidate/}).click();await expect(velocity).toHaveValue('25');
});
test('maps retain independent tag views, tool profiles and last workspace; a late load respects navigation',async({page})=>{
  await mockDesktop(page);await openFixture(page);const search=page.getByRole('textbox',{name:'Search tags',exact:true});await search.fill('test');await page.getByRole('combobox',{name:'Filter tag class',exact:true}).selectOption('weap');
  await page.locator('.gs-map-tools>summary').click();await page.locator('.gs-map-tools .gs-build-targets>summary').click();await page.locator('.gs-map-tools').getByRole('button',{name:'Add MCC target',exact:true}).click();const aFields=page.locator('.gs-map-tools fieldset').getByRole('textbox');await aFields.nth(0).fill('Map A kit');await aFields.nth(1).fill('C:/MapA/HCEEK');await aFields.nth(2).fill('C:/MapA/tags');
  await page.getByRole('button',{name:'Map library',exact:true}).click();await page.evaluate(()=>(window as any).__sparkMock.delayOpen=600);await page.locator('.map-card').filter({hasText:'Synthetic candidate'}).click();await page.getByRole('button',{name:'Features & workflows',exact:true}).click();await expect(page.getByRole('tab',{name:/Synthetic candidate/})).toBeVisible();await expect(page.getByRole('heading',{name:'What can Spark do?',exact:true})).toBeVisible();await expect(page.locator('.gs-map-tools')).toContainText('default tools');
  await page.getByRole('button',{name:'Tag editor',exact:true}).click();await expect(search).toHaveValue('');await search.fill('candidate');
  await page.getByRole('tab',{name:/Synthetic baseline/}).click();await expect(search).toHaveValue('test');await expect(page.getByRole('combobox',{name:'Filter tag class',exact:true})).toHaveValue('weap');await expect(page.locator('.gs-map-tools fieldset').getByRole('textbox').nth(0)).toHaveValue('Map A kit');await expect(page.locator('.gs-map-tools fieldset').getByRole('textbox').nth(2)).toHaveValue('C:/MapA/tags');
  await page.getByRole('button',{name:'Level editor',exact:true}).click();await page.getByRole('tab',{name:/Synthetic candidate/}).click();await expect(search).toHaveValue('candidate');await page.getByRole('tab',{name:/Synthetic baseline/}).click();await expect(page.getByRole('combobox',{name:'Editing target',exact:true})).toBeVisible();
});
test('settings Browse survives a bootstrap refresh without erasing other drafts', async ({ page }) => {
  await mockDesktop(page);
  await page.getByRole('button', { name: 'Settings & tools', exact: true }).click();
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
  await page.getByRole('button', { name: 'Compare variants', exact: true }).click();
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
  await page.getByRole('button', { name: 'Export .gsproject' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__sparkMock.calls.filter((call: any) => call.command === 'export_project').length,
      ),
    )
    .toBe(1);
  await expect(page.getByText('Project descriptor exported.', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Build & playtest', exact: true }).click();
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
  await mockDesktop(page);await openFixture(page);await page.locator('.sidebar').getByRole('button',{name:'Level editor',exact:true}).click();await page.locator('.bsp-assembly>summary').click();await page.getByRole('button',{name:'Plan connected tunnel',exact:true}).click();const width=page.getByRole('spinbutton',{name:'Tunnel width',exact:true});await width.fill('4');await width.press('Tab');await page.locator('.sidebar').getByRole('button',{name:'Features & workflows',exact:true}).click();await page.locator('.sidebar').getByRole('button',{name:'Level editor',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'Tunnel width',exact:true})).toHaveValue('4');await page.getByRole('button',{name:'Apply connection',exact:true}).click();await expect(page.getByRole('button',{name:'Remove connection',exact:true})).toBeEnabled();await page.keyboard.press('Control+z');await expect(page.getByRole('button',{name:'Remove connection',exact:true})).toHaveCount(0);await page.keyboard.press('Control+Shift+z');await expect(page.getByRole('button',{name:'Remove connection',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Check tunnel clearance',exact:true}).click();await expect(page.locator('.bsp-assembly')).toContainText('42 points');expect(await page.evaluate(()=>(window as any).__sparkMock.saved.bspAssembly.tunnelWidth)).toBe(4);
  await page.locator('.sidebar').getByRole('button',{name:'Map library',exact:true}).click();await page.locator('.map-card').filter({hasText:'Synthetic candidate'}).click();await page.locator('.sidebar').getByRole('button',{name:'Level editor',exact:true}).click();await page.locator('.bsp-assembly>summary').click();await expect(page.getByRole('button',{name:'Remove connection',exact:true})).toHaveCount(0);await page.getByRole('tab',{name:'Synthetic baseline',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'Tunnel width',exact:true})).toHaveValue('4');
});
test('donor scenery participates in undo and changing a BSP transform clears stale clearance', async ({ page }) => {
  await mockDesktop(page);
  await openFixture(page);
  await page.locator('.sidebar').getByRole('button', { name: 'Level editor', exact: true }).click();
  await page.locator('.bsp-assembly>summary').click();
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
  await page.locator('.sidebar').getByRole('button', { name: 'Level editor', exact: true }).click();
  await page.locator('.bsp-assembly>summary').click();
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
  await page.locator('.sidebar').getByRole('button', { name: 'Level editor', exact: true }).click();
  await page.locator('.bsp-assembly>summary').click();
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
  await page.locator('.sidebar').getByRole('button', { name: 'Map library', exact: true }).click();
  await openFixture(page);
  await page.locator('.sidebar').getByRole('button', { name: 'Level editor', exact: true }).click();
  await expect(width).toHaveValue('6');
  await expect(page.getByRole('button', { name: 'Apply connection', exact: true })).toBeEnabled();
});

test('a delayed BSP plan cannot resurrect a draft after leaving the workspace', async ({ page }) => {
  await mockDesktop(page); await openFixture(page);
  await page.locator('.sidebar').getByRole('button', { name: 'Level editor', exact: true }).click();
  await page.locator('.bsp-assembly>summary').click();
  await page.evaluate(() => { (window as any).__sparkMock.deferBspPlan = true; });
  await page.getByRole('button', { name: 'Plan connected tunnel', exact: true }).click();
  await page.waitForFunction(() => !!(window as any).__sparkMock.finishBspPlan);
  await page.locator('.sidebar').getByRole('button', { name: 'Features & workflows', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What can Spark do?', exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).__sparkMock.finishBspPlan());
  await page.locator('.sidebar').getByRole('button', { name: 'Level editor', exact: true }).click();
  await expect(page.locator('.bsp-draft-heading')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Plan connected tunnel', exact: true })).toBeEnabled();
});

test('a delayed replacement plan cannot overwrite edits made while it runs', async ({ page }) => {
  await mockDesktop(page); await openFixture(page);
  await page.locator('.sidebar').getByRole('button', { name: 'Level editor', exact: true }).click();
  await page.locator('.bsp-assembly>summary').click();
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
  await page.getByRole('button', { name: 'Runtimes & friends', exact: true }).click();
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
