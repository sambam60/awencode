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
const DEFAULT_LINEAR_REDIRECT_URI: &str = "http://localhost:45671/callback";

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
    pub state_type: Option<String>,
    pub team_id: Option<String>,
    pub team_name: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearTeam {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearWorkflowStateSummary {
    pub id: String,
    pub name: String,
    pub team_id: String,
    pub team_name: String,
    pub state_type: Option<String>,
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
struct LinearTeamsData {
    teams: LinearTeamConnection,
}

#[derive(Debug, Deserialize)]
struct LinearTeamConnection {
    nodes: Vec<LinearTeamNode>,
}

#[derive(Debug, Clone, Deserialize)]
struct LinearTeamNode {
    id: String,
    name: String,
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinearIssueNode {
    id: String,
    identifier: String,
    title: String,
    url: String,
    state: Option<LinearIssueState>,
    team: Option<LinearIssueTeam>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinearIssueState {
    id: Option<String>,
    name: String,
    #[serde(rename = "type")]
    state_type: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct LinearIssueTeam {
    id: String,
    name: Option<String>,
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

#[derive(Debug, Deserialize)]
struct LinearIssueLookupData {
    issue: Option<LinearIssueNode>,
}

#[derive(Debug, Deserialize)]
struct LinearIssueSearchData {
    issues: LinearIssueConnection,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinearIssueUpdateData {
    issue_update: LinearIssueUpdatePayload,
}

#[derive(Debug, Deserialize)]
struct LinearIssueUpdatePayload {
    success: bool,
    issue: Option<LinearIssueNode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinearWorkflowStatesData {
    workflow_states: LinearWorkflowStateConnection,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinearWorkflowStateConnection {
    nodes: Vec<LinearWorkflowStateNode>,
}

#[derive(Debug, Clone, Deserialize)]
struct LinearWorkflowStateNode {
    id: String,
    name: String,
    #[serde(rename = "type")]
    state_type: Option<String>,
    position: Option<f64>,
}

pub async fn linear_oauth_start() -> Result<LinearOauthStartResult, String> {
    let client_id = linear_client_id()?;
    let request_id = random_token(24);
    let state = random_token(32);
    let code_verifier = random_token(64);
    let code_challenge = code_challenge(&code_verifier);
    let redirect_uri = linear_redirect_uri()?;
    let listener = TcpListener::bind(linear_callback_bind_addr(&redirect_uri)?)
        .await
        .map_err(|err| format!("Failed to start local callback server: {err}"))?;

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

pub async fn linear_get_teams() -> Result<Vec<LinearTeam>, String> {
    let Some(token) = load_linear_token()? else {
        return Err("Connect Linear before listing teams.".to_string());
    };
    linear_teams_from_token(&token).await
}

pub async fn linear_get_workflow_states() -> Result<Vec<LinearWorkflowStateSummary>, String> {
    let Some(token) = load_linear_token()? else {
        return Err("Connect Linear before listing workflow states.".to_string());
    };
    let teams = linear_teams_from_token(&token).await?;
    let mut states = Vec::new();
    for team in teams {
        let mut team_states = linear_workflow_states(&token, &team.id).await?;
        team_states.sort_by(|a, b| {
            let a_pos = a.position.unwrap_or(f64::INFINITY);
            let b_pos = b.position.unwrap_or(f64::INFINITY);
            a_pos
                .partial_cmp(&b_pos)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.name.cmp(&b.name))
        });
        states.extend(
            team_states
                .into_iter()
                .map(|state| LinearWorkflowStateSummary {
                    id: state.id,
                    name: state.name,
                    team_id: team.id.clone(),
                    team_name: team.name.clone(),
                    state_type: state.state_type,
                }),
        );
    }
    Ok(states)
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
                team {
                  id
                  name
                }
                state {
                  id
                  name
                  type
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
    team: Option<String>,
) -> Result<LinearIssue, String> {
    let Some(token) = load_linear_token()? else {
        return Err("Connect Linear before creating issues.".to_string());
    };
    let team_id = resolve_linear_team_id(&token, team).await?;
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
              team {
                id
                name
              }
              state {
                id
                name
                type
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

pub async fn linear_get_issue(issue_id: String) -> Result<LinearIssue, String> {
    let Some(token) = load_linear_token()? else {
        return Err("Connect Linear before linking issues.".to_string());
    };
    let issue = linear_issue_node_by_id(&token, &issue_id).await?;
    Ok(linear_issue_from_node(issue))
}

pub async fn linear_update_issue_state(
    issue_id: String,
    awencode_status: String,
    preferred_state_name: Option<String>,
) -> Result<LinearIssue, String> {
    let Some(token) = load_linear_token()? else {
        return Err("Connect Linear before syncing issue state.".to_string());
    };
    let issue = linear_issue_node_by_id(&token, &issue_id).await?;
    let team_id = issue
        .team
        .as_ref()
        .map(|team| team.id.clone())
        .ok_or_else(|| format!("Linear issue {issue_id} did not include a team."))?;
    let workflow_state = linear_target_workflow_state(
        &token,
        &team_id,
        &awencode_status,
        preferred_state_name.as_deref(),
    )
    .await?;
    if issue.state.as_ref().and_then(|state| state.id.as_deref())
        == Some(workflow_state.id.as_str())
    {
        return Ok(linear_issue_from_node(issue));
    }
    let response: LinearGraphqlResponse<LinearIssueUpdateData> = linear_graphql(
        &token,
        r#"
        mutation UpdateIssueState($id: String!, $stateId: String!) {
          issueUpdate(id: $id, input: { stateId: $stateId }) {
            success
            issue {
              id
              identifier
              title
              url
              team {
                id
                name
              }
              state {
                id
                name
                type
              }
            }
          }
        }
        "#,
        json!({
            "id": issue_id,
            "stateId": workflow_state.id,
        }),
    )
    .await?;
    let data = response.data.ok_or_else(|| {
        linear_graphql_error_message(response.errors, "Linear issue update failed.")
    })?;
    if !data.issue_update.success {
        return Err("Linear issue update failed.".to_string());
    }
    let issue = data
        .issue_update
        .issue
        .ok_or_else(|| "Linear did not return the updated issue.".to_string())?;
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

async fn linear_teams_from_token(token: &str) -> Result<Vec<LinearTeam>, String> {
    let response: LinearGraphqlResponse<LinearTeamsData> = linear_graphql(
        token,
        r#"
        query Teams {
          teams {
            nodes {
              id
              name
            }
          }
        }
        "#,
        json!({}),
    )
    .await?;
    let data = response.data.ok_or_else(|| {
        linear_graphql_error_message(response.errors, "Linear did not return teams.")
    })?;
    Ok(data
        .teams
        .nodes
        .into_iter()
        .map(|team| LinearTeam {
            id: team.id,
            name: team.name,
        })
        .collect())
}

async fn resolve_linear_team_id(token: &str, raw_team: Option<String>) -> Result<String, String> {
    let teams = linear_teams_from_token(token).await?;
    if teams.is_empty() {
        return Err("No Linear teams are available for this account.".to_string());
    }

    let query = raw_team.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });

    if let Some(query) = query {
        if let Some(team) = teams.iter().find(|team| team.id == query) {
            return Ok(team.id.clone());
        }

        let exact_matches: Vec<&LinearTeam> = teams
            .iter()
            .filter(|team| team.name.eq_ignore_ascii_case(&query))
            .collect();
        if exact_matches.len() == 1 {
            return Ok(exact_matches[0].id.clone());
        }

        let lowered = query.to_lowercase();
        let partial_matches: Vec<&LinearTeam> = teams
            .iter()
            .filter(|team| team.name.to_lowercase().contains(&lowered))
            .collect();
        if partial_matches.len() == 1 {
            return Ok(partial_matches[0].id.clone());
        }

        return Err(format!(
            "Couldn't resolve Linear team \"{query}\". Available teams: {}",
            linear_team_names(&teams)
        ));
    }

    if teams.len() == 1 {
        return Ok(teams[0].id.clone());
    }

    Err(format!(
        "A Linear team is required. Available teams: {}",
        linear_team_names(&teams)
    ))
}

async fn linear_issue_node_by_id(token: &str, issue_id: &str) -> Result<LinearIssueNode, String> {
    let response: LinearGraphqlResponse<LinearIssueLookupData> = linear_graphql(
        token,
        r#"
        query Issue($id: String!) {
          issue(id: $id) {
            id
            identifier
            title
            url
            team {
              id
              name
            }
            state {
              id
              name
              type
            }
          }
        }
        "#,
        json!({
            "id": issue_id,
        }),
    )
    .await?;
    let data = response.data.ok_or_else(|| {
        linear_graphql_error_message(
            response.errors,
            "Linear did not return the requested issue.",
        )
    })?;
    if let Some(issue) = data.issue {
        return Ok(issue);
    }

    let response: LinearGraphqlResponse<LinearIssueSearchData> = linear_graphql(
        token,
        r#"
        query IssuesByIdentifier($identifier: String!) {
          issues(filter: { identifier: { eq: $identifier } }) {
            nodes {
              id
              identifier
              title
              url
              team {
                id
                name
              }
              state {
                id
                name
                type
              }
            }
          }
        }
        "#,
        json!({
            "identifier": issue_id,
        }),
    )
    .await?;
    let data = response.data.ok_or_else(|| {
        linear_graphql_error_message(
            response.errors,
            "Linear did not return the requested issue.",
        )
    })?;
    data.issues
        .nodes
        .into_iter()
        .next()
        .ok_or_else(|| format!("Linear issue {issue_id} was not found."))
}

async fn linear_workflow_states(
    token: &str,
    team_id: &str,
) -> Result<Vec<LinearWorkflowStateNode>, String> {
    let response: LinearGraphqlResponse<LinearWorkflowStatesData> = linear_graphql(
        token,
        r#"
        query WorkflowStates($teamId: ID!) {
          workflowStates(filter: {
            team: { id: { eq: $teamId } }
          }) {
            nodes {
              id
              name
              type
              position
            }
          }
        }
        "#,
        json!({
            "teamId": team_id,
        }),
    )
    .await?;
    let data = response.data.ok_or_else(|| {
        linear_graphql_error_message(response.errors, "Linear did not return workflow states.")
    })?;
    Ok(data.workflow_states.nodes)
}

async fn linear_target_workflow_state(
    token: &str,
    team_id: &str,
    awencode_status: &str,
    preferred_state_name: Option<&str>,
) -> Result<LinearWorkflowStateNode, String> {
    let mut states = linear_workflow_states(token, team_id).await?;
    if states.is_empty() {
        return Err("No Linear workflow states were found for this team.".to_string());
    }
    states.sort_by(|a, b| {
        let a_pos = a.position.unwrap_or(f64::INFINITY);
        let b_pos = b.position.unwrap_or(f64::INFINITY);
        a_pos
            .partial_cmp(&b_pos)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.name.cmp(&b.name))
    });

    if let Some(preferred_state_name) = preferred_state_name.and_then(trimmed_non_empty) {
        return find_state_by_exact_name(&states, preferred_state_name)
            .cloned()
            .ok_or_else(|| {
                format!(
                    "Configured Linear state \"{preferred_state_name}\" was not found for this team."
                )
            });
    }

    pick_linear_workflow_state(&states, awencode_status).cloned().ok_or_else(|| {
        format!("No matching Linear workflow state was found for Awencode status \"{awencode_status}\".")
    })
}

fn pick_linear_workflow_state<'a>(
    states: &'a [LinearWorkflowStateNode],
    awencode_status: &str,
) -> Option<&'a LinearWorkflowStateNode> {
    match awencode_status {
        "review" => find_state_by_name(
            states,
            &[
                "in review",
                "review",
                "qa",
                "testing",
                "verify",
                "verification",
                "ready for review",
            ],
        )
        .or_else(|| find_state_by_type(states, "started")),
        "active" => find_state_by_name(
            states,
            &["in progress", "progress", "started", "doing", "working"],
        )
        .or_else(|| find_state_by_type(states, "started")),
        "deployed" => {
            find_completed_state(states).or_else(|| find_state_by_type(states, "completed"))
        }
        _ => find_state_by_name(
            states,
            &["triage", "backlog", "todo", "to do", "queued", "next up"],
        )
        .or_else(|| find_state_by_type(states, "unstarted")),
    }
}

fn find_state_by_name<'a>(
    states: &'a [LinearWorkflowStateNode],
    needles: &[&str],
) -> Option<&'a LinearWorkflowStateNode> {
    states.iter().find(|state| {
        let name = state.name.to_lowercase();
        needles.iter().any(|needle| name.contains(needle))
    })
}

fn find_state_by_exact_name<'a>(
    states: &'a [LinearWorkflowStateNode],
    name: &str,
) -> Option<&'a LinearWorkflowStateNode> {
    states
        .iter()
        .find(|state| state.name.eq_ignore_ascii_case(name))
}

fn find_state_by_type<'a>(
    states: &'a [LinearWorkflowStateNode],
    state_type: &str,
) -> Option<&'a LinearWorkflowStateNode> {
    states
        .iter()
        .find(|state| state.state_type.as_deref() == Some(state_type))
}

fn find_completed_state(states: &[LinearWorkflowStateNode]) -> Option<&LinearWorkflowStateNode> {
    let negative = [
        "canceled",
        "cancelled",
        "duplicate",
        "declined",
        "won't",
        "wont",
        "not doing",
    ];
    let preferred = [
        "done",
        "completed",
        "complete",
        "shipped",
        "deployed",
        "closed",
    ];
    states
        .iter()
        .find(|state| {
            let name = state.name.to_lowercase();
            preferred.iter().any(|needle| name.contains(needle))
                && !negative.iter().any(|needle| name.contains(needle))
        })
        .or_else(|| {
            states.iter().find(|state| {
                state.state_type.as_deref() == Some("completed")
                    && !negative
                        .iter()
                        .any(|needle| state.name.to_lowercase().contains(needle))
            })
        })
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
    let body = response
        .text()
        .await
        .map_err(|err| format!("Failed to read Linear response body: {err}"))?;
    serde_json::from_str::<LinearGraphqlResponse<T>>(&body).map_err(|err| {
        let preview = if body.chars().count() > 600 {
            format!("{}...", body.chars().take(600).collect::<String>())
        } else {
            body
        };
        format!("Failed to parse Linear response: {err}. Body: {preview}")
    })
}

fn linear_graphql_error_message(errors: Option<Vec<LinearGraphqlError>>, fallback: &str) -> String {
    errors
        .and_then(|items| items.into_iter().next())
        .map(|item| item.message)
        .unwrap_or_else(|| fallback.to_string())
}

fn linear_team_names(teams: &[LinearTeam]) -> String {
    teams
        .iter()
        .map(|team| team.name.as_str())
        .collect::<Vec<_>>()
        .join(", ")
}

fn trimmed_non_empty(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn linear_issue_from_node(node: LinearIssueNode) -> LinearIssue {
    LinearIssue {
        id: node.id,
        identifier: node.identifier,
        title: node.title,
        url: node.url,
        state_name: node.state.as_ref().map(|state| state.name.clone()),
        state_type: node.state.and_then(|state| state.state_type),
        team_id: node.team.as_ref().map(|team| team.id.clone()),
        team_name: node.team.and_then(|team| team.name),
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

fn linear_redirect_uri() -> Result<String, String> {
    if let Some(redirect_uri) = optional_env_var("AWENCODE_LINEAR_REDIRECT_URI") {
        validate_linear_redirect_uri(&redirect_uri)?;
        return Ok(redirect_uri);
    }
    if let Some(redirect_uri) = option_env!("AWENCODE_LINEAR_REDIRECT_URI") {
        let trimmed = redirect_uri.trim();
        if !trimmed.is_empty() {
            validate_linear_redirect_uri(trimmed)?;
            return Ok(trimmed.to_string());
        }
    }
    Ok(DEFAULT_LINEAR_REDIRECT_URI.to_string())
}

fn linear_callback_bind_addr(redirect_uri: &str) -> Result<String, String> {
    let parsed = reqwest::Url::parse(redirect_uri)
        .map_err(|err| format!("Invalid Linear redirect URI: {err}"))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "Linear redirect URI must include a host.".to_string())?;
    let port = parsed
        .port_or_known_default()
        .ok_or_else(|| "Linear redirect URI must include a valid port.".to_string())?;
    match host {
        "localhost" | "127.0.0.1" => Ok(format!("127.0.0.1:{port}")),
        _ => Err("Linear redirect URI must use localhost or 127.0.0.1.".to_string()),
    }
}

fn validate_linear_redirect_uri(redirect_uri: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(redirect_uri)
        .map_err(|err| format!("Invalid Linear redirect URI: {err}"))?;
    if parsed.scheme() != "http" {
        return Err("Linear redirect URI must use http.".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "Linear redirect URI must include a host.".to_string())?;
    if !matches!(host, "localhost" | "127.0.0.1") {
        return Err("Linear redirect URI must use localhost or 127.0.0.1.".to_string());
    }
    if parsed.port_or_known_default().is_none() {
        return Err("Linear redirect URI must include a port.".to_string());
    }
    if parsed.path().is_empty() || parsed.path() == "/" {
        return Err("Linear redirect URI must include a callback path.".to_string());
    }
    Ok(())
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
