use clap::Parser;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::sync::Arc;
use std::time::Duration;
use sysinfo::{Disks, System};
use tokio::time;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::MaybeTlsStream;
use tokio_tungstenite::WebSocketStream;
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tracing::{info, warn};

type WsSink = futures_util::stream::SplitSink<WebSocketStream<MaybeTlsStream<TcpStream>>, Message>;

#[derive(Parser, Debug)]
#[command(name = "node-agent")]
struct Args {
    #[arg(long)]
    config: Option<String>,

    #[arg(long)]
    server_url: Option<String>,

    #[arg(long)]
    node_id: Option<String>,

    #[arg(long)]
    token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Config {
    server_url: Option<String>,
    node_id: Option<String>,
    token: Option<String>,
}

fn load_config(args: &Args) -> Result<Config, Box<dyn std::error::Error>> {
    let mut config = if let Some(path) = &args.config {
        let content = std::fs::read_to_string(path)?;
        toml::from_str(&content)?
    } else {
        Config {
            server_url: None,
            node_id: None,
            token: None,
        }
    };

    if let Some(server_url) = &args.server_url {
        config.server_url = Some(server_url.clone());
    }
    if let Some(node_id) = &args.node_id {
        config.node_id = Some(node_id.clone());
    }
    if let Some(token) = &args.token {
        config.token = Some(token.clone());
    }

    Ok(config)
}

fn read_net_stats() -> (u64, u64) {
    let content = std::fs::read_to_string("/proc/net/dev").unwrap_or_default();
    let mut rx_total: u64 = 0;
    let mut tx_total: u64 = 0;
    for line in content.lines().skip(2) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() > 9 {
            if let Ok(rx) = parts[1].parse::<u64>() {
                rx_total += rx;
            }
            if let Ok(tx) = parts[9].parse::<u64>() {
                tx_total += tx;
            }
        }
    }
    (rx_total, tx_total)
}

struct Agent {
    config: Config,
    system: Arc<Mutex<System>>,
}

impl Agent {
    fn new(config: Config) -> Self {
        let system = Arc::new(Mutex::new(System::new_all()));
        Agent { config, system }
    }

    async fn collect_metrics(system: &Arc<Mutex<System>>) -> serde_json::Value {
        let mut sys = system.lock().await;
        sys.refresh_all();

        let cpu_pct = sys.global_cpu_usage();
        let memory_pct = (sys.used_memory() as f64 / sys.total_memory() as f64) * 100.0;
        let memory_used_mb = sys.used_memory() as f64 / (1024.0 * 1024.0);
        let load = System::load_average();

        let disks = Disks::new_with_refreshed_list();
        let total: u64 = disks.iter().map(|d| d.total_space()).sum();
        let available: u64 = disks.iter().map(|d| d.available_space()).sum();
        let disk_pct = if total > 0 {
            ((total - available) as f64 / total as f64) * 100.0
        } else {
            0.0
        };
        let disk_used_gb = (total - available) as f64 / (1024.0 * 1024.0 * 1024.0);

        let (net_rx_bytes, net_tx_bytes) = read_net_stats();

        serde_json::json!({
            "type": "metrics",
            "cpu_pct": cpu_pct,
            "memory_pct": memory_pct,
            "memory_used_mb": memory_used_mb,
            "disk_pct": disk_pct,
            "disk_used_gb": disk_used_gb,
            "net_rx_bytes": net_rx_bytes,
            "net_tx_bytes": net_tx_bytes,
            "load_1m": load.one,
            "load_5m": load.five,
            "load_15m": load.fifteen,
        })
    }

    async fn send_metrics(ws_sink: &mut WsSink, system: Arc<Mutex<System>>) -> Result<(), Box<dyn std::error::Error>> {
        let metrics = Self::collect_metrics(&system).await;
        let msg = serde_json::to_string(&metrics)?;
        ws_sink.send(Message::Text(msg)).await?;
        Ok(())
    }

