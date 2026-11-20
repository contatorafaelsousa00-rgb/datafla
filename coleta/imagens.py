"""Cópia local das imagens que vêm das fontes (fotos dos jogadores, escudos e símbolos de competição).

O site serve as próprias cópias: carrega em qualquer rede (há redes cujo DNS não resolve o endereço
da fonte) e não depende de a fonte manter os endereços ou aceitar que outro site use as imagens.
As cópias ficam no Git (site/fotos, site/logos); só imagens novas são baixadas.
"""

from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlsplit

import requests

from . import config

PASTA_SITE = config.ROOT / "site"


HOSTS_PERMITIDOS = {"highlightly.net", "media.api-sports.io"}
NOME_VALIDO = re.compile(r"^\d+\.(png|jpe?g|webp)$")  # id numérico: nada de .html/.svg servido pelo nosso domínio
TIPOS_LOGO = {"teams", "leagues"}


def _eh_imagem(conteudo: bytes) -> bool:
    """Confere a assinatura do arquivo (PNG, JPEG ou WebP), não só o content-type que o servidor declara."""
    return (conteudo.startswith(b"\x89PNG\r\n\x1a\n") or conteudo.startswith(b"\xff\xd8\xff")
            or (conteudo[:4] == b"RIFF" and conteudo[8:12] == b"WEBP"))


def url_confiavel(url: str) -> bool:
    partes = urlsplit(url)
    return partes.scheme == "https" and partes.hostname in HOSTS_PERMITIDOS and bool(NOME_VALIDO.match(url.rsplit("/", 1)[-1]))


def copia_local(url: str, pasta: Path, prefixo: str) -> str:
    """Caminho relativo ao site (`prefixo/nome`) se a cópia existir ou puder ser baixada; senão a URL.

    Só copia de domínios das fontes e com nome `<id>.<png|jpg|webp>`: o arquivo vai para o Git e é servido
    pelo próprio site, então um endereço inesperado (ex.: `x.html`) nunca pode virar página no nosso domínio.
    """
    if not url_confiavel(url):
        return url
    nome = url.rsplit("/", 1)[-1]
    destino = pasta / nome
    if not destino.exists():
        try:
            resp = requests.get(url, timeout=15)
            if resp.ok and resp.headers.get("content-type", "").startswith("image/") and _eh_imagem(resp.content):
                pasta.mkdir(parents=True, exist_ok=True)
                destino.write_bytes(resp.content)
        except requests.RequestException:
            pass
    return f"{prefixo}/{nome}" if destino.exists() else url


def logo_local(url: str | None, pasta_site: Path | None = None) -> str | None:
    """Escudo/símbolo da Highlightly (…/images/teams/123.png) → "logos/teams/123.png"."""
    if not url or not url.startswith("http"):
        return url
    tipo = url.rstrip("/").split("/")[-2]  # "teams" ou "leagues": IDs iguais em tipos diferentes não colidem
    if tipo not in TIPOS_LOGO:
        return url
    return copia_local(url, (pasta_site or PASTA_SITE) / "logos" / tipo, f"logos/{tipo}")


def logos_locais(tabelas: dict[str, list[dict]], pasta_site: Path | None = None) -> int:
    """Troca, em todas as tabelas, os campos `*_logo` pela cópia local. Devolve quantos campos trocou."""
    trocados = 0
    for linhas in tabelas.values():
        if not isinstance(linhas, list):
            continue
        for linha in linhas:
            for campo, valor in linha.items():
                if campo.endswith("_logo") and isinstance(valor, str) and valor.startswith("http"):
                    novo = logo_local(valor, pasta_site)
                    trocados += novo != valor
                    linha[campo] = novo
    return trocados
