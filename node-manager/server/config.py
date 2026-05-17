from dataclasses import dataclass
from pathlib import Path
import yaml


@dataclass
class Config:
    host: str = "0.0.0.0"
    port: int = 8000
    db_path: str = "data/node-manager.db"
    releases_dir: str = "data/releases"
    root_path: str = ""


def load_config(path: str = "config.yaml") -> Config:
    path = Path(path)
    if not path.exists():
        return Config()
    with open(path) as f:
        data = yaml.safe_load(f)
    return Config(**data)
