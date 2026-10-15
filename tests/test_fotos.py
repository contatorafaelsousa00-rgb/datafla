"""Casamento dos jogadores da Highlightly com o elenco da API-Football (que tem as fotos)."""

from coleta import fotos


def elenco(*itens):
    return [{"id": i, "name": n, "number": num, "photo": f"foto/{i}.png"} for i, n, num in itens]


def jogador(jid, nome, numero=None, completo=None):
    return {"jogador_id": jid, "jogador": nome, "numero": numero, "nome_completo": completo}


def test_casa_por_nome_ignorando_acento_e_ponto():
    e = elenco((1, "A. Rossi", 1), (2, "Léo Pereira", 4))
    assert fotos.casar([jogador(10, "A. Rossi", 1), jogador(11, "Leo Pereira", 4)], e) == {10: "foto/1.png", 11: "foto/2.png"}


def test_desempata_sobrenome_pelo_numero_e_aceita_troca_de_camisa():
    e = elenco((1, "João Victor Cunha", 61), (2, "Victor Hugo", 8), (3, "Lucas Paquetá", 11))
    casados = fotos.casar([jogador(10, "João Victor", 61, "João Victor da Silva Cunha"), jogador(11, "Lucas Paquetá", 20)], e)
    assert casados == {10: "foto/1.png", 11: "foto/3.png"}  # Paquetá mudou de número: casa pelo nome


def test_nao_casa_quando_ambiguo_ou_ausente():
    e = elenco((1, "Bruno Silva", 5), (2, "Carlos Silva", 7))
    assert fotos.casar([jogador(10, "Silva", 9), jogador(11, "Wallace", 18)], e) == {}


def test_foto_local_usa_copia_e_cai_na_url_sem_rede(tmp_path, monkeypatch):
    (tmp_path / "7.png").write_bytes(b"png")
    assert fotos.foto_local("https://media.api-sports.io/football/players/7.png", tmp_path) == "fotos/7.png"

    def sem_rede(*a, **k):
        raise fotos.requests.ConnectionError("sem rede")
    monkeypatch.setattr(fotos.requests, "get", sem_rede)
    url = "https://media.api-sports.io/football/players/8.png"
    assert fotos.foto_local(url, tmp_path) == url  # sem cópia e sem rede: mantém a URL original


def test_logos_locais_troca_url_pela_copia_por_tipo(tmp_path, monkeypatch):
    from coleta import imagens
    (tmp_path / "logos" / "teams").mkdir(parents=True)
    (tmp_path / "logos" / "teams" / "5.png").write_bytes(b"png")

    def sem_rede(*a, **k):
        raise imagens.requests.ConnectionError("sem rede")
    monkeypatch.setattr(imagens.requests, "get", sem_rede)
    url_liga = "https://highlightly.net/soccer/images/leagues/5.png"
    tabelas = {"partidas": [{"adversario_logo": "https://highlightly.net/soccer/images/teams/5.png",
                             "competicao_logo": url_liga, "flamengo_logo": None}], "meta": {}}
    assert imagens.logos_locais(tabelas, tmp_path) == 1
    linha = tabelas["partidas"][0]
    assert linha["adversario_logo"] == "logos/teams/5.png"
    assert linha["competicao_logo"] == url_liga  # mesmo ID, outro tipo: sem cópia e sem rede, mantém a URL
    assert linha["flamengo_logo"] is None
