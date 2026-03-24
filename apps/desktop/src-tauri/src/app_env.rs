use std::path::PathBuf;
use std::sync::OnceLock;

static DOTENV_LOADED: OnceLock<()> = OnceLock::new();

pub fn optional_env_var(name: &str) -> Option<String> {
    load_dotenv_files();
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn load_dotenv_files() {
    DOTENV_LOADED.get_or_init(|| {
        for path in dotenv_candidates() {
            if path.is_file() {
                let _ = dotenvy::from_path_override(path);
            }
        }
    });
}

fn dotenv_candidates() -> Vec<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let desktop_dir = manifest_dir
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| manifest_dir.clone());
    vec![
        manifest_dir.join(".env"),
        manifest_dir.join(".env.local"),
        desktop_dir.join(".env"),
        desktop_dir.join(".env.local"),
    ]
}
