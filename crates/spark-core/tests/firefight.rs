mod common;
use spark_core::{firefight::*, maps};

fn config() -> FirefightConfig {
    let mut c = default_config();
    c.player_count = 1;
    c.preparation_ms = 0;
    c.countdown_ms = 0;
    c.intermission_ms = 100;
    c.spawn_interval_ms = 50;
    c.spawn_timeout_ms = 100;
    c.stuck_timeout_ms = 1000;
    c.max_alive = 1;
    c.rounds = 1;
    c.enemies = vec![EnemyType {
        id: "zombie".into(),
        name: "Zombie".into(),
        actor_variant_path: "MGM\\Fonzie\\Sparky\\Tags\\Zombies\\Zombie".into(),
        points: 100,
    }];
    c.waves = vec![WaveDefinition {
        id: "wave-1".into(),
        name: "Opening".into(),
        boss: false,
        score_multiplier_milli: 1000,
        groups: vec![EnemyGroup {
            enemy_id: "zombie".into(),
            count: 2,
            spawn_zone_id: None,
        }],
    }];
    c
}
fn advance(ms: u32) -> FirefightCommand {
    FirefightCommand::Advance { milliseconds: ms }
}
fn spawned(id: u32) -> FirefightCommand {
    FirefightCommand::SpawnSucceeded { actor_id: id }
}
fn killed(id: u32) -> FirefightCommand {
    FirefightCommand::ActorKilled { actor_id: id }
}

