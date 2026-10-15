"""Grava as tabelas normalizadas em SQLite e em CSV."""

from __future__ import annotations

import csv
import sqlite3
from pathlib import Path

from . import config


def _colunas(linhas: list[dict]) -> list[str]:
    cols: dict[str, None] = {}
    for l in linhas:
        cols.update(dict.fromkeys(l))
    return list(cols)


def salvar_sqlite(tabelas: dict[str, list[dict]], caminho: Path | None = None) -> Path:
    caminho = caminho or config.DB_PATH
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(caminho) as con:
        for nome, linhas in tabelas.items():
            con.execute(f'DROP TABLE IF EXISTS "{nome}"')
            if not linhas:
                continue
            cols = _colunas(linhas)
            con.execute(f'CREATE TABLE "{nome}" ({", ".join(f"{c!r}" for c in cols)})')
            con.executemany(
                f'INSERT INTO "{nome}" VALUES ({", ".join("?" * len(cols))})',
                [[l.get(c) for c in cols] for l in linhas],
            )
    return caminho


def salvar_csv(tabelas: dict[str, list[dict]], pasta: Path | None = None) -> Path:
    pasta = pasta or config.CSV_DIR
    pasta.mkdir(parents=True, exist_ok=True)
    for nome, linhas in tabelas.items():
        with open(pasta / f"{nome}.csv", "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=_colunas(linhas) if linhas else [])
            w.writeheader()
            w.writerows(linhas)
    return pasta
