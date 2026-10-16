// Aba Elenco: em alta/baixa, carga recente, rotação e minutagem jogo a jogo.
import { barrasHorizontais, colunas, conteudoDica, dica, mapaCalor, serie } from "./graficos.js";
import { $, assinado, comDetalhe, corComp, D, data, dataLonga, dicaJogo, estado, h, media, num, ORDEM_POS, preencher, rotuloMes, vazio } from "./comum.js";
import { abrirJogador, agregarJogadores, situacao } from "./jogadores.js";

// =====================================================================
// ELENCO
// =====================================================================
// ---------- subaba Ficha do elenco: idade, valor de mercado, contrato... agrupados por posição ----------
const GRUPOS_ELENCO = ["Goleiros", "Defensores", "Meio-campo", "Atacantes"];
const euros = (v) => (v == null ? "–" : v >= 1e6 ? `€ ${num(v / 1e6, v >= 1e7 ? 0 : 1)} mi` : `€ ${num(v / 1e3, 0)} mil`);
const dataCurta = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–");
const idade = (iso) => { if (!iso) return null; const n = new Date(`${iso}T12:00:00Z`), h = new Date();
  return h.getFullYear() - n.getFullYear() - (h < new Date(h.getFullYear(), n.getMonth(), n.getDate()) ? 1 : 0); };
const mesesAte = (iso) => (iso ? (new Date(`${iso}T12:00:00Z`) - Date.now()) / (30.44 * 864e5) : null);
let ordemFicha = { campo: "valor_mercado", desc: true };

