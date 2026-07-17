const MASK64: u64 = 0xFFFFFFFFFFFFFFFF;

fn rotl64(x: u64, r: u32) -> u64 {
    ((x << r) & MASK64) | (x >> (64 - r))
}

fn fmix64(mut k: u64) -> u64 {
    k ^= k >> 33;
    k = k.wrapping_mul(0xFF51AFD7ED558CCD) & MASK64;
    k ^= k >> 33;
    k = k.wrapping_mul(0xC4CEB9FE1A85EC53) & MASK64;
    k ^= k >> 33;
    k
}

pub fn murmurhash3_x64_128_bytes(data: &[u8], seed: u64) -> [u8; 16] {
    let c1: u64 = 0x87C37B91114253D5;
    let c2: u64 = 0x4CF5AD432745937F;

    let mut h1 = seed & MASK64;
    let mut h2 = seed & MASK64;

    let nblocks = data.len() / 16;

    for i in 0..nblocks {
        let block_start = i * 16;
        let mut k1 = u64::from_le_bytes(data[block_start..block_start+8].try_into().unwrap());
        let mut k2 = u64::from_le_bytes(data[block_start+8..block_start+16].try_into().unwrap());

        k1 = k1.wrapping_mul(c1) & MASK64;
        k1 = rotl64(k1, 31);
        k1 = k1.wrapping_mul(c2) & MASK64;
        h1 ^= k1;

        h1 = rotl64(h1, 27);
        h1 = h1.wrapping_add(h2) & MASK64;
        h1 = h1.wrapping_mul(5).wrapping_add(0x52DCE729) & MASK64;

        k2 = k2.wrapping_mul(c2) & MASK64;
        k2 = rotl64(k2, 33);
        k2 = k2.wrapping_mul(c1) & MASK64;
        h2 ^= k2;

        h2 = rotl64(h2, 31);
        h2 = h2.wrapping_add(h1) & MASK64;
        h2 = h2.wrapping_mul(5).wrapping_add(0x38495AB5) & MASK64;
    }

    let tail = &data[nblocks * 16..];

    let mut k1 = 0u64;
    let mut k2 = 0u64;

    let tail_len = tail.len();
    if tail_len > 8 {
        for i in 8..tail_len {
            k2 ^= (tail[i] as u64) << (8 * (i - 8));
        }
        k2 = k2.wrapping_mul(c2) & MASK64;
        k2 = rotl64(k2, 33);
        k2 = k2.wrapping_mul(c1) & MASK64;
        h2 ^= k2;
    }

    if tail_len > 0 {
        let limit = if tail_len > 8 { 8 } else { tail_len };
        for i in 0..limit {
            k1 ^= (tail[i] as u64) << (8 * i);
        }
        k1 = k1.wrapping_mul(c1) & MASK64;
        k1 = rotl64(k1, 31);
        k1 = k1.wrapping_mul(c2) & MASK64;
        h1 ^= k1;
    }

    h1 ^= data.len() as u64;
    h2 ^= data.len() as u64;

    h1 = h1.wrapping_add(h2) & MASK64;
    h2 = h2.wrapping_add(h1) & MASK64;

    h1 = fmix64(h1);
    h2 = fmix64(h2);

    h1 = h1.wrapping_add(h2) & MASK64;
    h2 = h2.wrapping_add(h1) & MASK64;

    let mut result = [0u8; 16];
    result[0..8].copy_from_slice(&h1.to_be_bytes());
    result[8..16].copy_from_slice(&h2.to_be_bytes());
    result
}

pub fn murmur3_to_bytes(text: &str) -> [u8; 16] {
    murmurhash3_x64_128_bytes(text.as_bytes(), 0)
}

fn extract_secret_key(v_voucher: &str, secret_index: u32) -> Result<String, String> {
    let mut set_bits = Vec::new();
    for i in 0..32 {
        if (secret_index & (1 << i)) != 0 {
            set_bits.push(i);
        }
    }
    if set_bits.len() < 2 {
        return Err(format!(
            "secret_index needs at least 2 set bits, got: {}",
            secret_index
        ));
    }
    let start = set_bits[0] as usize;
    let end = set_bits[1] as usize;

    let token = if v_voucher.len() > 8 {
        &v_voucher[8..]
    } else {
        v_voucher
    };

    if start > token.len() || end > token.len() || start > end {
        return Err("extracted secret key index out of bounds".to_string());
    }

    Ok(token[start..end].to_string())
}

