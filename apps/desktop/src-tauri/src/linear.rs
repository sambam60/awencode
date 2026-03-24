use crate::app_env::optional_env_var;
use crate::secrets::{clear_linear_token, load_linear_token, persist_linear_token};
use base64::Engine;
use rand::{distr::Alphanumeric, RngExt};
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::OnceLock;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::Mutex;

const LINEAR_GRAPHQL_URL: &str = "https://api.linear.app/graphql";
const LINEAR_AUTHORIZE_URL: &str = "https://linear.app/oauth/authorize";
const LINEAR_TOKEN_URL: &str = "https://api.linear.app/oauth/token";
const LINEAR_SCOPE: &str = "read,write,issues:create";

static LINEAR_OAUTH_SESSIONS: OnceLock<Mutex<HashMap<String, LinearOauthSession>>> =
    OnceLock::new();

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearOauthStartResult {
    pub request_id: String,
    pub auth_url: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum LinearOauthStatusResult {
    Pending { message: Option<String> },
    Complete { user: LinearUser },
    Error { message: String },
}

#[derive(Debug, Clone, serde::Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearUser {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssue {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub url: String,
    pub state_name: Option<String>,
}

struct LinearOauthSession {
    status: LinearOauthSessionState,
}

enum LinearOauthSessionState {
    Pending,
    Complete(LinearUser),
    Error(String),
}

#[derive(Debug, Deserialize)]
struct LinearTokenResponse {
    access_token: String,
}

#[derive(Debug, Deserialize)]
struct LinearGraphqlResponse<T> {
    data: Option<T>,
    errors: Option<Vec<LinearGraphqlError>>,
}

#[derive(Debug, Deserialize)]
struct LinearGraphqlError {
    message: String,
}

#[derive(Debug, Deserialize)]
struct LinearViewerData {
    viewer: LinearUser,
}

#[derive(Debug, Deserialize)]
struct LinearAssignedIssuesData {
    viewer: LinearAssignedIssuesViewer,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinearAssignedIssuesViewer {
    assigned_issues: LinearIssueConnection,
}

#[derive(Debug, Deserialize)]
struct LinearIssueConnection {
    nodes: Vec<LinearIssueNode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinearIssueNode {
    id: String,
    identifier: String,
    title: String,
    url: String,
    state: Option<LinearIssueState>,
}

#[derive(Debug, Deserialize)]
struct LinearIssueState {
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinearIssueCreateData {
    issue_create: LinearIssueCreatePayload,
}

#[derive(Debug, Deserialize)]
struct LinearIssueCreatePayload {
    success: bool,
    issue: Option<LinearIssueNode>,
}

pub async fn linear_oauth_start() -> Result<LinearOauthStartResult, String> {
    let client_id = linear_client_id()?;
    let request_id = random_token(24);
    let state = random_token(32);
    let code_verifier = random_token(64);
    let code_challenge = code_challenge(&code_verifier);
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|err| format!("Failed to start local callback server: {err}"))?;
    let port = listener
        .local_addr()
        .map_err(|err| format!("Failed to read callback port: {err}"))?
        .port();
    let redirect_uri = format!("http://localhost:{port}/callback");

    sessions().lock().await.insert(
        request_id.clone(),
        LinearOauthSession {
            status: LinearOauthSessionState::Pending,
        },
    );

    let auth_url = reqwest::Url::parse_with_params(
        LINEAR_AUTHORIZE_URL,
        &[
            ("client_id", client_id),
            ("redirect_uri", redirect_uri.as_str()),
            ("response_type", "code"),
            ("scope", LINEAR_SCOPE),
            ("state", state.as_str()),
            ("code_challenge", code_challenge.as_str()),
            ("code_challenge_method", "S256"),
        ],
    )
    .map_err(|err| format!("Failed to build Linear authorization URL: {err}"))?
    .to_string();

    tokio::spawn(linear_oauth_listener_task(
        request_id.clone(),
        listener,
        state,
        code_verifier,
        redirect_uri,
    ));

