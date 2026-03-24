use super::AuthRequestTelemetryContext;
use super::ModelClient;
use super::PendingUnauthorizedRetry;
use super::UnauthorizedRecoveryExecution;
use super::X_CODEX_TURN_METADATA_HEADER;
use super::X_CODEX_TURN_STATE_HEADER;
use super::sanitize_openrouter_responses_tools;
use crate::client_common::Prompt;
use crate::client_common::tools::FreeformTool;
use crate::client_common::tools::FreeformToolFormat;
use crate::client_common::tools::ResponsesApiTool;
use crate::client_common::tools::ToolSpec;
use crate::model_provider_info::ModelProviderInfo;
use crate::model_provider_info::WireApi;
use codex_otel::SessionTelemetry;
use codex_protocol::ThreadId;
use codex_protocol::models::BaseInstructions;
use codex_protocol::openai_models::ModelInfo;
use codex_protocol::protocol::SessionSource;
use codex_protocol::protocol::SubAgentSource;
use http::HeaderMap;
use pretty_assertions::assert_eq;
use serde_json::json;
use std::time::Duration;

fn test_model_client(session_source: SessionSource) -> ModelClient {
    let provider = crate::model_provider_info::create_oss_provider_with_base_url(
        "https://example.com/v1",
        crate::model_provider_info::WireApi::Responses,
    );
    ModelClient::new(
        None,
        ThreadId::new(),
        provider,
        session_source,
        None,
        false,
        false,
        false,
        None,
    )
}

fn openrouter_model_client(session_source: SessionSource) -> ModelClient {
    let provider = ModelProviderInfo {
        name: "OpenRouter".to_string(),
        base_url: Some("https://openrouter.ai/api/v1".to_string()),
        env_key: Some("OPENROUTER_API_KEY".to_string()),
        env_key_instructions: None,
        experimental_bearer_token: None,
        wire_api: WireApi::Responses,
        query_params: None,
        http_headers: None,
        env_http_headers: None,
        request_max_retries: None,
        stream_max_retries: None,
        stream_idle_timeout_ms: None,
        requires_openai_auth: false,
        supports_websockets: false,
    };
    ModelClient::new(
        None,
        ThreadId::new(),
        provider,
        session_source,
        None,
        false,
        false,
        false,
        None,
    )
}

fn test_model_info() -> ModelInfo {
    serde_json::from_value(json!({
        "slug": "gpt-test",
        "display_name": "gpt-test",
        "description": "desc",
        "default_reasoning_level": "medium",
        "supported_reasoning_levels": [
            {"effort": "medium", "description": "medium"}
        ],
        "shell_type": "shell_command",
        "visibility": "list",
        "supported_in_api": true,
        "priority": 1,
        "upgrade": null,
        "base_instructions": "base instructions",
        "model_messages": null,
        "supports_reasoning_summaries": false,
        "support_verbosity": false,
        "default_verbosity": null,
        "apply_patch_tool_type": null,
        "truncation_policy": {"mode": "bytes", "limit": 10000},
        "supports_parallel_tool_calls": false,
        "supports_image_detail_original": false,
        "context_window": 272000,
        "auto_compact_token_limit": null,
        "experimental_supported_tools": []
    }))
    .expect("deserialize test model info")
}

fn test_session_telemetry() -> SessionTelemetry {
    SessionTelemetry::new(
        ThreadId::new(),
        "gpt-test",
        "gpt-test",
        None,
        None,
        None,
        "test-originator".to_string(),
        false,
        "test-terminal".to_string(),
        SessionSource::Cli,
    )
}

#[test]
fn build_subagent_headers_sets_other_subagent_label() {
    let client = test_model_client(SessionSource::SubAgent(SubAgentSource::Other(
        "memory_consolidation".to_string(),
    )));
    let headers = client.build_subagent_headers();
    let value = headers
        .get("x-openai-subagent")
        .and_then(|value| value.to_str().ok());
    assert_eq!(value, Some("memory_consolidation"));
}

#[tokio::test]
async fn summarize_memories_returns_empty_for_empty_input() {
    let client = test_model_client(SessionSource::Cli);
    let model_info = test_model_info();
    let session_telemetry = test_session_telemetry();

    let output = client
        .summarize_memories(Vec::new(), &model_info, None, &session_telemetry)
        .await
        .expect("empty summarize request should succeed");
    assert_eq!(output.len(), 0);
}

