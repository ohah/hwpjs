/// Distribution document (배포용 문서) decryption.
///
/// Distribution documents use ViewText streams that are encrypted with AES-128 ECB.
/// Each ViewText stream starts with a HWPTAG_DISTRIBUTE_DOC_DATA record
/// (tag 28, 256 bytes of data), followed by the AES-128-ECB encrypted section data.
///
/// Algorithm:
/// 1. Skip 4-byte record header, read 256-byte distribution data
/// 2. Extract seed from first 4 bytes of distribution data
/// 3. Generate random array using MSVC rand() with odd/even pattern
/// 4. XOR bytes 4..256 of distribution data with random array to decode
/// 5. Extract 16-byte AES key from decoded data at offset (seed_low & 0x0F) + 4
/// 6. AES-128-ECB decrypt the remaining stream data
/// 7. Decompress the decrypted data (deflate)

use aes::cipher::{BlockDecrypt, KeyInit};
use aes::Aes128;

use crate::decompress::decompress_deflate;
use crate::error::HwpError;

/// Decrypt a ViewText stream from a distribution document.
///
/// The raw stream starts with a 4-byte record header + 256 bytes of distribution data,
/// followed by the AES-128-ECB encrypted (and then compressed) section data.
pub fn decrypt_viewtext(raw: &[u8], compressed: bool) -> Result<Vec<u8>, HwpError> {
    // Need at least record header (4 bytes) + distribution data (256 bytes)
    if raw.len() < 4 + 256 {
        return Err(HwpError::InternalError {
            message: "ViewText stream too short for distribution data".to_string(),
        });
    }

    // Skip 4-byte record header, take 256 bytes of distribution data
    let dist_data = &raw[4..4 + 256];

    // Extract seed from first 4 bytes of distribution data
    let seed = u32::from_le_bytes([dist_data[0], dist_data[1], dist_data[2], dist_data[3]]);

    // Generate random array using MSVC rand() with odd/even pattern
    let random_array = generate_random_array(seed);

    // XOR distribution data with random array (skip first 4 bytes = seed)
    let mut decoded = [0u8; 256];
    decoded[..4].copy_from_slice(&dist_data[..4]); // keep seed as-is
    for i in 4..256 {
        decoded[i] = dist_data[i] ^ random_array[i];
    }

    // Extract 16-byte AES key
    // offset = (first byte of decoded & 0x0F) + 4
    // Note: decoded[0] == dist_data[0] (seed's low byte, not XOR'd)
    let offset = ((decoded[0] & 0x0F) as usize) + 4;
    if offset + 16 > 256 {
        return Err(HwpError::InternalError {
            message: "Distribution key offset out of range".to_string(),
        });
    }
    let key: [u8; 16] = decoded[offset..offset + 16].try_into().unwrap();

    // The encrypted payload starts after the record header + distribution data
    let payload = &raw[4 + 256..];
    if payload.is_empty() {
        return Ok(Vec::new());
    }

    // AES-128-ECB decrypt
    let cipher = Aes128::new(&key.into());
    let mut decrypted = payload.to_vec();

    // Pad to 16-byte boundary if needed
    let padding_needed = (16 - (decrypted.len() % 16)) % 16;
    if padding_needed > 0 {
        decrypted.resize(decrypted.len() + padding_needed, padding_needed as u8);
    }

    // Decrypt in 16-byte blocks
    for chunk in decrypted.chunks_exact_mut(16) {
        let block = aes::Block::from_mut_slice(chunk);
        cipher.decrypt_block(block);
    }

    // Decompress if needed
    if compressed {
        decompress_deflate(&decrypted)
    } else {
        Ok(decrypted)
    }
}

/// Generate 256-byte random array using MSVC-compatible srand()/rand().
///
/// Per the HWP distribution document spec:
/// - Odd-numbered rand() call: value A = rand() & 0xFF
/// - Even-numbered rand() call: count B = (rand() & 0x0F) + 1
/// - Insert A into the array B times
/// - Repeat until 256 bytes are filled
fn generate_random_array(seed: u32) -> [u8; 256] {
    let mut result = [0u8; 256];
    let mut state = seed;
    let mut pos = 0;

    while pos < 256 {
        // Odd call: get value
        state = msvc_rand(state);
        let value = ((state >> 16) & 0xFF) as u8;

        // Even call: get count
        state = msvc_rand(state);
        let count = (((state >> 16) & 0x0F) + 1) as usize;

        for _ in 0..count {
            if pos >= 256 {
                break;
            }
            result[pos] = value;
            pos += 1;
        }
    }

    result
}

/// MSVC-compatible rand() state transition.
/// state = (state * 214013 + 2531011) & 0x7FFFFFFF
#[inline]
fn msvc_rand(state: u32) -> u32 {
    (state.wrapping_mul(214013).wrapping_add(2531011)) & 0x7FFF_FFFF
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_random_array_fills_256() {
        let arr = generate_random_array(12345);
        assert_eq!(arr.len(), 256);
    }

    #[test]
    fn test_random_array_deterministic() {
        let a = generate_random_array(42);
        let b = generate_random_array(42);
        assert_eq!(a, b);
    }

    #[test]
    fn test_msvc_rand_known_values() {
        // MSVC srand(1) then rand() should produce 41
        let state = msvc_rand(1);
        assert_eq!((state >> 16) & 0x7FFF, 41);
    }

    #[test]
    fn test_viewtext_too_short() {
        assert!(decrypt_viewtext(&[0u8; 100], true).is_err());
    }
}
