mod remote;
use sha2::{Digest, Sha256};
const EXE_SHA256: &str = "788fb4095664b9417f64f9d40a5668e6d0775823407e9d5a7b517587536766a0";
const PDB_SHA256: &str = "b3755a3d5a7864e0ba30be6dd457c3f361c62a2bc0a04c18860a713f1931c800";
fn verify(path: &std::path::Path, expected: &str) {
    let stat = std::fs::symlink_metadata(path).expect("owned regular file");
    assert!(
        stat.is_file() && !stat.file_type().is_symlink() && stat.len() < 64 * 1024 * 1024,
        "bounded regular file required"
    );
    let before = stat.modified().unwrap();
    let bytes = std::fs::read(path).unwrap();
    assert_eq!(
        Sha256::digest(&bytes)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>(),
        expected,
        "unsupported executable or symbols"
    );
    assert_eq!(
        std::fs::metadata(path).unwrap().modified().unwrap(),
        before,
        "file changed during validation"
    );
}
use serde_json::{json, Value};
use std::{
    ffi::{c_void, CString},
    mem::size_of,
    ptr,
};
use windows_sys::Win32::{
    Foundation::GetLastError,
    System::{Diagnostics::Debug::*, Threading::GetCurrentProcess},
};
#[link(name = "kernel32")]
extern "system" {
    fn LocalFree(p: *mut c_void) -> *mut c_void;
}
struct Symbols {
    h: windows_sys::Win32::Foundation::HANDLE,
    base: u64,
}
impl Drop for Symbols {
    fn drop(&mut self) {
        unsafe {
            SymCleanup(self.h);
        }
    }
}
impl Symbols {
    fn u32(&self, id: u32, kind: IMAGEHLP_SYMBOL_TYPE_INFO) -> Option<u32> {
        let mut n = 0;
        unsafe {
            (SymGetTypeInfo(self.h, self.base, id, kind, &mut n as *mut _ as *mut c_void) != 0)
                .then_some(n)
        }
    }
    fn name(&self, id: u32) -> Option<String> {
        let mut p: *mut u16 = ptr::null_mut();
        unsafe {
            if SymGetTypeInfo(
                self.h,
                self.base,
                id,
                TI_GET_SYMNAME,
                &mut p as *mut _ as *mut c_void,
            ) == 0
                || p.is_null()
            {
                return None;
            }
            let mut n = 0;
            while n < 512 && *p.add(n) != 0 {
                n += 1;
            }
            let s = String::from_utf16_lossy(std::slice::from_raw_parts(p, n));
            LocalFree(p as *mut c_void);
            Some(s)
        }
    }
    fn describe(&self, id: u32, depth: usize) -> Value {
        let mut size = 0u64;
        unsafe {
            SymGetTypeInfo(
                self.h,
                self.base,
                id,
                TI_GET_LENGTH,
                &mut size as *mut _ as *mut c_void,
            );
        }
        let tag = self.u32(id, TI_GET_SYMTAG);
        let target = self.u32(id, TI_GET_TYPEID);
        let mut out = json!({"typeId":id,"tag":tag,"name":self.name(id),"bytes":size,"offset":self.u32(id,TI_GET_OFFSET),"count":self.u32(id,TI_GET_COUNT)});
        if depth > 0 {
            if let Some(next) = target.filter(|next| *next != id && *next != 0) {
                out["type"] = self.describe(next, depth - 1);
            }
            if let Some(count) = self
                .u32(id, TI_GET_CHILDRENCOUNT)
                .filter(|n| *n > 0 && *n <= 256)
            {
                let mut data = vec![0u32; 2 + count as usize];
                data[0] = count;
                unsafe {
                    if SymGetTypeInfo(
                        self.h,
                        self.base,
                        id,
                        TI_FINDCHILDREN,
                        data.as_mut_ptr() as *mut c_void,
                    ) != 0
                    {
                        out["fields"] = Value::Array(
                            data[2..]
                                .iter()
                                .map(|child| self.describe(*child, depth - 1))
                                .collect(),
                        );
                    }
                }
            }
        }
        out
    }
    fn type_name(&self, name: &str) -> Value {
        let mut storage = vec![0u64; 512];
        let sym = storage.as_mut_ptr() as *mut SYMBOL_INFO;
        unsafe {
            (*sym).SizeOfStruct = size_of::<SYMBOL_INFO>() as u32;
            (*sym).MaxNameLen = 1023;
            let n = CString::new(name).unwrap();
            if SymGetTypeFromName(self.h, self.base, n.as_ptr() as *const u8, sym) == 0 {
                return json!({"name":name,"error":GetLastError()});
            }
            json!({"name":name,"index":(*sym).Index,"typeIndex":(*sym).TypeIndex,"tag":(*sym).Tag,"layout":self.describe(if (*sym).TypeIndex!=0{(*sym).TypeIndex}else{(*sym).Index},7)})
        }
    }
    fn resolve(&self, rva: u32) -> Value {
        let mut storage = vec![0u64; 512];
        let sym = storage.as_mut_ptr() as *mut SYMBOL_INFO;
        let mut displacement = 0;
        unsafe {
            (*sym).SizeOfStruct = size_of::<SYMBOL_INFO>() as u32;
            (*sym).MaxNameLen = 1023;
            if SymFromAddr(self.h, self.base + u64::from(rva), &mut displacement, sym) == 0 {
                return json!({"rva":rva,"error":GetLastError()});
            }
            assert!((*sym).NameLen <= 1023);
            let name = String::from_utf8_lossy(std::slice::from_raw_parts(
                (*sym).Name.as_ptr() as *const u8,
                (*sym).NameLen as usize,
            ));
            json!({"rva":rva,"symbol":name,"displacement":displacement})
        }
    }
    fn symbol(&self, name: &str) -> Value {
        let mut storage = vec![0u64; 512];
        let sym = storage.as_mut_ptr() as *mut SYMBOL_INFO;
        unsafe {
            (*sym).SizeOfStruct = size_of::<SYMBOL_INFO>() as u32;
            (*sym).MaxNameLen = 1023;
            let name_c = CString::new(name).unwrap();
            if SymFromName(self.h, name_c.as_ptr() as *const u8, sym) == 0 {
                return json!({"symbol":name,"error":GetLastError()});
            }
            json!({"symbol":name,"rva":(*sym).Address-self.base,"size":(*sym).Size,"layout":self.describe((*sym).TypeIndex,5)})
        }
    }
}
pub fn run() {
    let args: Vec<_> = std::env::args().collect();
    assert!(
        args.len() == 3 || args.len() == 5 || (args.len() == 6 && args[5] == "--details"),
        "<publisher exe> <local symbols directory> [<owned pid> <host|client> [--details] | --resolve-rvas <hex RVAs> | --resolve-symbols <names>]"
    );
    verify(std::path::Path::new(&args[1]), EXE_SHA256);
    verify(&std::path::Path::new(&args[2]).join("halo.pdb"), PDB_SHA256);
    let file = CString::new(args[1].as_str()).unwrap();
    let search = CString::new(args[2].as_str()).unwrap();
    unsafe {
        let h = GetCurrentProcess();
        SymSetOptions(SYMOPT_EXACT_SYMBOLS | SYMOPT_FAIL_CRITICAL_ERRORS | SYMOPT_NO_PROMPTS);
        assert_ne!(
            SymInitialize(h, search.as_ptr() as *const u8, 0),
            0,
            "SymInitialize {}",
            GetLastError()
        );
        let base = SymLoadModuleEx(
            h,
            ptr::null_mut(),
            file.as_ptr() as *const u8,
            b"opence\0".as_ptr(),
            0x10000000,
            0,
            ptr::null(),
            0,
        );
        assert_ne!(base, 0, "SymLoadModuleEx {}", GetLastError());
        let s = Symbols { h, base };
        let mut module: IMAGEHLP_MODULE64 = std::mem::zeroed();
        module.SizeOfStruct = size_of::<IMAGEHLP_MODULE64>() as u32;
        assert_ne!(SymGetModuleInfo64(h, base, &mut module), 0);
        assert_eq!(module.PdbUnmatched, 0, "Mismatched PDB");
        assert_eq!(module.SymType, SymPdb, "Missing private PDB type metadata");
        if args.len() == 5 && args[3] == "--resolve-symbols" {
            let names: Vec<_> = args[4].split(',').collect();
            assert!(
                !names.is_empty() && names.len() <= 16,
                "at most 16 symbol names"
            );
            assert!(
                names.iter().all(|name| !name.is_empty()
                    && name.len() <= 128
                    && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')),
                "bounded literal symbols only"
            );
            verify(std::path::Path::new(&args[1]), EXE_SHA256);
            verify(&std::path::Path::new(&args[2]).join("halo.pdb"), PDB_SHA256);
            println!(
                "{}",
                json!({"readOnly":true,"offline":true,"exeSha256":EXE_SHA256,
                "pdbSha256":PDB_SHA256,"resolved":names.into_iter().map(|name|s.symbol(name)).collect::<Vec<_>>()})
            );
            return;
        }
        if args.len() == 5 && args[3] == "--resolve-rvas" {
            let rvas: Vec<_> = args[4]
                .split(',')
                .map(|rva| {
                    assert!(
                        rva.len() <= 8 && !rva.is_empty(),
                        "bounded hexadecimal RVA required"
                    );
                    let rva = u32::from_str_radix(rva, 16).expect("hexadecimal RVA");
                    assert!(rva < module.ImageSize, "RVA outside verified module");
                    rva
                })
                .collect();
            assert!(!rvas.is_empty() && rvas.len() <= 32, "at most 32 RVAs");
            verify(std::path::Path::new(&args[1]), EXE_SHA256);
            verify(&std::path::Path::new(&args[2]).join("halo.pdb"), PDB_SHA256);
            println!(
                "{}",
                json!({"readOnly":true,"offline":true,"exeSha256":EXE_SHA256,"pdbSha256":PDB_SHA256,"resolved":rvas.into_iter().map(|rva|s.resolve(rva)).collect::<Vec<_>>()})
            );
            return;
        }
        let out = json!({"types":(["actor_datum","object_header_datum","object_datum","unit_datum","unit_control_data","weapon_datum","scenario","hs_global","hs_global_datum","unit_animation","object_animation_state","animation_state"].iter().map(|name|s.type_name(name)).collect::<Vec<_>>()),"module":{"base":base,"symType":module.SymType,"pdbAge":module.PdbAge,"pdbGuid":[module.PdbSig70.data1,module.PdbSig70.data2 as u32,module.PdbSig70.data3 as u32],"pdbGuidTail":module.PdbSig70.data4,"pdbUnmatched":module.PdbUnmatched},"symbols":(["actor_data","object_header_data","game_time_globals","host_actors","host_actor_count","client_actors","client_actor_count","ai_profile","global_scenario","hs_global_data","hs_external_globals"].iter().map(|name|s.symbol(name)).collect::<Vec<_>>())});
        if args.len() == 3 {
            println!("{}", serde_json::to_string_pretty(&out).unwrap());
        } else {
            remote::observe(
                &out,
                &args[1],
                args[3].parse().unwrap(),
                &args[4],
                args.len() == 6,
            );
            verify(std::path::Path::new(&args[1]), EXE_SHA256);
            verify(&std::path::Path::new(&args[2]).join("halo.pdb"), PDB_SHA256);
            println!("{}", json!({"completed":true,"inputsRechecked":true}));
        }
    }
}