#[test]
fn auth_request_telemetry_context_tracks_attached_auth_and_retry_phase() {
    let auth_context = AuthRequestTelemetryContext::new(
        Some(crate::auth::AuthMode::Chatgpt),
        &crate::api_bridge::CoreAuthProvider::for_test(Some("access-token"), Some("workspace-123")),
        PendingUnauthorizedRetry::from_recovery(UnauthorizedRecoveryExecution {
            mode: "managed",
            phase: "refresh_token",
        }),
    );

    assert_eq!(auth_context.auth_mode, Some("Chatgpt"));
    assert!(auth_context.auth_header_attached);
    assert_eq!(auth_context.auth_header_name, Some("authorization"));
    assert!(auth_context.retry_after_unauthorized);
    assert_eq!(auth_context.recovery_mode, Some("managed"));
    assert_eq!(auth_context.recovery_phase, Some("refresh_token"));
}

#[test]
fn sanitize_openrouter_responses_tools_keeps_only_functions() {
    let tools = vec![
        json!({
            "type": "function",
            "name": "read_file",
            "description": "Read a file.",
            "strict": false,
            "defer_loading": true,
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }),
        json!({
            "type": "custom",
            "name": "apply_patch",
            "description": "Patch files."
        }),
        json!({
            "type": "local_shell"
        }),
    ];

    let sanitized = sanitize_openrouter_responses_tools(tools);

    assert_eq!(
        sanitized,
        vec![json!({
            "type": "function",
            "name": "read_file",
            "description": "Read a file.",
            "strict": false,
            "parameters": {
                "type": "object",
                "properties": {}
            }
        })]
    );
}

#[test]
fn openrouter_build_responses_request_strips_provider_specific_metadata() {
    let client = openrouter_model_client(SessionSource::Cli);
    let session = client.new_session();
    let provider = codex_api::Provider {
        name: "OpenRouter".to_string(),
        base_url: "https://openrouter.ai/api/v1".to_string(),
        query_params: None,
        headers: HeaderMap::new(),
        retry: codex_api::provider::RetryConfig {
            max_attempts: 0,
            base_delay: Duration::from_millis(1),
            retry_429: false,
            retry_5xx: false,
            retry_transport: false,
        },
        stream_idle_timeout: Duration::from_millis(1),
    };
    let prompt = Prompt {
        input: vec![],
        tools: vec![
            ToolSpec::Function(ResponsesApiTool {
                name: "read_file".to_string(),
                description: "Read a file.".to_string(),
                strict: false,
                defer_loading: Some(true),
                parameters: crate::tools::spec::JsonSchema::Object {
                    properties: Default::default(),
                    required: None,
                    additional_properties: None,
                },
                output_schema: None,
            }),
            ToolSpec::Freeform(FreeformTool {
                name: "apply_patch".to_string(),
                description: "Patch files.".to_string(),
                format: FreeformToolFormat {
                    r#type: "grammar".to_string(),
                    syntax: "lark".to_string(),
                    definition: "patch".to_string(),
                },
            }),
        ],
        parallel_tool_calls: true,
        base_instructions: BaseInstructions {
            text: "base instructions".to_string(),
        },
        personality: None,
        output_schema: None,
    };

    let request = session
        .build_responses_request(
            &provider,
            &prompt,
            &test_model_info(),
            None,
            codex_protocol::config_types::ReasoningSummary::None,
            Some(codex_protocol::config_types::ServiceTier::Flex),
        )
        .expect("build request");

    assert_eq!(
        request.tools,
        vec![json!({
            "type": "function",
            "name": "read_file",
            "description": "Read a file.",
            "strict": false,
            "parameters": {
                "type": "object",
                "properties": {}
            }
        })]
    );
    assert_eq!(request.include, Vec::<String>::new());
    assert_eq!(request.prompt_cache_key, None);
    assert_eq!(request.service_tier, None);
}

#[test]
fn openrouter_build_responses_options_omits_stateful_headers() {
    let client = openrouter_model_client(SessionSource::Cli);
    let session = client.new_session();
    let _ = session.turn_state.set("turn-state".to_string());

    let options = session.build_responses_options(
        Some("meta"),
        codex_api::requests::responses::Compression::None,
    );

    assert_eq!(options.session_source, None);
    assert_eq!(options.turn_state, None);
    assert!(
        options
            .extra_headers
            .get(X_CODEX_TURN_STATE_HEADER)
            .is_none()
    );
    assert!(
        options
            .extra_headers
            .get(X_CODEX_TURN_METADATA_HEADER)
            .is_none()
    );
}
