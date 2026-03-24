use crate::app_env::optional_env_var;
use crate::secrets::{clear_github_token, load_github_token, persist_github_token};
use reqwest::header::{ACCEPT, AUTHORIZATION};
use serde::Deserialize;
use std::collections::HashSet;
use std::path::Path;

const GITHUB_API_BASE: &str = "https://api.github.com";
const GITHUB_OAUTH_DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const GITHUB_OAUTH_ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const GITHUB_USER_AGENT: &str = "awencode-desktop";

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDeviceFlowStartResult {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub interval: u64,
    pub expires_in: u64,
}

#[derive(Debug, serde::Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum GitHubDeviceFlowPollResult {
    Pending {
        interval: u64,
        message: Option<String>,
    },
    Complete {
        user: GitHubUser,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, serde::Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPrStatus {
    pub checks_state: GitHubChecksState,
    pub approvals: u32,
    pub comments: u32,
    pub mergeable: bool,
    pub pr_number: Option<u64>,
    pub pr_url: Option<String>,
}

#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubChecksState {
    Success,
    Failure,
    Pending,
    None,
}

#[derive(Debug, Deserialize)]
struct GitHubDeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    interval: Option<u64>,
    expires_in: u64,
}

#[derive(Debug, Deserialize)]
struct GitHubTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubPullRequest {
    number: u64,
    html_url: String,
    mergeable: Option<bool>,
    comments: u32,
    review_comments: u32,
    head: GitHubPullRequestHead,
}

#[derive(Debug, Deserialize)]
struct GitHubPullRequestHead {
    sha: String,
}

#[derive(Debug, Deserialize)]
struct GitHubReview {
    state: String,
    user: Option<GitHubReviewUser>,
}

#[derive(Debug, Deserialize)]
struct GitHubReviewUser {
    login: String,
}

#[derive(Debug, Deserialize)]
struct GitHubCheckRunsResponse {
    total_count: u32,
    check_runs: Vec<GitHubCheckRun>,
}

#[derive(Debug, Deserialize)]
struct GitHubCheckRun {
    status: String,
    conclusion: Option<String>,
}

pub async fn github_device_flow_start() -> Result<GitHubDeviceFlowStartResult, String> {
    let client_id = github_client_id()?;
    let client = github_http_client()?;
    let response = client
        .post(GITHUB_OAUTH_DEVICE_CODE_URL)
        .header(ACCEPT, "application/json")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(urlencoded_body(&[
            ("client_id", client_id),
            ("scope", "repo"),
        ])?)
        .send()
        .await
        .map_err(|err| format!("Failed to start GitHub login: {err}"))?;
    if !response.status().is_success() {
        let message = response
            .text()
            .await
            .unwrap_or_else(|_| "GitHub login start failed".to_string());
        return Err(format!("Failed to start GitHub login: {message}"));
    }
    let payload: GitHubDeviceCodeResponse = response
        .json()
        .await
        .map_err(|err| format!("Failed to parse GitHub login response: {err}"))?;
    Ok(GitHubDeviceFlowStartResult {
        device_code: payload.device_code,
        user_code: payload.user_code,
        verification_uri: payload.verification_uri,
        interval: payload.interval.unwrap_or(5),
        expires_in: payload.expires_in,
    })
}

