"""Linha de comando da coleta.

    python -m coleta.coletar status     # confere chave, cota, time e acesso à temporada
    python -m coleta.coletar jogos      # baixa a lista de jogos do Flamengo na temporada
    python -m coleta.coletar detalhes   # baixa os detalhes dos jogos encerrados que faltam
    python -m coleta.coletar processar  # gera banco, CSVs e relatório de validação (sem usar a API)
    python -m coleta.coletar tudo       # jogos + detalhes + processar
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone

from . import armazenar, config, normalizar, validar
from .api import ClienteAPI, ErroAPI, ler_raw, salvar_raw

ARQ_JOGOS = f"jogos_{config.SEASON}"


def _agora():
    return datetime.now(timezone.utc)


def cmd_status(api: ClienteAPI):
    conta = api.get("status")["response"]
    req = conta.get("requests", {})
    print(f"Plano: {conta.get('subscription', {}).get('plan')}  |  "
          f"requisições hoje: {req.get('current')}/{req.get('limit_day')}")

    time = api.get("teams", id=config.TEAM_ID)["response"]
    nome = time[0]["team"]["name"] if time else None
    print(f"Time {config.TEAM_ID}: {nome}")
    if not nome or "flamengo" not in nome.lower():
        print("ATENÇÃO: o ID não corresponde ao Flamengo. Ajuste FLA_TEAM_ID.")
        return 1

    try:
        ligas = api.get("leagues", team=config.TEAM_ID, season=config.SEASON)["response"]
    except ErroAPI as e:
        print(f"Sem acesso à temporada {config.SEASON}: {e}")
        return 1
    print(f"Competições em {config.SEASON}:")
    for l in ligas:
        temporada = next((s for s in l["seasons"] if s["year"] == config.SEASON), {})
        cob = temporada.get("coverage", {}).get("fixtures", {})
        print(f"  {l['league']['id']:>5}  {l['league']['name']:<30} "
              f"eventos={cob.get('events')} escalações={cob.get('lineups')} "
              f"estatísticas={cob.get('statistics_fixtures')} jogadores={cob.get('statistics_players')}")
    return 0


def cmd_jogos(api: ClienteAPI):
    corpo = api.get("fixtures", team=config.TEAM_ID, season=config.SEASON)
    salvar_raw(ARQ_JOGOS, corpo)
    jogos = corpo["response"]
    encerrados = sum(j["fixture"]["status"]["short"] in config.STATUS_ENCERRADO for j in jogos)
    print(f"{len(jogos)} jogos na temporada, {encerrados} encerrados.")
    return 0


def _precisa_coletar(fixture_id: int, data_jogo: datetime) -> bool:
    salvo = ler_raw(f"partida_{fixture_id}")
    if salvo is None:
        return True
    coletado = datetime.fromisoformat(salvo["_coletado_em"])
    return coletado - data_jogo < timedelta(hours=config.JANELA_RECOLETA_HORAS)


def cmd_detalhes(api: ClienteAPI):
    lista = ler_raw(ARQ_JOGOS)
    if lista is None:
        print("Rode primeiro: python -m coleta.coletar jogos")
        return 1
    pendentes = [
        j["fixture"]["id"]
        for j in lista["response"]
        if j["fixture"]["status"]["short"] in config.STATUS_ENCERRADO
        and _precisa_coletar(j["fixture"]["id"], datetime.fromisoformat(j["fixture"]["date"]))
    ]
    print(f"{len(pendentes)} jogos para baixar ({-(-len(pendentes) // config.LOTE_DETALHES)} requisições).")
    for i in range(0, len(pendentes), config.LOTE_DETALHES):
        lote = pendentes[i:i + config.LOTE_DETALHES]
        corpo = api.get("fixtures", ids="-".join(map(str, lote)))
        for partida in corpo["response"]:
            partida["_coletado_em"] = _agora().isoformat()
            salvar_raw(f"partida_{partida['fixture']['id']}", partida)
        print(f"  lote {i // config.LOTE_DETALHES + 1}: {len(corpo['response'])} jogos salvos")
    return 0


def carregar_partidas() -> list[dict]:
    return [
        ler_raw(c.stem)
        for c in sorted(config.RAW_DIR.glob("partida_*.json"))
    ]


def cmd_processar():
    partidas = carregar_partidas()
    if not partidas:
        print("Nenhum jogo baixado ainda.")
        return 1
    tabelas = normalizar.normalizar(partidas)
    armazenar.salvar_sqlite(tabelas)
    armazenar.salvar_csv(tabelas)

    resultado = validar.validar(tabelas)
    config.RELATORIO_DIR.mkdir(parents=True, exist_ok=True)
    (config.RELATORIO_DIR / "relatorio.md").write_text(
        validar.relatorio_markdown(resultado), encoding="utf-8"
    )
    armazenar.salvar_csv(resultado, config.RELATORIO_DIR)
    problemas = sum(c["status"] != validar.OK for c in resultado["checagens"])
    print(f"{len(partidas)} jogos processados -> {config.DB_PATH}")
    print(f"Validação: {problemas} apontamentos -> {config.RELATORIO_DIR / 'relatorio.md'}")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("comando", choices=["status", "jogos", "detalhes", "processar", "tudo"])
    args = parser.parse_args(argv)

    if args.comando == "processar":
        return cmd_processar()

    try:
        api = ClienteAPI()
    except RuntimeError as e:
        print(e)
        return 1
    try:
        if args.comando == "status":
            return cmd_status(api)
        if args.comando == "jogos":
            return cmd_jogos(api)
        if args.comando == "detalhes":
            return cmd_detalhes(api)
        return cmd_jogos(api) or cmd_detalhes(api) or cmd_processar()
    except ErroAPI as e:
        print(f"Erro da API: {e}")
        return 1
    finally:
        if api.chamadas:
            print(f"[{api.chamadas} requisições usadas; restam {api.restantes_hoje} hoje]")


if __name__ == "__main__":
    sys.exit(main())
