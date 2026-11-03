import type {ForgeAsset} from './forge';
export const homeCharacters=[
  {id:'monitor',label:'Guilty Spark'},
  {id:'johnson',label:'Sgt. Johnson'},
  {id:'chief',label:'Master Chief'},
  {id:'cortana',label:'Cortana'},
] as const;
export type HomeCharacter=typeof homeCharacters[number]['id'];
export const characterChoice=(id:HomeCharacter)=>`character:${id}`;
export function characterFromChoice(choice:string):HomeCharacter|null{
  if(choice==='automatic')return 'monitor';
  return homeCharacters.find(c=>characterChoice(c.id)===choice)?.id??null;
}
export function matchesHomeCharacter(asset:Pick<ForgeAsset,'path'|'class'>,character:HomeCharacter):boolean{
  if(asset.class!=='bipd')return false;
  const path=asset.path.replaceAll('\\','/').toLowerCase();
  switch(character){
    case 'monitor':return /(?:^|\/)(?:monitor|343)\//.test(path);
    case 'chief':return /^characters\/cyborg\/cyborg$/.test(path);
    case 'johnson':return /^characters\/marine_armored\/marine_armored(?:_unarmed)?$/.test(path)||/^characters\/johnson\//.test(path);
    case 'cortana':return /^characters\/cortana\/cortana$/.test(path);
  }
}