pub async fn github_device_flow_poll(
    device_code: String,
) -> Result<GitHubDeviceFlowPollResult, String> {
    let client_id = github_client_id()?;
    let client = github_http_client()?;
    let response = client
        .post(GITHUB_OAUTH_ACCESS_TOKEN_URL)
        .header(ACCEPT, "application/json")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(urlencoded_body(&[
            ("client_id", client_id),
            ("device_code", device_code.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])?)
        .send()
        .await
        .map_err(|err| format!("Failed to check GitHub login: {err}"))?;
    if !response.status().is_success() {
        let message = response
            .text()
            .await
            .unwrap_or_else(|_| "GitHub login polling failed".to_string());
        return Err(format!("Failed to check GitHub login: {message}"));
    }
    let payload: GitHubTokenResponse = response
        .json()
        .await
        .map_err(|err| format!("Failed to parse GitHub login poll response: {err}"))?;
    if let Some(access_token) = payload.access_token {
        persist_github_token(&access_token)?;
        let Some(user) = github_get_user_from_token(&access_token).await? else {
            return Err("GitHub login succeeded but user details could not be loaded".to_string());
        };
        return Ok(GitHubDeviceFlowPollResult::Complete { user });
    }

    match payload.error.as_deref() {
        Some("authorization_pending") => Ok(GitHubDeviceFlowPollResult::Pending {
            interval: 5,
            message: payload.error_description,
        }),
        Some("slow_down") => Ok(GitHubDeviceFlowPollResult::Pending {
            interval: 10,
            message: payload.error_description,
        }),
        Some("expired_token") | Some("access_denied") => Ok(GitHubDeviceFlowPollResult::Error {
            message: payload
                .error_description
                .unwrap_or_else(|| "GitHub login expired. Please start again.".to_string()),
        }),
        Some(other) => Ok(GitHubDeviceFlowPollResult::Error {
            message: payload
                .error_description
                .unwrap_or_else(|| format!("GitHub login failed: {other}")),
        }),
        None => Ok(GitHubDeviceFlowPollResult::Error {
            message: "GitHub login did not return an access token.".to_string(),
        }),
    }
}

pub async fn github_get_user() -> Result<Option<GitHubUser>, String> {
    let Some(token) = load_github_token()? else {
        return Ok(None);
    };
    github_get_user_from_token(&token).await
}

pub fn github_disconnect() -> Result<(), String> {
    clear_github_token()
}

pub async fn github_get_pr_status(path: String) -> Result<Option<GitHubPrStatus>, String> {
    let Some(token) = load_github_token()? else {
        return Ok(None);
    };
    let repo_context = resolve_repo_context(Path::new(&path))?;
    let Some((owner, repo)) = parse_github_repo(&repo_context.origin_url) else {
        return Ok(None);
    };
    let client = github_http_client()?;
    let pulls_url = format!(
        "{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls?head={owner}:{}&state=open&per_page=1",
        repo_context.branch
    );
    let pulls: Vec<GitHubPullRequest> = github_get_json(&client, &token, &pulls_url).await?;
    let Some(pr) = pulls.into_iter().next() else {
        return Ok(None);
    };

    let reviews_url = format!(
        "{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls/{}/reviews?per_page=100",
        pr.number
    );
    let reviews: Vec<GitHubReview> = github_get_json(&client, &token, &reviews_url).await?;
    let approvals = approved_review_count(&reviews) as u32;

    let checks_url = format!(
        "{GITHUB_API_BASE}/repos/{owner}/{repo}/commits/{}/check-runs?per_page=100",
        pr.head.sha
    );
    let checks_response = github_get_json::<GitHubCheckRunsResponse>(&client, &token, &checks_url)
        .await
        .ok();
    let checks_state = determine_checks_state(checks_response.as_ref());

    Ok(Some(GitHubPrStatus {
        checks_state,
        approvals,
        comments: pr.comments + pr.review_comments,
        mergeable: pr.mergeable.unwrap_or(false),
        pr_number: Some(pr.number),
        pr_url: Some(pr.html_url),
    }))
}

async fn github_get_user_from_token(token: &str) -> Result<Option<GitHubUser>, String> {
    let client = github_http_client()?;
    let response = client
        .get(format!("{GITHUB_API_BASE}/user"))
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .send()
        .await
        .map_err(|err| format!("Failed to load GitHub account: {err}"))?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        clear_github_token()?;
        return Ok(None);
    }
    if !response.status().is_success() {
        let message = response
            .text()
            .await
            .unwrap_or_else(|_| "GitHub account request failed".to_string());
        return Err(format!("Failed to load GitHub account: {message}"));
    }

    let user = response
        .json::<GitHubUser>()
        .await
        .map_err(|err| format!("Failed to parse GitHub account: {err}"))?;
    Ok(Some(user))
}

