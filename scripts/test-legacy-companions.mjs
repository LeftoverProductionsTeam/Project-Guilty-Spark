import assert from 'node:assert/strict';
import {companionOfferLabel,mayOfferLaunch,validatedDashboard,cannotGuaranteeCompatibility} from '../src/legacyCompanions.ts';
const offer=(o={})=>({id:'hmt',name:'Halo Map Tools',historicalRole:'tags',preferredFormat:'windows-pe',runtimeHint:'',runtimeDetected:true,installed:false,registered:false,...o});
const reg=(o={})=>({id:'uuid1',toolId:'hmt',name:'Halo Map Tools',fileName:'HMT.exe',format:'windows-pe',status:'available-to-try',detail:'Binary SHA verified. Compatibility untested.',runtime:'Windows native',...o});
const dashboard=(o={})=>({hostOs:'windows',hostArch:'x86_64',runtimes:[{id:'windows-pe',available:true,detail:'Candidate only'},{id:'mac-app',available:false,detail:'Mac-only'}],catalog:[offer()],registrations:[reg()],discoveryScope:'Known paths only',...o});
const data=validatedDashboard(dashboard());
assert.equal(companionOfferLabel(data.catalog[0]),'Potential runtime present · tool not registered');
assert.equal(companionOfferLabel(offer({installed:true,registered:true})),'Registered binary verified · operation not tested');
assert.equal(companionOfferLabel(offer({registered:true})),'Registered, but not currently verified');
assert.equal(companionOfferLabel(offer({runtimeDetected:false})),'No native or recognized compatibility runtime · tool not registered');
assert.equal(mayOfferLaunch(data.registrations[0],data),true);
for(const status of ['changed','unavailable','invalid-registration','runtime-unavailable']) {
  const d=dashboard({registrations:[reg({status})]});
  assert.equal(mayOfferLaunch(d.registrations[0],d),false,`unsafe launch status ${status}`);
}
assert.equal(mayOfferLaunch(reg(),dashboard({runtimes:[{id:'windows-pe',available:false,detail:'Missing'}]})),false);
assert.equal(mayOfferLaunch(reg({id:'forged'}),dashboard()),false);
assert.throws(()=>validatedDashboard(dashboard({registrations:[reg({fileName:'C:\\private\\game.exe'})]})),/Invalid legacy/);
assert.throws(()=>validatedDashboard(dashboard({registrations:[reg({fileName:'../game.exe'})]})),/Invalid legacy/);
assert.throws(()=>validatedDashboard(dashboard({catalog:[offer({preferredFormat:'shell-script'})]})),/Unsupported legacy/);
assert.throws(()=>validatedDashboard(dashboard({runtimes:[{id:'bash',available:true,detail:'danger'}]})),/Unsupported legacy/);
assert.throws(()=>validatedDashboard(dashboard({registrations:Array.from({length:21},()=>reg())})),/Unsupported companion/);
assert.match(cannotGuaranteeCompatibility,/does not mean/);
console.log('PASS: legacy companions explicitly registered, runtime candidate != working app, refused launch on stale/unavailable/forged binary identity and path leaks');
