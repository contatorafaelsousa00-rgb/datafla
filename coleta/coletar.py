"""Linha de comando da coleta.

    python -m coleta.coletar status     # confere chave, cota, time e acesso à temporada
    (todos aceitam --temporada 2025; o padrão é o ano atual)

    python -m coleta.coletar jogos      # baixa a lista de jogos do Flamengo na temporada
    python -m coleta.coletar elenco     # baixa o elenco atual (idade, posição, número)
    python -m coleta.coletar detalhes   # baixa os detalhes dos jogos encerrados que faltam
    python -m coleta.coletar processar  # gera banco, CSVs e relatório de validação (sem usar a API)
    python -m coleta.coletar tudo       # jogos + elenco + detalhes + processar
    python -m coleta.coletar modelo-sumula <id_partida>  # cria planilha para conferir com a súmula
    python -m coleta.coletar sumulas    # compara as súmulas preenchidas com a API
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone

from . import alteracoes, armazenar, config, exportar, normalizar, sumulas, validar
from .api import ClienteAPI, ErroAPI, ler_raw, salvar_raw

ARQ_JOGOS = "jogos"
ARQ_ELENCO = "elenco"


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


def cmd_elenco(api: ClienteAPI):
    if config.SEASON != config.TEMPORADA_ATUAL:
        # /players/squads só devolve o elenco de hoje; idade e número não valem para temporadas passadas.
        print(f"Elenco ignorado: a API só tem o elenco atual, não o de {config.SEASON}.")
        return 0
    corpo = api.get("players/squads", team=config.TEAM_ID)
    salvar_raw(ARQ_ELENCO, corpo)
    n = sum(len(b.get("players", [])) for b in corpo["response"])
    print(f"Elenco: {n} jogadores.")
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
        mudancas = []
        for partida in corpo["response"]:
            partida["_coletado_em"] = _agora().isoformat()
            nome = f"partida_{partida['fixture']['id']}"
            anterior = ler_raw(nome)
            if anterior is not None:
                mudancas += alteracoes.comparar(anterior, partida)
            salvar_raw(nome, partida)
        alteracoes.registrar(mudancas)
        print(f"  lote {i // config.LOTE_DETALHES + 1}: {len(corpo['response'])} jogos salvos"
              + (f", {len(mudancas)} valores mudaram desde a coleta anterior" if mudancas else ""))
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
    jogos, elenco = ler_raw(ARQ_JOGOS), ler_raw(ARQ_ELENCO)
    tabelas["calendario"] = normalizar.linhas_calendario(jogos["response"]) if jogos else []
    tabelas["elenco"] = normalizar.linhas_elenco(elenco["response"]) if elenco else []
    armazenar.salvar_sqlite(tabelas)
    armazenar.salvar_csv(tabelas)

    resultado = validar.validar(tabelas)
    config.RELATORIO_DIR.mkdir(parents=True, exist_ok=True)
    (config.RELATORIO_DIR / "relatorio.md").write_text(
        validar.relatorio_markdown(resultado), encoding="utf-8"
    )
    armazenar.salvar_csv(resultado, config.RELATORIO_DIR)
    site = exportar.exportar(tabelas, resultado, demo=os.environ.get("FLA_DEMO") == "1")
    problemas = sum(c["status"] != validar.OK for c in resultado["checagens"])
    print(f"{len(partidas)} jogos processados -> {config.DB_PATH}")
    print(f"Validação: {problemas} apontamentos -> {config.RELATORIO_DIR / 'relatorio.md'}")
    print(f"Site: {site}")
    return 0


def _tabelas_baixadas():
    partidas = carregar_partidas()
    return normalizar.normalizar(partidas) if partidas else None


def cmd_modelo_sumula(id_partida: int):
    t = _tabelas_baixadas()
    partida = next((p for p in (t or {}).get("partidas", []) if p["id_partida"] == id_partida), None)
    if partida is None:
        print(f"Partida {id_partida} não encontrada entre os jogos baixados.")
        return 1
    jogadores = [j for j in t["jogadores_partida"] if j["id_partida"] == id_partida]
    caminho = sumulas.criar_modelo(partida, jogadores)
    print(f"Modelo criado: {caminho} (x {partida['adversario']}, {partida['data_utc'][:10]})")
    return 0


def cmd_sumulas():
    t = _tabelas_baixadas()
    if t is None:
        print("Nenhum jogo baixado ainda.")
        return 1
    partidas = {p["id_partida"]: p for p in t["partidas"]}
    comparacoes = []
    for arq in sorted(config.SUMULAS_DIR.glob("*.csv")):
        pid = int(arq.stem)
        if pid not in partidas:
            print(f"  {arq.name}: partida não baixada, ignorada")
            continue
        jogadores = [j for j in t["jogadores_partida"] if j["id_partida"] == pid]
        comparacoes += sumulas.comparar(partidas[pid], jogadores, sumulas.ler_sumula(arq))
    config.RELATORIO_DIR.mkdir(parents=True, exist_ok=True)
    destino = config.RELATORIO_DIR / "sumulas.md"
    destino.write_text(sumulas.resumo_markdown(comparacoes), encoding="utf-8")
    divergentes = sum(not c["confere"] for c in comparacoes)
    print(f"{len(comparacoes)} itens comparados, {divergentes} divergências -> {destino}")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("comando", choices=[
        "status", "jogos", "elenco", "detalhes", "processar", "tudo", "modelo-sumula", "sumulas"])
    parser.add_argument("id_partida", nargs="?", type=int)
    parser.add_argument("-t", "--temporada", type=int, help=f"ano da temporada (padrão: {config.SEASON})")
    args = parser.parse_args(argv)
    if args.temporada:
        config.aplicar_temporada(args.temporada)
    print(f"Temporada {config.SEASON}")

    if args.comando == "processar":
        return cmd_processar()
    if args.comando == "sumulas":
        return cmd_sumulas()
    if args.comando == "modelo-sumula":
        if args.id_partida is None:
            parser.error("informe o id_partida (veja data/<ano>/csv/partidas.csv)")
        return cmd_modelo_sumula(args.id_partida)

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
        if args.comando == "elenco":
            return cmd_elenco(api)
        if args.comando == "detalhes":
            return cmd_detalhes(api)
        return cmd_jogos(api) or cmd_elenco(api) or cmd_detalhes(api) or cmd_processar()
    except ErroAPI as e:
        print(f"Erro da API: {e}")
        return 1
    finally:
        if api.chamadas:
            print(f"[{api.chamadas} requisições usadas; restam {api.restantes_hoje} hoje]")


if __name__ == "__main__":
    sys.exit(main())
