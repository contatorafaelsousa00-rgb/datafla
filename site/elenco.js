// Aba Elenco: em alta/baixa, carga recente, rotação e minutagem jogo a jogo.
import { barrasHorizontais, colunas, conteudoDica, dica, mapaCalor, serie } from "./graficos.js";
import { $, assinado, comDetalhe, corComp, D, data, dataLonga, dicaJogo, estado, h, media, num, ORDEM_POS, rotuloMes, vazio } from "./comum.js";
import { abrirJogador, agregarJogadores, situacao } from "./jogadores.js";

// =====================================================================
// ELENCO
// =====================================================================
export function renderElenco(js) {
  const det = comDetalhe(js);
  // Momento: nota nos últimos 5 jogos do jogador × média da temporada
  const porJogador = new Map();
  for (const p of det) for (const j of D.jogadoresPorPartida.get(p.id_partida) ?? []) {
    if (!(j.minutos >= 20) || j.nota == null) continue;
    if (!porJogador.has(j.jogador_id)) porJogador.set(j.jogador_id, { nome: j.jogador, posicao: j.posicao, notas: [] });
    porJogador.get(j.jogador_id).notas.push(j.nota);
  }
  const momento = [...porJogador.entries()].filter(([, v]) => v.notas.length >= 8).map(([id, v]) => {
    const recente = media(v.notas.slice(-5)), temporada = media(v.notas);
    return { id, ...v, recente, temporada, delta: recente - temporada };
  });
  const lista = (itens) => (itens.length ? h("ul", { class: "lista-simples" }, itens.map((m) => h("li", { class: "clicavel", onclick: () => abrirJogador(m.id) },
    h("span", { class: `delta ${m.delta >= 0 ? "sobe" : "desce"}` }, assinado(m.delta, 2)),
    h("span", { class: "cresce" }, h("b", {}, m.nome), h("span", { class: "sutil" }, ` · ${m.posicao}`)),
    h("span", { class: "chance" }, num(m.recente, 2), h("small", {}, ` nos últimos 5 · ${num(m.temporada, 2)} na temporada`)))))
    : vazio("Ninguém com 8+ jogos com nota nessa direção."));
  $("em-alta").replaceChildren(lista(momento.filter((m) => m.delta > 0.05).sort((a, b) => b.delta - a.delta).slice(0, 6)));
  $("em-baixa").replaceChildren(lista(momento.filter((m) => m.delta < -0.05).sort((a, b) => a.delta - b.delta).slice(0, 6)));

  // Carga: minutos nos 30 dias até o último jogo filtrado
  const ultimo = det.at(-1);
  if (!ultimo) { $("graf-carga").replaceChildren(vazio("Nenhum jogo no filtro.")); $("nota-carga").textContent = ""; }
  else {
    const fim = new Date(ultimo.data_utc), ini = new Date(fim - 30 * 864e5);
    const janela = det.filter((p) => new Date(p.data_utc) > ini);
    const carga = new Map();
    for (const p of janela) for (const j of D.jogadoresPorPartida.get(p.id_partida) ?? []) {
      if (!(j.minutos > 0)) continue;
      const c = carga.get(j.jogador_id) ?? { nome: j.jogador, minutos: 0, jogos: 0 };
      c.minutos += j.minutos; c.jogos++;
      carga.set(j.jogador_id, c);
    }
    const top = [...carga.values()].sort((a, b) => b.minutos - a.minutos).slice(0, 12);
    $("nota-carga").textContent = `Minutos em campo nos 30 dias até ${dataLonga(ultimo.data_utc)}: ${janela.length} jogos, até ${num(janela.length * 90)} min possíveis.`;
    barrasHorizontais($("graf-carga"), top.map((c) => ({ rotulo: c.nome, valor: c.minutos, cor: "var(--serie-1)",
      texto: `${num(c.minutos)} min · ${c.jogos} j`,
      dica: () => conteudoDica(c.nome, [{ valor: `${num(c.minutos)} min`, nome: `em ${c.jogos} jogos` }]) })),
    { max: janela.length * 90, larguraRotulo: 130 });
  }

  // Rotação: titulares trocados em relação ao jogo anterior (só jogos com escalação na fonte)
  const comEscalacao = det.filter((p) => (D.jogadoresPorPartida.get(p.id_partida) ?? []).some((j) => j.titular));
  const tit = comEscalacao.map((p) => new Set((D.jogadoresPorPartida.get(p.id_partida) ?? []).filter((j) => j.titular).map((j) => j.jogador_id)));
  const trocas = comEscalacao.map((p, i) => (i === 0 ? null : [...tit[i]].filter((id) => !tit[i - 1].has(id)).length));
  if (comEscalacao.length < 2) $("graf-rotacao").replaceChildren(vazio("Poucos jogos com escalação no filtro."));
  else colunas($("graf-rotacao"), comEscalacao.map((p, i) => ({ valor: trocas[i] ?? 0, cor: corComp(p.competicao),
    dica: dicaJogo(p, [{ valor: trocas[i] == null ? "–" : `${trocas[i]} titulares novos`, nome: "em relação ao jogo anterior" }]) })),
  { max: 11, altura: 170, rotuloX: rotuloMes(comEscalacao) });

  renderMinutagem(det);
}

