use std::path::PathBuf;

fn main() {
    if let Err(e) = assert_codex_sidecar_present() {
        panic!("{e}");
    }
    tauri_build::build();
}

/// Tauri `bundle.externalBin` requires `binaries/codex-app-server-<TARGET>` to exist before
/// `tauri_build::build()` runs. Build that artifact out-of-band (`pnpm run prepare:codex-app-server`
/// or CI cache + prepare on cache miss) — do not compile codex here on every desktop build.
fn assert_codex_sidecar_present() -> Result<(), String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let triple = std::env::var("TARGET").map_err(|_| "TARGET not set (build script)")?;
    let ext = if triple.contains("windows") {
        ".exe"
    } else {
        ""
    };
    let dest = manifest_dir
        .join("binaries")
        .join(format!("codex-app-server-{triple}{ext}"));
    if dest.is_file() {
        return Ok(());
    }

    Err(format!(
        "Missing codex-app-server sidecar for target {triple} (expected {}).\n\
         From apps/desktop run: pnpm run prepare:codex-app-server\n\
         (Set TARGET when cross-compiling, e.g. TARGET=x86_64-apple-darwin.)\n\
         In CI, restore cache for apps/desktop/src-tauri/binaries or run prepare when the cache misses.",
        dest.display()
    ))
}
