use bytes::Buf;
use std::io::Read;
use tauri::{AppHandle, Emitter};

pub fn decode_and_emit(app: &AppHandle, data: &[u8]) {
    let mut offset = 0usize;
    while offset + 16 <= data.len() {
        let mut cur = std::io::Cursor::new(&data[offset..]);
        let packet_len = cur.get_u32() as usize;
        let header_len = cur.get_u16() as usize;
        let proto = cur.get_u16();
        let op = cur.get_u32();
        let _ = cur.get_u32();

        if packet_len == 0 || offset + packet_len > data.len() || header_len < 16 {
            break;
        }

        let body = &data[offset + header_len..offset + packet_len];
        if proto == 2 {
            let mut decoder = flate2::read::ZlibDecoder::new(body);
            let mut out = vec![];
            if decoder.read_to_end(&mut out).is_ok() {
                decode_and_emit(app, &out);
            }
        } else if proto == 3 {
            let mut decoder = brotli::Decompressor::new(body, 4096);
            let mut out = vec![];
            if decoder.read_to_end(&mut out).is_ok() {
                decode_and_emit(app, &out);
            }
        } else if op == 5 {
            if let Ok(value) = serde_json::from_slice::<serde_json::Value>(body) {
                let _ = app.emit("danmu-event", value);
            }
        }

        offset += packet_len;
    }
}