async fn github_get_json<T: for<'de> Deserialize<'de>>(
    client: &reqwest::Client,
    token: &str,
    url: &str,
) -> Result<T, String> {
    let response = client
        .get(url)
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|err| format!("GitHub request failed: {err}"))?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        clear_github_token()?;
        return Err("GitHub access token is no longer valid. Reconnect GitHub.".to_string());
    }
    if !response.status().is_success() {
        let message = response
            .text()
            .await
            .unwrap_or_else(|_| "GitHub request failed".to_string());
        return Err(format!("GitHub request failed: {message}"));
    }
    response
        .json::<T>()
        .await
        .map_err(|err| format!("Failed to parse GitHub response: {err}"))
}

fn github_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(GITHUB_USER_AGENT)
        .build()
        .map_err(|err| format!("Failed to create GitHub client: {err}"))
}

fn urlencoded_body(params: &[(&str, &str)]) -> Result<String, String> {
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

fn github_client_id() -> Result<&'static str, String> {
    if let Some(client_id) = optional_env_var("AWENCODE_GITHUB_CLIENT_ID") {
        return Ok(Box::leak(client_id.into_boxed_str()));
    }
    if let Some(client_id) = option_env!("AWENCODE_GITHUB_CLIENT_ID") {
        if !client_id.trim().is_empty() {
            return Ok(client_id);
        }
    }
    {
        Err(
            "GitHub OAuth is not configured. Set AWENCODE_GITHUB_CLIENT_ID in apps/desktop/.env or your shell."
                .to_string(),
        )
    }
}

fn approved_review_count(reviews: &[GitHubReview]) -> usize {
    let mut approved_users = HashSet::new();
    for review in reviews {
        if review.state.eq_ignore_ascii_case("approved") {
            if let Some(user) = &review.user {
                approved_users.insert(user.login.as_str());
            }
        }
    }
    approved_users.len()
}

fn determine_checks_state(checks: Option<&GitHubCheckRunsResponse>) -> GitHubChecksState {
    let Some(checks) = checks else {
        return GitHubChecksState::None;
    };
    if checks.total_count == 0 {
        return GitHubChecksState::None;
    }
    if checks
        .check_runs
        .iter()
        .any(|run| !run.status.eq_ignore_ascii_case("completed"))
    {
        return GitHubChecksState::Pending;
    }
    if checks.check_runs.iter().any(|run| {
        !matches!(
            run.conclusion.as_deref(),
            Some("success" | "neutral" | "skipped")
        )
    }) {
        return GitHubChecksState::Failure;
    }
    GitHubChecksState::Success
}

struct RepoContext {
    branch: String,
    origin_url: String,
}

fn resolve_repo_context(path: &Path) -> Result<RepoContext, String> {
    if !path.is_dir() {
        return Err("Not a directory".to_string());
    }
    let branch = run_git(path, ["rev-parse", "--abbrev-ref", "HEAD"])?;
    let origin_url = run_git(path, ["remote", "get-url", "origin"])?;
    Ok(RepoContext { branch, origin_url })
}

fn run_git<const N: usize>(path: &Path, args: [&str; N]) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(path)
        .output()
        .map_err(|err| format!("Failed to run git: {err}"))?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if message.is_empty() {
            "git command failed".to_string()
        } else {
            message
        });
    }
    let value = String::from_utf8(output.stdout)
        .map_err(|err| format!("Failed to read git output: {err}"))?;
    Ok(value.trim().to_string())
}

fn parse_github_repo(origin_url: &str) -> Option<(String, String)> {
    let trimmed = origin_url.trim().trim_end_matches(".git");
    let repo_path = trimmed.strip_prefix("git@github.com:").or_else(|| {
        trimmed
            .strip_prefix("https://github.com/")
            .or_else(|| trimmed.strip_prefix("http://github.com/"))
    })?;
    let mut parts = repo_path.split('/');
    let owner = parts.next()?.trim();
    let repo = parts.next()?.trim();
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some((owner.to_string(), repo.to_string()))
}
