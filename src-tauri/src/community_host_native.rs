//! Real Delta Control reads and owned host configuration. No game wire translation.
use super::*;
use spark_core as core;
use spark_core::community_host as host;

#[derive(Default)]
pub(super) struct CommunityHostState {
    controls: HashMap<String, ControlSession>,
}
struct ControlSession {
    owner: String,
    target: host::ControlTarget,
    token: Arc<host::ControlToken>,
    last_attempt: Instant,
    poll_in_flight: bool,
}

struct ControlObservation {
    target: host::ControlTarget,
    token: Arc<host::ControlToken>,
}

impl CommunityHostState {
    fn begin_poll(&mut self, connection_id: &str, owner: &str) -> Reply<ControlObservation> {
        let session = self
            .controls
            .get_mut(connection_id)
            .ok_or("The control observation is no longer connected")?;
        if session.owner != owner {
            return Err("This observation belongs to another window".into());
        }
        if session.poll_in_flight {
            return Err("A status request for this observation is already running".into());
        }
        if session.last_attempt.elapsed() < Duration::from_secs(host::MIN_STATUS_POLL_SECONDS) {
            return Err("Wait two seconds before polling this server again".into());
        }
        session.last_attempt = Instant::now();
        session.poll_in_flight = true;
        Ok(ControlObservation {
            target: session.target.clone(),
            token: Arc::clone(&session.token),
        })
    }

    fn finish_poll(
        &mut self,
        connection_id: &str,
        owner: &str,
        observation: &ControlObservation,
    ) -> Reply<()> {
        let session = self.controls.get_mut(connection_id).ok_or(
            "The control observation was disconnected while its status request was running",
        )?;
        if session.owner != owner || !Arc::ptr_eq(&session.token, &observation.token) {
            return Err("This observation changed while its status request was running".into());
        }
        session.poll_in_flight = false;
        Ok(())
    }
}

fn poll_status(
    state: &Mutex<CommunityHostState>,
    connection_id: &str,
    owner: &str,
    window_open: impl FnOnce() -> bool,
) -> Reply<host::ServerStatus> {
    let observation = lock(state)?.begin_poll(connection_id, owner)?;
    // No shared mutex is held during the network request. Disconnect and
    // other observers stay responsive while a server stalls or loads.
    let outcome = request_json(
        &host::read_plan(&observation.target, host::ControlRead::Status),
        &observation.token,
    )
    .and_then(|bytes| host::parse_status(&bytes).map_err(error));
    let mut controls = lock(state)?;
    if !window_open() {
        controls
            .controls
            .retain(|_, session| session.owner != owner);
        return Err("The requesting window closed".into());
    }
    controls.finish_poll(connection_id, owner, &observation)?;
    drop(controls);
    outcome
}

fn build_plan(state: &AppState, request: &host::HostRequest) -> Reply<host::HostPlan> {
    let mut evidence = host::HostInstallationEvidence {
        platform: runtime::platform().into(),
        architecture: std::env::consts::ARCH.into(),
        ..Default::default()
    };
    if request.runtime_id.is_native() {
        if let Ok(registration) = runtime_registration(state, request.runtime_id) {
            let inventory = runtime::inventory_maps(&registration).map_err(error)?;
            evidence.data_root = Some(
                registration
                    .data_root
                    .clone()
                    .unwrap_or(registration.root.clone()),
            );
            for map in inventory.maps.iter().filter(|m| m.valid) {
                if let (Some(version), Some(kind), Some(hash)) =
                    (map.cache_version, map.scenario_type, &map.sha256)
                {
                    let name = Path::new(&map.relative_path)
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    evidence.maps.push(host::HostMapEvidence {
                        selector: name,
                        cache_version: version,
                        scenario_type: kind,
                        sha256: hash.clone(),
                        resources_ready: false,
                    });
                }
            }
        }
    }
    // A registered interactive client is not a separately inspected Linux
    // dedicated-server executable. Never turn client discovery into host proof.
    host::plan_host(request, &evidence).map_err(error)
}

#[tauri::command]
pub(super) async fn community_host_plan(
    app: tauri::AppHandle,
    request: host::HostRequest,
) -> Reply<host::HostPlan> {
    tauri::async_runtime::spawn_blocking(move || build_plan(&app.state::<AppState>(), &request))
        .await
        .map_err(error)?
}

