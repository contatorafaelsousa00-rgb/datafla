import { barrasHorizontais, colunas, colunasAgrupadas, conteudoDica, dica, legenda, linhas, mapaCalor } from "./graficos.js";

const DEMO = new URLSearchParams(location.search).has("demo");
const CORES_COMP = {
  "Brasileirão": "var(--s1)", "Libertadores": "var(--s2)", "Copa do Brasil": "var(--s3)",
  "Carioca": "var(--s4)", "Supercopa": "var(--s5)", "Recopa": "var(--s6)",
};
const ORDEM_COMP = Object.keys(CORES_COMP);
const ORDEM_POS = ["Goleiro", "Defensor", "Meio-campo", "Atacante"];
const corComp = (c) => CORES_COMP[c] ?? "var(--mudo)";
const $ = (id) => document.getElementById(id);

const estado = { comps: new Set(), mando: "", aba: "geral", jogador: null, jogo: null,
  ordem: { campo: "minutos", desc: true }, busca: "" };
let D; // dados preparados

// ---------- formatação ----------
const nf = (casas) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const num = (v, casas = 0) => (v === null || v === undefined || Number.isNaN(v) ? "–" : nf(casas).format(v));
const pct = (v, casas = 1) => (v === null || Number.isNaN(v) ? "–" : nf(casas).format(v * 100) + "%");
const data = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const dataLonga = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });
const mes = (iso) => new Date(iso).toLocaleDateString("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).replace(".", "");
const assinado = (v) => (v > 0 ? "+" : "") + num(v);

function h(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) n.append(f instanceof Node ? f : String(f));
  return n;
}
const tagComp = (c) => h("span", { class: "tag-comp" }, h("i", { style: `background:${corComp(c)}` }), c);

