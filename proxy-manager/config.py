from dataclasses import dataclass
from pathlib import Path
import yaml


@dataclass
class Config:
    host: str = "0.0.0.0"
    port: int = 8090
    db_path: str = "data/proxy-manager.db"
    auth_password: str = ""
    secret_key: str = ""


def load_config(path: str = "config.yaml") -> Config:
    path = Path(path)
    if not path.exists():
        return Config()
    with open(path) as f:
        data = yaml.safe_load(f)
    cfg = Config(**data)
    if not cfg.secret_key:
        import secrets
        cfg.secret_key = secrets.token_hex(32)
    return cfg