#[tauri::command]
pub(super) async fn community_host_save(
    app: tauri::AppHandle,
    request: host::HostRequest,
) -> Reply<PathBuf> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let plan = build_plan(&state, &request)?;
        let configuration = plan
            .configuration
            .as_ref()
            .ok_or("This mode has no implemented native host configuration to save")?;
        let root = state
            .root
            .join("host-plans")
            .join(uuid::Uuid::new_v4().to_string());
        core::reject_links(&root).map_err(error)?;
        fs::create_dir_all(&root).map_err(error)?;
        project::atomic_write(
            &root.join("host-plan.json"),
            &serde_json::to_vec_pretty(&plan).map_err(error)?,
            false,
        )
        .map_err(error)?;
        let playlist =
            root.join(core::safe_relative(&configuration.playlist_relative_path).map_err(error)?);
        if let Some(parent) = playlist.parent() {
            fs::create_dir_all(parent).map_err(error)?;
        }
        project::atomic_write(&playlist, configuration.playlist_text.as_bytes(), false)
            .map_err(error)?;
        Ok(root)
    })
    .await
    .map_err(error)?
}

fn authorization_header(token: &host::ControlToken) -> Reply<reqwest::header::HeaderValue> {
    let mut authorization = token
        .with_authorization(reqwest::header::HeaderValue::from_str)
        .map_err(|_| {
            "The control credential is not a valid HTTP authorization field".to_string()
        })?;
    authorization.set_sensitive(true);
    Ok(authorization)
}

fn request_json(plan: &host::ControlRequestPlan, token: &host::ControlToken) -> Reply<Vec<u8>> {
    if plan.follow_redirects
        || plan.use_proxy
        || !(1..=host::CONTROL_TIMEOUT_SECONDS).contains(&plan.timeout_seconds)
        || plan.maximum_response_bytes == 0
        || plan.maximum_response_bytes > host::MAX_CONTROL_BYTES
    {
        return Err("Unsupported control transport plan".into());
    }
    let client = reqwest::blocking::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(plan.timeout_seconds))
        .build()
        .map_err(error)?;
    let mut request = match plan.method {
        host::HttpMethod::Get => client.get(&plan.url),
        host::HttpMethod::Post => client.post(&plan.url),
    };
    request = request
        .header(reqwest::header::AUTHORIZATION, authorization_header(token)?)
        .header(reqwest::header::ACCEPT, "application/json");
    if let Some(body) = &plan.body {
        request = request
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(body.clone());
    }
    let response=request.send().map_err(|_|"Could not reach the authenticated loopback control service. Check its address and token; no game action was performed.".to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Control service returned HTTP {}. Response body omitted to protect credentials.",
            response.status().as_u16()
        ));
    }
    if !response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| {
            value
                .split(';')
                .next()
                .unwrap_or("")
                .trim()
                .eq_ignore_ascii_case("application/json")
        })
    {
        return Err("Control service did not return the documented JSON response type".into());
    }
    if response
        .content_length()
        .is_some_and(|size| size > plan.maximum_response_bytes as u64)
    {
        return Err("Control response exceeded its size limit".into());
    }
    let mut bytes = vec![];
    response
        .take(plan.maximum_response_bytes as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(error)?;
    if bytes.len() > plan.maximum_response_bytes {
        return Err("Control response exceeded its streaming size limit".into());
    }
    Ok(bytes)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ControlView {
    connection_id: String,
    status: host::ServerStatus,
    detail: String,
    commands_enabled: bool,
}

#[tauri::command]
pub(super) async fn community_control_connect(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    address: String,
    token: String,
) -> Reply<ControlView> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let target = host::ControlTarget::new(runtime::RuntimeId::ChupathingyCe, &address).map_err(error)?;
        let token = host::ControlToken::new(&token).map_err(error)?;
        let status = host::parse_status(&request_json(&host::read_plan(&target, host::ControlRead::Status), &token)?).map_err(error)?;
        let state = app.state::<AppState>();
        let mut controls = lock(&state.community_hosts)?;
        // Synchronize insertion with release_window. An HTTP response received
        // after window destruction must not leave a stored credential behind.
        if app.get_webview_window(&owner).is_none() { return Err("The requesting window closed".into()); }
        if controls.controls.len() >= 16 { return Err("Disconnect an old control observation first".into()); }
        let connection_id = uuid::Uuid::new_v4().to_string();
        controls.controls.insert(connection_id.clone(), ControlSession {
            owner, target, token: Arc::new(token), last_attempt: Instant::now(), poll_in_flight: false,
        });
        Ok(ControlView {
            connection_id, status, commands_enabled: false,
            detail: "Authenticated actual server status received. Capacity is configured, not a performance result. This observer has no adapter-owned private host process/configuration proof, so mutating commands remain unavailable.".into(),
        })
    }).await.map_err(error)?
}

