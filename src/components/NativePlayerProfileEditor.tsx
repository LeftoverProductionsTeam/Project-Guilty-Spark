import { useId } from 'react';
import type { NativePlayerProfile } from '../firefight';
import { NumberField } from './ui';

/** Shared authoring fields; native validation and output stay in spark-core. */
export default function NativePlayerProfileEditor({ value, onChange, weaponPaths = [], disabled = false }: {
  value: NativePlayerProfile;
  onChange: (patch: Partial<NativePlayerProfile>) => void;
  weaponPaths?: readonly string[];
  disabled?: boolean;
}) {
  const choices = useId();
  return <fieldset className="forge-rule-grid forge-player-profile" aria-label="Native player starting loadout" disabled={disabled}>
    <datalist id={choices}>{[...new Set(weaponPaths)].map(path => <option key={path} value={path}/>)}</datalist>
    <label>Primary weapon tag<input aria-label="Primary weapon tag" list={choices} key={'primary:'+value.primaryWeapon}
      defaultValue={value.primaryWeapon} maxLength={240}
      onBlur={event => { if (event.target.value !== value.primaryWeapon) onChange({primaryWeapon:event.target.value}); }}/></label>
    <label>Secondary weapon tag (optional)<input aria-label="Secondary weapon tag" list={choices}
      key={'secondary:'+value.secondaryWeapon} defaultValue={value.secondaryWeapon ?? ''} maxLength={240}
      onBlur={event => {
        const weapon = event.target.value || null;
        if (weapon !== value.secondaryWeapon) onChange(weapon ? {secondaryWeapon:weapon} :
          {secondaryWeapon:null,secondaryLoaded:0,secondaryReserved:0});
      }}/></label>
    {([
      ['primaryLoaded','Primary rounds loaded',0,32767,1],
      ['primaryReserved','Primary rounds reserved',0,32767,1],
      ['secondaryLoaded','Secondary rounds loaded',0,32767,1],
      ['secondaryReserved','Secondary rounds reserved',0,32767,1],
      ['health','Starting health',.01,1,.05], ['shields','Starting shields',0,3,.1],
      ['fragmentationGrenades','Fragmentation grenades',0,4,1], ['plasmaGrenades','Plasma grenades',0,4,1],
    ] as const).map(([key,label,min,max,step]) => <label key={key}>{label}<NumberField label={label}
      value={value[key]} min={min} max={max} step={step} onCommit={number => onChange({[key]:number})}/></label>)}
  </fieldset>;
}