#[test]
fn draft_is_saveable_but_not_runnable_and_untrusted_fields_are_rejected() {
    assert!(validate_document(&default_config()).is_ok());
    assert!(validate(&default_config()).is_err());
    let mut value = serde_json::to_value(default_config()).unwrap();
    value["runtimeIntegrated"] = true.into();
    assert!(serde_json::from_value::<FirefightConfig>(value).is_err());
    assert!(
        serde_json::from_str::<FirefightCommand>(r#"{"type":"start","executeGame":true}"#).is_err()
    );
}

#[test]
fn validation_bounds_identity_paths_and_finite_positions() {
    let c = config();
    assert!(validate(&c).is_ok());
    let mut bad = c.clone();
    bad.enemies.push(bad.enemies[0].clone());
    assert!(validate(&bad).is_err());
    let mut bad = c.clone();
    bad.enemies[0].actor_variant_path = "../evil".into();
    assert!(validate(&bad).is_err());
    let mut bad = c.clone();
    bad.spawn_zones[0].position[0] = f32::NAN;
    assert!(validate(&bad).is_err());
    let mut bad = c.clone();
    bad.spawn_zones[0].enabled = false;
    assert!(validate(&bad).is_err());
    let mut bad = c.clone();
    bad.waves[0].groups[0].enemy_id = "missing".into();
    assert!(validate_document(&bad).is_ok());
    assert!(validate(&bad).is_err());
    let mut bad = c.clone();
    bad.max_total_per_wave = 1;
    assert!(validate(&bad).is_err());
    let mut bad = c.clone();
    bad.spawn_interval_ms = 0;
    assert!(validate(&bad).is_err());
    let mut bad = c.clone();
    bad.player_count = 17;
    assert!(validate(&bad).is_err());
    let mut bad = c;
    bad.source_sha256 = Some("not-a-hash".into());
    assert!(validate(&bad).is_err());
}

#[test]
fn deterministic_replay_pending_capacity_and_score_use_acknowledged_ids() {
    let c = config();
    let steps = [
        FirefightCommand::Start {},
        spawned(1),
        advance(50),
        killed(1),
        advance(0),
        spawned(2),
        killed(2),
    ];
    let a = simulate(&c, &steps).unwrap();
    let b = simulate(&c, &steps).unwrap();
    assert_eq!(a, b);
    assert_eq!(a.state.phase, Phase::Victory);
    assert_eq!(a.state.score, 200);
    assert_eq!(a.scope, "authoringSimulationOnly");
    assert!(!a.runtime_integrated && !a.gameplay_verified);
    let pending = simulate(&c, &[FirefightCommand::Start {}, advance(50)]).unwrap();
    assert_eq!(pending.state.actors.len(), 1);
    assert_eq!(pending.state.queued_enemies, 1);
    assert_eq!(pending.state.phase, Phase::ActiveWave);
    assert_eq!(pending.state.actors[0].status, ActorStatus::Pending);
    for p in a.events.iter().filter_map(|e| e.position) {
        assert!(p[0] * p[0] + p[1] * p[1] <= c.spawn_zones[0].radius.powi(2));
    }
    let mut different = c.clone();
    different.seed += 1;
    assert_ne!(simulate(&different, &steps).unwrap().events, a.events);
    assert!(simulate(&c, &[FirefightCommand::Start {}, killed(1)]).is_err());
    assert!(simulate(&c, &[FirefightCommand::Start {}, spawned(1), spawned(1)]).is_err());
    assert!(simulate(
        &c,
        &[FirefightCommand::Start {}, spawned(1), killed(1), killed(1)]
    )
    .is_err());
}

#[test]
fn failed_and_timed_out_spawns_retry_with_new_ids_and_never_score() {
    let mut c = config();
    c.max_spawn_attempts = 2;
    let r = simulate(
        &c,
        &[
            FirefightCommand::Start {},
            FirefightCommand::SpawnFailed { actor_id: 1 },
            advance(50),
        ],
    )
    .unwrap();
    // Other queued enemies retain their turn before the retry ticket.
    assert_eq!(r.state.actors[0].id, 2);
    assert_eq!(r.state.score, 0);
    c.waves[0].groups[0].count = 1;
    let r = simulate(&c, &[FirefightCommand::Start {}, advance(200)]).unwrap();
    assert_eq!(r.state.phase, Phase::Defeat);
    assert_eq!(r.state.kills, 0);
    assert_eq!(r.state.score, 0);
    assert!(!r.events.iter().any(|e| e.kind == "waveCompleted"));
    assert!(simulate(
        &c,
        &[
            FirefightCommand::Start {},
            FirefightCommand::SpawnFailed { actor_id: 1 },
            spawned(1)
        ]
    )
    .is_err());
}

#[test]
fn stuck_actors_stop_instead_of_disappearing_and_progress_extends_deadline() {
    let c = config();
    let stuck = simulate(&c, &[FirefightCommand::Start {}, spawned(1), advance(1000)]).unwrap();
    assert_eq!(stuck.state.phase, Phase::Defeat);
    assert_eq!(stuck.state.actors.len(), 1);
    assert_eq!(stuck.state.score, 0);
    let alive = simulate(
        &c,
        &[
            FirefightCommand::Start {},
            spawned(1),
            advance(900),
            FirefightCommand::ActorProgress { actor_id: 1 },
            advance(900),
        ],
    )
    .unwrap();
    assert_eq!(alive.state.phase, Phase::ActiveWave);
    assert_eq!(alive.state.wave_number, 1);
    assert!(simulate(
        &c,
        &[
            FirefightCommand::Start {},
            FirefightCommand::ActorProgress { actor_id: 1 }
        ]
    )
    .is_err());
}

#[test]
fn shared_lives_and_revives_are_explicit() {
    let mut c = config();
    c.player_count = 2;
    c.team_lives = 1;
    c.allow_revives = true;
    let r = simulate(
        &c,
        &[
            FirefightCommand::Start {},
            FirefightCommand::PlayerDown { player: 0 },
            FirefightCommand::RevivePlayer { player: 0 },
            FirefightCommand::PlayerDown { player: 0 },
            FirefightCommand::RespawnPlayer { player: 0 },
        ],
    )
    .unwrap();
    assert_eq!(r.state.team_lives, 0);
    assert!(r.state.players_alive.iter().all(|p| *p));
    let defeated = simulate(
        &c,
        &[
            FirefightCommand::Start {},
            FirefightCommand::PlayerDown { player: 0 },
            FirefightCommand::RespawnPlayer { player: 0 },
            FirefightCommand::PlayerDown { player: 0 },
            FirefightCommand::PlayerDown { player: 1 },
        ],
    )
    .unwrap();
    assert_eq!(defeated.state.phase, Phase::Defeat);
    assert!(simulate(
        &c,
        &[
            FirefightCommand::Start {},
            FirefightCommand::PlayerDown { player: 0 },
            FirefightCommand::PlayerDown { player: 1 },
            FirefightCommand::RevivePlayer { player: 0 }
        ]
    )
    .is_err());
    c.allow_revives = false;
    assert!(simulate(
        &c,
        &[
            FirefightCommand::Start {},
            FirefightCommand::PlayerDown { player: 0 },
            FirefightCommand::RevivePlayer { player: 0 }
        ]
    )
    .is_err());
}

#[test]
fn boss_endless_round_scaling_and_caps_are_deterministic() {
    let mut c = config();
    c.waves[0].boss = true;
    c.waves[0].score_multiplier_milli = 2000;
    assert_eq!(
        simulate(&c, &[FirefightCommand::Start {}])
            .unwrap()
            .state
            .phase,
        Phase::Boss
    );
    let r = preview(&c, 1).unwrap();
    assert_eq!(r.state.phase, Phase::Victory);
    assert_eq!(r.state.score, 400);
    c.endless = true;
    c.player_count = 2;
    c.difficulty_step_percent = 100;
    c.extra_player_count_percent = 50;
    c.max_total_per_wave = 4;
    let r = preview(&c, 3).unwrap();
    assert_eq!(r.state.wave_number, 3);
    assert_eq!(r.state.round_number, 3);
    assert_eq!(r.state.kills, 3 + 4 + 4);
    assert_eq!(r.state.phase, Phase::Intermission);
    assert!(r.diagnostics[0].contains("scripts successful virtual"));
}

#[test]
fn asset_validation_and_zombie_presets_require_actual_actor_paths_and_source_hash() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("fixture.map");
    std::fs::write(&path, common::fixture(7)).unwrap();
    let mut inspection = maps::inspect_map(&path, None).unwrap();
    assert!(presets(&inspection).iter().all(|p| p.config.is_none()));
    let mut c = config();
    c.source_sha256 = Some(inspection.sha256.clone());
    assert!(!validate_assets(&c, &inspection).valid);
    // Synthetic inventory used only to verify identity logic, not game validity.
    inspection.tags[1].class = "actv".into();
    inspection.tags[1].path = c.enemies[0].actor_variant_path.clone();
    assert!(validate_assets(&c, &inspection).valid);
    assert_eq!(available_enemies(&inspection).len(), 1);
    let presets = presets(&inspection);
    assert!(presets[0].config.is_some());
    assert!(presets[1].config.is_none());
    assert_eq!(
        presets[0].config.as_ref().unwrap().enemies[0].actor_variant_path,
        c.enemies[0].actor_variant_path
    );
    c.source_sha256 = None;
    assert!(!validate_assets(&c, &inspection).valid);
}