pub fn decrypt_captcha(v_voucher: &str, content: &str) -> Result<serde_json::Value, String> {
    use base64::Engine;
    use sha2::Digest;
    
    let decoded_bytes = base64::engine::general_purpose::STANDARD
        .decode(content)
        .map_err(|e| e.to_string())?;
        
    let parts: Vec<&[u8]> = decoded_bytes.split(|&b| b == b'|').collect();
    if parts.len() != 4 {
        return Err(format!("expected 4 parts, got {}", parts.len()));
    }
    
    let timestamp_str = String::from_utf8(parts[0].to_vec()).map_err(|e| e.to_string())?;
    let _salt_str = String::from_utf8(parts[1].to_vec()).map_err(|e| e.to_string())?;
    let secret_index_str = String::from_utf8(parts[2].to_vec()).map_err(|e| e.to_string())?;
    let encrypted_b64 = String::from_utf8(parts[3].to_vec()).map_err(|e| e.to_string())?;
    
    let secret_index = secret_index_str.parse::<u32>().map_err(|e| e.to_string())?;
    let secret_key = extract_secret_key(v_voucher, secret_index)?;
    
    let mut hasher = sha2::Sha256::new();
    hasher.update(format!("{}{}", secret_key, timestamp_str).as_bytes());
    let sha_result = hasher.finalize();
    let xor_key = &sha_result[..16];
    
    let encrypted_bytes = base64::engine::general_purpose::STANDARD
        .decode(&encrypted_b64)
        .map_err(|e| e.to_string())?;
        
    let mut raw = Vec::with_capacity(encrypted_bytes.len());
    for (i, &b) in encrypted_bytes.iter().enumerate() {
        raw.push(b ^ xor_key[i % xor_key.len()]);
    }
    
    let text = String::from_utf8(raw).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(data)
}

pub fn obfuscate_token(token: &str, mask_byte: Option<u8>, salt8: Option<[u8; 8]>) -> String {
    use base64::Engine;
    use rand::RngCore;
    let token_bytes = token.as_bytes();
    let mut rng = rand::thread_rng();
    
    let actual_salt8 = match salt8 {
        Some(s) => s,
        None => {
            let mut s = [0u8; 8];
            rng.fill_bytes(&mut s);
            s
        }
    };
    
    let actual_mask_byte = match mask_byte {
        Some(m) => m,
        None => {
            let mut m = [0u8; 1];
            rng.fill_bytes(&mut m);
            m[0]
        }
    };
    
    let mut mixed = Vec::with_capacity(token_bytes.len());
    for (i, &b) in token_bytes.iter().enumerate() {
        mixed.push(b ^ actual_mask_byte ^ actual_salt8[i % 8]);
    }
    
    let mut raw = Vec::with_capacity(1 + mixed.len() + 8);
    raw.push(actual_mask_byte);
    raw.extend_from_slice(&mixed);
    raw.extend_from_slice(&actual_salt8);
    
    base64::engine::general_purpose::STANDARD.encode(&raw)
}

#[allow(dead_code)]
pub fn encrypt_content(encrypted_token: &str, salt: &str, params: &serde_json::Value) -> Result<String, String> {
    use aes::Aes128;
    use base64::Engine;
    use cbc::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};

    let plaintext_str = serde_json::to_string(params).map_err(|e| e.to_string())?;
    let plaintext = plaintext_str.as_bytes();

    let aes_key = murmur3_to_bytes(encrypted_token);
    let iv = murmur3_to_bytes(salt);

    type Aes128CbcEnc = cbc::Encryptor<Aes128>;
    
    let mut buf = vec![0u8; plaintext.len() + 16];
    buf[..plaintext.len()].copy_from_slice(plaintext);
    
    let ct = Aes128CbcEnc::new(&aes_key.into(), &iv.into())
        .encrypt_padded_mut::<Pkcs7>(&mut buf, plaintext.len())
        .map_err(|e| e.to_string())?;
        
    Ok(base64::engine::general_purpose::STANDARD.encode(ct))
}

pub fn gen_dm_track() -> String {
    let (wh_a, wh_b, wh_c) = gen_wh(500, 420);
    let (of_a, of_b, of_c) = gen_of(0, 0);
    
    let dm_img_inter = serde_json::json!({
        "ds": [],
        "wh": [wh_a, wh_b, wh_c],
        "of": [of_a, of_b, of_c]
    }).to_string();
    
    serde_json::json!({
        "dm_img_list": [],
        "dm_img_str": "V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ",
        "dm_cover_img_str": "QU5HTEUgKEludGVsLCBJbnRlbChSKSBVSEQgR3JhcGhpY3MgRGlyZWN0M0QxMSB2c181XzAgcHNfNV8wLCBEM0QxMSlHb29nbGUgSW5jLiAoSW50ZW",
        "dm_img_inter": dm_img_inter
    }).to_string()
}

fn gen_wh(w: i32, h: i32) -> (i32, i32, i32) {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let r: i32 = rng.gen_range(0..114);
    (2 * w + 2 * h + 3 * r, 4 * w - h + r, r)
}

fn gen_of(cx: i32, cy: i32) -> (i32, i32, i32) {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let r: i32 = rng.gen_range(0..514);
    (3 * cx + 2 * cy + r, 4 * cx - 4 * cy + 2 * r, r)
}
