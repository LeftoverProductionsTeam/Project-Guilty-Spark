import {useState} from 'react';
import type {Workspace} from '../types';
import {PageTitle} from './ui';
const terms=[
  ['Tag','A Halo data file that describes an object, effect, image, sound or level. Tags often reference other tags.'],
  ['Scenario','The level’s placements, player starts, objectives, scripts and BSP references.'],
  ['BSP','The compiled level structure: surfaces, collision and visibility data. Changing source geometry requires rebuilding it.'],
  ['Map / cache','The compiled file loaded by a specific Halo edition. It is different from the editable tag tree.'],
  ['Editing kit','The separate set of tools for authoring Halo content. Installing MCC alone does not install its kit.'],
  ['Tool / Map Builder','The command-line compiler that turns source models and editable tags into Halo assets and maps.'],
  ['Guerilla','The official editor for individual tag properties and dependencies.'],
  ['Sapien','The official scenario editor for placements, encounters, scripts and level testing.'],
  ['Standalone / Tag Test','The SDK’s development game executable. It loads loose tags; Halo 1 Standalone has no multiplayer networking.'],
  ['tags folder','Editable Halo tag files. Point Spark at the extracted working copy for the selected editing kit.'],
  ['data folder','Source images, geometry and scripts used by the compiler. It is different from the tags folder.'],
  ['Resource maps','Shared classic bitmaps.map, sounds.map and loc.map files. Use the matching edition and source files.'],
  ['Shader / material','How a surface combines textures, transparency and lighting. A texture preview alone is not the full game material.'],
  ['Lightmap','Baked lighting compiled for a BSP. Moving an editor sun does not rewrite that lightmap.'],
  ['Fog','Distance atmosphere described by the map’s sky/environment data or an editor preview override.'],
  ['Collision','The solid surfaces used by physics. Spark’s source walk preview is separate from compiled Halo physics.'],
  ['Portals and PVS','Compiled partitions and visibility sets that help the game avoid rendering unseen parts of a level.'],
  ['JMS','A source model format accepted by the Halo compiler. Exporting JMS does not itself create a playable map.'],
  ['Item collection','A tag that chooses a weapon or equipment item for a map pickup. Its actual world model belongs to that item.'],
  ['Spawn point','A player starting position and facing direction. Spartan previews make these starts easier to read in the editor.'],
  ['Build target','A saved engine-specific choice of kit, tags and compiler. MCC and Custom Edition need separate compatible outputs.'],
  ['Dependency / recursive extraction','A referenced tag, plus any tags it references. Recursive extraction follows that chain into a checked staging folder.'],
  ['Snapshot','A saved, hashed project state for recovery. It does not replace the preserved original map.'],
  ['Live adapter','The connection to a particular game process and loaded map. Only its enabled operations can be sent to the game.'],
  ['Uniform scale','The same size factor on every axis. Live vehicle size also couples shared contact spheres, mass, inertia and suspension depths. Park and exit before changing it.'],
  ['Shared editing session','Two Spark editors exchanging source edits. This is separate from Halo’s game networking and replication.'],
  ['Readback','Reading a value after writing it to confirm the data changed. Visuals, collision and peer replication still need game testing.'],
  ['Machinima','Filmmaking inside a game. Rehearse cameras in Spark, then compile native camera points and HUD controls for a compatible MCC scenario.'],
];
const workflows:{title:string;description:string;target:Workspace;steps:string[]}[]=[
  {title:'Open an existing map',description:'Explore your own Halo content without overwriting the original.',target:'library',steps:['Import an owned .map in Map Library.','Open World editor. Use MMB to pan or hold RMB + WASD to fly.','Use Locate Halo Textures / Sounds if the map needs matching shared resources.']},
  {title:'Build an original level',description:'Start with editable source and a matching Halo compiler.',target:'quickforge',steps:['Create a QuickForge room and add real asset references.','Place player starts and objectives; walk the source collision preview.','Choose the CE or MCC build target, compile, then test the resulting map in that game.']},
  {title:'Edit and undo',description:'Make reversible changes with a history size you control.',target:'settings',steps:['Select an object, drag a colored axis or enter its position.','Ctrl+Z undoes; Ctrl+Y or Ctrl+Shift+Z redoes. Text fields retain text undo.','Settings & tools → Undo history limit defaults to 100. Preservation holds project snapshots.']},
  {title:'Connect a running game',description:'The Level Editor follows the matching live map automatically.',target:'world',steps:['Launch MCC in Anti-Cheat Disabled mode and load Halo 1.','In the Level Editor, choose Running Halo session and connect. Preserve and open its matching map when prompted.','Auto follows matching source and live maps. Move or resize existing objects; spawning and runtime BSP replacement still require additional adapter support.']},
  {title:'Resize a live vehicle',description:'Keep vehicle contact geometry and suspension aligned with its visible size.',target:'live',steps:['Load Halo 1 in the reviewed MCC build using Anti-Cheat Disabled. Connect in Live Lab and select an actual vehicle.','Park and exit every vehicle sharing its physics. Review the shared count, enable coupled resizing, choose 0.5×–2× and apply.','Test tires, steering and driving. Park and exit before undoing or disconnecting. Keep Spark running while using resized vehicles.']},
  {title:'Edit together',description:'Share a QuickForge source document on a private LAN or VPN.',target:'quickforge',steps:['One editor hosts under Shared QuickForge; privately share its address, port and key.','The second editor joins from a local project. Each person supplies their own Halo assets.','Each binds their own game adapter. Source sync and game replication are separate; retain conflicts as local drafts.']},
  {title:'Style your workbench',description:'Choose a palette, whole-window glass and a color tint.',target:'interface',steps:['Open Interface Studio and choose a theme.','Adjust Window transparency, tint color and tint strength.','Ctrl+Alt+O restores full opacity and clears the tint. Your appearance is remembered on this device.']},
  {title:'Convert a classic map to MCC',description:'Build a derived MCC cache using your installed editing kit.',target:'build',steps:['Import your owned map and connect its original shared resources when required.','Open Build & playtest and Prepare installed MCC tools. Spark extracts the SDK tags into a separate working cache.','Convert, inspect any compatibility errors, then test the result in MCC. Protected sources require editable files from their author.']},
  {title:'Record a native camera take',description:'Hide the game HUD and keep your character controllable.',target:'machinima',steps:['In Machinima, capture camera keys and enable In-engine recording.','Choose a fixed camera or sequence, then open the MCC build workflow. Existing scenario scripts must be recovered and merged before adding a take.','Build and load the native scenario. Flashlight toggles the camera take and restores the HUD when stopped. Record the game with OBS at the game’s resolution.']},
  {title:'Adjust the shared renderer',description:'Use authored textures and lighting, with optional visual enhancements.',target:'world',steps:['Open a map in the Level Editor and let verified texture loading complete.','Use Lighting & fog for an editor override, or Render enhancements for normal maps, highlights, bloom and exposure.','Use map lighting and Restore source rendering return to the authored preview. These controls do not patch a running game’s renderer.']},
];
export default function HowTo({navigate}:{navigate:(workspace:Workspace)=>void}){
  const [tab,setTab]=useState<'guide'|'glossary'>('guide'),[query,setQuery]=useState('');
  return <div className="analysis-page gs-how-to"><PageTitle eyebrow="FIELD MANUAL" title="How-to & Glossary" description="Choose a task or look up a Halo term. Your saved game and tools stay connected between launches."/><button onClick={()=>navigate('features')}>Browse all Spark features &amp; workflows</button>
    <div role="tablist" aria-label="Help topics"><button role="tab" id="gs-howto-tab" aria-selected={tab==='guide'} aria-controls="gs-howto-panel" onClick={()=>setTab('guide')}>How to</button><button role="tab" id="gs-glossary-tab" aria-selected={tab==='glossary'} aria-controls="gs-howto-panel" onClick={()=>setTab('glossary')}>Glossary</button></div>
    <section role="tabpanel" id="gs-howto-panel" aria-labelledby={tab==='guide'?'gs-howto-tab':'gs-glossary-tab'}>
      {tab==='guide'?<div className="gs-howto-grid">{workflows.map(w=><article className="analysis-card" key={w.title}><h2>{w.title}</h2><p>{w.description}</p><ol>{w.steps.map(s=><li key={s}>{s}</li>)}</ol><button onClick={()=>navigate(w.target)}>Open {w.target==='interface'?'Interface Studio':w.target==='library'?'Map Library':w.target==='settings'?'Settings & tools':w.target==='live'?'Live Lab':'QuickForge'}</button></article>)}</div>:<><input type="search" aria-label="Search glossary" value={query} onChange={e=>setQuery(e.target.value)} placeholder="BSP, tags, lightmap…"/><dl className="gs-glossary">{terms.filter(([name,text])=>`${name} ${text}`.toLowerCase().includes(query.toLowerCase())).map(([name,text])=><div key={name}><dt>{name}</dt><dd>{text}</dd></div>)}</dl></>}
    </section>
  </div>;
}
