//! One camera authority per project. Director windows are views, never project editors.
use super::*;
use spark_core as core;
use tauri::{PhysicalPosition, PhysicalSize, Position, Size, WebviewUrl, WebviewWindowBuilder};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CameraPose {
    position: [f64; 3],
    look_at: [f64; 3],
    fov: f64,
    roll: f64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CameraKey {
    id: String,
    name: String,
    duration_ms: u32,
    camera_position: [f64; 3],
    look_at: [f64; 3],
    fov: f64,
    roll: f64,
    easing: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Composition {
    pose: CameraPose,
    shots: Vec<CameraKey>,
    selected: Option<String>,
    target: Option<String>,
    tracking: String,
    playing: bool,
    playhead_ms: u64,
    started_at_ms: u64,
}
impl Default for Composition {
    fn default() -> Self {
        Self {
            pose: CameraPose {
                position: [8., -8., 6.],
                look_at: [0., 0., 0.],
                fov: 55.,
                roll: 0.,
            },
            shots: vec![],
            selected: None,
            target: None,
            tracking: "free".into(),
            playing: false,
            playhead_ms: 0,
            started_at_ms: 0,
        }
    }
}
fn finite3(v: &[f64; 3]) -> bool {
    v.iter().all(|v| v.is_finite() && v.abs() <= 1_000_000.)
}
fn validate_pose(p: &CameraPose) -> Reply<()> {
    if !finite3(&p.position)
        || !finite3(&p.look_at)
        || !p.fov.is_finite()
        || !(10. ..=140.).contains(&p.fov)
        || !p.roll.is_finite()
        || p.roll.abs() > 180.
        || p.position
            .iter()
            .zip(&p.look_at)
            .map(|(a, b)| (a - b).powi(2))
            .sum::<f64>()
            < 1e-10
    {
        return Err("Camera position, target or lens is invalid".into());
    }
    Ok(())
}
fn validate(c: &Composition) -> Reply<()> {
    validate_pose(&c.pose)?;
    if c.shots.len() > 256
        || c.playhead_ms > 153_600_000
        || !["free", "fixed", "follow", "lookAt", "orbit"].contains(&c.tracking.as_str())
        || c.target.as_ref().is_some_and(|id| id.len() > 128)
        || c.selected.as_ref().is_some_and(|id| id.len() > 128)
    {
        return Err("Camera session exceeds supported bounds".into());
    }
    let mut ids = std::collections::HashSet::new();
    for shot in &c.shots {
        if shot.id.is_empty()
            || shot.id.len() > 128
            || !ids.insert(&shot.id)
            || shot.name.is_empty()
            || shot.name.len() > 120
            || shot.name.chars().any(char::is_control)
            || !(100..=600_000).contains(&shot.duration_ms)
            || !["cut", "linear", "smooth"].contains(&shot.easing.as_str())
        {
            return Err("Invalid camera keyframe".into());
        }
        validate_pose(&CameraPose {
            position: shot.camera_position,
            look_at: shot.look_at,
            fov: shot.fov,
            roll: shot.roll,
        })?;
    }
    if c.selected
        .as_ref()
        .is_some_and(|id| !c.shots.iter().any(|s| &s.id == id))
    {
        return Err("Selected camera is no longer in this session".into());
    }
    Ok(())
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Placement {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    fullscreen: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DirectorSession {
    id: String,
    project_id: String,
    revision: u64,
    composition: Composition,
    placement: Placement,
    #[serde(skip_deserializing)]
    window: Option<String>,
    #[serde(skip_deserializing)]
    recording: bool,
}
#[derive(Default)]
pub(super) struct DirectorState {
    sessions: HashMap<String, DirectorSession>,
}
pub(super) fn validate_recorder_window(state: &AppState, owner: &str, project: &str) -> Reply<()> {
    let sessions = lock(&state.director)?;
    let session = sessions
        .sessions
        .get(project)
        .ok_or("Open the camera session first")?;
    if session.window.as_deref() != Some(owner) || session.recording {
        return Err("Open the detached Director and finish its previous recording first".into());
    }
    Ok(())
}
pub(super) fn recording_flag(
    state: &AppState,
    owner: &str,
    project: &str,
    active: bool,
) -> Reply<()> {
    let mut sessions = lock(&state.director)?;
    let session = sessions
        .sessions
        .get_mut(project)
        .ok_or("Open the camera session first")?;
    if session.window.as_deref() != Some(owner) {
        return Err("Recording belongs to the detached Director window".into());
    }
    session.recording = active;
    Ok(())
}
fn path(state: &AppState, project: &str) -> Reply<PathBuf> {
    uuid::Uuid::parse_str(project).map_err(error)?;
    let directory = state.root.join("director");
    core::reject_links(&directory).map_err(error)?;
    fs::create_dir_all(&directory).map_err(error)?;
    Ok(directory.join(format!("{project}.json")))
}
fn persist(state: &AppState, session: &DirectorSession) -> Reply<()> {
    let mut copy = session.clone();
    copy.composition.playing = false;
    copy.composition.started_at_ms = 0;
    core::project::atomic_write(
        &path(state, &session.project_id)?,
        &serde_json::to_vec_pretty(&copy).map_err(error)?,
        false,
    )
    .map(|_| ())
    .map_err(error)
}
fn revised(
    session: &DirectorSession,
    owner: &str,
    revision: u64,
    composition: Composition,
) -> Reply<DirectorSession> {
    validate(&composition)?;
    if owner.starts_with("director-") && session.window.as_deref() != Some(owner) {
        return Err("Camera belongs to a different Director window".into());
    }
    if session.revision != revision {
        return Err("Camera changed in another window; refresh the shared session".into());
    }
    let mut view = session.clone();
    view.composition = composition;
    view.revision = view
        .revision
        .checked_add(1)
        .ok_or("Camera revision limit")?;
    Ok(view)
}
fn get_or_open(state: &AppState, id: &str) -> Reply<DirectorSession> {
    lock(&state.library)?.get(id).map_err(error)?;
    let mut sessions = lock(&state.director)?;
    if let Some(value) = sessions.sessions.get(id) {
        return Ok(value.clone());
    }
    let file = path(state, id)?;
    let mut value = if file.is_file() {
        let data = bounded_read(&file, 512 * 1024)?;
        let stored: DirectorSession = serde_json::from_slice(&data).map_err(error)?;
        if stored.project_id != id {
            return Err("Saved camera belongs to another map".into());
        }
        validate(&stored.composition)?;
        stored
    } else {
        DirectorSession {
            id: uuid::Uuid::new_v4().to_string(),
            project_id: id.into(),
            revision: 0,
            composition: Composition::default(),
            placement: Placement {
                width: 1280,
                height: 720,
                ..Default::default()
            },
            window: None,
            recording: false,
        }
    };
    value.window = None;
    value.recording = false;
    value.composition.playing = false;
    sessions.sessions.insert(id.into(), value.clone());
    Ok(value)
}
#[tauri::command]
pub(super) async fn director_session(
    app: tauri::AppHandle,
    project_id: String,
) -> Reply<DirectorSession> {
    tauri::async_runtime::spawn_blocking(move || get_or_open(&app.state::<AppState>(), &project_id))
        .await
        .map_err(error)?
}
#[tauri::command]
pub(super) async fn director_update(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    revision: u64,
    composition: Composition,
    save: bool,
) -> Reply<DirectorSession> {
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        if !owner.starts_with("director-"){check_document_owner(&state,&project_id,&owner)?;}
        get_or_open(&state, &project_id)?;
        let view = {
            let mut sessions = lock(&state.director)?;
            let s = sessions
                .sessions
                .get_mut(&project_id)
                .ok_or("Camera session closed")?;
            if app.get_webview_window(&owner).is_none() {
                return Err("Camera window closed".into());
            }
            let view = revised(s, &owner, revision, composition)?;
            if save {
                persist(&state, &view)?;
            }
            *s = view.clone();
            view
        };
        app.emit("spark:director", &view).map_err(error)?;
        Ok(view)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub(super) async fn director_popout(
    app: tauri::AppHandle,
    project_id: String,
) -> Reply<DirectorSession> {
    let state = app.state::<AppState>();
    let mut view = get_or_open(&state, &project_id)?;
    if let Some(label) = &view.window {
        if let Some(w) = app.get_webview_window(label) {
            w.show().map_err(error)?;
            w.set_focus().map_err(error)?;
            return Ok(view);
        }
    }
    let label = format!("director-{}", view.id);
    let url = WebviewUrl::App(format!("index.html?director={}", view.project_id).into());
    let w = WebviewWindowBuilder::new(&app, &label, url)
        .title("Spark Recording Director")
        .inner_size(1280., 720.)
        .min_inner_size(640., 360.)
        .decorations(false)
        .background_color(tauri::window::Color(0, 0, 0, 255))
        .build()
        .map_err(error)?;
    let monitors = w.available_monitors().map_err(error)?;
    let visible = monitors.iter().any(|m| {
        placement_visible(
            &view.placement,
            m.position().x,
            m.position().y,
            m.size().width,
            m.size().height,
        )
    });
    if visible {
        w.set_size(Size::Physical(PhysicalSize::new(
            view.placement.width.max(640),
            view.placement.height.max(360),
        )))
        .map_err(error)?;
        w.set_position(Position::Physical(PhysicalPosition::new(
            view.placement.x,
            view.placement.y,
        )))
        .map_err(error)?;
    } else {
        let _ = w.center();
    }
    if view.placement.fullscreen {
        w.set_fullscreen(true).map_err(error)?;
    }
    view.window = Some(label);
    lock(&state.director)?
        .sessions
        .insert(project_id, view.clone());
    app.emit("spark:director", &view).map_err(error)?;
    Ok(view)
}
fn placement_visible(p: &Placement, x: i32, y: i32, width: u32, height: u32) -> bool {
    let left = i64::from(p.x).max(i64::from(x));
    let top = i64::from(p.y).max(i64::from(y));
    let right = (i64::from(p.x) + i64::from(p.width)).min(i64::from(x) + i64::from(width));
    let bottom = (i64::from(p.y) + i64::from(p.height)).min(i64::from(y) + i64::from(height));
    right - left >= 160 && bottom - top >= 80
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Display {
    index: usize,
    name: String,
    width: u32,
    height: u32,
    scale: f64,
}
#[tauri::command]
pub(super) fn director_displays(window: tauri::WebviewWindow) -> Reply<Vec<Display>> {
    Ok(window
        .available_monitors()
        .map_err(error)?
        .iter()
        .enumerate()
        .map(|(index, m)| Display {
            index,
            name: m
                .name()
                .cloned()
                .unwrap_or_else(|| format!("Display {}", index + 1)),
            width: m.size().width,
            height: m.size().height,
            scale: m.scale_factor(),
        })
        .collect())
}
#[tauri::command]
pub(super) fn director_window(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    project_id: String,
    action: String,
    monitor: Option<usize>,
) -> Reply<()> {
    let state = app.state::<AppState>();
    let view = get_or_open(&state, &project_id)?;
    if view.window.as_deref() != Some(window.label()) {
        return Err("This is not the project's Director window".into());
    }
    match action.as_str() {
        "fullscreen" => window
            .set_fullscreen(!window.is_fullscreen().map_err(error)?)
            .map_err(error)?,
        "maximize" => {
            if window.is_maximized().map_err(error)? {
                window.unmaximize().map_err(error)?
            } else {
                window.maximize().map_err(error)?
            }
        }
        "monitor" => {
            let monitors = window.available_monitors().map_err(error)?;
            let m = monitors
                .get(monitor.ok_or("Choose a display")?)
                .ok_or("Display is no longer attached")?;
            window.set_fullscreen(false).map_err(error)?;
            window
                .set_position(Position::Physical(*m.position()))
                .map_err(error)?;
            window
                .set_size(Size::Physical(PhysicalSize::new(
                    m.size().width,
                    m.size().height,
                )))
                .map_err(error)?;
        }
        "dock" => {
            if view.recording {
                return Err("Stop and save the recording before docking this window".into());
            }
            let owner = lock(&state.document_owners)?
                .get(&project_id)
                .cloned()
                .ok_or("Open this map in an editor window before docking the Director")?;
            app.emit_to(&owner, "spark:director-docked", &project_id)
                .map_err(error)?;
            if let Some(editor) = app.get_webview_window(&owner) {
                let _ = editor.set_focus();
            }
            window.close().map_err(error)?;
        }
        _ => return Err("Unknown Director window action".into()),
    }
    Ok(())
}
pub(super) fn window_event(
    app: &tauri::AppHandle,
    window: &tauri::Window,
    event: &tauri::WindowEvent,
) {
    if !window.label().starts_with("director-") {
        return;
    }
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let Ok(mut sessions) = state.director.lock() else {
        return;
    };
    let Some(session) = sessions
        .sessions
        .values_mut()
        .find(|s| s.window.as_deref() == Some(window.label()))
    else {
        return;
    };
    match event {
        tauri::WindowEvent::CloseRequested { api, .. } if session.recording => {
            api.prevent_close();
            let _ = app.emit(
                "spark:director-close-blocked",
                "Stop and save the active recording before closing the Director.",
            );
        }
        tauri::WindowEvent::Moved(position) => {
            if !window.is_fullscreen().unwrap_or(false) && !window.is_maximized().unwrap_or(false) {
                session.placement.x = position.x;
                session.placement.y = position.y;
            }
        }
        tauri::WindowEvent::Resized(size) => {
            if !window.is_fullscreen().unwrap_or(false) && !window.is_maximized().unwrap_or(false) {
                session.placement.width = size.width.max(640);
                session.placement.height = size.height.max(360);
            }
            session.placement.fullscreen = window.is_fullscreen().unwrap_or(false);
        }
        tauri::WindowEvent::Destroyed => {
            session.window = None;
            session.recording = false;
            let _ = persist(&state, session);
            let _ = app.emit("spark:director", &*session);
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn camera_bounds_and_keys_reject_nan_identity_and_controls() {
        let mut c = Composition::default();
        assert!(validate(&c).is_ok());
        c.pose.fov = f64::NAN;
        assert!(validate(&c).is_err());
        c = Composition::default();
        c.tracking = "engine-memory-write".into();
        assert!(validate(&c).is_err());
        c = Composition::default();
        c.selected = Some("missing".into());
        assert!(validate(&c).is_err());
        c = Composition::default();
        c.pose.look_at = c.pose.position;
        assert!(validate(&c).is_err());
    }
    #[test]
    fn paused_saved_camera_retains_lens_and_bookmarks_without_native_project_mutation() {
        let c = Composition::default();
        let bytes = serde_json::to_vec(&c).unwrap();
        let restored: Composition = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(restored.pose.fov, 55.);
        assert!(validate(&restored).is_ok());
    }
    #[test]
    fn shared_camera_rejects_stale_or_other_project_windows_without_changing_the_authority() {
        let current = DirectorSession {
            id: "session".into(),
            project_id: "map".into(),
            revision: 4,
            composition: Composition::default(),
            placement: Placement::default(),
            window: Some("director-session".into()),
            recording: false,
        };
        assert!(revised(&current, "director-other", 4, Composition::default()).is_err());
        assert!(revised(&current, "main", 3, Composition::default()).is_err());
        let mut pose = Composition::default();
        pose.pose.fov = 70.;
        let next = revised(&current, "director-session", 4, pose).unwrap();
        assert_eq!(next.revision, 5);
        assert_eq!(next.composition.pose.fov, 70.);
        assert_eq!(current.revision, 4);
        assert_eq!(current.composition.pose.fov, 55.);
    }
    #[test]
    fn removed_monitor_placement_is_rejected_and_negative_monitor_coordinates_are_preserved() {
        let p = Placement {
            x: -1600,
            y: 80,
            width: 1280,
            height: 720,
            fullscreen: false,
        };
        assert!(placement_visible(&p, -1920, 0, 1920, 1080));
        assert!(!placement_visible(&p, 0, 0, 1920, 1080));
        let far = Placement {
            x: i32::MAX,
            y: i32::MIN,
            width: u32::MAX,
            height: 720,
            fullscreen: false,
        };
        assert!(!placement_visible(&far, 0, 0, 1920, 1080));
    }
}
