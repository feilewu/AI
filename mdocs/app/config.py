from dataclasses import dataclass
from pathlib import Path

import yaml


@dataclass
class Config:
    docs_root: str
    host: str = "0.0.0.0"
    port: int = 8000


def load_config(path: str = "config.yaml") -> Config:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    with open(path) as f:
        data = yaml.safe_load(f)
    return Config(**data)
