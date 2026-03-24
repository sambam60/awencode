use serde::Deserialize;

const TITLE_MODEL: &str = "gpt-4o-mini";
const COMMIT_MESSAGE_MODEL: &str = "gpt-4.1";

const TITLE_SYSTEM_PROMPT: &str = r#"You generate concise titles for coding chat sessions.
Rules:
- Write a concise title summarising the topic or message the user wrote.
- Return only the title text - nothing else.
- Use 2 to 6 words.
- No quotes, no punctuation at the end unless required.
- Prefer a specific technical summary over generic wording."#;

const COMMIT_MESSAGE_SYSTEM_PROMPT: &str = r#"You write concise git commit messages for code changes.
Rules:
- Return exactly one line containing only the commit subject.
- Use imperative mood.
- Describe the actual code change, not the review process.
- Keep it under 72 characters.
- Do not add quotes, bullets, prefixes, or trailing punctuation unless required."#;

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

    let Some(raw) = create_chat_completion(
        openai_api_key,
        TITLE_MODEL,
        TITLE_SYSTEM_PROMPT,
        seed_message,
        24,
        0.3,
        "title generation",
    )
    .await?
    else {
        return Ok(None);
    };

    Ok(normalize_generated_title(&raw))
}

pub async fn generate_commit_message(
    openai_api_key: &str,
    diff_context: &str,
) -> Result<Option<String>, String> {
    if openai_api_key.trim().is_empty() || diff_context.trim().is_empty() {
        return Ok(None);
    }

    let Some(raw) = create_chat_completion(
        openai_api_key,
        COMMIT_MESSAGE_MODEL,
        COMMIT_MESSAGE_SYSTEM_PROMPT,
        diff_context,
        48,
        0.2,
        "commit message generation",
    )
    .await?
    else {
        return Ok(None);
    };

    Ok(normalize_generated_commit_message(&raw))
}

async fn create_chat_completion(
    openai_api_key: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    max_tokens: u32,
    temperature: f32,
    task_name: &str,
) -> Result<Option<String>, String> {
    let response = reqwest::Client::new()
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(openai_api_key)
        .json(&serde_json::json!({
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": user_prompt },
            ],
        }))
        .send()
        .await
        .map_err(|err| format!("Failed to contact OpenAI for {task_name}: {err}"))?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let data = response
        .json::<ChatCompletionsResponse>()
        .await
        .map_err(|err| format!("Failed to parse OpenAI response for {task_name}: {err}"))?;

    Ok(data
        .choices
        .first()
        .and_then(|choice| choice.message.content.clone()))
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

fn normalize_generated_commit_message(raw: &str) -> Option<String> {
    let first_line = raw.lines().map(str::trim).find(|line| !line.is_empty())?;
    let cleaned = first_line
        .trim_start_matches(['"', '\'', '`'])
        .trim_end_matches(['"', '\'', '`'])
        .strip_prefix("commit message:")
        .or_else(|| first_line.strip_prefix("Commit message:"))
        .unwrap_or(first_line)
        .trim();

    if cleaned.is_empty() {
        return None;
    }

    Some(cleaned.to_string())
}

#[cfg(test)]
mod tests {
    use super::normalize_generated_commit_message;

    #[test]
    fn normalizes_generated_commit_message() {
        assert_eq!(
            normalize_generated_commit_message("Commit message: Add auto commit titles\n\nextra"),
            Some("Add auto commit titles".to_string())
        );
    }

    #[test]
    fn strips_quotes_from_generated_commit_message() {
        assert_eq!(
            normalize_generated_commit_message("\"Refine git commit fallback\""),
            Some("Refine git commit fallback".to_string())
        );
    }
}
