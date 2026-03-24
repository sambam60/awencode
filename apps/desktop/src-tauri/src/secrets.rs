use keyring::{Entry, Error as KeyringError};

const SECRET_SERVICE: &str = "com.awencode.desktop";
const OPENAI_ACCOUNT: &str = "openai";
const OPENROUTER_ACCOUNT: &str = "openrouter";
const AZURE_ACCOUNT: &str = "azure-openai";
const GITHUB_ACCOUNT: &str = "github";
const LINEAR_ACCOUNT: &str = "linear";

#[derive(Debug, Clone)]
pub struct StoredApiKeys {
    pub openai: Option<String>,
    pub openrouter: Option<String>,
    pub azure: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyStatuses {
    pub openai_configured: bool,
    pub openrouter_configured: bool,
    pub azure_configured: bool,
}

pub fn load_api_keys() -> Result<StoredApiKeys, String> {
    Ok(StoredApiKeys {
        openai: read_secret(OPENAI_ACCOUNT)?,
        openrouter: read_secret(OPENROUTER_ACCOUNT)?,
        azure: read_secret(AZURE_ACCOUNT)?,
    })
}

pub fn load_api_key_statuses() -> Result<ApiKeyStatuses, String> {
    let stored = load_api_keys()?;
    Ok(ApiKeyStatuses {
        openai_configured: stored.openai.is_some(),
        openrouter_configured: stored.openrouter.is_some(),
        azure_configured: stored.azure.is_some(),
    })
}

pub fn persist_api_key_updates(
    openai: Option<&str>,
    openrouter: Option<&str>,
    azure: Option<&str>,
) -> Result<StoredApiKeys, String> {
    if let Some(value) = openai {
        write_secret(OPENAI_ACCOUNT, value)?;
    }
    if let Some(value) = openrouter {
        write_secret(OPENROUTER_ACCOUNT, value)?;
    }
    if let Some(value) = azure {
        write_secret(AZURE_ACCOUNT, value)?;
    }

    load_api_keys()
}

pub fn load_github_token() -> Result<Option<String>, String> {
    read_secret(GITHUB_ACCOUNT)
}

pub fn persist_github_token(value: &str) -> Result<(), String> {
    write_secret(GITHUB_ACCOUNT, value)
}

pub fn clear_github_token() -> Result<(), String> {
    write_secret(GITHUB_ACCOUNT, "")
}

pub fn load_linear_token() -> Result<Option<String>, String> {
    read_secret(LINEAR_ACCOUNT)
}

pub fn persist_linear_token(value: &str) -> Result<(), String> {
    write_secret(LINEAR_ACCOUNT, value)
}

pub fn clear_linear_token() -> Result<(), String> {
    write_secret(LINEAR_ACCOUNT, "")
}

fn keyring_entry(account: &str) -> Result<Entry, String> {
    Entry::new(SECRET_SERVICE, account)
        .map_err(|err| format!("Failed to access secure storage entry for {account}: {err}"))
}

fn read_secret(account: &str) -> Result<Option<String>, String> {
    let entry = keyring_entry(account)?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(err) => Err(format!(
            "Failed to read {account} credential from secure storage: {err}"
        )),
    }
}

fn write_secret(account: &str, value: &str) -> Result<(), String> {
    let entry = keyring_entry(account)?;
    if value.trim().is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(err) => Err(format!(
                "Failed to delete {account} credential from secure storage: {err}"
            )),
        }
    } else {
        entry
            .set_password(value)
            .map_err(|err| format!("Failed to store {account} credential in secure storage: {err}"))
    }
}