export const FAIXAS_MIN = [[15, "1–15"], [45, "16–45"], [70, "46–70"], [89, "71–89"], [Infinity, "90+"]];
export const nivelMin = (m) => FAIXAS_MIN.findIndex(([lim]) => m <= lim);

export function renderMinutagem(ps) {
  const lista = agregarJogadores(ps).sort((a, b) =>
    (ORDEM_POS.indexOf(a.posicao) - ORDEM_POS.indexOf(b.posicao)) || b.minutos - a.minutos);
  $("legenda-minutagem").replaceChildren(
    ...FAIXAS_MIN.map(([, r], i) => h("span", {}, h("i", { style: `background:var(--seq-${i})` }), `${r} min`)),
    h("span", {}, h("i", { style: "border:1px solid var(--eixo)" }), "no banco"),
    h("span", {}, h("i", { style: "border:1px dashed var(--grade)" }), "não relacionado"),
    ...D.competicoes.filter((c) => ps.some((p) => p.competicao === c))
      .map((c) => h("span", {}, h("i", { class: "traco", style: `background:${corComp(c)}` }), c)),
  );
  if (!lista.length) { $("mapa-minutagem").replaceChildren(vazio("Nenhum jogo no filtro.")); return; }
  const indice = new Map(ps.map((p, ci) => [p.id_partida, ci]));
  const grade = lista.map(() => Array(ps.length).fill(null));
  const linhaDe = new Map(lista.map((a, li) => [a.id, li]));
  for (const p of ps) for (const j of D.jogadoresPorPartida.get(p.id_partida) ?? []) {
    const li = linhaDe.get(j.jogador_id);
    if (li !== undefined) grade[li][indice.get(p.id_partida)] = j;
  }
  mapaCalor($("mapa-minutagem"),
    lista.map((a) => ({ rotulo: a.jogador, extra: `${num(a.minutos)} min` })),
    ps.map((p) => ({ cor: corComp(p.competicao), dica: dicaJogo(p) })),
    (li, ci) => {
      const j = grade[li][ci];
      if (!j) return { estado: "fora" };
      return j.minutos > 0 ? { estado: "jogou", minutos: j.minutos } : { estado: "banco" };
    },
    { nivel: nivelMin,
      dicaCelula: (li, ci) => conteudoDica(`${lista[li].jogador} · ${data(ps[ci].data_utc)} x ${ps[ci].adversario}`,
        [{ valor: situacao(grade[li][ci], ps[ci]) }]) });
}
