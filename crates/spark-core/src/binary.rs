use crate::{invalid, Result};

pub struct Reader<'a>(pub &'a [u8]);
impl<'a> Reader<'a> {
    pub fn bytes(&self, offset: usize, len: usize) -> Result<&'a [u8]> {
        let end = offset
            .checked_add(len)
            .ok_or_else(|| crate::SparkError::Invalid("Offset overflow".into()))?;
        self.0.get(offset..end).ok_or_else(|| {
            crate::SparkError::Invalid(format!("Read outside file at 0x{offset:X} (length {len})"))
        })
    }
    pub fn u16(&self, offset: usize) -> Result<u16> {
        Ok(u16::from_le_bytes(
            self.bytes(offset, 2)?.try_into().unwrap(),
        ))
    }
    pub fn u32(&self, offset: usize) -> Result<u32> {
        Ok(u32::from_le_bytes(
            self.bytes(offset, 4)?.try_into().unwrap(),
        ))
    }
    pub fn f32(&self, offset: usize) -> Result<f32> {
        let n = f32::from_le_bytes(self.bytes(offset, 4)?.try_into().unwrap());
        if !n.is_finite() {
            return invalid(format!("Non-finite value at 0x{offset:X}"));
        }
        Ok(n)
    }
    pub fn string(&self, offset: usize, limit: usize) -> Result<String> {
        let remain = self
            .0
            .len()
            .checked_sub(offset)
            .ok_or_else(|| crate::SparkError::Invalid("String pointer outside data".into()))?;
        let bytes = self.bytes(offset, limit.min(remain))?;
        let end = bytes
            .iter()
            .position(|b| *b == 0)
            .ok_or_else(|| crate::SparkError::Invalid("Unterminated string".into()))?;
        if bytes[..end].iter().any(|b| *b < 0x20) {
            return invalid("Control character in tag path or header text");
        }
        Ok(String::from_utf8_lossy(&bytes[..end]).into_owned())
    }
    pub fn fourcc(&self, offset: usize) -> Result<String> {
        let bytes = self.bytes(offset, 4)?;
        Ok(bytes
            .iter()
            .rev()
            .map(|b| {
                if b.is_ascii_graphic() || *b == b' ' {
                    *b as char
                } else {
                    '?'
                }
            })
            .collect())
    }
}
