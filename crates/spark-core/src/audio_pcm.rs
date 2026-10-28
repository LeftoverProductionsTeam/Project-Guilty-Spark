//! Original bounded PCM/Xbox-ADPCM playback conversion. The standard IMA step
//! table and Xbox's 36-byte/channel, 64-frame block layout are format facts.
//! No encoder, resampling, gain adjustment or source mutation is performed.
use crate::{invalid,Result};
use super::audio::MAX_PREVIEW_BYTES;
const STEPS:[i32;89]=[7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,34,37,41,45,50,55,60,66,73,80,88,97,107,118,130,143,157,173,190,209,230,253,279,307,337,371,408,449,494,544,598,658,724,796,876,963,1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,3327,3660,4026,4428,4871,5358,5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,15289,16818,18500,20350,22385,24623,27086,29794,32767];
const INDEX:[i32;8]=[-1,-1,-1,-1,2,4,6,8];
pub(crate) fn frame_count(data:&[u8],codec:u16,channels:u8)->Result<usize>{
    if !matches!(channels,1|2)||data.is_empty()||data.len()>MAX_PREVIEW_BYTES{return invalid("PCM channels or input size outside bounds");}
    let ch=channels as usize;
    let frames=match codec {
        0=>{if data.len()%(2*ch)!=0{return invalid("PCM contains an incomplete interleaved frame");}data.len()/(2*ch)},
        1=>{
            let block=36*ch;if data.len()%block!=0{return invalid("Xbox ADPCM contains a truncated block");}
            for bytes in data.chunks_exact(block){for c in 0..ch{if u16::from_le_bytes([bytes[c*4+2],bytes[c*4+3]])>88{return invalid("Xbox ADPCM step index exceeds 88");}}}
            data.len()/block*64
        },
        _=>return invalid("This sound codec has no bounded PCM converter"),
    };
    if frames*ch*2+44>MAX_PREVIEW_BYTES{return invalid("Decoded WAV exceeds the 16 MiB playback budget");}Ok(frames)
}
pub(crate) fn wave(data:&[u8],codec:u16,channels:u8,rate:u32)->Result<Vec<u8>>{
    let frames=frame_count(data,codec,channels)?;if !matches!(rate,22050|44100){return invalid("Unsupported PCM sample rate");}
    let ch=channels as usize;let size=frames*ch*2;let mut wave=Vec::with_capacity(size+44);
    wave.extend(b"RIFF");wave.extend(((size+36)as u32).to_le_bytes());wave.extend(b"WAVEfmt ");wave.extend(16u32.to_le_bytes());
    wave.extend(1u16.to_le_bytes());wave.extend((channels as u16).to_le_bytes());wave.extend(rate.to_le_bytes());
    wave.extend((rate*channels as u32*2).to_le_bytes());wave.extend((channels as u16*2).to_le_bytes());wave.extend(16u16.to_le_bytes());
    wave.extend(b"data");wave.extend((size as u32).to_le_bytes());
    if codec==0 {for pair in data.chunks_exact(2){wave.extend([pair[1],pair[0]]);}return Ok(wave);}
    for block in data.chunks_exact(36*ch){
        let mut predictor=[0i32;2];let mut index=[0i32;2];
        for c in 0..ch{predictor[c]=i16::from_le_bytes([block[c*4],block[c*4+1]])as i32;index[c]=block[c*4+2]as i32;}
        for frame in 0..64 {for c in 0..ch {
            if frame>0 {let sample=frame-1;let at=4*ch+(sample/8)*4*ch+c*4+(sample%8)/2;
                let nibble=(block[at]>>((sample%2)*4))&15;let step=STEPS[index[c]as usize];
                let delta=((2*(nibble&7)as i32+1)*step)>>3;
                predictor[c]=(predictor[c]+if nibble&8!=0{-delta}else{delta}).clamp(-32768,32767);
                index[c]=(index[c]+INDEX[(nibble&7)as usize]).clamp(0,88);
            }
            wave.extend((predictor[c]as i16).to_le_bytes());
        }}
    }Ok(wave)
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn big_endian_pcm_has_exact_signed_samples_and_wave_clock(){
        let w=wave(&[0x80,0,0x7f,0xff,0,1,0xff,0xff],0,2,22050).unwrap();
        assert_eq!(&w[44..],&[0,0x80,0xff,0x7f,1,0,0xff,0xff]);
        assert_eq!(u32::from_le_bytes(w[28..32].try_into().unwrap()),88200);
        assert!(wave(&[0,1,2],0,1,22050).is_err());
    }
    #[test]fn xbox_blocks_preserve_predictor_channel_order_and_frame_count(){
        let mut data=vec![0u8;72];data[0..2].copy_from_slice(&(-500i16).to_le_bytes());data[4..6].copy_from_slice(&500i16.to_le_bytes());
        let w=wave(&data,1,2,44100).unwrap();assert_eq!(w.len(),44+64*4);
        for frame in w[44..].chunks_exact(4){assert_eq!(frame,&[12,254,244,1]);}
        data[2]=89;assert!(wave(&data,1,2,44100).is_err());
        data[2]=0;assert!(wave(&data[..71],1,2,44100).is_err());
    }
    #[test]fn xbox_nibble_order_and_saturation_are_bounded(){
        let mut data=vec![0u8;36];data[0..2].copy_from_slice(&32760i16.to_le_bytes());data[2]=88;data[4]=0xf7;
        let w=wave(&data,1,1,22050).unwrap();let samples:Vec<_>=w[44..].chunks_exact(2).map(|p|i16::from_le_bytes([p[0],p[1]])).collect();
        assert_eq!(&samples[..3],&[32760,32767,-28671]);
    }
}