// ---------- dados ----------
function agrupar(lista, chave) {
  const m = new Map();
  for (const x of lista) {
    const k = x[chave];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

function preparar(bruto) {
  const partidas = bruto.partidas.slice().sort((a, b) => a.data_utc.localeCompare(b.data_utc));
  const stats = new Map();
  for (const s of bruto.estatisticas) {
    if (!stats.has(s.id_partida)) stats.set(s.id_partida, { fla: {}, adv: {} });
    stats.get(s.id_partida)[s.eh_flamengo ? "fla" : "adv"][s.estatistica] = s.valor;
  }
  for (const p of partidas) {
    const st = stats.get(p.id_partida) ?? { fla: {}, adv: {} };
    p.xg_pro = st.fla.xg ?? null;
    p.xg_contra = st.adv.xg ?? null;
  }
  return {
    bruto, partidas, stats,
    jogadoresPorPartida: agrupar(bruto.jogadores, "id_partida"),
    eventosPorPartida: agrupar(bruto.eventos, "id_partida"),
    elenco: new Map(bruto.elenco.map((j) => [j.jogador_id, j])),
    competicoes: ORDEM_COMP.filter((c) => partidas.some((p) => p.competicao === c))
      .concat([...new Set(partidas.map((p) => p.competicao))].filter((c) => !ORDEM_COMP.includes(c))),
  };
}

const filtradas = () => D.partidas.filter((p) => estado.comps.has(p.competicao) && (!estado.mando || p.mando === estado.mando));
const pontos = (ps) => ps.reduce((s, p) => s + (p.resultado === "V" ? 3 : p.resultado === "E" ? 1 : 0), 0);
const contar = (ps, r) => ps.filter((p) => p.resultado === r).length;
const soma = (lista, f) => lista.reduce((s, x) => s + (f(x) ?? 0), 0);

// ---------- visão geral ----------
function kpi(rotulo, valor, extra, destaque = false) {
  return h("div", { class: "kpi" + (destaque ? " destaque" : "") },
    h("div", { class: "rotulo" }, rotulo), h("div", { class: "valor" }, valor), extra ? h("div", { class: "extra" }, extra) : null);
}

function renderGeral(ps) {
  const n = ps.length;
  const gp = soma(ps, (p) => p.gols_pro), gc = soma(ps, (p) => p.gols_contra);
  const comXg = ps.filter((p) => p.xg_pro !== null);
  $("kpis").replaceChildren(
    kpi("Aproveitamento", n ? pct(pontos(ps) / (3 * n)) : "–", `${pontos(ps)} pontos em ${n} jogos`, true),
    kpi("Campanha", `${contar(ps, "V")}V ${contar(ps, "E")}E ${contar(ps, "D")}D`, "vitórias, empates e derrotas"),
    kpi("Gols", `${gp} × ${gc}`, `saldo ${assinado(gp - gc)}`),
    kpi("xG", comXg.length ? `${num(soma(comXg, (p) => p.xg_pro), 1)} × ${num(soma(comXg, (p) => p.xg_contra), 1)}` : "Sem xG",
      comXg.length ? `a favor × contra, em ${comXg.length} de ${n} jogos` : "nenhum jogo filtrado tem xG"),
    kpi("Média de gols", n ? num(gp / n, 2) : "–", n ? `sofre ${num(gc / n, 2)} por jogo` : null),
  );

  // Aproveitamento por competição
  const porComp = D.competicoes.map((c) => [c, ps.filter((p) => p.competicao === c)]).filter(([, l]) => l.length);
  const alvo = $("graf-aproveitamento");
  if (!porComp.length) alvo.replaceChildren(h("p", { class: "vazio" }, "Nenhum jogo no filtro."));
  else barrasHorizontais(alvo, porComp.map(([c, l]) => ({
    rotulo: c, valor: pontos(l) / (3 * l.length) * 100, cor: corComp(c),
    texto: `${pct(pontos(l) / (3 * l.length), 0)} · ${l.length} j`,
    dica: () => conteudoDica(c, [{ valor: pct(pontos(l) / (3 * l.length)), nome: "aproveitamento" },
      { valor: `${contar(l, "V")}V ${contar(l, "E")}E ${contar(l, "D")}D`, nome: `em ${l.length} jogos` }]),
  })), { max: 100 });

  // Gols por faixa de 15 minutos
  const faixas = ["1–15", "16–30", "31–45", "46–60", "61–75", "76–90", "Prorr."];
  const faixa = (e) => (e.minuto > 90 ? 6 : Math.min(5, Math.max(0, Math.ceil(e.minuto / 15) - 1)));
  const pro = Array(7).fill(0), contra = Array(7).fill(0);
  for (const p of ps) for (const e of D.eventosPorPartida.get(p.id_partida) ?? []) {
    if (e.tipo !== "Goal" || e.detalhe === "Missed Penalty") continue;
    (e.eh_flamengo ? pro : contra)[faixa(e)]++;
  }
  const usar = pro[6] + contra[6] > 0 ? 7 : 6;
  colunasAgrupadas($("graf-faixas"), faixas.slice(0, usar), [
    { nome: "Marcados", cor: "var(--s1)", valores: pro.slice(0, usar) },
    { nome: "Sofridos", cor: "var(--s2)", valores: contra.slice(0, usar) },
  ]);

  // Gols x xG acumulados
  const caixa = $("graf-xg");
  caixa.replaceChildren();
  $("xg-nota").textContent = comXg.length
    ? `Só jogos com xG na API (${comXg.length} de ${n}). Gols acima do xG indicam finalização acima do esperado.`
    : "Nenhum jogo filtrado tem xG na API.";
  if (comXg.length >= 2) {
    const grade = h("div", { class: "grade-2" });
    const ataque = h("div"), defesa = h("div");
    grade.append(h("div", {}, h("h3", {}, "Ataque"), ataque), h("div", {}, h("h3", {}, "Defesa"), defesa));
    caixa.append(grade);
    const acum = (f) => { let s = 0; return comXg.map((p) => (s += f(p) ?? 0)); };
    const rot = comXg.map((p) => `${data(p.data_utc)} x ${p.adversario}`);
    const rotCurto = comXg.map((p) => data(p.data_utc));
    const fmt = (v) => num(v, 1);
    linhas(ataque, rotCurto, [
      { nome: "gols", cor: "var(--s1)", valores: acum((p) => p.gols_pro) },
      { nome: "xG", cor: "var(--s2)", valores: acum((p) => p.xg_pro) },
    ], { formato: fmt, dicaRotulos: rot });
    linhas(defesa, rotCurto, [
      { nome: "sofridos", cor: "var(--s1)", valores: acum((p) => p.gols_contra) },
      { nome: "xG contra", cor: "var(--s2)", valores: acum((p) => p.xg_contra) },
    ], { formato: fmt });
  }

  // Sequência
  $("sequencia").replaceChildren(...ps.map((p) => {
    const chip = h("span", { class: `resultado ${p.resultado}`, tabindex: 0, "aria-label": `${p.resultado} contra ${p.adversario}` }, p.resultado);
    dica(chip, () => conteudoDica(`${dataLonga(p.data_utc)} · ${p.competicao}`,
      [{ valor: `${p.gols_pro} × ${p.gols_contra}`, nome: `${p.mando === "Casa" ? "contra" : "fora, contra"} ${p.adversario}` }]));
    return chip;
  }));
  if (!ps.length) $("sequencia").append(h("p", { class: "vazio" }, "Nenhum jogo no filtro."));

  // Próximos jogos
  const futuros = D.bruto.calendario
    .filter((j) => !["FT", "AET", "PEN"].includes(j.status) && estado.comps.has(j.competicao) && (!estado.mando || j.mando === estado.mando))
    .sort((a, b) => a.data_utc.localeCompare(b.data_utc)).slice(0, 6);
  $("proximos").replaceChildren(futuros.length
    ? h("table", { class: "tabela" }, h("tbody", {}, futuros.map((j) => h("tr", {},
        h("td", {}, dataLonga(j.data_utc)), h("td", {}, tagComp(j.competicao)), h("td", {}, j.mando), h("td", {}, j.adversario)))))
    : h("p", { class: "vazio" }, "Nenhum jogo futuro no calendário."));
}

// ---------- jogadores ----------
function agregarJogadores(ps) {
  const ag = new Map();
  for (const p of ps) for (const j of D.jogadoresPorPartida.get(p.id_partida) ?? []) {
    if (!ag.has(j.jogador_id)) {
      const el = D.elenco.get(j.jogador_id);
      ag.set(j.jogador_id, { id: j.jogador_id, jogador: j.jogador, posicao: el?.posicao ?? j.posicao, idade: el?.idade ?? null,
        relacionado: 0, jogos: 0, titular: 0, minutos: 0, gols: 0, assistencias: 0, finalizacoes: 0, desarmes: 0,
        amarelos: 0, vermelhos: 0, somaNota: 0, nNota: 0 });
    }
    const a = ag.get(j.jogador_id);
    a.relacionado++;
    if (j.minutos > 0) a.jogos++;
    if (j.titular) a.titular++;
    a.minutos += j.minutos ?? 0;
    for (const c of ["gols", "assistencias", "finalizacoes", "desarmes", "amarelos", "vermelhos"]) a[c] += j[c] ?? 0;
    if (j.nota !== null && j.minutos > 0) { a.somaNota += j.nota; a.nNota++; }
  }
  const possiveis = soma(ps, (p) => p.duracao);
  for (const a of ag.values()) {
    a.pctMin = possiveis ? a.minutos / possiveis : null;
    a.ga90 = a.minutos ? (a.gols + a.assistencias) / a.minutos * 90 : null;
    a.fin90 = a.minutos ? a.finalizacoes / a.minutos * 90 : null;
    a.nota = a.nNota ? a.somaNota / a.nNota : null;
  }
  return [...ag.values()].filter((a) => a.minutos > 0);
}

const COLS_JOG = [
  { campo: "jogador", titulo: "Jogador", txt: true },
  { campo: "posicao", titulo: "Pos.", txt: true },
  { campo: "idade", titulo: "Idade" },
  { campo: "jogos", titulo: "Jogos" },
  { campo: "titular", titulo: "Titular" },
  { campo: "minutos", titulo: "Minutos" },
  { campo: "pctMin", titulo: "% min.", f: (v) => pct(v, 0) },
  { campo: "gols", titulo: "Gols" },
  { campo: "assistencias", titulo: "Assist." },
  { campo: "ga90", titulo: "G+A/90", f: (v) => num(v, 2) },
  { campo: "fin90", titulo: "Final./90", f: (v) => num(v, 1) },
  { campo: "nota", titulo: "Nota", f: (v) => num(v, 2) },
  { campo: "amarelos", titulo: "Amar." },
  { campo: "vermelhos", titulo: "Verm." },
];

function renderJogadores(ps) {
  let lista = agregarJogadores(ps);
  const busca = estado.busca.trim().toLowerCase();
  if (busca) lista = lista.filter((a) => a.jogador.toLowerCase().includes(busca));
  const { campo, desc } = estado.ordem;
  lista.sort((a, b) => {
    const va = a[campo], vb = b[campo];
    if (va === vb) return b.minutos - a.minutos;
    if (va === null) return 1;
    if (vb === null) return -1;
    const r = typeof va === "string" ? va.localeCompare(vb, "pt-BR") : va - vb;
    return desc ? -r : r;
  });
  const cab = h("tr", {}, COLS_JOG.map((c) => h("th", {
    class: `ordenavel${c.txt ? "" : " num"}`, scope: "col",
    "aria-sort": c.campo === campo ? (desc ? "descending" : "ascending") : null,
    onclick: () => { estado.ordem = { campo: c.campo, desc: c.campo === campo ? !desc : !c.txt }; render(); },
  }, c.titulo)));
  const corpo = lista.map((a) => h("tr", {
    class: "clicavel" + (estado.jogador === a.id ? " selecionado" : ""), tabindex: 0,
    onclick: () => { estado.jogador = a.id; render(); $("detalhe-jogador").scrollIntoView({ behavior: "smooth", block: "nearest" }); },
    onkeydown: (e) => { if (e.key === "Enter") { estado.jogador = a.id; render(); } },
  }, COLS_JOG.map((c) => h("td", { class: c.txt ? "" : "num" }, c.f ? c.f(a[c.campo]) : (a[c.campo] ?? "–")))));
  $("tabela-jogadores").replaceChildren(h("thead", {}, cab), h("tbody", {}, corpo.length ? corpo
    : h("tr", {}, h("td", { colspan: COLS_JOG.length, class: "vazio" }, "Nenhum jogador no filtro."))));
  renderDetalheJogador(ps, lista);
}

function situacao(j, p) {
  if (!j) return "não relacionado";
  if (!(j.minutos > 0)) return "no banco, não entrou";
  if (j.titular) return j.minutos < p.duracao ? `titular, saiu (${j.minutos} min)` : "titular, jogo inteiro";
  return `entrou (${j.minutos} min)`;
}

function renderDetalheJogador(ps, lista) {
  const caixa = $("detalhe-jogador");
  const a = lista.find((x) => x.id === estado.jogador);
  caixa.hidden = !a;
  if (!a) return;
  const grafico = h("div", { class: "grafico" });
  caixa.replaceChildren(
    h("h2", {}, a.jogador),
    h("p", { class: "sutil" }, [a.posicao, a.idade ? `${a.idade} anos` : null].filter(Boolean).join(" · ")),
    h("div", { class: "mini-kpis" },
      ...[["Minutos", num(a.minutos)], ["Jogos", `${a.jogos} (${a.titular} tit.)`], ["Gols", a.gols], ["Assistências", a.assistencias],
        ["G+A por 90", num(a.ga90, 2)], ["Nota média", num(a.nota, 2)]].map(([r, v]) => h("div", {}, h("b", {}, v), h("span", {}, r)))),
    h("h3", { style: "margin-top:16px" }, "Minutos por jogo"),
    grafico,
  );
  const itens = ps.map((p) => {
    const j = (D.jogadoresPorPartida.get(p.id_partida) ?? []).find((x) => x.jogador_id === a.id);
    return { valor: j?.minutos ?? 0, cor: corComp(p.competicao),
      dica: () => conteudoDica(`${dataLonga(p.data_utc)} · ${p.competicao}`,
        [{ valor: `${j?.minutos ?? 0} min`, nome: `x ${p.adversario}` }, { valor: situacao(j, p) }]) };
  });
  colunas(grafico, itens, { max: Math.max(90, ...itens.map((i) => i.valor)),
    rotuloX: (i) => (i === 0 || mes(ps[i].data_utc) !== mes(ps[i - 1].data_utc) ? mes(ps[i].data_utc) : null) });
  legenda(caixa, D.competicoes.filter((c) => ps.some((p) => p.competicao === c)).map((c) => ({ nome: c, cor: corComp(c) })));
}

// ---------- minutagem ----------
const FAIXAS_MIN = [[15, "1–15"], [45, "16–45"], [70, "46–70"], [89, "71–89"], [Infinity, "90+"]];
const nivelMin = (m) => FAIXAS_MIN.findIndex(([lim]) => m <= lim);

function renderMinutagem(ps) {
  const lista = agregarJogadores(ps).sort((a, b) =>
    (ORDEM_POS.indexOf(a.posicao) - ORDEM_POS.indexOf(b.posicao)) || b.minutos - a.minutos);
  const leg = $("legenda-minutagem");
  leg.replaceChildren(
    ...FAIXAS_MIN.map(([, r], i) => h("span", {}, h("i", { style: `background:var(--seq-${i})` }), `${r} min`)),
    h("span", {}, h("i", { style: "border:1px solid var(--eixo)" }), "no banco"),
    h("span", {}, h("i", { style: "border:1px dashed var(--grade)" }), "não relacionado"),
    ...D.competicoes.filter((c) => ps.some((p) => p.competicao === c))
      .map((c) => h("span", {}, h("i", { class: "traco", style: `background:${corComp(c)}` }), c)),
  );
  if (!lista.length) { $("mapa-minutagem").replaceChildren(h("p", { class: "vazio" }, "Nenhum jogo no filtro.")); return; }
  const indice = new Map(ps.map((p, ci) => [p.id_partida, ci]));
  const grade = lista.map(() => Array(ps.length).fill(null));
  const linhaDe = new Map(lista.map((a, li) => [a.id, li]));
  for (const p of ps) for (const j of D.jogadoresPorPartida.get(p.id_partida) ?? []) {
    const li = linhaDe.get(j.jogador_id);
    if (li !== undefined) grade[li][indice.get(p.id_partida)] = j;
  }
  mapaCalor($("mapa-minutagem"),
    lista.map((a) => ({ rotulo: a.jogador, extra: `${num(a.minutos)} min` })),
    ps.map((p) => ({ cor: corComp(p.competicao),
      dica: () => conteudoDica(`${dataLonga(p.data_utc)} · ${p.competicao}`, [{ valor: `${p.gols_pro} × ${p.gols_contra}`, nome: `x ${p.adversario}` }]) })),
    (li, ci) => {
      const j = grade[li][ci];
      if (!j) return { estado: "fora" };
      return j.minutos > 0 ? { estado: "jogou", minutos: j.minutos } : { estado: "banco" };
    },
    { nivel: nivelMin,
      dicaCelula: (li, ci) => conteudoDica(`${lista[li].jogador} · ${data(ps[ci].data_utc)} x ${ps[ci].adversario}`,
        [{ valor: situacao(grade[li][ci], ps[ci]) }]) });
}

// ---------- jogos ----------
function renderJogos(ps) {
  const lista = ps.slice().reverse();
  $("tabela-jogos").replaceChildren(
    h("thead", {}, h("tr", {}, ["Data", "Competição", "Mando", "Adversário", "Placar", "Res.", "xG"].map((t, i) =>
      h("th", { class: i >= 4 ? "num" : "" }, t)))),
    h("tbody", {}, lista.length ? lista.map((p) => h("tr", {
      class: "clicavel" + (estado.jogo === p.id_partida ? " selecionado" : ""), tabindex: 0,
      onclick: () => { estado.jogo = p.id_partida; render(); $("detalhe-jogo").scrollIntoView({ behavior: "smooth", block: "nearest" }); },
      onkeydown: (e) => { if (e.key === "Enter") { estado.jogo = p.id_partida; render(); } },
    },
      h("td", {}, dataLonga(p.data_utc)), h("td", {}, tagComp(p.competicao)), h("td", {}, p.mando), h("td", {}, p.adversario),
      h("td", { class: "num" }, `${p.gols_pro} × ${p.gols_contra}` + (p.penaltis_pro !== null ? ` (${p.penaltis_pro}–${p.penaltis_contra} pên.)` : "")),
      h("td", { class: "num" }, h("span", { class: `resultado ${p.resultado}` }, p.resultado)),
      h("td", { class: "num" }, p.xg_pro !== null ? `${num(p.xg_pro, 2)} × ${num(p.xg_contra, 2)}` : "–"),
    )) : h("tr", {}, h("td", { colspan: 7, class: "vazio" }, "Nenhum jogo no filtro."))));
  renderDetalheJogo(ps);
}

const STATS_JOGO = [["posse", "Posse", (v) => pct(v, 0)], ["xg", "xG", (v) => num(v, 2)], ["finalizacoes", "Finalizações"],
  ["finalizacoes_alvo", "No alvo"], ["escanteios", "Escanteios"], ["faltas", "Faltas"], ["passes", "Passes"],
  ["passes_pct", "Passes certos", (v) => pct(v, 0)], ["impedimentos", "Impedimentos"], ["amarelos", "Amarelos"], ["vermelhos", "Vermelhos"]];
const NOME_EVENTO = { Goal: "Gol", Card: "Cartão", subst: "Substituição", Var: "VAR" };

function renderDetalheJogo(ps) {
  const caixa = $("detalhe-jogo");
  const p = ps.find((x) => x.id_partida === estado.jogo);
  caixa.hidden = !p;
  if (!p) return;
  const st = D.stats.get(p.id_partida) ?? { fla: {}, adv: {} };
  const js = (D.jogadoresPorPartida.get(p.id_partida) ?? []).slice();
  const titulares = js.filter((j) => j.titular).sort((a, b) => ORDEM_POS.indexOf(a.posicao) - ORDEM_POS.indexOf(b.posicao));
  const entraram = js.filter((j) => !j.titular && j.minutos > 0).sort((a, b) => b.minutos - a.minutos);
  const linhaJog = (j) => h("tr", {}, h("td", { class: "num" }, j.numero ?? ""), h("td", {}, j.jogador),
    h("td", { class: "num" }, `${j.minutos ?? "–"}'`), h("td", { class: "num" }, j.nota !== null ? num(j.nota, 1) : "–"));
  const tabelaStats = STATS_JOGO.filter(([k]) => st.fla[k] !== undefined || st.adv[k] !== undefined);
  const eventos = D.eventosPorPartida.get(p.id_partida) ?? [];
  const [casa, fora] = p.mando === "Casa" ? ["Flamengo", p.adversario] : [p.adversario, "Flamengo"];
  const [gc, gf] = p.mando === "Casa" ? [p.gols_pro, p.gols_contra] : [p.gols_contra, p.gols_pro];

  caixa.replaceChildren(
    h("div", { class: "placar" }, h("h2", {}, casa), h("span", { class: "gols" }, `${gc} × ${gf}`), h("h2", {}, fora)),
    h("p", { class: "sutil" }, [p.competicao, p.rodada, dataLonga(p.data_utc), p.estadio, p.formacao ? `Formação ${p.formacao}` : null].filter(Boolean).join(" · ")),
    h("div", { class: "detalhe-grade" },
      h("div", {}, h("h3", {}, "Estatísticas"), tabelaStats.length
        ? h("table", { class: "tabela" }, h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", { class: "num" }, "Flamengo"), h("th", { class: "num" }, p.adversario))),
            h("tbody", {}, tabelaStats.map(([k, rot, f = (v) => num(v)]) => h("tr", {}, h("td", {}, rot),
              h("td", { class: "num" }, st.fla[k] !== undefined && st.fla[k] !== null ? f(st.fla[k]) : "–"),
              h("td", { class: "num" }, st.adv[k] !== undefined && st.adv[k] !== null ? f(st.adv[k]) : "–")))))
        : h("p", { class: "vazio" }, "Sem estatísticas na API.")),
      h("div", {}, h("h3", {}, "Escalação do Flamengo"),
        h("table", { class: "tabela" }, h("thead", {}, h("tr", {}, h("th", { class: "num" }, "Nº"), h("th", {}, "Titulares"), h("th", { class: "num" }, "Min."), h("th", { class: "num" }, "Nota"))),
          h("tbody", {}, titulares.map(linhaJog))),
        entraram.length ? h("table", { class: "tabela", style: "margin-top:10px" },
          h("thead", {}, h("tr", {}, h("th", { class: "num" }, "Nº"), h("th", {}, "Entraram"), h("th", { class: "num" }, "Min."), h("th", { class: "num" }, "Nota"))),
          h("tbody", {}, entraram.map(linhaJog))) : null),
      h("div", {}, h("h3", {}, "Eventos"), eventos.length
        ? h("ul", { class: "lista-eventos" }, eventos.map((e) => h("li", { class: e.eh_flamengo ? "" : "adv" },
            h("span", { class: "min" }, `${e.minuto}${e.acrescimo ? "+" + e.acrescimo : ""}'`),
            h("span", {}, `${e.detalhe && e.tipo === "Card" ? e.detalhe.replace("Yellow Card", "Amarelo").replace("Red Card", "Vermelho") : NOME_EVENTO[e.tipo] ?? e.tipo}: `,
              e.jogador ?? "", e.tipo === "subst" && e.assist ? ` ⇄ ${e.assist}` : "",
              e.tipo === "Goal" && e.assist ? ` (assist. ${e.assist})` : "", e.eh_flamengo ? "" : ` · ${p.adversario}`))))
        : h("p", { class: "vazio" }, "Sem eventos na API."))),
  );
}

// ---------- qualidade ----------
const CAMPOS_COMPL = [["escalacao", "Escalação"], ["minutagem", "Minutagem"], ["estatisticas_jogador", "Estat. jogador"],
  ["nota", "Nota"], ["estatisticas_time", "Estat. time"], ["xg", "xG"]];
const NOME_REGRA = { gols: "Gols × placar", titulares: "Titulares", titulares_sem_minutos: "Titular sem minutos",
  substituicoes: "Substituições", substituicoes_vs_eventos: "Substituições × eventos", minutos: "Soma de minutos",
  finalizacoes: "Finalizações", escalacao: "Escalação" };

function renderQualidade() {
  const v = D.bruto.validacao;
  const compl = v.completude.filter((c) => estado.comps.has(c.competicao));
  const porComp = D.competicoes.map((c) => [c, compl.filter((x) => x.competicao === c)]).filter(([, l]) => l.length);
  $("tabela-completude").replaceChildren(
    h("thead", {}, h("tr", {}, h("th", {}, "Competição"), h("th", { class: "num" }, "Jogos"), CAMPOS_COMPL.map(([, t]) => h("th", {}, t)))),
    h("tbody", {}, porComp.map(([c, l]) => h("tr", {}, h("td", {}, tagComp(c)), h("td", { class: "num" }, l.length),
      CAMPOS_COMPL.map(([k]) => {
        const f = l.filter((x) => x[k]).length / l.length;
        return h("td", {}, h("span", { class: "medidor" }, h("b", { style: `width:${f * 100}%` })), pct(f, 0));
      })))));
  const probs = v.checagens.filter((c) => c.status !== "ok" && estado.comps.has(c.competicao))
    .sort((a, b) => b.data_utc.localeCompare(a.data_utc));
  $("tabela-apontamentos").replaceChildren(
    h("thead", {}, h("tr", {}, ["Data", "Competição", "Jogo", "Time", "Regra", "Status", "Detalhe"].map((t) => h("th", {}, t)))),
    h("tbody", {}, probs.length ? probs.map((c) => h("tr", {}, h("td", {}, dataLonga(c.data_utc)), h("td", {}, tagComp(c.competicao)),
      h("td", {}, `x ${c.adversario}`), h("td", {}, c.time), h("td", {}, NOME_REGRA[c.regra] ?? c.regra),
      h("td", {}, h("span", { class: `status ${c.status}` }, c.status === "erro" ? "Erro" : "Alerta")), h("td", {}, c.detalhe)))
      : h("tr", {}, h("td", { colspan: 7, class: "vazio" }, "Nenhuma inconsistência nos jogos filtrados."))));
}

// ---------- filtros, abas, render ----------
const BASE = DEMO ? "dados-demo/" : "dados/";
let TEMPORADAS = [];

function montarCompeticoes() {
  const caixa = $("filtro-competicoes");
  caixa.replaceChildren(...D.competicoes.map((c) => h("button", {
    class: "chip", "aria-pressed": "true", "data-comp": c, onclick: () => {
      if (estado.comps.has(c)) { if (estado.comps.size > 1) estado.comps.delete(c); } else estado.comps.add(c);
      for (const b of caixa.children) b.setAttribute("aria-pressed", estado.comps.has(b.dataset.comp));
      render();
    },
  }, h("span", { class: "ponto", style: `background:${corComp(c)}` }), c)));
}

function montarTemporadas(atual) {
  $("filtro-temporada").replaceChildren(...TEMPORADAS.map((t) => h("button", {
    "aria-pressed": String(t.temporada === atual), onclick: () => carregarTemporada(t.temporada),
  }, String(t.temporada))));
}

function montarControlesFixos() {
  for (const b of $("filtro-mando").children) b.addEventListener("click", () => {
    estado.mando = b.dataset.mando;
    for (const x of $("filtro-mando").children) x.setAttribute("aria-pressed", x === b);
    render();
  });
  for (const b of document.querySelectorAll(".abas button")) b.addEventListener("click", () => {
    estado.aba = b.dataset.aba;
    for (const x of document.querySelectorAll(".abas button")) x.setAttribute("aria-selected", x === b);
    for (const s of document.querySelectorAll(".aba")) s.hidden = s.id !== `aba-${estado.aba}`;
    render();
  });
  $("busca-jogador").addEventListener("input", (e) => { estado.busca = e.target.value; render(); });
}

function render() {
  const ps = filtradas();
  ({ geral: renderGeral, jogadores: renderJogadores, minutagem: renderMinutagem, jogos: renderJogos, qualidade: renderQualidade })[estado.aba](ps);
}

function semDados(msg) {
  document.querySelector("main").replaceChildren(h("div", { class: "cartao" }, h("h2", {}, "Sem dados ainda"),
    h("p", { class: "sutil" }, msg)));
}

async function buscarJson(caminho) {
  const resp = await fetch(BASE + caminho, { cache: "no-store" });
  if (!resp.ok) throw new Error(`${caminho}: HTTP ${resp.status}`);
  return resp.json();
}

async function carregarTemporada(ano) {
  document.querySelector("main").style.opacity = ".5";
  try {
    D = preparar(await buscarJson(`${ano}.json`));
  } catch (e) {
    document.querySelector("main").style.opacity = "";
    semDados(`Não foi possível carregar a temporada ${ano} (${e.message}).`);
    return;
  }
  document.querySelector("main").style.opacity = "";
  const url = new URL(location);
  url.searchParams.set("t", ano);
  history.replaceState(null, "", url);
  document.title = `DataFla · Flamengo ${ano}`;
  $("titulo-temporada").textContent = `· Flamengo ${ano}`;
  $("aviso-demo").hidden = !D.bruto.meta.demo;
  $("atualizado").textContent = `Atualizado em ${new Date(D.bruto.meta.gerado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
  estado.comps = new Set(D.competicoes);
  estado.jogador = null;
  estado.jogo = null;
  montarTemporadas(ano);
  montarCompeticoes();
  render();
}

async function iniciar() {
  try {
    TEMPORADAS = await buscarJson("temporadas.json");
  } catch {
    TEMPORADAS = [];
  }
  if (!TEMPORADAS.length) {
    semDados("Rode a coleta (python -m coleta.coletar tudo) para gerar site/dados/, ou abra com ?demo=1 para ver dados fictícios.");
    return;
  }
  const pedida = Number(new URLSearchParams(location.search).get("t"));
  const ano = TEMPORADAS.some((t) => t.temporada === pedida) ? pedida : TEMPORADAS[0].temporada;
  montarControlesFixos();
  await carregarTemporada(ano);
  let t;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(render, 150); });
}

iniciar();
