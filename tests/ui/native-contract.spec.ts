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
      calls: [] as any[],
      failSave: false,
      failSettings: false,
      delayOpen: 0,
      saved: null as any,
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