    async fn exec_command(cmd_str: &str) -> serde_json::Value {
        let output = tokio::process::Command::new("sh")
            .arg("-c")
            .arg(cmd_str)
            .output()
            .await;

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                let result = if stderr.is_empty() { stdout } else { format!("{}\n{}", stdout, stderr) };
                serde_json::json!({
                    "exit_code": out.status.code().unwrap_or(-1),
                    "result": result,
                })
            }
            Err(e) => {
                serde_json::json!({
                    "exit_code": -1,
                    "result": format!("Failed to execute command: {}", e),
                })
            }
        }
    }

    async fn run(&self) -> Result<(), Box<dyn std::error::Error>> {
        let server_url = self
            .config
            .server_url
            .as_deref()
            .ok_or("server_url is required")?;
        let node_id = self
            .config
            .node_id
            .as_deref()
            .ok_or("node_id is required")?;
        let token = self
            .config
            .token
            .as_deref()
            .ok_or("token is required")?;

        let ws_url = format!("{}/ws/agent", server_url.trim_end_matches('/'));
        let system = self.system.clone();

        loop {
            tokio::select! {
                _ = tokio::signal::ctrl_c() => {
                    info!("Shutting down");
                    return Ok(());
                }
                _ = self.run_loop(&ws_url, node_id, token, system.clone()) => {}
            }
        }
    }

    async fn run_loop(
        &self,
        ws_url: &str,
        node_id: &str,
        token: &str,
        system: Arc<Mutex<System>>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        loop {
            info!("Connecting to {}", ws_url);
            match connect_async(ws_url).await {
                Ok((ws_stream, _)) => {
                    info!("WebSocket connected");
                    let (ws_sink, mut ws_stream) = ws_stream.split();
                    let ws_sink = Arc::new(Mutex::new(ws_sink));

                    {
                        let mut sink = ws_sink.lock().await;
                        let register = serde_json::json!({
                            "type": "register",
                            "node_id": node_id,
                            "token": token,
                        });
                        let msg = serde_json::to_string(&register)?;
                        sink.send(Message::Text(msg)).await?;
                    }

                    let mut metrics_interval = time::interval(Duration::from_secs(60));
                    let mut heartbeat_interval = time::interval(Duration::from_secs(30));

                    loop {
                        tokio::select! {
                            _ = heartbeat_interval.tick() => {
                                let mut sink = ws_sink.lock().await;
                                let ping = serde_json::json!({"type": "ping"});
                                sink.send(Message::Text(ping.to_string())).await?;
                            }
                            _ = metrics_interval.tick() => {
                                if let Err(e) = Self::send_metrics(&mut *ws_sink.lock().await, system.clone()).await {
                                    warn!("Failed to send metrics: {}", e);
                                }
                            }
                            msg = ws_stream.next() => {
                                match msg {
                                    Some(Ok(Message::Text(text))) => {
                                        let parsed: serde_json::Value = serde_json::from_str(&text)?;
                                        match parsed["type"].as_str() {
                                            Some("pong") | Some("ping") => {}
                                            Some("collect_metrics") => {
                                                if let Err(e) = Self::send_metrics(&mut *ws_sink.lock().await, system.clone()).await {
                                                    warn!("Failed to send metrics: {}", e);
                                                }
                                            }
                                            Some("exec") => {
                                                let cmd_id = parsed["cmd_id"].as_i64().unwrap_or(-1);
                                                let command = parsed["command"].as_str().unwrap_or("");
                                                info!("Executing command [{}]: {}", cmd_id, command);
                                                let result = Self::exec_command(command).await;
                                                let response = serde_json::json!({
                                                    "type": "cmd_result",
                                                    "cmd_id": cmd_id,
                                                    "exit_code": result["exit_code"],
                                                    "result": result["result"],
                                                });
                                                let mut sink = ws_sink.lock().await;
                                                sink.send(Message::Text(response.to_string())).await?;
                                            }
                                            Some(other) => warn!("Unknown message type: {}", other),
                                            None => warn!("Received message without type field"),
                                        }
                                    }
                                    Some(Ok(Message::Close(_))) => {
                                        info!("Server closed connection");
                                        break;
                                    }
                                    Some(Err(e)) => {
                                        warn!("WebSocket error: {}", e);
                                        break;
                                    }
                                    None => {
                                        info!("WebSocket stream ended");
                                        break;
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    warn!("Connection failed: {}", e);
                }
            }

            info!("Reconnecting in 10 seconds...");
            time::sleep(Duration::from_secs(10)).await;
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();
    let args = Args::parse();
    let config = load_config(&args)?;
    let agent = Agent::new(config);
    agent.run().await
}
