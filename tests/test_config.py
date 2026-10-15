from coleta import config


def test_carregar_env(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text('# comentário\nFLA_TESTE_A="valor a"\nFLA_TESTE_B=b\nlinha sem igual\n', encoding="utf-8")
    monkeypatch.delenv("FLA_TESTE_A", raising=False)
    monkeypatch.setenv("FLA_TESTE_B", "do terminal")
    config.carregar_env(env)
    import os
    assert os.environ["FLA_TESTE_A"] == "valor a"
    assert os.environ["FLA_TESTE_B"] == "do terminal"  # terminal tem prioridade
    monkeypatch.delenv("FLA_TESTE_A")
