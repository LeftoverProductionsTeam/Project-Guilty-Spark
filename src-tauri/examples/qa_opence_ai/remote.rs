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
    fn snapshot(&self, meta: &Value, role: &str, census: bool) -> Result<Value, String> {
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
        let end = self.tick(meta)?;
        if end != tick {
            return Err("crossed tick while reading".into());
        }
        Ok(
            json!({"localTick":tick.0,"serverTick":tick.1,"actorPoolCount":actor_count,"networkActorCount":count,"actors":records,"objectTags":object_tags}),
        )
    }
}
pub fn observe(meta: &Value, expected: &str, pid: u32, role: &str) {
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
                "pdb":meta["module"],"atomicSnapshot":false
            })
        );
        for sample in 0..760 {
            let mut code = 0;
            if GetExitCodeProcess(remote.handle, &mut code) == 0 || code != STILL_ACTIVE as u32 {
                break;
            }
            let result = remote.snapshot(meta, role, sample % 10 == 0);
            println!(
                "{}",
                match result {
                    Ok(v) =>
                        json!({"sample":sample,"elapsedMs":begin.elapsed().as_millis(),"state":v}),
                    Err(e) =>
                        json!({"sample":sample,"elapsedMs":begin.elapsed().as_millis(),"error":e}),
                }
            );
            std::thread::sleep(Duration::from_millis(100));
        }
    }
}
