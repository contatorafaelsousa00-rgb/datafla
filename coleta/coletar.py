"""Linha de comando da coleta.

    python -m coleta.coletar status     # confere chave, cota, time e acesso à temporada
    python -m coleta.coletar planejar   # decide, sem usar a API, se vale coletar agora (usado pelo workflow)
    (todos aceitam --temporada 2025; o padrão é o ano atual)
    (e --fonte highlightly|api-football; o padrão é highlightly quando há HIGHLIGHTLY_KEY no .env)

    python -m coleta.coletar jogos      # baixa a lista de jogos do Flamengo na temporada
    python -m coleta.coletar elenco     # baixa o elenco atual (idade, posição, número)
    python -m coleta.coletar detalhes   # baixa os detalhes dos jogos encerrados que faltam
    python -m coleta.coletar proximo    # próximos jogos: previsão, estádio, árbitro, confrontos, forma do adversário
    python -m coleta.coletar extras     # escalações, classificação e carreira dos jogadores (aos poucos, pela cota)
    python -m coleta.coletar fotos      # fotos dos jogadores (elenco da API-Football; renovado a cada 7 dias)
    python -m coleta.coletar processar  # gera banco, CSVs e relatório de validação (sem usar a API)
    python -m coleta.coletar tudo       # jogos + elenco + detalhes + processar
    python -m coleta.coletar modelo-sumula <id_partida>  # cria planilha para conferir com a súmula
    python -m coleta.coletar sumulas    # compara as súmulas preenchidas com a API
    python -m coleta.coletar inspecionar  # responde as dúvidas da documentação usando os jogos baixados
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone

from . import alteracoes, armazenar, config, exportar, extras, fotos, highlightly, imagens, inspecionar, normalizar, sumulas, validar
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
        if len(lote) == 1:
            corpo = api.get("fixtures", id=lote[0])
        else:
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


def _hl() -> bool:
    return config.FONTE == "highlightly"


def _normalizar(partidas: list[dict]) -> dict:
    return highlightly.normalizar(partidas) if _hl() else normalizar.normalizar(partidas, config.TEAM_ID)


def cmd_processar():
    partidas = carregar_partidas()
    if not partidas:
        print(f"Nenhum jogo baixado ainda em {config.RAW_DIR} (fonte {config.FONTE}).")
        return 1
    tabelas = _normalizar(partidas)
    jogos, elenco = ler_raw(ARQ_JOGOS), ler_raw(ARQ_ELENCO)
    if _hl():
        tabelas["calendario"] = highlightly.linhas_calendario(jogos["data"]) if jogos else []
    else:
        tabelas["calendario"] = normalizar.linhas_calendario(jogos["response"], config.TEAM_ID) if jogos else []
    tabelas["elenco"] = normalizar.linhas_elenco(elenco["response"], config.TEAM_ID) if elenco else []
    if _hl() and jogos:
        tabelas.update(highlightly.linhas_proximos(jogos["data"]))
        tabelas["escalacoes"], formacoes = extras.linhas_escalacoes([p["id_partida"] for p in tabelas["partidas"]])
        for p in tabelas["partidas"]:
            p["formacao"], p["formacao_adversario"] = formacoes.get(p["id_partida"], (None, None))
        tabelas["classificacao"] = extras.linhas_classificacao(jogos["data"])
        tabelas["carreira"] = extras.linhas_carreira()
        tabelas["liga"] = extras.linhas_liga(jogos["data"])
        tabelas["fotos"] = fotos.linhas_fotos(tabelas["jogadores_partida"])
        imagens.logos_locais(tabelas)
    armazenar.salvar_sqlite(tabelas)
    armazenar.salvar_csv(tabelas)

    resultado = validar.validar(tabelas)
    config.RELATORIO_DIR.mkdir(parents=True, exist_ok=True)
    (config.RELATORIO_DIR / "relatorio.md").write_text(
        validar.relatorio_markdown(resultado), encoding="utf-8"
    )
    armazenar.salvar_csv(resultado, config.RELATORIO_DIR)
    # "Atualizado em" do painel = última coleta (não a hora do deploy, que roda processar de novo)
    coletado = jogos.get("_coletado_em") if isinstance(jogos, dict) else None
    site = exportar.exportar(tabelas, resultado, demo=os.environ.get("FLA_DEMO") == "1", coletado_em=coletado)
    # Histórico das coletas, só para a tela de admin (arquivo separado: não pesa no painel)
    historico = config.PASTA_TEMPORADA / highlightly.ARQ_HISTORICO
    if historico.exists():
        (site.parent / f"atualizacoes-{config.SEASON}.json").write_text(historico.read_text(encoding="utf-8"), encoding="utf-8")
    problemas = sum(c["status"] != validar.OK for c in resultado["checagens"])
    print(f"{len(partidas)} jogos processados -> {config.DB_PATH}")
    print(f"Validação: {problemas} apontamentos -> {config.RELATORIO_DIR / 'relatorio.md'}")
    print(f"Site: {site}")
    return 0


def _tabelas_baixadas():
    partidas = carregar_partidas()
    return _normalizar(partidas) if partidas else None


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


def cmd_inspecionar():
    if _hl():
        print("O comando inspecionar responde dúvidas da API-Football; use --fonte api-football.")
        return 1
    partidas = carregar_partidas()
    if not partidas:
        print("Nenhum jogo baixado ainda. Rode antes: python -m coleta.coletar tudo")
        return 1
    texto = inspecionar.relatorio(partidas)
    config.RELATORIO_DIR.mkdir(parents=True, exist_ok=True)
    (config.RELATORIO_DIR / "inspecao.md").write_text(texto, encoding="utf-8")
    print(texto)
    print(f"-> {config.RELATORIO_DIR / 'inspecao.md'}")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("comando", choices=[
        "status", "planejar", "jogos", "elenco", "detalhes", "proximo", "extras", "fotos", "processar", "tudo", "modelo-sumula", "sumulas", "inspecionar"])
    parser.add_argument("id_partida", nargs="?", type=int)
    parser.add_argument("-t", "--temporada", type=int, help=f"ano da temporada (padrão: {config.SEASON})")
    parser.add_argument("--forcar", action="store_true", help="planejar: coleta mesmo sem novidade")
    parser.add_argument("-f", "--fonte", choices=sorted(config.FONTES), help=f"fonte dos dados (padrão: {config.FONTE})")
    args = parser.parse_args(argv)
    if args.fonte:
        config.aplicar_fonte(args.fonte)
    if args.temporada:
        config.aplicar_temporada(args.temporada)
    print(f"Temporada {config.SEASON} · fonte {config.FONTE}")

    if args.comando == "planejar":
        return highlightly.cmd_planejar(args.forcar)
    if args.comando == "processar":
        return cmd_processar()
    if args.comando == "sumulas":
        return cmd_sumulas()
    if args.comando == "inspecionar":
        return cmd_inspecionar()
    if args.comando == "modelo-sumula":
        if args.id_partida is None:
            parser.error("informe o id_partida (veja data/<ano>/csv/partidas.csv)")
        return cmd_modelo_sumula(args.id_partida)

    try:
        api = highlightly.ClienteHighlightly() if _hl() else ClienteAPI()
    except RuntimeError as e:
        print(e)
        return 1
    try:
        if _hl():
            if args.comando == "status":
                return highlightly.cmd_status(api)
            if args.comando == "jogos":
                return highlightly.cmd_jogos(api)
            if args.comando == "elenco":
                print("Elenco: a fonte Highlightly não tem elenco; os jogadores vêm dos jogos.")
                return 0
            if args.comando == "detalhes":
                return highlightly.cmd_detalhes(api)
            if args.comando == "proximo":
                return highlightly.cmd_proximo(api)
            if args.comando == "extras":
                return extras.cmd_extras(api)
            if args.comando == "fotos":
                return fotos.cmd_fotos(forcar=True)
            # Jogos encerrados têm prioridade na cota; o próximo jogo vem depois.
            antes = highlightly.situacao_coleta()["baixados"]
            salvas = highlightly.coletas_salvas()
            try:
                try:
                    codigo = (highlightly.cmd_jogos(api) or highlightly.cmd_detalhes(api)
                              or highlightly.cmd_proximo(api) or extras.cmd_extras(api) or fotos.cmd_fotos())
                except ErroAPI as e:
                    highlightly.registrar_atualizacao(salvas, api, str(e))
                    raise
                # o histórico entra antes de processar, para o site publicado já levar esta coleta
                highlightly.registrar_atualizacao(salvas, api)
                return codigo or cmd_processar()
            finally:
                s = highlightly.situacao_coleta()
                highlightly.resumo_github(
                    "| Coleta | |\n|---|---|\n"
                    f"| Jogos encerrados no calendário | {s['encerrados']} |\n"
                    f"| Com detalhes baixados | {s['baixados']} (+{s['baixados'] - antes} nesta execução) |\n"
                    f"| Pendentes | {s['pendentes']} |\n"
                    f"| Requisições usadas | {api.chamadas} |\n"
                    f"| Cota restante hoje | {api.restantes_hoje if api.restantes_hoje is not None else '?'} |\n")
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
