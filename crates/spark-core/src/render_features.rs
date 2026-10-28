use crate::{invalid, Result};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderFeatures {
    pub enabled: bool,
    pub bloom: bool,
    pub bloom_strength: f32,
    pub bloom_threshold: f32,
    pub bloom_radius: f32,
    pub exposure_ev: f32,
    pub saturation: f32,
    pub contrast: f32,
    pub vignette: f32,
    pub normal_maps: bool,
    pub normal_strength: f32,
    pub specular: bool,
    pub specular_strength: f32,
    pub self_illumination: bool,
    pub self_illum_strength: f32,
    pub quality: String,
    pub tone_mapping: String,
}
impl RenderFeatures {
    pub fn validate(&self) -> Result<()> {
        for (value, min, max) in [
            (self.bloom_strength, 0., 2.),
            (self.bloom_threshold, 0., 4.),
            (self.bloom_radius, 0., 1.),
            (self.exposure_ev, -4., 4.),
            (self.saturation, 0., 2.),
            (self.contrast, 0.5, 1.5),
            (self.vignette, 0., 1.),
            (self.normal_strength, 0., 2.),
            (self.specular_strength, 0., 2.),
            (self.self_illum_strength, 0., 4.),
        ] {
            if !value.is_finite() || value < min || value > max {
                return invalid("Renderer enhancement value is outside its supported range");
            }
        }
        if !["performance", "balanced", "full"].contains(&self.quality.as_str())
            || !["source", "filmic"].contains(&self.tone_mapping.as_str())
        {
            return invalid("Unknown renderer quality or color response");
        }
        Ok(())
    }
}
