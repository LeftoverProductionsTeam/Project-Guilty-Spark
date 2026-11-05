import type {MapInspection} from './types';
/** A renamed biped can still use the map's actual Spartan world model. Never
 * infer the geometry from the biped's display name or use another character. */
export function sourceSpartan(inspection:MapInspection|null|undefined){
  if(!inspection)return null;
  const modelClass=inspection.header.version===5?'mode':'mod2';
  const paths=['characters/cyborg_mp/cyborg_mp','characters/cyborg/cyborg'];
  for(const path of paths){const model=inspection.tags.find(t=>t.class===modelClass&&t.path.replaceAll('\\','/').toLowerCase()===path);
    if(!model)continue;const biped=inspection.tags.find(t=>t.class==='bipd'&&t.references.some(r=>r.label==='Model'&&r.targetId===model.id&&r.class===modelClass));
    if(biped)return biped;
  }return null;
}