#[test]
fn execution_is_bounded_and_never_runs_a_game() {
    let c = config();
    assert!(simulate(&c, &vec![advance(0); MAX_COMMANDS + 1]).is_err());
    assert!(simulate(&c, &[advance(0)]).is_err());
    assert!(simulate(&c, &[FirefightCommand::Start {}, advance(60001)]).is_err());
    assert!(preview(&c, 0).is_err());
    assert!(preview(&c, 9).is_err());
    let r = simulate(
        &c,
        &[FirefightCommand::Start {}, FirefightCommand::Abort {}],
    )
    .unwrap();
    assert_eq!(r.state.phase, Phase::Defeat);
    assert!(!r.runtime_integrated);
    assert!(!r.gameplay_verified);
}

fn native_project() -> spark_core::project::Project {
    let mut p=spark_core::project::Project::new("Native round test");
    let mut c=default_config();c.player_count=1;c.team_lives=1;c.allow_revives=false;c.rounds=1;c.endless=false;c.max_spawn_attempts=1;c.difficulty_step_percent=0;c.extra_player_count_percent=0;c.starting_equipment.clear();c.supply_drop_tags.clear();c.replenish_ammo_each_wave=false;
    c.max_alive=4;c.max_total_per_wave=4;c.stuck_timeout_ms=60000;
    c.native_player_profile=Some(NativePlayerProfile{primary_weapon:"weapons/pistol/pistol".into(),primary_loaded:12,primary_reserved:60,secondary_weapon:None,secondary_loaded:0,secondary_reserved:0,health:1.0,shields:1.0,fragmentation_grenades:2,plasma_grenades:0});
    c.enemies=vec![EnemyType{id:"grunt".into(),name:"Grunt".into(),actor_variant_path:"characters/grunt/grunt minor plasma pistol".into(),points:100}];
    c.spawn_zones=vec![SpawnZone{id:"enemy-zone".into(),position:[6.0,0.0,0.2],radius:2.0,enabled:true}];
    c.waves=vec![WaveDefinition{id:"wave".into(),name:"Wave".into(),boss:false,score_multiplier_milli:1000,groups:vec![EnemyGroup{enemy_id:"grunt".into(),count:2,spawn_zone_id:None}]}];
    let mut doc=spark_core::quickforge::create_arena("Native round test","firefightArena").unwrap();
    doc.spawns.truncate(1);doc.spawns[0].position=[-6.0,0.0,0.2];
    doc.logic=Some(spark_core::native_logic::Document {schema_version:1,triggers:vec![],devices:vec![],rules:vec![],manual_source:None,handwritten_sources:vec![spark_core::native_logic::HandwrittenSource{filename:"gs_firefight.hsc".into(),content:format!("{}{}\r\n; source compiled separately\r\n",NATIVE_ROUND_BINDING,serde_json::to_string(&c).unwrap())}]});
    p.quick_forge=Some(doc);p.firefight=Some(c);p
}
fn rebind(p:&mut spark_core::project::Project) {
    p.quick_forge.as_mut().unwrap().logic.as_mut().unwrap().handwritten_sources[0].content=format!("{}{}\n; native test\n",NATIVE_ROUND_BINDING,serde_json::to_string(p.firefight.as_ref().unwrap()).unwrap());
}
#[test]
fn native_round_uses_standard_scenario_fields_and_preserves_unrelated_source() {
    let p=native_project();let before=serde_json::to_vec(&p).unwrap();let plan=native_round_plan(&p).unwrap().unwrap();
    assert_eq!(plan.encounter_names,["gs_w01_g01"]);assert_eq!(plan.dependencies.len(),2);
    assert!(plan.dependencies.iter().any(|dep|dep.tag_class=="actor_variant"));
    assert!(plan.dependencies.iter().any(|dep|dep.tag_class=="weapon"&&dep.tag_path=="weapons/pistol/pistol"));
    let args=plan.commands.iter().flat_map(|command|command.args.iter()).cloned().collect::<Vec<_>>().join("|");
    for field in ["actor_palette[0].reference","encounters[0].flags.not_initially_created","encounters[0].squads[0].normal_diff_count","encounters[0].squads[0].starting_locations[1].position","encounters[0].firing_positions[1].position"] {assert!(args.contains(field),"{field}");}
    assert!(!args.contains(".one|"),"cache-only scenario fields belong to the native compiler");assert!(!args.contains("-n|"));assert!(!args.contains("-E|"));assert_eq!(serde_json::to_vec(&p).unwrap(),before);
}
#[test]
fn native_round_refuses_stale_rules_unsupported_options_and_unsafe_spawns_before_staging() {
    let mut p=native_project();p.firefight.as_mut().unwrap().waves[0].groups[0].count=3;
    assert!(native_round_plan(&p).unwrap_err().to_string().contains("changed after"));
    rebind(&mut p);assert!(native_round_plan(&p).is_ok());
    p.firefight.as_mut().unwrap().player_count=2;rebind(&mut p);assert!(native_round_plan(&p).is_err());
    p.firefight.as_mut().unwrap().player_count=1;p.firefight.as_mut().unwrap().spawn_zones[0].position=[-6.0,0.0,0.2];rebind(&mut p);
    assert!(native_round_plan(&p).unwrap_err().to_string().contains("two world units"));
    p.firefight.as_mut().unwrap().spawn_zones[0].position=[6.0,0.0,0.2];p.firefight.as_mut().unwrap().spawn_zones[0].radius=0.1;rebind(&mut p);
    assert!(native_round_plan(&p).unwrap_err().to_string().contains("radius"));
}
#[test]
fn native_round_groups_in_one_zone_have_distinct_starting_locations() {
    let mut p=native_project();p.firefight.as_mut().unwrap().enemies.push(EnemyType{id:"elite".into(),name:"Elite".into(),actor_variant_path:"characters/elite/elite minor/elite minor plasma rifle".into(),points:200});
    p.firefight.as_mut().unwrap().waves[0].groups.push(EnemyGroup{enemy_id:"elite".into(),count:2,spawn_zone_id:None});rebind(&mut p);
    let plan=native_round_plan(&p).unwrap().unwrap();let mut positions=std::collections::BTreeSet::new();
    for command in plan.commands {for window in command.args.windows(3) {if window[0]=="-S" && window[1].contains("starting_locations[") && window[1].ends_with(".position") {assert!(positions.insert(window[2].clone()));}}}
    assert_eq!(positions.len(),4);
}