#[tauri::command]
pub(super) async fn community_control_poll(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    connection_id: String,
) -> Reply<ControlView> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let status = poll_status(&state.community_hosts, &connection_id, &owner,
            || app.get_webview_window(&owner).is_some())?;
        Ok(ControlView {
            connection_id, status, commands_enabled: false,
            detail: "Current authenticated server status; observed player count is not a two-client or 128-player acceptance test.".into(),
        })
    }).await.map_err(error)?
}

#[tauri::command]
pub(super) async fn community_control_disconnect(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    connection_id: String,
) -> Reply<()> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut controls = lock(&state.community_hosts)?;
        if controls
            .controls
            .get(&connection_id)
            .is_some_and(|s| s.owner != owner)
        {
            return Err("This observation belongs to another window".into());
        }
        controls.controls.remove(&connection_id);
        Ok(())
    })
    .await
    .map_err(error)?
}
pub(super) fn release_window(state: &AppState, label: &str) {
    if let Ok(mut controls) = state.community_hosts.lock() {
        controls.controls.retain(|_, c| c.owner != label);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{io::Write, net::TcpListener, sync::mpsc, thread};

    // Deliberately synthetic. No real service credential or invite is read.
    const TOKEN: &str = "synthetic_spark_control_test_value";
    const STATUS: &[u8] = br#"{"name":"Loopback test","version":"fixture","network_version":33,"state":"in_game","map":"bloodgulch","game_type":"slayer","playlist":"playlists/test.txt","players":2,"maximum_players":128,"minimum_players":1,"public":false,"uptime_seconds":4}"#;

    fn read_request(stream: &mut std::net::TcpStream) -> String {
        // Winsock may inherit the listener's nonblocking mode on accept.
        stream.set_nonblocking(false).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let mut request = Vec::new();
        while request.len() < 16384 && !request.windows(4).any(|part| part == b"\r\n\r\n") {
            let mut bytes = [0; 1024];
            let count = stream.read(&mut bytes).unwrap();
            if count == 0 {
                break;
            }
            request.extend_from_slice(&bytes[..count]);
        }
        String::from_utf8(request).unwrap()
    }
    fn target(listener: &TcpListener) -> host::ControlTarget {
        host::ControlTarget::new(
            runtime::RuntimeId::ChupathingyCe,
            &listener.local_addr().unwrap().to_string(),
        )
        .unwrap()
    }
    fn response(status: &str, headers: &str, body: &[u8]) -> Vec<u8> {
        let mut bytes =
            format!("HTTP/1.1 {status}\r\nConnection: close\r\n{headers}\r\n").into_bytes();
        bytes.extend_from_slice(body);
        bytes
    }
    fn json_response(status: &str, body: &[u8]) -> Vec<u8> {
        response(
            status,
            &format!(
                "Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\n",
                body.len()
            ),
            body,
        )
    }
    fn serve_once(response: Vec<u8>) -> (host::ControlTarget, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let target = target(&listener);
        listener.set_nonblocking(true).unwrap();
        let server = thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(5);
            let mut stream = loop {
                match listener.accept() {
                    Ok((stream, _)) => break stream,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        assert!(
                            Instant::now() < deadline,
                            "bounded loopback server received no request"
                        );
                        thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) => panic!("loopback accept failed: {error}"),
                }
            };
            let request = read_request(&mut stream);
            let _ = stream.write_all(&response);
            request
        });
        (target, server)
    }
    fn token() -> host::ControlToken {
        host::ControlToken::new(TOKEN).unwrap()
    }
    fn session(target: host::ControlTarget) -> ControlSession {
        ControlSession {
            owner: "main".into(),
            target,
            token: Arc::new(token()),
            last_attempt: Instant::now() - Duration::from_secs(3),
            poll_in_flight: false,
        }
    }

    #[test]
    fn real_http_wrapper_sends_one_authenticated_get_and_parses_the_actual_status_schema() {
        let (target, server) = serve_once(json_response("200 OK", STATUS));
        let bytes = request_json(
            &host::read_plan(&target, host::ControlRead::Status),
            &token(),
        )
        .unwrap();
        let status = host::parse_status(&bytes).unwrap();
        assert_eq!(status.players, 2);
        assert_eq!(status.maximum_players, 128);
        let request = server.join().unwrap();
        assert!(request.starts_with("GET /v1/status HTTP/1.1\r\n"));
        assert!(request
            .to_ascii_lowercase()
            .contains(&format!("authorization: bearer {TOKEN}")));
        assert!(request
            .to_ascii_lowercase()
            .contains("accept: application/json"));
        assert!(!request.contains("/v1/command"));
    }

    #[test]
    fn non_success_bodies_and_private_details_never_become_error_text() {
        let body = format!("{{\"error\":\"{TOKEN}: private diagnostic\"}}");
        let (target, server) = serve_once(json_response("401 Unauthorized", body.as_bytes()));
        let error = request_json(
            &host::read_plan(&target, host::ControlRead::Status),
            &token(),
        )
        .unwrap_err();
        assert!(error.contains("401"));
        assert!(!error.contains(TOKEN));
        assert!(!error.contains("private diagnostic"));
        server.join().unwrap();
    }

    #[test]
    fn redirects_are_not_followed_and_cannot_forward_a_bearer_to_another_service() {
        let trap = TcpListener::bind("127.0.0.1:0").unwrap();
        trap.set_nonblocking(true).unwrap();
        let (target, server) = serve_once(response(
            "302 Found",
            &format!(
                "Location: http://{}/v1/status\r\nContent-Length: 0\r\n",
                trap.local_addr().unwrap()
            ),
            b"",
        ));
        let error = request_json(
            &host::read_plan(&target, host::ControlRead::Status),
            &token(),
        )
        .unwrap_err();
        assert!(error.contains("302"));
        server.join().unwrap();
        assert!(matches!(trap.accept(),Err(error) if error.kind()==std::io::ErrorKind::WouldBlock));
    }

    #[test]
    fn declared_and_streamed_response_caps_are_both_enforced() {
        for declared in [false, true] {
            let headers = if declared {
                "Content-Type: application/json\r\nContent-Length: 512\r\n"
            } else {
                "Content-Type: application/json\r\n"
            };
            let (target, server) = serve_once(response("200 OK", headers, &vec![b' '; 512]));
            let mut plan = host::read_plan(&target, host::ControlRead::Status);
            plan.maximum_response_bytes = 128;
            let error = request_json(&plan, &token()).unwrap_err();
            assert!(error.contains(if declared {
                "size limit"
            } else {
                "streaming size limit"
            }));
            server.join().unwrap();
        }
    }

    #[test]
    fn wrong_media_type_or_malformed_json_cannot_be_an_authenticated_status() {
        let (target, server) = serve_once(response(
            "200 OK",
            &format!(
                "Content-Type: text/html\r\nContent-Length: {}\r\n",
                STATUS.len()
            ),
            STATUS,
        ));
        assert!(request_json(
            &host::read_plan(&target, host::ControlRead::Status),
            &token()
        )
        .unwrap_err()
        .contains("JSON response type"));
        server.join().unwrap();
        let (target, server) = serve_once(json_response("200 OK", b"not valid json"));
        let bytes = request_json(
            &host::read_plan(&target, host::ControlRead::Status),
            &token(),
        )
        .unwrap();
        assert!(host::parse_status(&bytes).is_err());
        server.join().unwrap();
    }

    #[test]
    fn a_stalled_server_does_not_hold_the_mutex_and_cannot_resurrect_a_disconnected_session() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let state = Arc::new(Mutex::new(CommunityHostState::default()));
        state
            .lock()
            .unwrap()
            .controls
            .insert("session".into(), session(target(&listener)));
        let (arrived_tx, arrived_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            read_request(&mut stream);
            arrived_tx.send(()).unwrap();
            release_rx.recv_timeout(Duration::from_secs(3)).unwrap();
            let _ = stream.write_all(&json_response("200 OK", STATUS));
        });
        let worker_state = Arc::clone(&state);
        let worker = thread::spawn(move || poll_status(&worker_state, "session", "main", || true));
        arrived_rx.recv_timeout(Duration::from_secs(3)).unwrap();
        {
            let mut state = state
                .try_lock()
                .expect("HTTP must not hold the shared mutex");
            assert!(
                state.begin_poll("session", "main").is_err(),
                "one request per observation"
            );
            state.controls.remove("session");
        }
        release_tx.send(()).unwrap();
        server.join().unwrap();
        assert!(worker.join().unwrap().unwrap_err().contains("disconnected"));
        assert!(state.lock().unwrap().controls.is_empty());
    }

    #[test]
    fn owner_identity_throttling_and_replaced_session_checks_are_independent() {
        let target =
            host::ControlTarget::new(runtime::RuntimeId::ChupathingyCe, "127.0.0.1:32123").unwrap();
        let mut state = CommunityHostState::default();
        state.controls.insert("a".into(), session(target.clone()));
        assert!(state.begin_poll("a", "other-window").is_err());
        assert!(!state.controls["a"].poll_in_flight);
        let observation = state.begin_poll("a", "main").unwrap();
        assert!(state.begin_poll("a", "main").is_err());
        state.finish_poll("a", "main", &observation).unwrap();
        assert!(state
            .begin_poll("a", "main")
            .err()
            .unwrap()
            .contains("two seconds"));
        state.controls.insert("a".into(), session(target));
        assert!(state.finish_poll("a", "main", &observation).is_err());
        assert!(!state.controls["a"].poll_in_flight);
    }

    #[test]
    fn invalid_transport_limits_fail_before_any_http_request() {
        let target =
            host::ControlTarget::new(runtime::RuntimeId::ChupathingyCe, "127.0.0.1:32123").unwrap();
        for condition in 0..5 {
            let mut plan = host::read_plan(&target, host::ControlRead::Status);
            match condition {
                0 => plan.follow_redirects = true,
                1 => plan.use_proxy = true,
                2 => plan.maximum_response_bytes = 0,
                3 => plan.maximum_response_bytes = host::MAX_CONTROL_BYTES + 1,
                _ => plan.timeout_seconds = host::CONTROL_TIMEOUT_SECONDS + 1,
            }
            assert_eq!(
                request_json(&plan, &token()).unwrap_err(),
                "Unsupported control transport plan"
            );
        }
    }

    #[test]
    fn credential_headers_are_sensitive_and_cannot_leak_through_debug_formatting() {
        let header = authorization_header(&token()).unwrap();
        assert!(header.is_sensitive());
        assert!(!format!("{header:?}").contains(TOKEN));
        assert_eq!(header.to_str().unwrap(), format!("Bearer {TOKEN}"));
    }

    #[test]
    fn closed_window_or_failed_parse_cannot_leave_an_inflight_poll_or_delete_another_owner() {
        for closed in [false, true] {
            let (target, server) = serve_once(json_response(
                "200 OK",
                if closed { STATUS } else { b"not JSON" },
            ));
            let mut state = CommunityHostState::default();
            state.controls.insert("a".into(), session(target.clone()));
            let mut other = session(target);
            other.owner = "other".into();
            state.controls.insert("other".into(), other);
            let state = Mutex::new(state);
            assert!(poll_status(&state, "a", "main", || !closed).is_err());
            server.join().unwrap();
            let state = state.lock().unwrap();
            assert!(state.controls.contains_key("other"));
            if closed {
                assert!(!state.controls.contains_key("a"));
            } else {
                assert!(!state.controls["a"].poll_in_flight);
            }
        }
    }
}
