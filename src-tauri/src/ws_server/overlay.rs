use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use super::constants::OVERLAY_FALLBACK_INDEX;

pub(in crate::ws_server) fn sanitize_overlay_subpath(path: &str) -> String {
    let clean = path.trim().trim_start_matches('/').replace('\\', "/");
    clean
        .split('/')
        .filter(|segment| !segment.is_empty() && *segment != "." && *segment != "..")
        .collect::<Vec<_>>()
        .join("/")
}

fn overlay_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    let mut push_unique = |path: PathBuf| {
        if !roots.contains(&path) {
            roots.push(path);
        }
    };

    if let Ok(resource_dir) = app.path().resource_dir() {
        push_unique(resource_dir.clone());
        push_unique(resource_dir.join("dist"));
        push_unique(resource_dir.join("overlay-compat").join("dist"));
        // Tauri v2 may place `bundle.resources` under `Resources/_up_/...`.
        push_unique(resource_dir.join("_up_"));
        push_unique(resource_dir.join("_up_").join("dist"));
        push_unique(resource_dir.join("_up_").join("overlay-compat").join("dist"));
    }
    if let Ok(cwd) = std::env::current_dir() {
        push_unique(cwd.join("dist"));
        push_unique(cwd.join("overlay-compat").join("dist"));
        if let Some(parent) = cwd.parent() {
            push_unique(parent.join("dist"));
            push_unique(parent.join("overlay-compat").join("dist"));
        }
    }
    roots
}

pub(in crate::ws_server) async fn serve_overlay_path(
    app: &AppHandle,
    rel_path: &Path,
    spa_fallback: bool,
) -> Response {
    for root in overlay_roots(app) {
        let target = root.join(rel_path);
        if let Ok(bytes) = tokio::fs::read(&target).await {
            let mut response = (StatusCode::OK, bytes).into_response();
            let mime = infer_mime(&target);
            response
                .headers_mut()
                .insert("content-type", HeaderValue::from_static(mime));
            return response;
        }
    }

    if spa_fallback {
        for root in overlay_roots(app) {
            let fallback = root.join(OVERLAY_FALLBACK_INDEX);
            if let Ok(bytes) = tokio::fs::read(&fallback).await {
                let mut response = (StatusCode::OK, bytes).into_response();
                response.headers_mut().insert(
                    "content-type",
                    HeaderValue::from_static("text/html; charset=utf-8"),
                );
                return response;
            }
        }
    }

    (
        StatusCode::NOT_FOUND,
        "overlay assets not found, please run `pnpm build:overlay`",
    )
        .into_response()
}

fn infer_mime(path: &Path) -> &'static str {
    match path.extension().and_then(OsStr::to_str).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" => "application/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "map" => "application/json; charset=utf-8",
        _ => "application/octet-stream",
    }
}