function renderFicha(js) {
  const caixa = $("elenco-ficha");
  const perfis = (D.bruto.perfis ?? []).filter((p) => /flamengo/i.test(p.clube_atual ?? ""));
  if (!perfis.length) { preencher(caixa, h("article", { class: "cartao" }, vazio("A ficha do elenco chega nas próximas coletas."))); return; }
  const temporada = new Map(agregarJogadores(js).map((a) => [a.id, a]));
  const linhas = perfis.map((p) => ({ ...p, idade: idade(p.nascimento), meses: mesesAte(p.contrato_ate), t: temporada.get(p.jogador_id),
    numero: temporada.get(p.jogador_id)?.numero }));
  const total = linhas.reduce((s, l) => s + (l.valor_mercado ?? 0), 0);
  const idades = linhas.map((l) => l.idade).filter((x) => x != null);
  const vencendo = linhas.filter((l) => l.meses != null && l.meses <= 12);
  const lesionados = linhas.filter((l) => l.lesao_atual);
  const kpi = (r, v, e) => h("div", { class: "kpi" }, h("div", { class: "rotulo" }, r), h("div", { class: "valor" }, v), e ? h("div", { class: "extra" }, e) : null);
  const COLS = [["numero", "Nº"], ["jogador", "Jogador"], ["posicao_detalhada", "Posição"], ["idade", "Idade"], ["nacionalidade", "Nacionalidade"],
    ["altura", "Altura"], ["pe", "Pé"], ["valor_mercado", "Valor de mercado"], ["contrato_ate", "Contrato até"], ["no_clube_desde", "No clube desde"],
    ["jogos", "Jogos 2026"], ["minutos", "Min. 2026"]];
  const valor = (l, c) => (c === "jogos" || c === "minutos" ? l.t?.[c] ?? 0 : l[c]);
  const ordenar = (a, b) => { const x = valor(a, ordemFicha.campo), y = valor(b, ordemFicha.campo);
    const r = x == null ? 1 : y == null ? -1 : typeof x === "string" ? x.localeCompare(y) : x - y; return ordemFicha.desc ? -r : r; };
  const cab = h("thead", {}, h("tr", {}, COLS.map(([c, t], i) => h("th", { class: (i >= 3 && !["nacionalidade", "pe"].includes(c) ? "num " : "") + "ordenavel",
    "aria-sort": ordemFicha.campo === c ? (ordemFicha.desc ? "descending" : "ascending") : null,
    onclick: () => { ordemFicha = { campo: c, desc: ordemFicha.campo === c ? !ordemFicha.desc : true }; renderFicha(js); } }, t))));
  const celula = (l) => {
    const variacao = l.valor_anterior ? l.valor_mercado - l.valor_anterior : 0;
    return h("tr", { class: "clicavel" + (l.lesao_atual ? " lesionado" : ""), onclick: () => (l.t ? abrirJogador(l.jogador_id) : null) },
      h("td", { class: "num" }, l.numero ?? ""),
      h("td", {}, h("b", {}, l.jogador), /u-?\s?(17|20|23)/i.test(l.clube_atual ?? "") ? h("span", { class: "sutil" }, " (base)") : null, l.lesao_atual ? h("span", { class: "selo-lesao", title: `Lesionado: ${l.lesao_atual}` },
        ` lesionado${l.lesao_volta ? ` até ${dataCurta(l.lesao_volta)}` : ""}`) : null),
      h("td", {}, l.posicao_detalhada ?? "–", l.posicao_secundaria ? h("span", { class: "sutil" }, ` / ${l.posicao_secundaria}`) : null),
      h("td", { class: "num" }, l.idade ?? "–"), h("td", {}, l.nacionalidade ?? "–"),
      h("td", { class: "num" }, l.altura ? `${num(l.altura, 2)} m` : "–"), h("td", {}, l.pe ?? "–"),
      h("td", { class: "num", title: l.valor_data ? `Atualizado em ${dataCurta(l.valor_data)}; máximo da carreira ${euros(l.valor_maximo)}` : null },
        euros(l.valor_mercado), variacao ? h("span", { class: variacao > 0 ? "delta sobe" : "delta desce" }, variacao > 0 ? " ▲" : " ▼") : null),
      h("td", { class: "num" + (l.meses != null && l.meses <= 6 ? " alerta-contrato" : "") }, dataCurta(l.contrato_ate)),
      h("td", { class: "num" }, dataCurta(l.no_clube_desde)),
      h("td", { class: "num" }, l.t?.jogos ?? 0), h("td", { class: "num" }, num(l.t?.minutos ?? 0)));
  };
  preencher(caixa,
    h("div", { class: "kpis" },
      kpi("Jogadores", linhas.length, "com perfil na fonte"),
      kpi("Valor de mercado", euros(total), "soma do elenco"),
      kpi("Idade média", idades.length ? num(idades.reduce((a, b) => a + b, 0) / idades.length, 1) : "–", `${Math.min(...idades)} a ${Math.max(...idades)} anos`),
      kpi("Contratos até 12 meses", vencendo.length, vencendo.length ? vencendo.slice(0, 3).map((l) => l.jogador).join(", ") + (vencendo.length > 3 ? "…" : "") : "nenhum"),
      kpi("Lesionados", lesionados.length, lesionados.map((l) => l.jogador).join(", ") || "nenhum")),
    ...GRUPOS_ELENCO.concat([null]).map((g) => {
      const doGrupo = linhas.filter((l) => (g ? l.grupo === g : !GRUPOS_ELENCO.includes(l.grupo))).sort(ordenar);
      if (!doGrupo.length) return null;
      return h("article", { class: "cartao" }, h("h2", {}, g ?? "Sem posição na fonte",
          h("span", { class: "sutil" }, ` · ${doGrupo.length} ${doGrupo.length === 1 ? "jogador" : "jogadores"} · ${euros(doGrupo.reduce((s, l) => s + (l.valor_mercado ?? 0), 0))}`)),
        h("div", { class: "tabela-rolagem" }, h("table", { class: "tabela tabela-ficha" }, cab.cloneNode(true), h("tbody", {}, doGrupo.map(celula)))));
    }),
    h("p", { class: "sutil" }, "Fonte: perfil dos jogadores na Highlightly (dados do Transfermarkt), atualizado uma vez por semana. "
      + "Contrato em vermelho: vence em até 6 meses. Clique no cabeçalho para ordenar e num jogador para ver o perfil."));
  // o clone do cabeçalho perde os cliques: religa em cada tabela
  caixa.querySelectorAll(".tabela-ficha thead th").forEach((th, i) => th.addEventListener("click", () => {
    const c = COLS[i][0]; ordemFicha = { campo: c, desc: ordemFicha.campo === c ? !ordemFicha.desc : true }; renderFicha(js); }));
}

export function renderElenco(js) {
  for (const b of $("subaba-elenco").children) b.setAttribute("aria-pressed", String(b.dataset.sub === estado.subElenco));
  const ficha = estado.subElenco === "ficha";
  $("elenco-ficha").hidden = !ficha;
  $("elenco-desempenho").hidden = ficha;
  if (ficha) return renderFicha(js);
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
