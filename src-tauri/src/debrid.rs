use serde_json::{json, Value};
use std::collections::HashMap;

fn credential() -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.aster.contenthub", "real-debrid")
        .map_err(|_| "Windows Credential Manager is unavailable.".to_string())
}

// No arbitrary destinations: a bearer token is sent exclusively to the official RD API.
fn allowed_path(method: &str, path: &str) -> bool {
    match (method, path) {
        ("GET", "user") | ("POST", "unrestrict/link") | ("POST", "torrents/addMagnet") => true,
        ("GET", p) if p.starts_with("torrents/info/") => valid_id(p.trim_start_matches("torrents/info/")),
        ("POST", p) if p.starts_with("torrents/selectFiles/") => valid_id(p.trim_start_matches("torrents/selectFiles/")),
        _ => false,
    }
}

fn valid_id(id: &str) -> bool { !id.is_empty() && id.len() <= 80 && id.bytes().all(|b| b.is_ascii_alphanumeric()) }

async fn request(token: &str, method: &str, path: &str, params: HashMap<String, String>) -> Result<Value, String> {
    if !allowed_path(method, path) { return Err("Unsupported Real-Debrid operation.".into()); }
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none()).build().map_err(|_| "Could not create API client.".to_string())?;
    let url = format!("https://api.real-debrid.com/rest/1.0/{path}");
    let builder = if method == "POST" { client.post(url).form(&params) } else { client.get(url) };
    let mut response = builder.bearer_auth(token).send().await.map_err(|_| "Real-Debrid could not be reached. Check your connection.".to_string())?;
    let status = response.status();
    if status.as_u16() == 204 || status.as_u16() == 202 { return Ok(json!({})); }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "Incomplete Real-Debrid response.".to_string())? {
        if bytes.len() + chunk.len() > 2 * 1024 * 1024 { return Err("Real-Debrid response is too large.".into()); }
        bytes.extend_from_slice(&chunk);
    }
    if !status.is_success() {
        let data: Value = serde_json::from_slice(&bytes).unwrap_or(json!({}));
        let code = data.get("error_code").and_then(Value::as_i64).unwrap_or(0);
        return Err(format!("Real-Debrid request failed (HTTP {}, code {}). Check your token, account status, or source availability.", status.as_u16(), code));
    }
    serde_json::from_slice(&bytes).map_err(|_| "Invalid Real-Debrid response.".to_string())
}

#[tauri::command]
pub async fn rd_connect(token: String) -> Result<Value, String> {
    let token = token.trim();
    if token.is_empty() || token.len() > 2048 || token.chars().any(char::is_whitespace) { return Err("Enter a valid API token.".into()); }
    let user = request(token, "GET", "user", HashMap::new()).await?;
    credential()?.set_password(token).map_err(|_| "Could not save the token in Windows Credential Manager.".to_string())?;
    Ok(user)
}

#[tauri::command]
pub async fn rd_request(method: String, path: String, params: HashMap<String, String>) -> Result<Value, String> {
    let token = credential()?.get_password().map_err(|_| "Connect your Real-Debrid account first.".to_string())?;
    request(&token, &method, &path, params).await
}

#[tauri::command]
pub fn rd_disconnect() -> Result<(), String> {
    match credential()?.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not remove the saved token.".into()),
    }
}

#[tauri::command]
pub fn rd_open_token_page() -> Result<(), String> {
    open::that_detached("https://real-debrid.com/apitoken")
        .map_err(|_| "Could not open your browser. Visit https://real-debrid.com/apitoken manually.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_allows_expected_routes() {
        assert!(allowed_path("GET", "torrents/info/ABC123"));
        assert!(allowed_path("POST", "torrents/selectFiles/ABC123"));
        assert!(!allowed_path("GET", "torrents/info/../../user"));
        assert!(!allowed_path("DELETE", "torrents/delete/ABC123"));
        assert!(!allowed_path("GET", "https://example.com"));
    }
}