#[test]
fn native_solo_spawn_minimum_does_not_lower_multiplayer_or_clearance_checks() {
    let mut p=native_project();let doc=p.quick_forge.as_mut().unwrap();
    assert!(!spark_core::quickforge::validate(doc).unwrap().issues.iter().any(|issue|issue.code=="SPAWN_MINIMUM"));
    doc.game_mode="slayer".into();
    assert!(spark_core::quickforge::validate(doc).unwrap().issues.iter().any(|issue|issue.code=="SPAWN_MINIMUM"));
    doc.game_mode="firefight".into();doc.spawns.clear();
    assert!(spark_core::quickforge::validate(doc).unwrap().issues.iter().any(|issue|issue.code=="SPAWN_MINIMUM"));
}

#[test]fn native_player_loadout_is_standard_bounded_and_not_silently_invented_for_old_source(){
 let original=default_config();let bytes=serde_json::to_value(&original).unwrap();assert!(bytes.get("nativePlayerProfile").is_none());
 let mut p=native_project();p.firefight.as_mut().unwrap().native_player_profile=None;rebind(&mut p);
 assert!(native_round_plan(&p).unwrap_err().to_string().contains("player loadout"));
 let p=native_project();let plan=native_round_plan(&p).unwrap().unwrap();let args=plan.commands.iter().flat_map(|command|command.args.iter()).cloned().collect::<Vec<_>>().join("|");
 for field in ["player_starting_profile[0].name|gs_firefight_start","player_starting_profile[0].primary_weapon|weapons/pistol/pistol.weapon","player_starting_profile[0].primary_rounds_loaded|12","player_starting_profile[0].primary_rounds_reserved|60","player_starting_profile[0].starting_health_modifier|1","player_starting_profile[0].starting_shield_modifier|1"]{assert!(args.contains(field),"{field}");}
 let mut bad=p.clone();bad.firefight.as_mut().unwrap().native_player_profile.as_mut().unwrap().primary_reserved=32768;rebind(&mut bad);assert!(native_round_plan(&bad).is_err());
 let mut bad=p.clone();bad.firefight.as_mut().unwrap().native_player_profile.as_mut().unwrap().primary_weapon="../protected".into();rebind(&mut bad);assert!(native_round_plan(&bad).is_err());
 let mut bad=p;bad.firefight.as_mut().unwrap().native_player_profile.as_mut().unwrap().secondary_weapon=Some("weapons\\pistol\\pistol".into());rebind(&mut bad);assert!(native_round_plan(&bad).is_err());
}
