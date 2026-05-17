use anyhow::{Context, Result};
use chrono::Local;
use regex::Regex;
use reqwest::blocking::Client;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;
use std::time::Duration;

const TARGET_URL: &str = "https://wiki.biligame.com/blhx/%E6%96%B0%E9%97%BB%E5%85%AC%E5%91%8A";
const STATE_FILE: &str = "known_links.json";
const LOG_DIR: &str = "logs";
const CHANGE_LOG: &str = "logs/change.log";

#[derive(Serialize, Deserialize)]
struct State {
    known_links: BTreeSet<String>,
}

fn main() -> Result<()> {
    let logs_dir = PathBuf::from(LOG_DIR);
    fs::create_dir_all(&logs_dir).context("Failed to create logs directory")?;

    let state = load_state()?;
    let client = new_client()?;

    let html = fetch_page(&client, TARGET_URL)?;
    let current_links = extract_links(&html)?;
    let new_links: Vec<_> = current_links
        .iter()
        .filter(|(_, url)| !state.known_links.contains(url.as_str()))
        .collect();

    let known: BTreeSet<String> = current_links.iter().map(|(_, u)| u.clone()).collect();

    if new_links.is_empty() {
        println!("[{}] No new announcements.", timestamp());
        save_state(&known)?;
        return Ok(());
    }

    println!("[{}] Found {} new announcement(s).", timestamp(), new_links.len());

    for (title, url) in &new_links {
        match fetch_page(&client, url) {
            Ok(content) => {
                let text = extract_text(&content)?;
                save_markdown(&logs_dir, title, url, &text)?;
                let entry = format!("[{}] NEW: {} ({})\n", timestamp(), title, url);
                fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(CHANGE_LOG)
                    .and_then(|f| std::io::Write::write_all(&mut f.try_clone().unwrap(), entry.as_bytes()))
                    .ok();
                println!("  + {}", title);
            }
            Err(e) => eprintln!("  ! Failed {}: {:#}", title, e),
        }
    }

    save_state(&known)?;
    println!("[{}] Done.", timestamp());
    Ok(())
}

fn new_client() -> Result<Client> {
    Client::builder()
        .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36")
        .timeout(Duration::from_secs(30))
        .build()
        .context("Failed to create HTTP client")
}

fn fetch_page(client: &Client, url: &str) -> Result<String> {
    let resp = client
        .get(url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .header("Referer", "https://wiki.biligame.com/blhx/%E6%96%B0%E9%97%BB%E5%85%AC%E5%91%8A")
        .send()
        .with_context(|| format!("Failed to fetch {}", url))?;

    if !resp.status().is_success() {
        anyhow::bail!("HTTP {} for {}", resp.status(), url);
    }

    resp.text().with_context(|| format!("Failed to read body from {}", url))
}

fn extract_links(html: &str) -> Result<Vec<(String, String)>> {
    let re = Regex::new(r"\d{4}年").unwrap();
    let doc = Html::parse_document(html);

    let link_sel = Selector::parse("a")
        .map_err(|e| anyhow::anyhow!("Invalid selector: {}", e))?;

    let mut links = Vec::new();

    let container = doc.select(&Selector::parse(".mw-parser-output").unwrap())
        .next()
        .or_else(|| doc.select(&Selector::parse("#mw-content-text").unwrap()).next())
        .or_else(|| doc.select(&Selector::parse("body").unwrap()).next())
        .ok_or_else(|| anyhow::anyhow!("No content container found"))?;

    for a in container.select(&link_sel) {
        let href = a.value().attr("href").unwrap_or("");
        let text: String = a.text().collect::<Vec<_>>().join(" ");
        let text_trimmed = text.trim();

        if text_trimmed.is_empty() || href.is_empty() {
            continue;
        }

        if href.starts_with('#') || href.contains("Special:") || href.contains("Category:") {
            continue;
        }

        if !re.is_match(text_trimmed) {
            continue;
        }

        let absolute = resolve_url(href);
        links.push((text_trimmed.to_string(), absolute));
    }

    Ok(links)
}

fn extract_text(html: &str) -> Result<String> {
    let doc = Html::parse_document(html);

    let el = doc.select(&Selector::parse(".mw-parser-output").unwrap())
        .next()
        .or_else(|| doc.select(&Selector::parse("#mw-content-text").unwrap()).next())
        .or_else(|| doc.select(&Selector::parse("body").unwrap()).next())
        .ok_or_else(|| anyhow::anyhow!("No content element found"))?;

    let text: String = el.text()
        .collect::<Vec<_>>()
        .join("\n");

    let cleaned: Vec<&str> = text.lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();

    Ok(cleaned.join("\n"))
}

fn resolve_url(href: &str) -> String {
    if href.starts_with("http://") || href.starts_with("https://") {
        return href.to_string();
    }
    let base = "https://wiki.biligame.com";
    if href.starts_with('/') {
        format!("{}{}", base, href)
    } else {
        format!("{}/{}", base, href)
    }
}

fn save_markdown(logs_dir: &PathBuf, title: &str, url: &str, content: &str) -> Result<()> {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S");
    let safe_name: String = title
        .chars()
        .map(|c| if c == ':' || c == '/' || c == '\\' { '_' } else { c })
        .collect();
    let filename = format!("{}-{}.md", Local::now().format("%Y-%m-%d"), safe_name);
    let path = logs_dir.join(&filename);

    let md = format!(
        "# {}\n\n**发现时间**: {}\n**原始链接**: {}\n\n---\n\n{}",
        title, now, url, content
    );

    fs::write(&path, md).with_context(|| format!("Failed to write {}", path.display()))?;
    Ok(())
}

fn load_state() -> Result<State> {
    let path = PathBuf::from(STATE_FILE);
    if path.exists() {
        let data = fs::read_to_string(&path)?;
        Ok(serde_json::from_str(&data)?)
    } else {
        Ok(State {
            known_links: BTreeSet::new(),
        })
    }
}

fn save_state(known: &BTreeSet<String>) -> Result<()> {
    fs::write(STATE_FILE, serde_json::to_string_pretty(&State { known_links: known.clone() })?)
        .context("Failed to save state")
}

fn timestamp() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}
