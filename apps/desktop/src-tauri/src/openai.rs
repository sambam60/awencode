use serde::Deserialize;

const TITLE_SYSTEM_PROMPT: &str = r#"You generate concise titles for coding chat sessions.
Rules:
- Write a concise title summarising the topic or message the user wrote.
- Return only the title text - nothing else.
- Use 2 to 6 words.
- No quotes, no punctuation at the end unless required.
- Prefer a specific technical summary over generic wording."#;

#[derive(Debug, Deserialize)]
struct ChatCompletionsResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: Option<String>,
}

pub async fn generate_thread_title(
    openai_api_key: &str,
    seed_message: &str,
) -> Result<Option<String>, String> {
    if openai_api_key.trim().is_empty() || seed_message.trim().is_empty() {
        return Ok(None);
    }

    let response = reqwest::Client::new()
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(openai_api_key)
        .json(&serde_json::json!({
            "model": "gpt-4o-mini",
            "max_tokens": 24,
            "temperature": 0.3,
            "messages": [
                { "role": "system", "content": TITLE_SYSTEM_PROMPT },
                { "role": "user", "content": seed_message },
            ],
        }))
        .send()
        .await
        .map_err(|err| format!("Failed to contact OpenAI for title generation: {err}"))?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let data = response
        .json::<ChatCompletionsResponse>()
        .await
        .map_err(|err| format!("Failed to parse OpenAI title response: {err}"))?;

    let raw = data
        .choices
        .first()
        .and_then(|choice| choice.message.content.as_deref())
        .unwrap_or("");

    Ok(normalize_generated_title(raw))
}

fn normalize_generated_title(raw: &str) -> Option<String> {
    let first_line = raw.lines().map(str::trim).find(|line| !line.is_empty())?;

    let cleaned = first_line
        .trim_start_matches(['"', '\'', '`'])
        .trim_end_matches(['"', '\'', '`'])
        .strip_prefix("title:")
        .or_else(|| first_line.strip_prefix("Title:"))
        .unwrap_or(first_line)
        .trim();

    if cleaned.is_empty() {
        return None;
    }

    Some(truncate_generated_title(cleaned))
}

fn truncate_generated_title(text: &str) -> String {
    if text.chars().count() > 56 {
        format!("{}...", text.chars().take(53).collect::<String>())
    } else {
        text.to_string()
    }
}
