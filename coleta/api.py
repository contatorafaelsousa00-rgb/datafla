"""Cliente mínimo da API-Football (v3) com cache em disco e controle de cota."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import requests

from . import config


class ErroAPI(RuntimeError):
    pass


class ClienteAPI:
    def __init__(self, key: str | None = None, sessao: requests.Session | None = None):
        self.sessao = sessao or requests.Session()
        self.sessao.headers["x-apisports-key"] = key or config.api_key()
        self.restantes_hoje: int | None = None
        self.chamadas = 0

    def get(self, endpoint: str, **params) -> dict:
        """Chama um endpoint e devolve o JSON completo. Erros da API viram ErroAPI."""
        url = f"{config.BASE_URL}/{endpoint.lstrip('/')}"
        for tentativa in range(4):
            resp = self.sessao.get(url, params=params, timeout=30)
            if resp.status_code == 429 or resp.status_code >= 500:
                time.sleep(2 ** (tentativa + 1))
                continue
            break
        resp.raise_for_status()
        self.chamadas += 1

        restantes = resp.headers.get("x-ratelimit-requests-remaining")
        if restantes is not None:
            self.restantes_hoje = int(restantes)

        corpo = resp.json()
        erros = corpo.get("errors")
        # A API devolve [] quando não há erro e um objeto {campo: mensagem} quando há.
        if erros:
            raise ErroAPI(f"{endpoint} {params}: {erros}")

        # Respeita o limite por minuto do plano grátis (10/min).
        time.sleep(float(os.environ.get("FLA_PAUSA_SEG", "6.5")))
        return corpo


def salvar_raw(nome: str, conteudo: dict, raw_dir: Path | None = None) -> Path:
    raw_dir = raw_dir or config.RAW_DIR
    raw_dir.mkdir(parents=True, exist_ok=True)
    caminho = raw_dir / f"{nome}.json"
    caminho.write_text(json.dumps(conteudo, ensure_ascii=False, indent=1), encoding="utf-8")
    return caminho


def ler_raw(nome: str, raw_dir: Path | None = None) -> dict | None:
    caminho = (raw_dir or config.RAW_DIR) / f"{nome}.json"
    if not caminho.exists():
        return None
    return json.loads(caminho.read_text(encoding="utf-8"))
