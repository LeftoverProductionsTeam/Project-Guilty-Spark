use serde_json::{json, Value};
use std::{
    ffi::c_void,
    mem::size_of,
    time::{Duration, Instant},
};
use windows_sys::Win32::{
    Foundation::*,
    System::{
        Diagnostics::{Debug::ReadProcessMemory, ToolHelp::*},
        Threading::*,
    },
};
struct Remote {
    handle: HANDLE,
    base: u64,
}
impl Drop for Remote {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.handle);
        }
    }
}
fn definition(mut v: &Value) -> &Value {
    for _ in 0..10 {
        if v.get("fields").is_some() {
            return v;
        }
        if let Some(t) = v.get("type") {
            v = t
        } else {
            break;
        }
    }
    v
}
fn field<'a>(v: &'a Value, name: &str) -> &'a Value {
    definition(v)["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["name"] == name)
        .unwrap()
}
fn offset(v: &Value, name: &str) -> usize {
    field(v, name)["offset"].as_u64().unwrap() as usize
}
fn typ<'a>(v: &'a Value, name: &str) -> &'a Value {
    definition(
        &v["types"]
            .as_array()
            .unwrap()
            .iter()
            .find(|t| t["name"] == name)
            .unwrap()["layout"],
    )
}
fn symbol<'a>(v: &'a Value, name: &str) -> &'a Value {
    v["symbols"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["symbol"] == name)
        .unwrap()
}
fn u16(b: &[u8], p: usize) -> u16 {
    u16::from_le_bytes(b[p..p + 2].try_into().unwrap())
}
fn u32(b: &[u8], p: usize) -> u32 {
    u32::from_le_bytes(b[p..p + 4].try_into().unwrap())
}
fn f32(b: &[u8], p: usize) -> f32 {
    f32::from_le_bytes(b[p..p + 4].try_into().unwrap())
}
fn vector(b: &[u8], p: usize) -> [f32; 3] {
    [f32(b, p), f32(b, p + 4), f32(b, p + 8)]
}
impl Remote {
    fn read(&self, p: u64, n: usize) -> Result<Vec<u8>, String> {
        if p < 65536
            || p.checked_add(n as u64).is_none_or(|end| end > 0x100000000)
            || n > 2 * 1024 * 1024
        {
            return Err("bounded address rejected".into());
        }
        let mut b = vec![0; n];
        let mut got = 0;
        unsafe {
            if ReadProcessMemory(
                self.handle,
                p as usize as *const c_void,
                b.as_mut_ptr() as *mut c_void,
                n,
                &mut got,
            ) == 0
                || got != n
            {
                return Err(format!("unavailable read {}", GetLastError()));
            }
        }
        Ok(b)
    }
    fn read_symbol(&self, meta: &Value, name: &str, n: usize) -> Result<Vec<u8>, String> {
        self.read(self.base + symbol(meta, name)["rva"].as_u64().unwrap(), n)
    }
    fn pool(&self, meta: &Value, name: &str) -> Result<(u16, u16, u16, u32), String> {
        let p = u32(&self.read_symbol(meta, name, 4)?, 0);
        let b = self.read(p as u64, 56)?;
        let count = u16(&b, 32);
        let size = u16(&b, 34);
        let actual = u16(&b, 48);
        let data = u32(&b, 52);
        if b[36] != 1 || count > 32768 || size == 0 || size > 8192 || actual > count {
            return Err("invalid datum pool".into());
        }
        Ok((count, size, actual, data))
    }
    fn tick(&self, meta: &Value) -> Result<(u32, u32), String> {
        let t = &symbol(meta, "game_time_globals")["layout"]["type"];
        let p = u32(&self.read_symbol(meta, "game_time_globals", 4)?, 0);
        let b = self.read(p as u64, 32)?;
        if b[0] == 0 {
            return Err("map not initialized".into());
        }
        Ok((
            u32(&b, offset(t, "local_time")),
            u32(&b, offset(t, "server_time")),
        ))
    }
    fn script_globals(&self, meta: &Value) -> Result<Value, String> {
        let scenario = typ(meta, "scenario");
        let global = typ(meta, "hs_global");
        let datum = typ(meta, "hs_global_datum");
        let pointer = u32(&self.read_symbol(meta, "global_scenario", 4)?, 0);
        let block_type = &field(scenario, "hs_globals")["type"];
        let block = self.read(pointer as u64 + offset(scenario, "hs_globals") as u64,
            definition(block_type)["bytes"].as_u64().unwrap() as usize)?;
        let count = u32(&block, offset(block_type, "count")) as usize;
        if count > 256 { return Err("script global census exceeds bound".into()); }
        if count == 0 { return Ok(json!([])); }
        let stride = global["bytes"].as_u64().unwrap() as usize;
        let globals = self.read(u32(&block, offset(block_type, "address")) as u64, count * stride)?;
        // The constant count is optimized out; the publisher PDB retains the
        // actual external-global array extent. Never substitute a guessed count.
        let external = symbol(meta, "hs_external_globals")["layout"]["count"].as_u64()
            .filter(|count| *count > 0 && *count <= 512).ok_or("external global layout differs")? as usize;
        let (maximum, datum_stride, _, values) = self.pool(meta, "hs_global_data")?;
        if maximum > 1024 || external + count > maximum as usize || datum_stride as u64 != datum["bytes"].as_u64().unwrap() {
            return Err("script global pool layout differs".into());
        }
        let mut out = vec![];
        for index in 0..count {
            let row = &globals[index * stride..(index + 1) * stride];
            let name_start = offset(global, "name");
            let name = &row[name_start..name_start+32];
            let name = String::from_utf8_lossy(&name[..name.iter().position(|b| *b == 0).unwrap_or(32)]);
            // Only Spark's explicit test/controller state, never arbitrary script strings/pointers.
            if !name.starts_with("gs_ff_") { continue; }
            let kind = u16(row, offset(global, "type"));
            if !matches!(kind, 5 | 7 | 8) { continue; }
            let value = self.read(values as u64 + ((external + index) * datum_stride as usize) as u64, datum_stride as usize)?;
            if u16(&value, offset(datum, "identifier")) != 0xaced { return Err("script global salt differs".into()); }
            let at = offset(datum, "value");
            let number = match kind {
                5 => i64::from(value[at] != 0),
                7 => i64::from(u16(&value, at) as i16),
                8 => i64::from(u32(&value, at) as i32),
                _ => return Err("unsupported Spark script global type".into()),
            };
            out.push(json!({"name":name,"type":kind,"value":number}));
        }
        Ok(json!(out))
    }
    fn details(&self, meta: &Value, headers: &[u8], step: usize) -> Result<Value, String> {
        let actor = typ(meta, "actor_datum");
        let (maximum, stride, _, address) = self.pool(meta, "actor_data")?;
        if maximum > 1024 || stride as u64 != actor["bytes"].as_u64().unwrap() {
            return Err("actor detail pool layout differs".into());
        }
        let bytes = self.read(address as u64, maximum as usize * stride as usize)?;
        let meta_type = &field(actor, "meta")["type"];
        let state_type = &field(actor, "state")["type"];
        // Resolve the verified PDB layout once per census, not for each object.
        let actor_id = offset(actor, "identifier");
        let actor_meta = offset(actor, "meta");
        let actor_state = offset(actor, "state");
        let [a_unit, a_tag, a_variant, a_active, a_frozen, a_dormant, a_erase, a_encounterless, a_team] =
            [
                "unit_index",
                "definition_index",
                "variant_definition_index",
                "active",
                "frozen",
                "dormant",
                "erase_next_tick",
                "encounterless",
                "team_index",
            ]
            .map(|n| offset(meta_type, n));
        let [a_mode, a_action, a_combat] =
            ["mode", "action", "combat_status"].map(|n| offset(state_type, n));
        let mut pool = Vec::new();
        for (index, entry) in bytes.chunks_exact(stride as usize).enumerate() {
            let salt = u16(entry, actor_id);
            if salt == 0 {
                continue;
            }
            let m = &entry[actor_meta..];
            let s = &entry[actor_state..];
            pool.push(json!({
                "id": ((salt as u32) << 16) | index as u32,
                "unitId": u32(m, a_unit), "actorTag": u32(m, a_tag), "variantTag": u32(m, a_variant),
                "active": m[a_active], "frozen": m[a_frozen], "dormant": m[a_dormant],
                "eraseNextTick": m[a_erase], "encounterless": m[a_encounterless], "team": u16(m, a_team),
                "mode": u16(s, a_mode), "action": u16(s, a_action), "combatStatus": u16(s, a_combat)
            }));
        }
        let header = typ(meta, "object_header_datum");
        let object_type = typ(meta, "object_datum");
        let object = &field(object_type, "object")["type"];
        let unit = typ(meta, "unit_datum");
        let unit_type = &field(unit, "unit")["type"];
        let weapon = typ(meta, "weapon_datum");
        let weapon_type = &field(weapon, "weapon")["type"];
        let trigger_type = definition(&field(weapon_type, "triggers")["type"]);
        let [h_id, h_kind, h_size, h_datum] =
            ["identifier", "type", "data_size", "datum"].map(|n| offset(header, n));
        let object_start = offset(object_type, "object");
        let object_tag = offset(object_type, "definition_index");
        let [o_position, o_velocity, o_health, o_shield, o_flags, o_damage, o_team, o_parent] = [
            "position",
            "translational_velocity",
            "body_vitality",
            "shield_vitality",
            "flags",
            "damage_flags",
            "owner_team_index",
            "parent_object_index",
        ]
        .map(|n| offset(object, n));
        let unit_start = offset(unit, "unit");
        let unit_animation = typ(meta, "unit_animation");
        let u_animation = offset(unit_type, "animation");
        let object_animation = typ(meta, "object_animation_state");
        let object_state = typ(meta, "animation_state");
        let o_animation_state = offset(object, "animation") + offset(object_animation, "state");
        let [u_actor, u_player, u_flags, u_seat, u_control, u_throttle] = [
            "actor_index",
            "player_index",
            "flags",
            "parent_seat_index",
            "control_flags",
            "throttle",
        ]
        .map(|n| offset(unit_type, n));
        let weapon_start = offset(weapon, "weapon");
        let [w_fired, w_state, w_triggers] =
            ["game_time_last_fired", "state", "triggers"].map(|n| offset(weapon_type, n));
        let [t_state, t_flags, t_timer] =
            ["state", "flags", "state_timer"].map(|n| offset(trigger_type, n));
        let unit_bytes = unit["bytes"].as_u64().unwrap() as usize;
        let weapon_bytes = weapon["bytes"].as_u64().unwrap() as usize;
        let object_bytes = object_type["bytes"].as_u64().unwrap() as usize;
        let mut objects = Vec::new();
        for (index, h) in headers.chunks_exact(step).enumerate() {
            let salt = u16(h, h_id);
            let kind = h[h_kind];
            let size = u16(h, h_size) as usize;
            let required = if kind <= 1 {
                unit_bytes
            } else if kind == 2 {
                weapon_bytes
            } else {
                object_bytes
            };
            if salt == 0 || kind > 5 || size < required || size > 16384 {
                continue;
            }
            if objects.len() >= 4096 {
                return Err("object detail limit exceeded".into());
            }
            let bytes = self.read(u32(h, h_datum) as u64, required)?;
            let o = &bytes[object_start..];
            let mut record = json!({
                "id": ((salt as u32) << 16) | index as u32, "type": kind,
                "tag": u32(&bytes, object_tag), "position": vector(o, o_position),
                "velocity": vector(o, o_velocity), "health": f32(o, o_health), "shield": f32(o, o_shield),
                "flags": u32(o, o_flags), "damageFlags": u16(o, o_damage),
                "team": u16(o, o_team), "parentId": u32(o, o_parent)
            });
            if kind <= 1 {
                let u = &bytes[unit_start..];
                record["unit"] = json!({
                    "actorId": u32(u, u_actor), "playerId": u32(u, u_player), "flags": u32(u, u_flags),
                    "seat": u16(u, u_seat), "controlFlags": u16(u, u_control), "throttle": vector(u, u_throttle),
                    "animationSeat": u[u_animation + offset(unit_animation, "seat_index")] as i8,
                    "animationState": u[u_animation + offset(unit_animation, "state")] as i8,
                    "animationAction": u[u_animation + offset(unit_animation, "action")] as i8,
                    "animationIndex": u16(o, o_animation_state + offset(object_state, "index")),
                    "animationFrame": u16(o, o_animation_state + offset(object_state, "frame_index"))
                });
            } else if kind == 2 {
                let w = &bytes[weapon_start..];
                let t = &w[w_triggers..];
                record["weapon"] = json!({
                    "lastFiredTick": u32(w, w_fired), "state": w[w_state], "triggerState": t[t_state],
                    "triggerFlags": u32(t, t_flags), "triggerTimer": u16(t, t_timer)
                });
            }
            objects.push(record);
        }
        let profile = definition(&symbol(meta, "ai_profile")["layout"]);
        let profile_bytes = self.read_symbol(
            meta,
            "ai_profile",
            profile["bytes"].as_u64().unwrap() as usize,
        )?;
        Ok(
            json!({"actorPool": pool,"objects": objects,"aiProfileDisabled":profile_bytes[offset(profile,"disabled")],"scriptGlobals":self.script_globals(meta)?}),
        )
    }
    fn snapshot(
        &self,
        meta: &Value,
        role: &str,
        census: bool,
        details: bool,
    ) -> Result<Value, String> {
        let tick = self.tick(meta)?;
        let (max, step, _, start) = self.pool(meta, "object_header_data")?;
        let header = typ(meta, "object_header_datum");
        if step as u64 != header["bytes"].as_u64().unwrap() {
            return Err("header stride mismatch".into());
        }
        let headers = self.read(start as u64, max as usize * step as usize)?;
        let (_am, _, actor_count, _) = self.pool(meta, "actor_data")?;
        let name = if role == "host" {
            "host_actors"
        } else {
            "client_actors"
        };
        let count_name = if role == "host" {
            "host_actor_count"
        } else {
            "client_actor_count"
        };
        let count = u16(&self.read_symbol(meta, count_name, 2)?, 0) as usize;
        if count > 1056 {
            return Err("actor count exceeds publisher bound".into());
        }
        let desc = definition(&symbol(meta, name)["layout"]["type"]);
        let stride = desc["bytes"].as_u64().unwrap() as usize;
        let actors = if count > 0 {
            self.read_symbol(meta, name, count * stride)?
        } else {
            vec![]
        };
        let unit = typ(meta, "unit_datum");
        let object = &field(unit, "object")["type"];
        let ud = &field(unit, "unit")["type"];
        let object_off = offset(unit, "object");
        let unit_off = offset(unit, "unit");
        let mut records = Vec::new();
        for i in 0..count {
            let a = &actors[i * stride..(i + 1) * stride];
            let id = u32(a, offset(desc, "unit_index"));
            let slot = (id & 0xffff) as usize;
            if slot >= max as usize {
                continue;
            }
            let h = &headers[slot * step as usize..(slot + 1) * step as usize];
            if u16(h, offset(header, "identifier")) != (id >> 16) as u16
                || h[offset(header, "type")] > 1
            {
                continue;
            }
            let size = u16(h, offset(header, "data_size")) as usize;
            if size < unit["bytes"].as_u64().unwrap() as usize || size > 16384 {
                continue;
            }
            let b = self.read(
                u32(h, offset(header, "datum")) as u64,
                unit["bytes"].as_u64().unwrap() as usize,
            )?;
            let o = &b[object_off..];
            let u = &b[unit_off..];
            let control = &field(desc, "control")["type"];
            let cb = &a[offset(desc, "control")..];
            let trigger = f32(cb, offset(control, "primary_trigger"));
            // Recorded-animation units also enter this upstream table and can
            // have no AI actor or meaningful trigger. Keep that distinction.
            let trigger =
                (trigger.is_finite() && (0.0..=1.0).contains(&trigger)).then_some(trigger);
            records.push(json!({
                "id": id,
                "tag": u32(&b, offset(unit, "definition_index")),
                "position": vector(o, offset(object, "position")),
                "health": f32(o, offset(object, "body_vitality")),
                "shield": f32(o, offset(object, "shield_vitality")),
                "damageFlags": u16(o, offset(object, "damage_flags")),
                "actorId": u32(u, offset(ud, "actor_index")),
                "playerId": u32(u, offset(ud, "player_index")),
                "parentId": u32(o, offset(object, "parent_object_index")),
                "seat": u16(u, offset(ud, "parent_seat_index")),
                "team": u16(o, offset(object, "owner_team_index")),
                "throttle": vector(cb, offset(control, "throttle")),
                "trigger": trigger,
                "controlFlags": u16(cb, offset(control, "control_flags")),
                "receivedTick": if role == "client" {
                    Some(u32(a, offset(desc, "received_time")))
                } else { None },
                "impulse": u16(a, offset(desc, "impulse")),
                "impulseSequence": a[offset(desc, "impulse_number")],
                "speechTag": u32(a, offset(desc, "speech_sound")),
                "speechSequence": a[offset(desc, "speech_number")]
            }));
        }
        let mut object_tags = std::collections::BTreeMap::new();
        if census {
            for h in headers.chunks_exact(step as usize) {
                if u16(h, offset(header, "identifier")) == 0
                    || u16(h, offset(header, "data_size")) < 4
                    || h[offset(header, "type")] > 11
                {
                    continue;
                }
                let tag = self.read(u32(h, offset(header, "datum")) as u64, 4)?;
                *object_tags
                    .entry((h[offset(header, "type")], u32(&tag, 0)))
                    .or_insert(0usize) += 1;
            }
        }
        let object_tags: Vec<_> = object_tags
            .into_iter()
            .map(|((kind, tag), count)| json!({"type": kind, "tag": tag, "count": count}))
            .collect();
        let details = if census && details {
            Some(self.details(meta, &headers, step as usize)?)
        } else {
            None
        };
        let end = self.tick(meta)?;
        if end != tick {
            return Err("crossed tick while reading".into());
        }
        Ok(
            json!({"localTick":tick.0,"serverTick":tick.1,"actorPoolCount":actor_count,"networkActorCount":count,"actors":records,"objectTags":object_tags,"details":details}),
        )
    }
}
pub fn observe(meta: &Value, expected: &str, pid: u32, role: &str, details: bool) {
    assert!(role == "host" || role == "client");
    unsafe {
        let h = OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        assert!(!h.is_null(), "read-only process handle {}", GetLastError());
        let mut image = [0u16; 32768];
        let mut len = image.len() as u32;
        assert_ne!(
            QueryFullProcessImageNameW(h, 0, image.as_mut_ptr(), &mut len),
            0
        );
        let actual = std::path::PathBuf::from(String::from_utf16_lossy(&image[..len as usize]));
        assert_eq!(
            actual.canonicalize().unwrap(),
            std::path::Path::new(expected).canonicalize().unwrap(),
            "wrong owned executable"
        );
        let modules = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid);
        assert_ne!(modules, INVALID_HANDLE_VALUE);
        let mut module: MODULEENTRY32W = std::mem::zeroed();
        module.dwSize = size_of::<MODULEENTRY32W>() as u32;
        assert_ne!(Module32FirstW(modules, &mut module), 0);
        let module_path = String::from_utf16_lossy(
            &module.szExePath[..module
                .szExePath
                .iter()
                .position(|c| *c == 0)
                .unwrap_or(module.szExePath.len())],
        );
        assert_eq!(
            std::path::Path::new(&module_path).canonicalize().unwrap(),
            actual.canonicalize().unwrap(),
            "main module differs from selected owned executable"
        );
        let base = module.modBaseAddr as usize as u64;
        assert!(
            base >= 65536 && base + (module.modBaseSize as u64) <= 0x100000000,
            "32-bit main module required"
        );
        for sym in meta["symbols"].as_array().unwrap() {
            assert!(
                sym["rva"]
                    .as_u64()
                    .is_some_and(|rva| rva < module.modBaseSize as u64),
                "symbol outside executable image"
            );
        }
        CloseHandle(modules);
        let remote = Remote { handle: h, base };
        let begin = Instant::now();
        println!(
            "{}",
            json!({
                "schemaVersion":1,"runtime":"opence-build-335",
                "role":role,"pid":pid,"base":base,"readOnly":true,
                "exeSha256":super::EXE_SHA256,"pdbSha256":super::PDB_SHA256,
                "pdb":meta["module"],"atomicSnapshot":false,"detailedCensus":details
            })
        );
        for sample in 0..760 {
            let mut code = 0;
            if GetExitCodeProcess(remote.handle, &mut code) == 0 || code != STILL_ACTIVE as u32 {
                break;
            }
            let read_started = Instant::now();
            let result = remote.snapshot(meta, role, sample % 10 == 0, details);
            println!(
                "{}",
                match result {
                    Ok(v) =>
                        json!({"sample":sample,"elapsedMs":begin.elapsed().as_millis(),"readMs":read_started.elapsed().as_secs_f64()*1000.0,"state":v}),
                    Err(e) =>
                        json!({"sample":sample,"elapsedMs":begin.elapsed().as_millis(),"error":e}),
                }
            );
            std::thread::sleep(Duration::from_millis(100));
        }
    }
}
