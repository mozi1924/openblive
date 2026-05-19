use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use anyhow::{anyhow, Result};
use base64::Engine;
use keyring::Entry;
use rand::RngCore;

pub fn get_or_create_master_key() -> Result<[u8; 32]> {
    let entry = Entry::new("OpenBliveStudio", "credential_master_key")?;
    if let Ok(secret) = entry.get_password() {
        let raw = base64::engine::general_purpose::STANDARD
            .decode(secret)
            .map_err(|error| anyhow!(error.to_string()))?;
        if raw.len() == 32 {
            let mut out = [0u8; 32];
            out.copy_from_slice(&raw);
            return Ok(out);
        }
    }

    let mut key = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut key);
    let encoded = base64::engine::general_purpose::STANDARD.encode(key);
    entry.set_password(&encoded)?;
    Ok(key)
}

pub fn encrypt_text(plain: &str, key: &[u8; 32]) -> Result<String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|error| anyhow!(error.to_string()))?;
    let mut nonce = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce);
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plain.as_bytes())
        .map_err(|error| anyhow!(error.to_string()))?;

    let mut payload = Vec::with_capacity(12 + ciphertext.len());
    payload.extend_from_slice(&nonce);
    payload.extend_from_slice(&ciphertext);
    Ok(base64::engine::general_purpose::STANDARD.encode(payload))
}

pub fn decrypt_text(enc: &str, key: &[u8; 32]) -> Result<String> {
    let payload = base64::engine::general_purpose::STANDARD
        .decode(enc)
        .map_err(|error| anyhow!(error.to_string()))?;
    if payload.len() < 13 {
        return Err(anyhow!("invalid encrypted payload"));
    }

    let (nonce, data) = payload.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|error| anyhow!(error.to_string()))?;
    let plain = cipher
        .decrypt(Nonce::from_slice(nonce), data)
        .map_err(|error| anyhow!(error.to_string()))?;

    String::from_utf8(plain).map_err(|error| anyhow!(error.to_string()))
}
