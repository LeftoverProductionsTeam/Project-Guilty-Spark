import {call,native} from './api';
import {readMapSession,writeMapSession} from './mapSession';
import {characterFromChoice,homeCharacters,matchesHomeCharacter} from './homeCharacters';
import {preloadHomeModels} from './homeShowcase';
import type {Bootstrap} from './types';
import type {InterfacePreferences} from './interfacePreferences';
let started:Promise<void>|null=null;
export function startLaunchVoice(data:Bootstrap,preferences:()=>InterfacePreferences):Promise<void>{
  if(!native)return Promise.resolve();
  if(started)return started;
  started=(async()=>{
    if(!preferences().launchVoiceEnabled||preferences().launchVoiceVolume<=0)return;
    const choice=readMapSession('global','home.model','automatic');
    let character=characterFromChoice(choice);
    if(!character){const models=await preloadHomeModels(data),model=models.find(asset=>`${asset.sourceSha256}:${asset.tagId}`===choice);character=model?homeCharacters.find(c=>matchesHomeCharacter(model,c.id))?.id??null:null;}
    if(!character)return;
    try{
      const greeting=await call<{character:string;lineId:string;availableLines:number}>('prepare_launch_voice',{character});
      if(!greeting)return;
      const settings=preferences();
      if(!settings.launchVoiceEnabled||settings.launchVoiceVolume<=0){await call('stop_launch_voice');return;}
      const played=await call<boolean>('play_launch_voice',{character,lineId:greeting.lineId,volume:settings.launchVoiceVolume});
      if(played)writeMapSession('global','home.voice.status',`One ${homeCharacters.find(c=>c.id===character)?.label} greeting per launch · ${greeting.availableLines} recoverable lines in the shuffle.`);
    }catch(error){writeMapSession('global','home.voice.status','Launch voice: '+String(error).slice(0,350));}
  })();return started;
}
