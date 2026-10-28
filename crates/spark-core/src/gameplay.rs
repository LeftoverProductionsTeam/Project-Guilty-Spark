//! Per-map controls and an engine-neutral input contract. These settings do not
//! grant a runtime write capability; an adapter must supply verified hooks.
use crate::{invalid, Result};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Controls {
    pub sprint: bool,
    pub sprint_key: String,
    pub sprint_multiplier: f32,
    pub dual_wield: bool,
    pub dual_wield_key: String,
    pub sword_lunge: bool,
}
impl Default for Controls {
    fn default() -> Self {
        Self {
            sprint: false,
            sprint_key: "ShiftLeft".into(),
            sprint_multiplier: 1.75,
            dual_wield: false,
            dual_wield_key: "KeyQ".into(),
            sword_lunge: false,
        }
    }
}
pub fn keyboard_key(value: &str) -> bool {
    matches!(
        value,
        "ShiftLeft"
            | "ShiftRight"
            | "ControlLeft"
            | "ControlRight"
            | "AltLeft"
            | "AltRight"
            | "Space"
    ) || (value.len() == 4 && value.starts_with("Key") && value.as_bytes()[3].is_ascii_uppercase())
        || (value.len() == 6 && value.starts_with("Digit") && value.as_bytes()[5].is_ascii_digit())
}
impl Controls {
    pub fn validate(&self) -> Result<()> {
        if !keyboard_key(&self.sprint_key)
            || !keyboard_key(&self.dual_wield_key)
            || self.sprint_key == self.dual_wield_key
        {
            return invalid("Choose two different keyboard keys for sprint and dual wield");
        }
        if !self.sprint_multiplier.is_finite() || !(1.05..=2.).contains(&self.sprint_multiplier) {
            return invalid("Sprint speed must be between 1.05 and 2 times the normal speed");
        }
        Ok(())
    }
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Buttons {
    pub left_mouse: bool,
    pub right_mouse: bool,
    pub reload: bool,
    pub sprint: bool,
    pub dual_toggle: bool,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutedInput {
    pub left_fire: bool,
    pub right_fire: bool,
    pub primary_fire: bool,
    pub secondary_fire: bool,
    pub zoom: bool,
    pub grenade: bool,
    pub reload: bool,
    pub sprint: bool,
    pub dual_active: bool,
}
#[derive(Default)]
pub struct InputRouter {
    dual_active: bool,
    toggle_was_down: bool,
    await_release: bool,
}
impl InputRouter {
    /// Focus loss, death, changing weapons and disabled/unavailable hooks release
    /// both triggers. A held mouse button cannot become a shot on reconnect.
    pub fn route(
        &mut self,
        config: &Controls,
        input: Buttons,
        ready: bool,
        paired_weapon: bool,
    ) -> RoutedInput {
        if !ready {
            self.dual_active = false;
            self.toggle_was_down = input.dual_toggle;
            self.await_release = true;
            return RoutedInput::default();
        }
        if !config.dual_wield || !paired_weapon {
            self.dual_active = false;
        }
        if config.dual_wield && paired_weapon && input.dual_toggle && !self.toggle_was_down {
            self.dual_active = !self.dual_active;
            self.await_release = true;
        }
        self.toggle_was_down = input.dual_toggle;
        if self.await_release {
            if input.left_mouse || input.right_mouse {
                return RoutedInput {
                    dual_active: self.dual_active,
                    ..Default::default()
                };
            }
            self.await_release = false;
        }
        let firing = input.left_mouse || input.right_mouse;
        let sprint = config.sprint && input.sprint && !self.dual_active && !firing && !input.reload;
        if self.dual_active {
            RoutedInput {
                left_fire: input.left_mouse && !input.reload,
                right_fire: input.right_mouse && !input.reload,
                primary_fire: input.left_mouse && !input.reload,
                secondary_fire: input.right_mouse && !input.reload,
                reload: input.reload,
                dual_active: true,
                ..Default::default()
            }
        } else {
            RoutedInput {
                primary_fire: input.left_mouse && !input.reload && !sprint,
                zoom: input.right_mouse,
                reload: input.reload,
                sprint,
                ..Default::default()
            }
        }
    }
}

/// Halo 1 paired tags use independent primary/secondary triggers. Trigger 0
/// belongs to the left gun, trigger 1 to the right gun; neither is slaved.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairRecipe {
    pub left_trigger: u8,
    pub right_trigger: u8,
    pub left_magazine: u8,
    pub right_magazine: u8,
    pub secondary_trigger_mode: &'static str,
    pub secondary_overrides_grenades: bool,
    pub prevents_grenade_throwing: bool,
    pub zoom_levels: u8,
    pub requirements: Vec<&'static str>,
}
pub fn pair_recipe() -> PairRecipe {
    PairRecipe {
        left_trigger: 0,
        right_trigger: 1,
        left_magazine: 0,
        right_magazine: 1,
        secondary_trigger_mode: "normal",
        secondary_overrides_grenades: true,
        prevents_grenade_throwing: true,
        zoom_levels: 0,
        requirements: vec![
            "A paired first-person model with actual left and right weapon geometry",
            "Matching first-person firing and reload animations",
            "Separate left and right muzzle markers and magazine/trigger bindings",
            "Verified primary/secondary input hooks, or matching in-game mouse bindings",
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn dual() -> (Controls, InputRouter) {
        let config = Controls {
            dual_wield: true,
            ..Controls::default()
        };
        let mut router = InputRouter::default();
        assert!(
            router
                .route(
                    &config,
                    Buttons {
                        dual_toggle: true,
                        ..Default::default()
                    },
                    true,
                    true
                )
                .dual_active
        );
        router.route(&config, Buttons::default(), true, true);
        (config, router)
    }
    #[test]
    fn each_button_fires_its_own_gun_and_both_can_fire_together() {
        let (config, mut router) = dual();
        for (left, right) in [(true, false), (false, true), (true, true), (false, false)] {
            let out = router.route(
                &config,
                Buttons {
                    left_mouse: left,
                    right_mouse: right,
                    ..Default::default()
                },
                true,
                true,
            );
            assert_eq!(
                (
                    out.left_fire,
                    out.right_fire,
                    out.primary_fire,
                    out.secondary_fire
                ),
                (left, right, left, right)
            );
            assert!(!out.zoom && !out.grenade);
        }
    }
    #[test]
    fn focus_loss_and_weapon_changes_release_both_guns_without_a_stale_shot() {
        let (config, mut router) = dual();
        let held = Buttons {
            left_mouse: true,
            right_mouse: true,
            ..Default::default()
        };
        assert_eq!(
            router.route(&config, held, false, true),
            RoutedInput::default()
        );
        assert!(!router.route(&config, held, true, true).primary_fire);
        router.route(&config, Buttons::default(), true, true);
        assert!(
            !router
                .route(
                    &config,
                    Buttons {
                        dual_toggle: true,
                        ..Default::default()
                    },
                    true,
                    false
                )
                .dual_active
        );
    }
    #[test]
    fn toggle_is_edge_triggered_and_reload_suppresses_both_triggers() {
        let (config, mut router) = dual();
        let reload = router.route(
            &config,
            Buttons {
                left_mouse: true,
                right_mouse: true,
                reload: true,
                ..Default::default()
            },
            true,
            true,
        );
        assert!(!reload.left_fire && !reload.right_fire && reload.reload);
        let pressed = Buttons {
            dual_toggle: true,
            ..Default::default()
        };
        assert!(!router.route(&config, pressed, true, true).dual_active);
        assert!(!router.route(&config, pressed, true, true).dual_active);
    }
    #[test]
    fn sprint_stops_when_firing_reloading_or_dual_wielding() {
        let config = Controls {
            sprint: true,
            ..Controls::default()
        };
        let mut router = InputRouter::default();
        assert!(
            router
                .route(
                    &config,
                    Buttons {
                        sprint: true,
                        ..Default::default()
                    },
                    true,
                    false
                )
                .sprint
        );
        assert!(
            !router
                .route(
                    &config,
                    Buttons {
                        sprint: true,
                        left_mouse: true,
                        ..Default::default()
                    },
                    true,
                    false
                )
                .sprint
        );
        assert!(
            !router
                .route(
                    &config,
                    Buttons {
                        sprint: true,
                        reload: true,
                        ..Default::default()
                    },
                    true,
                    false
                )
                .sprint
        );
        assert!(Controls {
            dual_wield_key: "ShiftLeft".into(),
            ..config.clone()
        }
        .validate()
        .is_err());
        assert!(Controls {
            sprint_multiplier: f32::NAN,
            ..config
        }
        .validate()
        .is_err());
    }
}
