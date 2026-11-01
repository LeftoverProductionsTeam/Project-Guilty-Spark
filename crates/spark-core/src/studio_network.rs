//! Explicit session address scopes. Radmin's 26/8 addresses are NOT classified
//! as private Internet addresses; their use requires a selected local VPN adapter
//! at the desktop boundary and a pinned, encrypted invitation.
use crate::{invalid, Result};
use serde::{Deserialize, Serialize};
use std::net::{Ipv4Addr, SocketAddr};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NetworkScope {
    #[default]
    Private,
    RadminVpn,
}
impl NetworkScope {
    pub fn is_private(&self) -> bool {
        *self == Self::Private
    }
    pub fn allows(self, ip: Ipv4Addr) -> bool {
        match self {
            Self::Private => crate::studio_session::private_ipv4(ip),
            Self::RadminVpn => {
                ip.octets()[0] == 26
                    && ip.octets()[1..] != [0, 0, 0]
                    && ip.octets()[1..] != [255, 255, 255]
            }
        }
    }
    pub fn endpoint(self, endpoint: &str) -> Result<SocketAddr> {
        let address: SocketAddr = endpoint.trim().parse().map_err(|_| {
            crate::SparkError::Invalid("Enter an IPv4 session address and port".into())
        })?;
        if address.port() == 0 || !matches!(address,SocketAddr::V4(v) if self.allows(*v.ip())) {
            return invalid("The endpoint does not match the invitation's selected LAN/VPN scope");
        }
        Ok(address)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn radmin_is_explicit_and_never_changes_the_private_address_policy() {
        assert!(!crate::studio_session::private_ipv4(
            "26.10.20.30".parse().unwrap()
        ));
        assert!(NetworkScope::Private.endpoint("26.10.20.30:1234").is_err());
        assert!(NetworkScope::RadminVpn.endpoint("26.10.20.30:1234").is_ok());
        for value in [
            "8.8.8.8:1234",
            "192.168.1.2:1234",
            "0.0.0.0:1234",
            "26.0.0.0:1234",
            "26.255.255.255:1234",
            "26.1.2.3:0",
        ] {
            assert!(NetworkScope::RadminVpn.endpoint(value).is_err(), "{value}");
        }
    }
}
