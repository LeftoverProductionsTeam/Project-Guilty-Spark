import {PREFERRED_RUNTIME} from './runtimeWorkbench';
import { call } from './api';
import type { Bootstrap, OpenProject } from './types';
import { catalogAssets } from './forge';
import type { ForgeAsset } from './forge';
import { retainAssetSource } from './assetSources';
import type { AssetSourceInventory } from './assetSources';
import {matchesHomeCharacter} from './homeCharacters';
import type {HomeCharacter} from './homeCharacters';

const sources = new Map<string, Promise<ForgeAsset[]>>();
const characterSources=new Map<string,Promise<ForgeAsset|null>>();
export function preloadHomeCharacter(data:Bootstrap,character:HomeCharacter):Promise<ForgeAsset|null>{
  const runtime=data.settings?.preferredHalo ?? PREFERRED_RUNTIME;
  const key=JSON.stringify([data.dataDirectory,data.installation.mccPath,runtime,character]);
  const existing=characterSources.get(key);if(existing)return existing;
  const pending=(async()=>{
    const known=await preloadHomeModels(data);
    const pick=async(assets:ForgeAsset[])=>{
      const matching=assets.filter(asset=>matchesHomeCharacter(asset,character));
      const model=matching[0];if(!model)return null;
      if(character!=='johnson'||/characters[\\/]johnson[\\/]/i.test(model.path))return model;
      const variants=await call<string[]>('owned_character_variants',{projectId:model.sourceProjectId,tagId:model.tagId,sourceSha256:model.sourceSha256});
      const johnson=variants.find(name=>/^sgt_johnson(?:-|$)/i.test(name));
      return johnson?{...model,modelVariant:johnson,name:'Sgt. Johnson'}:null;
    };
    const version=runtime==='mccSteam'?13:runtime==='haloCustomEdition'?609:5;
    const available=await pick(known.filter(asset=>asset.cacheVersion===version));if(available)return available;
    const inventory=await call<AssetSourceInventory>('discover_asset_sources');
    const wanted=character==='monitor'?/^c40\.map$/i:/^a10\.map$/i;
    const provider=runtime==='openCe'?'opence':runtime==='chupathingyCe'?'chupathingy':'';
    const rank=(row:AssetSourceInventory['maps'][number])=>(row.cacheVersion===version?0:10)+(provider&&!row.location.toLowerCase().includes(provider)?1:0)+(character==='chief'&&!/^bloodgulch/i.test(row.name)?2:0);
    const maps=inventory.maps.filter(row=>!row.archive&&wanted.test(row.name)).sort((a,b)=>rank(a)-rank(b));
    for(const row of maps.slice(0,6)){
      try{const source=(await call<OpenProject[]>('open_asset_source',{sourceId:row.id,preparePreviewResources:true,previewOnly:true}))[0];if(source){const chosen=await pick(await connect(source));if(chosen)return chosen;}}
      catch{/* A different owned copy may have the exact model and variation. */}
    }return pick(known);
  })();
  if(characterSources.size>=16)characterSources.delete(characterSources.keys().next().value!);
  characterSources.set(key,pending);void pending.then(model=>{if(!model)characterSources.delete(key);},()=>characterSources.delete(key));return pending;
}
export const isHaloMonitor = (asset: Pick<ForgeAsset,'path'>) => /(?:^|[\\/])(?:monitor|343)[\\/]/i.test(asset.path);
function characters(source: OpenProject): ForgeAsset[] {
  const available = catalogAssets(source);
  const featured = available.filter(
    (asset) =>
      (asset.class==='bipd'||/monitor|343/i.test(asset.path)) && ['bipd', 'scen', 'vehi'].includes(asset.class),
  );
  return (featured.length ? featured : available.filter((asset) => asset.class === 'bipd')).sort(
    (a, b) => Number(isHaloMonitor(b)) - Number(isHaloMonitor(a)),
  );
}
async function connect(source: OpenProject): Promise<ForgeAsset[]> {
  if (source.inspection?.header.version === 13 && !source.project.source?.resourceSha256?.['mcc-textures']) {
    try {
      source = await call<OpenProject>('connect_mcc_texture_resources', { projectId: source.project.id });
    } catch {
      /* Embedded images remain eligible; missing dependencies stay explicit. */
    }
  }
  retainAssetSource(source);
  return characters(source);
}
/** Cache immutable source identities, not GPU objects or unverified pixels.
 * Each mounted preview still performs its normal source/resource checks. */
export function preloadHomeModels(data: Bootstrap): Promise<ForgeAsset[]> {
  const key = JSON.stringify([data.dataDirectory, data.installation.mccPath]);
  let pending = sources.get(key);
  if (pending) return pending;
  pending = (async () => {
    // An existing preserved campaign source needs one verified open, rather
    // than rescanning and reimporting the installed map on every app launch.
    const preserved = data.entries.find((row) => row.version === 13 && row.title.toLowerCase() === 'c40');
    if (preserved) {
      try {
        const found = await connect(await call<OpenProject>('open_project', { id: preserved.id }));
        if (found.some(isHaloMonitor)) return found;
      } catch {
        /* Original integrity checks remain authoritative; try another source. */
      }
    }
    let inventory: AssetSourceInventory | undefined;
    try {
      inventory = await call<AssetSourceInventory>('discover_asset_sources');
      const monitor = inventory.maps.find(
        (row) => !row.archive && row.cacheVersion === 13 && /^c40\.map$/i.test(row.name),
      );
      if (monitor) {
        const source = (await call<OpenProject[]>('open_asset_source', {
          sourceId: monitor.id,
          preparePreviewResources: true,
          previewOnly: true,
        }))[0];
        if (source) {
          const found = await connect(source);
          if (found.some(isHaloMonitor)) return found;
        }
      }
    } catch {
      /* A missing campaign source must not prevent an owned fallback. */
    }
    const saved = [...data.entries]
      .filter((row) => row.version !== null)
      .sort((a, b) => Number(b.version === 13) - Number(a.version === 13));
    for (const row of saved.slice(0, 3)) {
      try {
        const found = await connect(await call<OpenProject>('open_project', { id: row.id }));
        if (found.length) return found;
      } catch {
        /* Try another independently owned source. */
      }
    }
    const candidate =
      inventory?.maps.find(
        (row) => !row.archive && row.cacheVersion === 13 && /^(bloodgulch|d40)\.map$/i.test(row.name),
      ) ??
      inventory?.maps.find(
        (row) => !row.archive && row.cacheVersion === 609 && /^bloodgulch\.map$/i.test(row.name),
      );
    if (!candidate) return [];
    const source = (await call<OpenProject[]>('open_asset_source', { sourceId: candidate.id, preparePreviewResources: true, previewOnly: true }))[0];
    return source ? connect(source) : [];
  })();
  if (sources.size >= 4) sources.delete(sources.keys().next().value!);
  sources.set(key, pending);
  void pending.then(
    (models) => {
      if (!models.length) sources.delete(key);
    },
    () => sources.delete(key),
  );
  return pending;
}
