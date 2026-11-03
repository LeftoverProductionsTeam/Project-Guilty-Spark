import {expect,it} from 'vitest';
import {characterFromChoice,matchesHomeCharacter} from './homeCharacters';
it('keeps stable saved character choices and excludes prop models and similarly named paths',()=>{
  expect(characterFromChoice('automatic')).toBe('monitor');expect(characterFromChoice('character:johnson')).toBe('johnson');expect(characterFromChoice('native-id')).toBeNull();
  for(const [id,path]of [['monitor','characters/monitor/monitor'],['chief','characters/cyborg/cyborg'],['cortana','characters/cortana/cortana'],['johnson','characters/marine_armored/marine_armored']]as const)expect(matchesHomeCharacter({class:'bipd',path},id)).toBe(true);
  expect(matchesHomeCharacter({class:'scen',path:'cinematics/effects/cortana effects/cortana vol'},'cortana')).toBe(false);
  expect(matchesHomeCharacter({class:'bipd',path:'characters/cyborg/cyborg_unarmed'},'chief')).toBe(false);
});
