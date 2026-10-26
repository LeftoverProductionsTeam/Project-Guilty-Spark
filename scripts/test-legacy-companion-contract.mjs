import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const native=readFileSync(new URL('../src-tauri/src/legacy_companions.rs',import.meta.url),'utf8');
const app=readFileSync(new URL('../src-tauri/src/app.rs',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/components/LegacyCompanionTools.tsx',import.meta.url),'utf8');
const conf=JSON.parse(readFileSync(new URL('../src-tauri/capabilities/main.json',import.meta.url)));
for(const command of ['legacy_companion_dashboard','choose_legacy_companion_path','register_legacy_companion','unregister_legacy_companion','launch_legacy_companion']){
  assert.match(app,new RegExp(`fn ${command}\\b`));
  assert.ok(app.includes(`            ${command},`),'Command missing native invoke allowlist: '+command);
  assert.match(ui,new RegExp(`['"]${command}['"]`),'ui');
}
assert.match(native,/pub fn register\(/);
assert.match(native,/pub fn status\(/);
assert.match(native,/pub fn launch\(/);
assert.match(native,/explicit_consent/);
assert.match(native,/maps::hash_file/);
assert.match(native,/reject_links/);
assert.match(native,/PE\\0\\0/);
assert.match(native,/Command::new/);
assert.doesNotMatch(native,/\b(cmd\.exe|powershell|\bsh\s+-c|\bspawn\s*\(\s*"bash")/i);
assert.ok(!conf.permissions.some(p=>String(p).includes('shell')),'Shell plugin unexpectedly enabled');
assert.match(ui,/window\.confirm/);
assert.match(ui,/mayOfferLaunch/);
assert.match(native,/std::env::consts::OS/);
console.log('PASS: native command/UI registration, host-runtime discovery, fingerprint+link guard, explicit consent, no shell capabilities');
