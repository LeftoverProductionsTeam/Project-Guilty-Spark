//! Local interface discovery only. No DNS, scans, network changes or firewall
//! rules. A 26/8 endpoint is admitted only with this PC's real active Radmin NIC.
use serde::Serialize;
use spark_core::studio_network::NetworkScope;
use std::net::Ipv4Addr;
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Interface {
    pub label: String,
    pub address: String,
    pub prefix_length: u8,
    pub network_scope: NetworkScope,
}
pub fn interfaces() -> Result<Vec<Interface>, String> {
    let mut result = vec![Interface {
        label: "Only this computer".into(),
        address: "127.0.0.1".into(),
        prefix_length: 8,
        network_scope: NetworkScope::Private,
    }];
    #[cfg(windows)]
    windows::append(&mut result)?;
    result.sort_by(|a, b| a.address.cmp(&b.address));
    result.dedup_by(|a, b| a.address == b.address);
    Ok(result)
}
pub fn bind_scope(ip: Ipv4Addr) -> Result<NetworkScope, String> {
    if spark_core::studio_session::private_ipv4(ip) {
        return Ok(NetworkScope::Private);
    }
    interfaces()?.into_iter().find(|i|i.address==ip.to_string()&&i.network_scope==NetworkScope::RadminVpn)
        .map(|i|i.network_scope).ok_or_else(||"Select the active Radmin VPN adapter for a 26.x address. Public/wildcard bindings are not supported.".into())
}
pub fn require_client_scope(scope: NetworkScope) -> Result<(), String> {
    if scope == NetworkScope::RadminVpn && !interfaces()?.iter().any(|i| i.network_scope == scope) {
        return Err("This invitation uses Radmin VPN. Open Radmin VPN and join the host's network, then retry. Spark does not install a driver or change network/firewall settings.".into());
    }
    Ok(())
}
#[cfg(windows)]
mod windows {
    use super::*;
    use std::{
        mem::{align_of, size_of},
        ptr,
    };
    use windows_sys::Win32::{
        Foundation::{ERROR_BUFFER_OVERFLOW, ERROR_NO_DATA, NO_ERROR},
        NetworkManagement::{
            IpHelper::{
                GetAdaptersAddresses, GAA_FLAG_SKIP_ANYCAST, GAA_FLAG_SKIP_DNS_SERVER,
                GAA_FLAG_SKIP_MULTICAST, IP_ADAPTER_ADDRESSES_LH, IP_ADAPTER_UNICAST_ADDRESS_LH,
            },
            Ndis::IfOperStatusUp,
        },
        Networking::WinSock::{IpDadStatePreferred, AF_INET, SOCKADDR_IN},
    };
    struct Buffer {
        words: Vec<u64>,
    }
    impl Buffer {
        fn contains<T>(&self, p: *const T) -> bool {
            let start = self.words.as_ptr() as usize;
            let end = start + self.words.len() * 8;
            let at = p as usize;
            at >= start
                && at % align_of::<T>() == 0
                && at.checked_add(size_of::<T>()).is_some_and(|n| n <= end)
        }
        unsafe fn string(&self, mut p: *const u16) -> Result<String, String> {
            if p.is_null() {
                return Ok(String::new());
            }
            let mut text = Vec::new();
            for _ in 0..512 {
                if !self.contains(p) {
                    return Err("Adapter text escaped its native buffer".into());
                }
                let ch = *p;
                if ch == 0 {
                    return Ok(String::from_utf16_lossy(&text)
                        .chars()
                        .filter(|c| !c.is_control())
                        .collect());
                }
                text.push(ch);
                p = p.add(1);
            }
            Err("Adapter name exceeds the supported bound".into())
        }
    }
    pub fn append(result: &mut Vec<Interface>) -> Result<(), String> {
        let mut size = 16 * 1024u32;
        for _ in 0..3 {
            if size > 1024 * 1024 {
                return Err("Local adapter inventory exceeds its supported bound".into());
            }
            let mut buffer = Buffer {
                words: vec![0; (size as usize).div_ceil(8)],
            };
            let root = buffer.words.as_mut_ptr().cast::<IP_ADAPTER_ADDRESSES_LH>();
            let status = unsafe {
                GetAdaptersAddresses(
                    AF_INET as u32,
                    GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER,
                    ptr::null(),
                    root,
                    &mut size,
                )
            };
            if status == ERROR_BUFFER_OVERFLOW {
                continue;
            }
            if status == ERROR_NO_DATA {
                return Ok(());
            }
            if status != NO_ERROR {
                return Err(format!(
                    "Windows could not list local network adapters ({status})"
                ));
            }
            let mut adapter = root;
            let mut adapters = 0;
            while !adapter.is_null() {
                if adapters >= 128 || !buffer.contains(adapter) {
                    return Err("Invalid bounded adapter inventory".into());
                }
                adapters += 1;
                let a = unsafe { &*adapter };
                if a.OperStatus == IfOperStatusUp {
                    let description = unsafe { buffer.string(a.Description) }?;
                    let label = unsafe { buffer.string(a.FriendlyName) }?;
                    let radmin =
                        description.eq_ignore_ascii_case("Famatech Radmin VPN Ethernet Adapter");
                    let mut unicast = a.FirstUnicastAddress;
                    let mut count = 0;
                    while !unicast.is_null() {
                        if count >= 128
                            || !buffer.contains::<IP_ADAPTER_UNICAST_ADDRESS_LH>(unicast)
                        {
                            return Err("Invalid bounded interface addresses".into());
                        }
                        count += 1;
                        let u = unsafe { &*unicast };
                        let socket = u.Address.lpSockaddr.cast::<SOCKADDR_IN>();
                        if u.DadState == IpDadStatePreferred
                            && u.Address.iSockaddrLength >= size_of::<SOCKADDR_IN>() as i32
                            && buffer.contains(socket)
                        {
                            let address = unsafe { &*socket };
                            if address.sin_family == AF_INET {
                                let octets = unsafe { address.sin_addr.S_un.S_un_b };
                                let ip = Ipv4Addr::new(
                                    octets.s_b1,
                                    octets.s_b2,
                                    octets.s_b3,
                                    octets.s_b4,
                                );
                                let scope = if radmin
                                    && u.OnLinkPrefixLength == 8
                                    && NetworkScope::RadminVpn.allows(ip)
                                {
                                    Some(NetworkScope::RadminVpn)
                                } else if NetworkScope::Private.allows(ip) && !ip.is_loopback() {
                                    Some(NetworkScope::Private)
                                } else {
                                    None
                                };
                                if let Some(network_scope) = scope {
                                    result.push(Interface {
                                        label: if radmin {
                                            "Radmin VPN".into()
                                        } else {
                                            label.clone()
                                        },
                                        address: ip.to_string(),
                                        prefix_length: u.OnLinkPrefixLength,
                                        network_scope,
                                    });
                                }
                            }
                        }
                        unicast = u.Next;
                    }
                }
                adapter = a.Next;
            }
            return Ok(());
        }
        Err("Network adapters changed during discovery; refresh and retry".into())
    }
}
