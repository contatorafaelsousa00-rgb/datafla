"""Fotos dos jogadores.

A Highlightly não tem foto de jogador (o campo `logo` vem vazio no box-score e na ficha).
O elenco atual da API-Football (/players/squads, 1 requisição do plano grátis) traz a URL da foto,
servida por um endereço público que não conta na cota. Como cada fonte tem seus próprios IDs,
os jogadores são casados por nome e número da camisa.

As fotos são copiadas para site/fotos/ e servidas pelo próprio site: assim carregam em qualquer
rede (há redes cujo DNS não resolve media.api-sports.io). Sem a cópia local, usa a URL original.
"""

from __future__ import annotations

import os
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

from . import config
from .api import ClienteAPI, ErroAPI, ler_raw, salvar_raw

ARQ = "elenco_fotos"
DIAS_VALIDADE = 7  # o elenco muda pouco; renova uma vez por semana
TEAM_ID_API_FOOTBALL = int(os.environ.get("FLA_TEAM_ID", "127"))
PASTA_SITE = Path(os.environ.get("FLA_SITE_FOTOS", config.ROOT / "site" / "fotos"))


def foto_local(url: str, pasta: Path | None = None) -> str:
    """Caminho relativo ao site ("fotos/123.png") se a cópia existir ou puder ser baixada; senão a URL."""
    pasta = pasta or PASTA_SITE
    nome = url.rsplit("/", 1)[-1]
    destino = pasta / nome
    if not destino.exists():
        try:
            resp = requests.get(url, timeout=15)
            if resp.ok and resp.headers.get("content-type", "").startswith("image/"):
                pasta.mkdir(parents=True, exist_ok=True)
                destino.write_bytes(resp.content)
        except requests.RequestException:
            pass
    return f"fotos/{nome}" if destino.exists() else url


def _norm(texto: str | None) -> str:
    sem_acento = unicodedata.normalize("NFD", texto or "").encode("ascii", "ignore").decode()
    return " ".join(sem_acento.lower().replace(".", " ").replace("-", " ").split())


def _sobrenome(texto: str | None) -> str:
    partes = _norm(texto).split()
    return partes[-1] if partes else ""


def cmd_fotos(forcar: bool = False) -> int:
    """Baixa o elenco com fotos (API-Football) se o salvo tiver mais de 7 dias."""
    salvo = ler_raw(ARQ)
    if salvo and not forcar:
        idade = datetime.now(timezone.utc) - datetime.fromisoformat(salvo["_coletado_em"])
        if idade < timedelta(days=DIAS_VALIDADE):
            print(f"Fotos: elenco salvo há {idade.days} dia(s); não precisa baixar de novo.")
            return 0
    if not os.environ.get(config.API_KEY_ENV):
        print("Fotos: sem API_FOOTBALL_KEY; mantém as fotos já salvas.")
        return 0
    try:
        corpo = ClienteAPI().get("players/squads", team=TEAM_ID_API_FOOTBALL)
    except (ErroAPI, OSError) as e:
        print(f"Fotos: não foi possível baixar o elenco ({e}); mantém as fotos já salvas.")
        return 0
    jogadores = [j for bloco in corpo.get("response", []) for j in bloco.get("players", [])]
    salvar_raw(ARQ, {"jogadores": jogadores, "_coletado_em": datetime.now(timezone.utc).isoformat()})
    print(f"Fotos: elenco com {len(jogadores)} jogadores salvo.")
    return 0


def casar(jogadores: list[dict], elenco: list[dict]) -> dict[int, str]:
    """{jogador_id da fonte do painel: url da foto}. Só casa quando não há ambiguidade.

    Ordem: nome igual (ex.: "A. Rossi") → sobrenome + número da camisa → sobrenome único no elenco.
    """
    por_nome, por_sobrenome = {}, {}
    for e in elenco:
        if not e.get("photo"):
            continue
        por_nome.setdefault(_norm(e["name"]), []).append(e)
        por_sobrenome.setdefault(_sobrenome(e["name"]), []).append(e)
    fotos = {}
    for j in jogadores:
        nomes = [j.get("jogador"), j.get("nome_completo")]
        candidatos = next((por_nome[_norm(n)] for n in nomes if _norm(n) in por_nome), [])
        if len(candidatos) != 1:
            mesmo_sobrenome = [e for n in nomes for e in por_sobrenome.get(_sobrenome(n), [])]
            unicos = {e["id"]: e for e in mesmo_sobrenome}
            com_numero = [e for e in unicos.values() if j.get("numero") and e.get("number") == j.get("numero")]
            candidatos = com_numero if len(com_numero) == 1 else list(unicos.values())
        if len(candidatos) == 1:
            fotos[j["jogador_id"]] = candidatos[0]["photo"]
    return fotos


def linhas_fotos(jogadores: list[dict]) -> list[dict]:
    salvo = ler_raw(ARQ)
    if not salvo:
        return []
    # Um registro por jogador do Flamengo (o mais recente traz o número atual da camisa)
    unicos = {}
    for j in jogadores:
        if j.get("eh_flamengo"):
            unicos[j["jogador_id"]] = j
    fotos = casar(list(unicos.values()), salvo["jogadores"])
    return [{"jogador_id": k, "foto": foto_local(v)} for k, v in fotos.items()]