    Ok(LinearOauthStartResult {
        request_id,
        auth_url,
    })
}

pub async fn linear_oauth_status(request_id: String) -> Result<LinearOauthStatusResult, String> {
    let sessions = sessions().lock().await;
    let Some(session) = sessions.get(&request_id) else {
        return Ok(LinearOauthStatusResult::Error {
            message: "Linear login session was not found.".to_string(),
        });
    };
    Ok(match &session.status {
        LinearOauthSessionState::Pending => LinearOauthStatusResult::Pending { message: None },
        LinearOauthSessionState::Complete(user) => {
            LinearOauthStatusResult::Complete { user: user.clone() }
        }
        LinearOauthSessionState::Error(message) => LinearOauthStatusResult::Error {
            message: message.clone(),
        },
    })
}

pub async fn linear_get_user() -> Result<Option<LinearUser>, String> {
    let Some(token) = load_linear_token()? else {
        return Ok(None);
    };
    linear_viewer_from_token(&token).await
}

pub fn linear_disconnect() -> Result<(), String> {
    clear_linear_token()
}

pub async fn linear_get_assigned_issues() -> Result<Vec<LinearIssue>, String> {
    let Some(token) = load_linear_token()? else {
        return Ok(Vec::new());
    };
    let response: LinearGraphqlResponse<LinearAssignedIssuesData> = linear_graphql(
        &token,
        r#"
        query AssignedIssues {
          viewer {
            assignedIssues(first: 50) {
              nodes {
                id
                identifier
                title
                url
                state {
                  name
                }
              }
            }
          }
        }
        "#,
        json!({}),
    )
    .await?;
    let data = response.data.ok_or_else(|| {
        linear_graphql_error_message(response.errors, "Linear did not return assigned issues.")
    })?;
    Ok(data
        .viewer
        .assigned_issues
        .nodes
        .into_iter()
        .map(linear_issue_from_node)
        .collect())
}

pub async fn linear_create_issue(
    title: String,
    description: Option<String>,
    team_id: Option<String>,
) -> Result<LinearIssue, String> {
    let Some(token) = load_linear_token()? else {
        return Err("Connect Linear before creating issues.".to_string());
    };
    let Some(team_id) = team_id.filter(|value| !value.trim().is_empty()) else {
        return Err("A Linear team is required to create an issue.".to_string());
    };
    let response: LinearGraphqlResponse<LinearIssueCreateData> = linear_graphql(
        &token,
        r#"
        mutation CreateIssue($title: String!, $description: String, $teamId: String!) {
          issueCreate(input: { title: $title, description: $description, teamId: $teamId }) {
            success
            issue {
              id
              identifier
              title
              url
              state {
                name
              }
            }
          }
        }
        "#,
        json!({
            "title": title,
            "description": description,
            "teamId": team_id,
        }),
    )
    .await?;
    let data = response.data.ok_or_else(|| {
        linear_graphql_error_message(response.errors, "Linear issue creation failed.")
    })?;
    if !data.issue_create.success {
        return Err("Linear issue creation failed.".to_string());
    }
    let issue = data
        .issue_create
        .issue
        .ok_or_else(|| "Linear did not return the created issue.".to_string())?;
    Ok(linear_issue_from_node(issue))
}

async fn linear_oauth_listener_task(
    request_id: String,
    listener: TcpListener,
    expected_state: String,
    code_verifier: String,
    redirect_uri: String,
) {
    let result =
        linear_oauth_listener_inner(listener, &expected_state, &code_verifier, &redirect_uri).await;
    let mut sessions = sessions().lock().await;
    let Some(session) = sessions.get_mut(&request_id) else {
        return;
    };
    session.status = match result {
        Ok(user) => LinearOauthSessionState::Complete(user),
        Err(message) => LinearOauthSessionState::Error(message),
    };
}

async fn linear_oauth_listener_inner(
    listener: TcpListener,
    expected_state: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<LinearUser, String> {
    let (mut socket, _) = listener
        .accept()
        .await
        .map_err(|err| format!("Failed to accept Linear callback: {err}"))?;
    let mut buffer = vec![0_u8; 8192];
    let read_len = socket
        .read(&mut buffer)
        .await
        .map_err(|err| format!("Failed to read Linear callback: {err}"))?;
    let request = String::from_utf8_lossy(&buffer[..read_len]);
    let request_line = request.lines().next().unwrap_or_default();
    let path = request_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| "Linear callback request was malformed.".to_string())?;
    let callback_url = reqwest::Url::parse(&format!("http://localhost{path}"))
        .map_err(|err| format!("Failed to parse Linear callback URL: {err}"))?;
    let query: HashMap<String, String> = callback_url
        .query_pairs()
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();

    if query.get("state").map(String::as_str) != Some(expected_state) {
        write_callback_response(
            &mut socket,
            400,
            "Linear connection failed",
            "The OAuth state did not match. You can close this window and try again.",
        )
        .await;
        return Err("Linear login failed because the returned state did not match.".to_string());
    }

    let Some(code) = query.get("code").cloned() else {
        let message = query
            .get("error_description")
            .cloned()
            .or_else(|| query.get("error").cloned())
            .unwrap_or_else(|| "Linear did not return an authorization code.".to_string());
        write_callback_response(&mut socket, 400, "Linear connection failed", &message).await;
        return Err(message);
    };

    let access_token = exchange_linear_code(&code, code_verifier, redirect_uri).await?;
    persist_linear_token(&access_token)?;
    let Some(user) = linear_viewer_from_token(&access_token).await? else {
        write_callback_response(
            &mut socket,
            400,
            "Linear connection failed",
            "Linear login succeeded, but the account details could not be loaded.",
        )
        .await;
        return Err(
            "Linear login succeeded, but the account details could not be loaded.".to_string(),
        );
    };
    write_callback_response(
        &mut socket,
        200,
        "Linear connected",
        "You can close this window and return to Awencode.",
    )
    .await;
    Ok(user)
}

async fn exchange_linear_code(
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut params = vec![
        ("code".to_string(), code.to_string()),
        ("redirect_uri".to_string(), redirect_uri.to_string()),
        ("client_id".to_string(), linear_client_id()?.to_string()),
        ("code_verifier".to_string(), code_verifier.to_string()),
        ("grant_type".to_string(), "authorization_code".to_string()),
    ];
    if !linear_client_secret().is_empty() {
        params.push((
            "client_secret".to_string(),
            linear_client_secret().to_string(),
        ));
    }
    let body = urlencoded_body(&params)?;
    let response = client
        .post(LINEAR_TOKEN_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await
        .map_err(|err| format!("Failed to exchange Linear authorization code: {err}"))?;
    if !response.status().is_success() {
        let message = response
            .text()
            .await
            .unwrap_or_else(|_| "Linear token exchange failed".to_string());
        return Err(format!("Linear token exchange failed: {message}"));
    }
    let payload: LinearTokenResponse = response
        .json()
        .await
        .map_err(|err| format!("Failed to parse Linear token response: {err}"))?;
    Ok(payload.access_token)
}

async fn linear_viewer_from_token(token: &str) -> Result<Option<LinearUser>, String> {
    let response: LinearGraphqlResponse<LinearViewerData> = linear_graphql(
        token,
        r#"
        query Viewer {
          viewer {
            id
            name
            email
          }
        }
        "#,
        json!({}),
    )
    .await?;
    let Some(data) = response.data else {
        return Ok(None);
    };
    Ok(Some(data.viewer))
}

async fn linear_graphql<T: for<'de> Deserialize<'de>>(
    token: &str,
    query: &str,
    variables: serde_json::Value,
) -> Result<LinearGraphqlResponse<T>, String> {
    let response = reqwest::Client::new()
        .post(LINEAR_GRAPHQL_URL)
        .bearer_auth(token)
        .json(&json!({
            "query": query,
            "variables": variables,
        }))
        .send()
        .await
        .map_err(|err| format!("Linear request failed: {err}"))?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        clear_linear_token()?;
        return Err("Linear access token is no longer valid. Reconnect Linear.".to_string());
    }
    if !response.status().is_success() {
        let message = response
            .text()
            .await
            .unwrap_or_else(|_| "Linear request failed".to_string());
        return Err(format!("Linear request failed: {message}"));
    }
    response
        .json::<LinearGraphqlResponse<T>>()
        .await
        .map_err(|err| format!("Failed to parse Linear response: {err}"))
}

fn linear_graphql_error_message(errors: Option<Vec<LinearGraphqlError>>, fallback: &str) -> String {
    errors
        .and_then(|items| items.into_iter().next())
        .map(|item| item.message)
        .unwrap_or_else(|| fallback.to_string())
}

fn linear_issue_from_node(node: LinearIssueNode) -> LinearIssue {
    LinearIssue {
        id: node.id,
        identifier: node.identifier,
        title: node.title,
        url: node.url,
        state_name: node.state.map(|state| state.name),
    }
}

async fn write_callback_response(
    socket: &mut tokio::net::TcpStream,
    status_code: u16,
    title: &str,
    message: &str,
) {
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>{title}</title></head><body><h1>{title}</h1><p>{message}</p></body></html>"
    );
    let response = format!(
        "HTTP/1.1 {status_code} OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = socket.write_all(response.as_bytes()).await;
    let _ = socket.shutdown().await;
}

fn sessions() -> &'static Mutex<HashMap<String, LinearOauthSession>> {
    LINEAR_OAUTH_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn linear_client_id() -> Result<&'static str, String> {
    if let Some(client_id) = optional_env_var("AWENCODE_LINEAR_CLIENT_ID") {
        return Ok(Box::leak(client_id.into_boxed_str()));
    }
    if let Some(client_id) = option_env!("AWENCODE_LINEAR_CLIENT_ID") {
        if !client_id.trim().is_empty() {
            return Ok(client_id);
        }
    }
    {
        Err(
            "Linear OAuth is not configured. Set AWENCODE_LINEAR_CLIENT_ID in apps/desktop/.env or your shell."
                .to_string(),
        )
    }
}

fn random_token(length: usize) -> String {
    rand::rng()
        .sample_iter(&Alphanumeric)
        .take(length)
        .map(char::from)
        .collect()
}

fn code_challenge(code_verifier: &str) -> String {
    let digest = Sha256::digest(code_verifier.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest)
}

fn linear_client_secret() -> &'static str {
    if let Some(client_secret) = optional_env_var("AWENCODE_LINEAR_CLIENT_SECRET") {
        return Box::leak(client_secret.into_boxed_str());
    }
    option_env!("AWENCODE_LINEAR_CLIENT_SECRET").unwrap_or("")
}

fn urlencoded_body(params: &[(String, String)]) -> Result<String, String> {
    let mut url = reqwest::Url::parse("https://awencode.invalid")
        .map_err(|err| format!("Failed to build encoded request body: {err}"))?;
    {
        let mut pairs = url.query_pairs_mut();
        for (key, value) in params {
            pairs.append_pair(key, value);
        }
    }
    url.query()
        .map(str::to_string)
        .ok_or_else(|| "Failed to encode request body.".to_string())
}
