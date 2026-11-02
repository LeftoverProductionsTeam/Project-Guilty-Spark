//! Read-only numeric layouts used by Halo 1's original Xbox caches.
//! Independently implemented from the published HEK layouts; no game code.
use crate::{invalid, Result};

pub(crate) fn signed_fraction(value: u32, bits: u32) -> f32 {
    let sign = 1u32 << (bits - 1);
    (value & (sign - 1)) as f32 / (sign - 1) as f32 - if value & sign != 0 { 1.0 } else { 0.0 }
}

pub(crate) fn normal(value: u32) -> [f32; 3] {
    [signed_fraction(value, 11), signed_fraction(value >> 11, 11), signed_fraction(value >> 22, 10)]
}

/// Xbox uncompressed texels use a rectangular Morton layout. A dimension
/// which has exhausted its coordinate bits contributes no further bits.
pub(crate) fn linear_texels(pixels: &[u8], width: u16, height: u16, stride: usize) -> Result<Vec<u8>> {
    if !width.is_power_of_two() || !height.is_power_of_two() || ![1, 2, 4].contains(&stride) {
        return invalid("Xbox swizzled textures require bounded power-of-two dimensions and a known texel size");
    }
    let (w, h) = (width as usize, height as usize);
    if pixels.len() != w * h * stride { return invalid("Xbox swizzled texture length differs from its dimensions"); }
    let mut out = vec![0; pixels.len()];
    for y in 0..h { for x in 0..w {
        let (mut address, mut output_bit, mut coordinate_bit) = (0usize, 0, 1usize);
        while coordinate_bit < w || coordinate_bit < h {
            if coordinate_bit < w { address |= usize::from(x & coordinate_bit != 0) << output_bit; output_bit += 1; }
            if coordinate_bit < h { address |= usize::from(y & coordinate_bit != 0) << output_bit; output_bit += 1; }
            coordinate_bit <<= 1;
        }
        let destination = (y * w + x) * stride;
        out[destination..destination + stride].copy_from_slice(&pixels[address * stride..(address + 1) * stride]);
    }}
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_sign_encoding_and_rectangular_swizzle_are_exact() {
        assert_eq!(signed_fraction(0x8000, 16), -1.0);
        assert_eq!(signed_fraction(0x7fff, 16), 1.0);
        assert_eq!(signed_fraction(0xffff, 16), 0.0);
        assert_eq!(normal(511 << 22), [0.0, 0.0, 1.0]);
        // Documented 4x2 Morton order: (0,0),(1,0),(0,1),(1,1),(2,0),...
        assert_eq!(linear_texels(&[0, 1, 4, 5, 2, 3, 6, 7], 4, 2, 1).unwrap(), [0, 1, 2, 3, 4, 5, 6, 7]);
        assert_eq!(linear_texels(&[0, 1, 2, 3, 4, 5, 6, 7], 2, 4, 1).unwrap(), [0, 1, 2, 3, 4, 5, 6, 7]);
        assert!(linear_texels(&[0; 6], 3, 2, 1).is_err());
        assert!(linear_texels(&[0; 7], 4, 2, 1).is_err());
    }
}
