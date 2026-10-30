//! TLS 1.3 with an invitation-pinned self-signed certificate. No trust-store
//! mutation, insecure certificate verifier or application-defined encryption.
use crate::{invalid, Result, SparkError};
use rustls::{
    pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer, ServerName},
    ClientConfig, RootCertStore, ServerConfig,
};
use std::{net::TcpStream, sync::Arc};
fn fail(e: impl std::fmt::Display) -> SparkError {
    SparkError::Invalid(format!("SparkLink TLS: {e}"))
}
pub struct Identity {
    pub config: Arc<ServerConfig>,
    pub certificate: String,
}
pub fn identity() -> Result<Identity> {
    let rcgen::CertifiedKey { cert, signing_key } =
        rcgen::generate_simple_self_signed(vec!["sparklink.local".into()]).map_err(fail)?;
    let der = cert.der().clone();
    let certificate = der.iter().map(|b| format!("{b:02x}")).collect();
    let config =
        ServerConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
            .with_protocol_versions(&[&rustls::version::TLS13])
            .map_err(fail)?
            .with_no_client_auth()
            .with_single_cert(
                vec![der],
                PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(signing_key.serialize_der())),
            )
            .map_err(fail)?;
    Ok(Identity {
        config: Arc::new(config),
        certificate,
    })
}
pub fn client(certificate: &str) -> Result<Arc<ClientConfig>> {
    if certificate.is_empty()
        || certificate.len() > 4096
        || certificate.len() % 2 != 0
        || !certificate.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return invalid("Invalid SparkLink invitation certificate");
    }
    let der = certificate
        .as_bytes()
        .chunks_exact(2)
        .map(|b| u8::from_str_radix(std::str::from_utf8(b).unwrap(), 16).unwrap())
        .collect::<Vec<_>>();
    let mut roots = RootCertStore::empty();
    roots.add(CertificateDer::from(der)).map_err(fail)?;
    Ok(Arc::new(
        ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
            .with_protocol_versions(&[&rustls::version::TLS13])
            .map_err(fail)?
            .with_root_certificates(roots)
            .with_no_client_auth(),
    ))
}
pub fn connect(
    socket: TcpStream,
    config: Arc<ClientConfig>,
) -> Result<rustls::StreamOwned<rustls::ClientConnection, TcpStream>> {
    let connection = rustls::ClientConnection::new(
        config,
        ServerName::try_from("sparklink.local").map_err(fail)?,
    )
    .map_err(fail)?;
    Ok(rustls::StreamOwned::new(connection, socket))
}
pub fn accept(
    socket: TcpStream,
    config: Arc<ServerConfig>,
) -> Result<rustls::StreamOwned<rustls::ServerConnection, TcpStream>> {
    Ok(rustls::StreamOwned::new(
        rustls::ServerConnection::new(config).map_err(fail)?,
        socket,
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        time::Duration,
    };
    #[test]
    fn only_the_invited_certificate_can_exchange_private_frames() {
        let server_identity = identity().unwrap();
        let wrong = identity().unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let config = server_identity.config.clone();
        let server = std::thread::spawn(move || {
            for _ in 0..2 {
                let (socket, _) = listener.accept().unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(3)))
                    .unwrap();
                let mut tls = accept(socket, config.clone()).unwrap();
                let mut bytes = [0; 4];
                if tls.read_exact(&mut bytes).is_ok() {
                    assert_eq!(&bytes, b"edit");
                    tls.write_all(b"okay").unwrap();
                    tls.flush().unwrap();
                }
            }
        });
        let mut good = connect(
            TcpStream::connect(address).unwrap(),
            client(&server_identity.certificate).unwrap(),
        )
        .unwrap();
        good.write_all(b"edit").unwrap();
        good.flush().unwrap();
        let mut result = [0; 4];
        good.read_exact(&mut result).unwrap();
        assert_eq!(&result, b"okay");
        let mut bad = connect(
            TcpStream::connect(address).unwrap(),
            client(&wrong.certificate).unwrap(),
        )
        .unwrap();
        assert!(bad.write_all(b"edit").and_then(|_| bad.flush()).is_err());
        server.join().unwrap();
    }
}
