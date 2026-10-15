import {
  barrasEspelhadas, barrasHorizontais, colunas, colunasAgrupadas, colunasDivergentes, conteudoDica, dica, dispersao,
  linhaTempo, linhas, mapaCalor, mapaGol, serie,
} from "./graficos.js";

// Painel organizado pelas perguntas que os dados respondem: como está a temporada, como foi cada
// jogo, quem rende o quê, como está o elenco, como o time joga e quanto confiar nos dados.
// Feito para a temporada 2026 (fonte Highlightly); uma visão some quando a fonte não tem o dado.

const DEMO = new URLSearchParams(location.search).has("demo");
const CORES_COMP = {
  "Brasileirão": "var(--s1)", "Libertadores": "var(--s2)", "Copa do Brasil": "var(--s3)",
  "Carioca": "var(--s4)", "Supercopa": "var(--s5)", "Recopa": "var(--s6)",
};
const ORDEM_COMP = Object.keys(CORES_COMP);
const ORDEM_POS = ["Goleiro", "Defensor", "Meio-campo", "Atacante"];
const ENCERRADO = new Set(["FT", "AET", "PEN"]);
const MIN_MINUTOS = 450; // amostra mínima para comparar jogadores por 90 minutos
const corComp = (c) => CORES_COMP[c] ?? "var(--s7)"; // fora da lista (ex.: amistosos): cinza da identidade
let LOGOS = new Map(); // competição -> símbolo da fonte (a cor fica nos gráficos)
// Logos da fonte feitos para fundo branco e quase pretos: no tema escuro viram silhueta clara (CSS).
const LOGOS_ESCUROS = new Set(["Libertadores", "Supercopa", "Recopa", "Copa do Brasil"]);
// A fonte usa o logo da FIFA para amistosos, que não representa a competição.
const SEM_LOGO = new Set(["Amistosos"]);
// Símbolo da competição; sem símbolo, cai na bolinha com a cor da competição.
const simboloComp = (c) => (LOGOS.get(c) && !SEM_LOGO.has(c)
  ? h("img", { class: "logo-comp" + (LOGOS_ESCUROS.has(c) ? " escuro" : ""), src: LOGOS.get(c), alt: "", loading: "lazy",
    width: 22, height: 22, onerror: (e) => e.target.replaceWith(h("i", { class: "ponto", style: `background:${corComp(c)}` })) })
  : h("i", { class: "ponto", style: `background:${corComp(c)}` }));
const $ = (id) => document.getElementById(id);

// Filtros: comp ("" = todas), periodo ("temporada" | "10" | "5" | "AAAA-MM"), mando ("" | "Casa" | "Fora")
const estado = { comp: "", periodo: "temporada", mando: "", aba: "temporada", jogador: null, jogo: null,
  ordem: { campo: "minutos", desc: true }, busca: "", grupo: "geral", modo: "total" };
let D; // dados preparados

// ---------- formatação ----------
const nf = (casas) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const num = (v, casas = 0) => (v === null || v === undefined || Number.isNaN(v) ? "–" : nf(casas).format(v));
const pct = (v, casas = 1) => (v === null || v === undefined || Number.isNaN(v) ? "–" : nf(casas).format(v * 100) + "%");
const data = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const dataLonga = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });
const mes = (iso) => new Date(iso).toLocaleDateString("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).replace(".", "");
const assinado = (v, casas = 0) => {
  const r = Math.round(v * 10 ** casas) / 10 ** casas || 0; // evita "-0"
  return (r > 0 ? "+" : "") + num(r, casas);
};
const NOME_RES = { V: "vitória", E: "empate", D: "derrota" };

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
// Logo da competição para gráficos SVG (mesmas regras do símbolo: sem moldura, escuros invertidos no tema escuro)
const iconeComp = (c) => (LOGOS.get(c) && !SEM_LOGO.has(c)
  ? { src: LOGOS.get(c), classe: "logo-comp" + (LOGOS_ESCUROS.has(c) ? " escuro" : "") } : null);
const tagComp = (c) => h("span", { class: "tag-comp" }, simboloComp(c), c);
const escudo = (j) => h("span", { class: "time" },
  j.adversario_logo ? h("img", { src: j.adversario_logo, alt: "", loading: "lazy", width: 18, height: 18 }) : null, j.adversario);
const vazio = (texto) => h("p", { class: "vazio" }, texto);
const media = (lista) => (lista.length ? lista.reduce((s, v) => s + v, 0) / lista.length : null);
const soma = (lista, f) => lista.reduce((s, x) => s + (f(x) ?? 0), 0);
const pontosDe = (r) => (r === "V" ? 3 : r === "E" ? 1 : 0);
const pontos = (js) => js.reduce((s, j) => s + pontosDe(j.resultado), 0);
const contar = (js, r) => js.filter((j) => j.resultado === r).length;
const movel = (lista, f, n = 5) => lista.map((_, i) => media(lista.slice(Math.max(0, i - n + 1), i + 1).map(f).filter((v) => v != null)) ?? 0);
const rotuloMes = (lista) => (i) => (i === 0 || mes(lista[i].data_utc) !== mes(lista[i - 1].data_utc) ? mes(lista[i].data_utc) : null);

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

function resultado(pro, contra) {
  if (pro == null || contra == null) return null;
  return pro > contra ? "V" : pro < contra ? "D" : "E";
}

function preparar(bruto) {
  const stats = new Map();
  for (const s of bruto.estatisticas) {
    if (!stats.has(s.id_partida)) stats.set(s.id_partida, { fla: {}, adv: {} });
    stats.get(s.id_partida)[s.eh_flamengo ? "fla" : "adv"][s.estatistica] = s.valor;
  }
  const detalhes = new Map();
  for (const p of bruto.partidas) {
    const st = stats.get(p.id_partida) ?? { fla: {}, adv: {} };
    p.xg_pro = st.fla.xg ?? null;
    p.xg_contra = st.adv.xg ?? null;
    // Pontos esperados pela previsão pré-jogo da fonte (3 × P(vitória) + P(empate)).
    p.xp = p.prob_vitoria != null && p.prob_empate != null ? 3 * p.prob_vitoria + p.prob_empate : null;
    detalhes.set(p.id_partida, p);
  }
  // Resultados vêm do calendário (todos os jogos encerrados); o detalhe, quando já foi baixado.
  const base = bruto.calendario?.length ? bruto.calendario : bruto.partidas;
  const encerrados = base.filter((c) => ENCERRADO.has(c.status)).map((c) => {
    const det = detalhes.get(c.id_partida);
    return det ? { ...det, detalhe: true }
      : { ...c, resultado: resultado(c.gols_pro, c.gols_contra), xg_pro: null, xg_contra: null, xp: null, duracao: 90, detalhe: false };
  }).sort((a, b) => a.data_utc.localeCompare(b.data_utc));
  for (const j of bruto.jogadores) j.passes_certos ??= j.passes_precisao_api ?? null; // API-Football: contagem
  const comps = new Set(encerrados.map((p) => p.competicao).concat((bruto.calendario ?? []).map((c) => c.competicao)));
  LOGOS = new Map([...bruto.partidas, ...(bruto.calendario ?? [])].filter((c) => c.competicao_logo).map((c) => [c.competicao, c.competicao_logo]));
  return {
    bruto, stats, encerrados,
    calendario: bruto.calendario ?? [],
    jogadoresPorPartida: agrupar(bruto.jogadores, "id_partida"),
    eventosPorPartida: agrupar(bruto.eventos, "id_partida"),
    finalizacoesPorPartida: agrupar(bruto.finalizacoes ?? [], "id_partida"),
    fotos: new Map((bruto.fotos ?? []).map((f) => [f.jogador_id, f.foto])),
    competicoes: ORDEM_COMP.filter((c) => comps.has(c)).concat([...comps].filter((c) => !ORDEM_COMP.includes(c))),
    tem: {
      xg: bruto.partidas.some((p) => p.xg_pro != null),
      previsao: bruto.partidas.some((p) => p.xp != null),
    },
  };
}

const mesDe = (iso) => new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", timeZone: "America/Sao_Paulo" }).slice(0, 7);
const nomeMes = (aaaamm) => new Date(`${aaaamm}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const ehMes = (periodo) => /^\d{4}-\d{2}$/.test(periodo);
const compOk = (c) => !estado.comp || estado.comp === c;
// Jogos encerrados que passam pelos filtros. O período vale depois de competição e mando:
// "últimos 10" com Brasileirão = os 10 últimos jogos do Brasileirão.
function filtrados({ comMando = true } = {}) {
  let js = D.encerrados.filter((p) => compOk(p.competicao) && (!comMando || !estado.mando || p.mando === estado.mando));
  if (ehMes(estado.periodo)) js = js.filter((p) => mesDe(p.data_utc) === estado.periodo);
  else if (estado.periodo !== "temporada") js = js.slice(-Number(estado.periodo));
  return js;
}
const comDetalhe = (js) => js.filter((p) => p.detalhe);

// ---------- componentes ----------
function kpi(rotulo, valor, extra, destaque = false) {
  return h("div", { class: "kpi" + (destaque ? " destaque" : "") },
    h("div", { class: "rotulo" }, rotulo), h("div", { class: "valor" }, valor), extra ? h("div", { class: "extra" }, extra) : null);
}
const bola = (r) => h("span", { class: `resultado ${r}`, "aria-label": NOME_RES[r] }, r);
const dicaJogo = (p, linhasDica = []) => () => conteudoDica(`${dataLonga(p.data_utc)} · ${p.competicao}`,
  [{ valor: `${p.gols_pro} × ${p.gols_contra}`, nome: `${p.mando === "Casa" ? "x" : "fora, x"} ${p.adversario}` }, ...linhasDica]);
function mostrar(id, sim) { $(id).hidden = !sim; return sim; }
const notaTag = (v) => (v == null ? "–" : h("span", { class: "nota" + (v >= 7.5 ? " alta" : v < 6.3 ? " baixa" : "") }, num(v, 1)));

// =====================================================================
// PRÓXIMO JOGO
// =====================================================================
const CANCELADO = new Set(["ABD", "PST", "CANC"]);
const horaBR = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const diaBR = (iso) => new Date(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
const CLIMA = { rain: "chuva", cloudy: "nublado", clear: "céu limpo", sunny: "sol", "partly cloudy": "parcialmente nublado",
  overcast: "encoberto", snow: "neve", fog: "neblina", thunderstorm: "tempestade", drizzle: "garoa" };
let relogio; // atualiza a contagem regressiva

// Próximos jogos do calendário que passam pelos filtros de competição e mando (o período não se aplica ao futuro).
const futurosFiltrados = () => D.calendario
  .filter((j) => !ENCERRADO.has(j.status) && !CANCELADO.has(j.status) && new Date(j.data_utc) > Date.now() - 3 * 3600e3
    && compOk(j.competicao) && (!estado.mando || j.mando === estado.mando))
  .sort((a, b) => a.data_utc.localeCompare(b.data_utc));

function contagem(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return "em andamento";
  const min = Math.floor(ms / 6e4), d = Math.floor(min / 1440), hr = Math.floor((min % 1440) / 60), m = min % 60;
  if (d >= 2) return `em ${d} dias`;
  if (d === 1) return `em 1 dia e ${hr} h`;
  if (hr >= 1) return `em ${hr} h ${String(m).padStart(2, "0")} min`;
  return `em ${m} min`;
}

function renderProximo() {
  clearInterval(relogio);
  const base = futurosFiltrados()[0];
  if (!mostrar("card-proximo", !!base)) return;
  // Detalhe (estádio, árbitro, clima, previsão) só existe para o próximo jogo geral, baixado a cada coleta.
  const p = { ...base, ...((D.bruto.proximo ?? []).find((x) => x.id_partida === base.id_partida) ?? {}) };
  const logoFla = p.flamengo_logo ?? D.bruto.partidas.find((x) => x.flamengo_logo)?.flamengo_logo;
  const fla = { nome: "Flamengo", logo: logoFla }, adv = { nome: p.adversario, logo: p.adversario_logo };
  const [casa, fora] = p.mando === "Casa" ? [fla, adv] : [adv, fla];
  const lado = (t) => h("div", { class: "proximo-time" + (t === fla ? " fla" : "") },
    t.logo ? h("img", { src: t.logo, alt: "", width: 64, height: 64 }) : h("span", { class: "escudo-vazio" }), h("b", {}, t.nome));
  const cont = h("span", { class: "proximo-contagem" }, contagem(p.data_utc));
  const local = p.estadio ? `${p.estadio}${p.cidade ? `, ${p.cidade}` : ""}` : null;
  const clima = p.clima ? `${CLIMA[p.clima] ?? p.clima}${p.temperatura != null ? `, ${num(p.temperatura, 0)} °C` : ""}` : null;
  $("card-proximo").replaceChildren(
    h("div", { class: "proximo-topo" }, h("span", { class: "proximo-rotulo" }, "Próximo jogo"), cont),
    h("div", { class: "proximo-confronto" }, lado(casa),
      h("div", { class: "proximo-meio" }, h("b", {}, horaBR(p.data_utc)), h("span", {}, diaBR(p.data_utc))), lado(fora)),
    h("div", { class: "proximo-info" }, tagComp(p.competicao),
      ...[p.rodada, local ?? (p.mando === "Casa" ? "em casa" : "fora de casa"), p.arbitro ? `Árbitro: ${p.arbitro}` : null, clima]
        .filter(Boolean).map((t) => h("span", {}, t))),
    barraProbabilidade(p) ?? "",
  );
  relogio = setInterval(() => { cont.textContent = contagem(p.data_utc); }, 30000);
}

// =====================================================================
// TEMPORADA
// =====================================================================
function renderTemporada(js) {
  renderProximo();
  const n = js.length;
  const det = comDetalhe(js);
  const comXg = det.filter((p) => p.xg_pro != null);
  const comXp = det.filter((p) => p.xp != null);
  const gp = soma(js, (p) => p.gols_pro), gc = soma(js, (p) => p.gols_contra);
  const ult5 = js.slice(-5);

  $("kpis").replaceChildren(
    kpi("Aproveitamento", n ? pct(pontos(js) / (3 * n)) : "–", `${pontos(js)} pontos em ${n} jogos`, true),
    kpi("Campanha", `${contar(js, "V")}V ${contar(js, "E")}E ${contar(js, "D")}D`, "vitórias, empates e derrotas"),
    kpi("Gols", `${gp} × ${gc}`, `saldo ${assinado(gp - gc)} · ${num(n ? gp / n : null, 2)} por jogo`),
    comXg.length ? kpi("xG", `${num(soma(comXg, (p) => p.xg_pro), 1)} × ${num(soma(comXg, (p) => p.xg_contra), 1)}`,
      `saldo ${assinado(soma(comXg, (p) => p.xg_pro - p.xg_contra), 1)} em ${comXg.length} jogos`) : null,
    comXp.length ? kpi("Pontos × esperado", `${pontos(comXp)} × ${num(soma(comXp, (p) => p.xp), 1)}`,
      `${assinado(pontos(comXp) - soma(comXp, (p) => p.xp), 1)} sobre a previsão pré-jogo`) : null,
    ult5.length ? kpi("Últimos 5", h("span", { class: "forma" }, ult5.map((p) => bola(p.resultado))),
      `${pontos(ult5)} de ${3 * ult5.length} pontos`) : null,
  );

  // Desempenho jogo a jogo (saldo de xG)
  if (mostrar("card-desempenho", comXg.length >= 2)) {
    colunasDivergentes($("graf-desempenho"), comXg.map((p) => {
      const saldo = p.xg_pro - p.xg_contra;
      return { valor: saldo, cor: saldo >= 0 ? "var(--serie-1)" : "var(--serie-2)", marcador: p.resultado,
        dica: dicaJogo(p, [{ valor: `${num(p.xg_pro, 2)} × ${num(p.xg_contra, 2)}`, nome: "xG" },
          { valor: assinado(saldo, 2), nome: "saldo de xG" }]) };
    }), { rotuloX: rotuloMes(comXg) });
  }

  // Pontos × esperado e tendência de xG dividem a linha: definir visibilidade antes de medir
  mostrar("card-pontos", comXp.length >= 2);
  mostrar("card-tendencia", comXg.length >= 5);
  if (comXp.length >= 2) {
    const acum = (f) => { let t = 0; return comXp.map((p) => (t += f(p))); };
    linhas($("graf-pontos"), comXp.map((p) => data(p.data_utc)), [
      { nome: "pontos", cor: "var(--serie-1)", valores: acum((p) => pontosDe(p.resultado)) },
      { nome: "esperado", cor: "var(--serie-2)", valores: acum((p) => p.xp) },
    ], { formato: (v) => num(v, 1), dicaRotulos: comXp.map((p) => `${data(p.data_utc)} x ${p.adversario}`) });
  }
  if (comXg.length >= 5) {
    linhas($("graf-tendencia"), comXg.map((p) => data(p.data_utc)), [
      { nome: "xG a favor", cor: "var(--serie-1)", valores: movel(comXg, (p) => p.xg_pro) },
      { nome: "xG contra", cor: "var(--serie-2)", valores: movel(comXg, (p) => p.xg_contra) },
    ], { formato: (v) => num(v, 2), dicaRotulos: comXg.map((p) => `${data(p.data_utc)} x ${p.adversario} (média dos 5 últimos)`) });
  }

  // Por competição
  const porComp = D.competicoes.map((c) => [c, js.filter((p) => p.competicao === c)]).filter(([, l]) => l.length);
  if (!porComp.length) $("graf-competicoes").replaceChildren(vazio("Nenhum jogo no filtro."));
  else barrasHorizontais($("graf-competicoes"), porComp.map(([c, l]) => ({
    rotulo: c, valor: pontos(l) / (3 * l.length) * 100, cor: corComp(c), icone: iconeComp(c),
    texto: `${pct(pontos(l) / (3 * l.length), 0)} · ${l.length} j`,
    dica: () => conteudoDica(c, [{ valor: pct(pontos(l) / (3 * l.length)), nome: "aproveitamento" },
      { valor: `${contar(l, "V")}V ${contar(l, "E")}E ${contar(l, "D")}D`, nome: `em ${l.length} jogos` },
      { valor: `${soma(l, (p) => p.gols_pro)} × ${soma(l, (p) => p.gols_contra)}`, nome: "gols" }]),
  })), { max: 100, larguraRotulo: 110 });

  // Casa × fora (ignora o filtro de mando, que esconderia um dos lados)
  const linhaMando = (rot, l) => {
    const lx = l.filter((p) => p.xg_pro != null);
    return h("tr", {}, h("td", {}, rot), h("td", { class: "num" }, l.length),
      h("td", { class: "num" }, `${contar(l, "V")}-${contar(l, "E")}-${contar(l, "D")}`),
      h("td", { class: "num" }, l.length ? pct(pontos(l) / (3 * l.length), 0) : "–"),
      h("td", { class: "num" }, `${soma(l, (p) => p.gols_pro)} × ${soma(l, (p) => p.gols_contra)}`),
      D.tem.xg ? h("td", { class: "num" }, lx.length ? `${num(media(lx.map((p) => p.xg_pro)), 2)} × ${num(media(lx.map((p) => p.xg_contra)), 2)}` : "–") : null);
  };
  const base = filtrados({ comMando: false });
  $("tabela-mando").replaceChildren(h("table", { class: "tabela" },
    h("thead", {}, h("tr", {}, ["", "J", "V-E-D", "Aprov.", "Gols", D.tem.xg ? "xG por jogo" : null].filter((t) => t !== null)
      .map((t, i) => h("th", { class: i ? "num" : "" }, t)))),
    h("tbody", {}, linhaMando("Casa", base.filter((p) => p.mando === "Casa")), linhaMando("Fora", base.filter((p) => p.mando === "Fora")))));

  // Contra a previsão
  const chance = (p) => ({ V: p.prob_vitoria, E: p.prob_empate, D: p.prob_derrota })[p.resultado];
  const surpresas = det.filter((p) => chance(p) != null).sort((a, b) => chance(a) - chance(b)).slice(0, 5);
  if (mostrar("card-surpresas", surpresas.length > 0)) {
    $("surpresas").replaceChildren(h("ul", { class: "lista-simples" }, surpresas.map((p) => h("li", { class: "clicavel", onclick: () => { trocarAba("jogos"); abrirJogo(p.id_partida); } },
      bola(p.resultado), h("span", { class: "cresce" }, h("b", {}, `${p.gols_pro} × ${p.gols_contra} `), escudo(p),
        h("span", { class: "sutil" }, ` · ${data(p.data_utc)} · ${p.competicao}`)),
      h("span", { class: "chance" }, pct(chance(p), 0), h("small", {}, ` de chance de ${NOME_RES[p.resultado]}`))))));
  }

  // Forma e próximos
  $("sequencia").replaceChildren(...js.map((p) => {
    const chip = h("span", { class: `resultado ${p.resultado}`, tabindex: 0, "aria-label": `${NOME_RES[p.resultado]} contra ${p.adversario}` }, p.resultado);
    dica(chip, dicaJogo(p));
    return chip;
  }));
  if (!n) $("sequencia").append(vazio("Nenhum jogo no filtro."));
  const futuros = futurosFiltrados().slice(1, 6); // o primeiro já está no cartão em destaque
  $("proximos").replaceChildren(futuros.length
    ? h("table", { class: "tabela" }, h("tbody", {}, futuros.map((j) => h("tr", {},
        h("td", {}, `${dataLonga(j.data_utc)} · ${horaBR(j.data_utc)}`), h("td", {}, tagComp(j.competicao)), h("td", {}, j.mando), h("td", {}, escudo(j))))))
    : vazio("Nenhum jogo futuro no calendário."));
}

// =====================================================================
// JOGOS
// =====================================================================
function renderJogos(js) {
  const lista = js.slice().reverse();
  const cab = ["Data", "Competição", "Adversário", "Mando", "Placar", "Res.", D.tem.xg ? "xG" : null, D.tem.previsao ? "Chance pré-jogo" : null]
    .filter((t) => t !== null);
  $("tabela-jogos").replaceChildren(
    h("thead", {}, h("tr", {}, cab.map((t, i) => h("th", { class: i >= 4 ? "num" : "" }, t)))),
    h("tbody", {}, lista.length ? lista.map((p) => h("tr", {
      class: "clicavel" + (estado.jogo === p.id_partida ? " selecionado" : ""), tabindex: 0,
      onclick: () => abrirJogo(p.id_partida), onkeydown: (e) => { if (e.key === "Enter") abrirJogo(p.id_partida); },
    },
      h("td", {}, dataLonga(p.data_utc)), h("td", {}, tagComp(p.competicao)), h("td", {}, escudo(p)), h("td", {}, p.mando),
      h("td", { class: "num" }, `${p.gols_pro} × ${p.gols_contra}` + (p.penaltis_pro != null ? ` (${p.penaltis_pro}–${p.penaltis_contra} pên.)` : "")),
      h("td", { class: "num" }, bola(p.resultado)),
      D.tem.xg ? h("td", { class: "num" }, p.xg_pro != null ? `${num(p.xg_pro, 2)} × ${num(p.xg_contra, 2)}` : "–") : null,
      D.tem.previsao ? h("td", { class: "num" }, p.prob_vitoria != null ? h("span", { class: "medidor" }, h("b", { style: `width:${p.prob_vitoria * 100}%` })) : null,
        p.prob_vitoria != null ? pct(p.prob_vitoria, 0) : "–") : null,
    )) : h("tr", {}, h("td", { colspan: cab.length, class: "vazio" }, "Nenhum jogo no filtro."))));
  renderDetalheJogo(js);
}

function abrirJogo(id) {
  estado.jogo = id;
  render();
  $("detalhe-jogo").scrollIntoView({ behavior: "smooth", block: "start" });
}

const STATS_JOGO = [["xg", "xG", (v) => num(v, 2)], ["xa", "xA", (v) => num(v, 2)], ["grandes_chances", "Grandes chances"],
  ["finalizacoes", "Finalizações"], ["finalizacoes_alvo", "No alvo"], ["finalizacoes_dentro_area", "Dentro da área"],
  ["posse", "Posse", (v) => pct(v, 0)], ["passes", "Passes"], ["passes_pct", "Passes certos", (v) => pct(v, 0)],
  ["passes_ultimo_terco", "Passes no último terço"], ["cruzamentos", "Cruzamentos"], ["desarmes", "Desarmes"],
  ["interceptacoes", "Interceptações"], ["duelos_aereos_ganhos", "Duelos aéreos ganhos"], ["dribles_certos", "Dribles certos"],
  ["defesas", "Defesas do goleiro"], ["escanteios", "Escanteios"], ["faltas", "Faltas"], ["impedimentos", "Impedimentos"],
  ["amarelos", "Amarelos"], ["vermelhos", "Vermelhos"]];
const NOME_EVENTO = { Goal: "Gol", Card: "Cartão", subst: "Substituição", Var: "VAR" };
const NOME_CARTAO = { "Yellow Card": "Amarelo", "Second Yellow card": "Segundo amarelo", "Red Card": "Vermelho" };
const NOME_CHUTE = { Saved: "defendida", Missed: "para fora", Blocked: "bloqueada", Post: "na trave", Goal: "gol" };

function barraProbabilidade(p) {
  if (p.prob_vitoria == null) return null;
  const partes = [["V", p.prob_vitoria, "Vitória", "var(--serie-1)"], ["E", p.prob_empate, "Empate", "var(--neutro)"],
    ["D", p.prob_derrota, "Derrota", "var(--eixo)"]];
  return h("div", { class: "prob" },
    h("div", { class: "prob-titulo" }, h("span", {}, "Previsão pré-jogo"),
      h("span", { class: "sutil" }, p.resultado ? `resultado: ${NOME_RES[p.resultado]}` : "chance do Flamengo")),
    h("div", { class: "prob-barra" }, partes.map(([k, v, nome, cor]) => h("div", {
      class: "prob-parte" + (p.resultado === k ? " acertou" : ""), style: `flex:${Math.max(v, 0.04)};background:${cor}`,
      title: `${nome}: ${pct(v, 0)}` }, v >= 0.35 ? `${nome} ${pct(v, 0)}` : pct(v, 0)))));
}

function marcasLinhaTempo(p) {
  const marcas = [];
  for (const c of D.finalizacoesPorPartida.get(p.id_partida) ?? []) {
    if (/goal/i.test(c.resultado ?? "")) continue; // gols vêm dos eventos (que incluem gol contra)
    marcas.push({ minuto: c.minuto, lado: c.eh_flamengo ? "pro" : "contra", tipo: /saved/i.test(c.resultado ?? "") ? "alvo" : "chute",
      dica: () => conteudoDica(`${c.minuto}${c.acrescimo ? "+" + c.acrescimo : ""}' · ${c.eh_flamengo ? "Flamengo" : p.adversario}`,
        [{ valor: c.jogador ?? "–" }, { valor: `finalização ${NOME_CHUTE[c.resultado] ?? c.resultado ?? ""}` }]) });
  }
  for (const e of D.eventosPorPartida.get(p.id_partida) ?? []) {
    const lado = e.eh_flamengo ? "pro" : "contra";
    const quando = `${e.minuto}${e.acrescimo ? "+" + e.acrescimo : ""}'`;
    if (e.tipo === "Goal" && e.detalhe !== "Missed Penalty")
      marcas.push({ minuto: e.minuto, lado, tipo: "gol",
        dica: () => conteudoDica(`${quando} · Gol${e.detalhe === "Penalty" ? " de pênalti" : e.detalhe === "Own Goal" ? " contra" : ""}`,
          [{ valor: e.jogador ?? "–" }, ...(e.assist ? [{ valor: `assist. ${e.assist}` }] : [])]) });
    else if (e.tipo === "Card")
      marcas.push({ minuto: e.minuto, lado, tipo: e.detalhe === "Yellow Card" ? "amarelo" : "vermelho",
        dica: () => conteudoDica(`${quando} · ${NOME_CARTAO[e.detalhe] ?? "Cartão"}`, [{ valor: e.jogador ?? "–" }]) });
    else if (e.tipo === "subst")
      marcas.push({ minuto: e.minuto, lado, tipo: "sub",
        dica: () => conteudoDica(`${quando} · Substituição`, [{ valor: `sai ${e.jogador ?? "–"}` }, { valor: `entra ${e.assist ?? "–"}` }]) });
  }
  return marcas;
}

function renderDetalheJogo(js) {
  const caixa = $("detalhe-jogo");
  const p = js.find((x) => x.id_partida === estado.jogo);
  caixa.hidden = !p;
  if (!p) return;
  const [casa, fora] = p.mando === "Casa" ? ["Flamengo", p.adversario] : [p.adversario, "Flamengo"];
  const [gc, gf] = p.mando === "Casa" ? [p.gols_pro, p.gols_contra] : [p.gols_contra, p.gols_pro];
  const cabecalho = [
    h("div", { class: "placar" }, h("h2", {}, casa), h("span", { class: "gols" }, `${gc} × ${gf}`), h("h2", {}, fora),
      p.xg_pro != null ? h("span", { class: "sutil" }, `xG ${num(p.mando === "Casa" ? p.xg_pro : p.xg_contra, 2)} × ${num(p.mando === "Casa" ? p.xg_contra : p.xg_pro, 2)}`) : null),
    h("p", { class: "sutil" }, [p.competicao, p.rodada, dataLonga(p.data_utc), p.estadio, p.arbitro ? `Árbitro: ${p.arbitro}` : null,
      p.temperatura != null ? `${num(p.temperatura, 0)} °C` : null, p.formacao ? `Formação ${p.formacao}` : null].filter(Boolean).join(" · ")),
  ];
  if (!p.detalhe) {
    caixa.replaceChildren(...cabecalho, vazio("Os detalhes deste jogo ainda não foram baixados; entram na próxima coleta."));
    return;
  }
  const st = D.stats.get(p.id_partida) ?? { fla: {}, adv: {} };
  const jogadores = D.jogadoresPorPartida.get(p.id_partida) ?? [];
  const titulares = jogadores.filter((j) => j.titular).sort((a, b) => ORDEM_POS.indexOf(a.posicao) - ORDEM_POS.indexOf(b.posicao));
  const entraram = jogadores.filter((j) => !j.titular && j.minutos > 0).sort((a, b) => b.minutos - a.minutos);
  const temXg = jogadores.some((j) => j.xg != null);
  const linhaJog = (j) => h("tr", { class: "clicavel", onclick: () => abrirJogador(j.jogador_id) },
    h("td", { class: "num" }, j.numero ?? ""),
    h("td", {}, j.jogador, j.gols ? h("span", { class: "marca-gol", title: `${j.gols} gol(s)` }, "●".repeat(j.gols)) : null),
    h("td", { class: "num" }, `${j.minutos ?? "–"}'`), temXg ? h("td", { class: "num" }, j.xg != null ? num(j.xg, 2) : "–") : null,
    h("td", { class: "num" }, notaTag(j.nota)));
  const cabJog = (t) => h("thead", {}, h("tr", {}, h("th", { class: "num" }, "Nº"), h("th", {}, t), h("th", { class: "num" }, "Min."),
    temXg ? h("th", { class: "num" }, "xG") : null, h("th", { class: "num" }, "Nota")));
  const linhasStats = STATS_JOGO.filter(([k]) => st.fla[k] != null || st.adv[k] != null)
    .map(([k, rot, f = (v) => num(v)]) => ({ rotulo: rot, a: st.fla[k] ?? null, b: st.adv[k] ?? null, texto: f }));
  const eventos = D.eventosPorPartida.get(p.id_partida) ?? [];
  const chutes = D.finalizacoesPorPartida.get(p.id_partida) ?? [];
  const marcas = marcasLinhaTempo(p);
  const grafStats = h("div", { class: "grafico" }), tempo = h("div", { class: "grafico" });
  const golFla = h("div"), golAdv = h("div");

  caixa.replaceChildren(
    ...cabecalho,
    barraProbabilidade(p) ?? "",
    marcas.length ? h("div", { class: "bloco" }, h("h3", {}, "Linha do tempo"),
      h("p", { class: "sutil" }, "Flamengo em cima, adversário embaixo. Ponto cheio: defendida; vazio: para fora ou bloqueada; com anel: gol."),
      tempo) : null,
    h("div", { class: "detalhe-grade" },
      h("div", {}, h("h3", {}, "Comparativo"), linhasStats.length ? grafStats : vazio("Sem estatísticas na fonte.")),
      h("div", {}, h("h3", {}, "Flamengo em campo"),
        titulares.length ? h("table", { class: "tabela" }, cabJog("Titulares"), h("tbody", {}, titulares.map(linhaJog))) : vazio("Sem escalação na fonte."),
        entraram.length ? h("table", { class: "tabela", style: "margin-top:10px" }, cabJog("Entraram"), h("tbody", {}, entraram.map(linhaJog))) : null),
      h("div", {}, h("h3", {}, "Lances"), eventos.length
        ? h("ul", { class: "lista-eventos" }, eventos.map((e) => h("li", { class: e.eh_flamengo ? "" : "adv" },
            h("span", { class: "min" }, `${e.minuto}${e.acrescimo ? "+" + e.acrescimo : ""}'`),
            h("span", { class: `ev ev-${e.tipo === "Card" ? (e.detalhe === "Yellow Card" ? "amarelo" : "vermelho") : e.tipo}` }),
            h("span", {}, `${e.tipo === "Card" ? NOME_CARTAO[e.detalhe] ?? "Cartão" : NOME_EVENTO[e.tipo] ?? e.tipo}: `,
              e.jogador ?? "", e.tipo === "subst" && e.assist ? ` ⇄ ${e.assist}` : "",
              e.tipo === "Goal" && e.assist ? ` (assist. ${e.assist})` : "", e.eh_flamengo ? "" : ` · ${p.adversario}`))))
        : vazio("Sem lances na fonte."))),
    chutes.length ? h("div", { class: "detalhe-grade" },
      h("div", {}, h("h3", {}, "Finalizações do Flamengo"), golFla),
      h("div", {}, h("h3", {}, `Finalizações do ${p.adversario}`), golAdv)) : null,
  );
  if (marcas.length) linhaTempo(tempo, marcas, { duracao: p.duracao ?? 90 });
  if (linhasStats.length) barrasEspelhadas(grafStats, linhasStats, { nomeA: "Flamengo", nomeB: p.adversario });
  if (chutes.length) {
    mapaGol(golFla, chutes.filter((c) => c.eh_flamengo));
    mapaGol(golAdv, chutes.filter((c) => !c.eh_flamengo), { cor: "var(--serie-2)" });
  }
}

// =====================================================================
// JOGADORES
// =====================================================================
const SOMAS = ["minutos", "gols", "assistencias", "finalizacoes", "finalizacoes_alvo", "passes", "passes_certos", "passes_chave",
  "desarmes", "interceptacoes", "duelos", "duelos_ganhos", "dribles_tentados", "dribles_certos", "faltas_cometidas",
  "faltas_sofridas", "amarelos", "vermelhos", "defesas", "gols_sofridos"];
const OPCIONAIS = ["xg", "xa", "xgot", "xg_evitado"]; // null = a fonte não tem (diferente de 0)

function agregarJogadores(js) {
  const ag = new Map();
  for (const p of js) for (const j of D.jogadoresPorPartida.get(p.id_partida) ?? []) {
    if (!ag.has(j.jogador_id)) {
      ag.set(j.jogador_id, { id: j.jogador_id, jogador: j.jogador, posicao: j.posicao, numero: j.numero,
        relacionado: 0, jogos: 0, titular: 0, somaNota: 0, nNota: 0,
        ...Object.fromEntries(SOMAS.map((c) => [c, 0])), ...Object.fromEntries(OPCIONAIS.map((c) => [c, null])) });
    }
    const a = ag.get(j.jogador_id);
    a.relacionado++;
    if (j.minutos > 0) a.jogos++;
    if (j.titular) a.titular++;
    for (const c of SOMAS) a[c] += j[c] ?? 0;
    for (const c of OPCIONAIS) if (j[c] != null) a[c] = (a[c] ?? 0) + j[c];
    if (j.nota != null && j.minutos > 0) { a.somaNota += j.nota; a.nNota++; }
  }
  const possiveis = soma(comDetalhe(js), (p) => p.duracao ?? 90);
  for (const a of ag.values()) {
    a.pctMin = possiveis ? a.minutos / possiveis : null;
    a.nota = a.nNota ? a.somaNota / a.nNota : null;
    a.gMenosXg = a.xg != null ? a.gols - a.xg : null;
    a.aMenosXa = a.xa != null ? a.assistencias - a.xa : null;
    a.precisaoFin = a.finalizacoes ? a.finalizacoes_alvo / a.finalizacoes : null;
    a.passesPct = a.passes ? a.passes_certos / a.passes : null;
    a.duelosPct = a.duelos ? a.duelos_ganhos / a.duelos : null;
    a.driblesPct = a.dribles_tentados ? a.dribles_certos / a.dribles_tentados : null;
  }
  return [...ag.values()].filter((a) => a.minutos > 0);
}

// tipo: "texto" | "soma" (vira taxa no modo por 90) | "fixo" (não muda) | "pct" | "dif" (saldo; vira taxa por 90)
const COL = {
  jogador: { titulo: "Jogador", tipo: "texto" }, posicao: { titulo: "Pos.", tipo: "texto" },
  jogos: { titulo: "Jogos", tipo: "fixo" }, titular: { titulo: "Titular", tipo: "fixo" },
  minutos: { titulo: "Minutos", tipo: "fixo" }, pctMin: { titulo: "% min.", tipo: "pct" },
  gols: { titulo: "Gols", tipo: "soma" }, assistencias: { titulo: "Assist.", tipo: "soma" },
  nota: { titulo: "Nota", tipo: "fixo", casas: 2 },
  amarelos: { titulo: "Amar.", tipo: "soma" }, vermelhos: { titulo: "Verm.", tipo: "soma" },
  xg: { titulo: "xG", tipo: "soma", casas: 1 }, gMenosXg: { titulo: "G − xG", tipo: "dif", casas: 1 },
  finalizacoes: { titulo: "Final.", tipo: "soma" }, finalizacoes_alvo: { titulo: "No alvo", tipo: "soma" },
  precisaoFin: { titulo: "% no alvo", tipo: "pct" }, xgot: { titulo: "xGOT", tipo: "soma", casas: 1 },
  xa: { titulo: "xA", tipo: "soma", casas: 1 }, aMenosXa: { titulo: "A − xA", tipo: "dif", casas: 1 },
  passes_chave: { titulo: "Passes decisivos", tipo: "soma" }, passes: { titulo: "Passes", tipo: "soma" },
  passesPct: { titulo: "% certos", tipo: "pct" }, dribles_certos: { titulo: "Dribles", tipo: "soma" },
  driblesPct: { titulo: "% dribles", tipo: "pct" }, faltas_sofridas: { titulo: "Faltas sofridas", tipo: "soma" },
  desarmes: { titulo: "Desarmes", tipo: "soma" }, interceptacoes: { titulo: "Intercept.", tipo: "soma" },
  duelos_ganhos: { titulo: "Duelos ganhos", tipo: "soma" }, duelosPct: { titulo: "% duelos", tipo: "pct" },
  faltas_cometidas: { titulo: "Faltas", tipo: "soma" },
  defesas: { titulo: "Defesas", tipo: "soma" }, gols_sofridos: { titulo: "Gols sofridos", tipo: "soma" },
  xg_evitado: { titulo: "Gols evitados (xG)", tipo: "soma", casas: 2 },
};
const GRUPOS = {
  geral: { nome: "Geral", ordem: "minutos", cols: ["jogos", "titular", "minutos", "pctMin", "gols", "assistencias", "xg", "xa", "nota", "amarelos", "vermelhos"] },
  ataque: { nome: "Ataque", ordem: "gols", cols: ["minutos", "gols", "xg", "gMenosXg", "finalizacoes", "finalizacoes_alvo", "precisaoFin", "xgot"] },
  criacao: { nome: "Criação", ordem: "assistencias", cols: ["minutos", "assistencias", "xa", "aMenosXa", "passes_chave", "passes", "passesPct", "dribles_certos", "driblesPct", "faltas_sofridas"] },
  defesa: { nome: "Defesa", ordem: "desarmes", cols: ["minutos", "desarmes", "interceptacoes", "duelos_ganhos", "duelosPct", "faltas_cometidas", "amarelos"] },
  goleiros: { nome: "Goleiros", ordem: "xg_evitado", cols: ["jogos", "minutos", "defesas", "gols_sofridos", "xg_evitado", "passesPct", "nota"], filtro: (a) => a.posicao === "Goleiro" },
};

function valorCol(a, campo) {
  const c = COL[campo];
  const v = a[campo];
  if (estado.modo === "p90" && (c.tipo === "soma" || c.tipo === "dif") && v != null) return a.minutos ? (v / a.minutos) * 90 : null;
  return v;
}
function formatarCol(campo, v) {
  const c = COL[campo];
  if (v == null) return "–";
  if (c.tipo === "texto") return v;
  if (c.tipo === "pct") return pct(v, 0);
  if (c.tipo === "dif") return assinado(v, estado.modo === "p90" ? 2 : c.casas ?? 0);
  if (estado.modo === "p90" && c.tipo === "soma") return num(v, 2);
  return num(v, c.casas ?? 0);
}

function renderJogadores(js) {
  $("grupo-metricas").replaceChildren(...Object.entries(GRUPOS).map(([k, g]) => h("button", {
    "aria-pressed": String(estado.grupo === k),
    // Ao trocar de grupo, a tabela abre ordenada pela estatística principal (melhores primeiro)
    onclick: () => { estado.grupo = k; estado.ordem = { campo: g.ordem, desc: true }; render(); },
  }, g.nome)));
  for (const b of $("modo-metricas").children) b.setAttribute("aria-pressed", String(b.dataset.modo === estado.modo));

  const grupo = GRUPOS[estado.grupo];
  const todos = agregarJogadores(js);
  let lista = todos.filter((a) => !grupo.filtro || grupo.filtro(a));
  if (estado.modo === "p90") lista = lista.filter((a) => a.minutos >= MIN_MINUTOS);
  const busca = estado.busca.trim().toLowerCase();
  if (busca) lista = lista.filter((a) => a.jogador.toLowerCase().includes(busca));
  // Colunas sem nenhum valor na fonte somem
  const cols = ["jogador", "posicao", ...grupo.cols].filter((c) => COL[c].tipo === "texto" || todos.some((a) => a[c] != null));
  $("nota-jogadores").textContent = estado.modo === "p90"
    ? `Valores por 90 minutos; só jogadores com pelo menos ${MIN_MINUTOS} minutos. Clique num jogador para ver o perfil.`
    : "Clique num jogador para ver o perfil. \"% min.\" = minutos jogados ÷ minutos dos jogos filtrados.";

  const { campo, desc } = estado.ordem;
  lista.sort((a, b) => {
    const va = valorCol(a, campo), vb = valorCol(b, campo);
    if (va === vb) {
      const seg = grupo.cols.find((c) => c !== campo && c !== "minutos" && COL[c].tipo === "soma");
      return (seg ? (valorCol(b, seg) ?? -1) - (valorCol(a, seg) ?? -1) : 0) || b.minutos - a.minutos;
    }
    if (va == null) return 1;
    if (vb == null) return -1;
    const r = typeof va === "string" ? va.localeCompare(vb, "pt-BR") : va - vb;
    return desc ? -r : r;
  });
  const cab = h("tr", {}, cols.map((c) => h("th", {
    class: `ordenavel${COL[c].tipo === "texto" ? "" : " num"}`, scope: "col",
    "aria-sort": c === campo ? (desc ? "descending" : "ascending") : null,
    onclick: () => { estado.ordem = { campo: c, desc: c === campo ? !desc : COL[c].tipo !== "texto" }; render(); },
  }, COL[c].titulo)));
  const corpo = lista.map((a) => h("tr", {
    class: "clicavel" + (estado.jogador === a.id ? " selecionado" : ""), tabindex: 0,
    onclick: () => abrirJogador(a.id), onkeydown: (e) => { if (e.key === "Enter") abrirJogador(a.id); },
  }, cols.map((c) => h("td", { class: COL[c].tipo === "texto" ? "" : "num" },
    c === "nota" ? notaTag(a.nota) : formatarCol(c, valorCol(a, c))))));
  $("tabela-jogadores").replaceChildren(h("thead", {}, cab), h("tbody", {}, corpo.length ? corpo
    : h("tr", {}, h("td", { colspan: cols.length, class: "vazio" }, "Nenhum jogador no filtro."))));

  renderDispersao(todos);
}

// O perfil abre num modal, sem trocar de aba nem rolar a página.
function abrirJogador(id) {
  estado.jogador = id;
  const modal = $("modal-jogador");
  if (!modal.open) {
    modal.showModal();
    modal.append($("dica")); // a dica precisa estar dentro do modal para aparecer por cima dele
  }
  modal.querySelector(".modal-corpo").scrollTop = 0;
  render(); // desenha o perfil (largura já conhecida) e destaca o jogador na aba de jogadores
}

function fecharJogador() {
  const modal = $("modal-jogador");
  if (modal.open) modal.close();
}

function montarModal() {
  const modal = $("modal-jogador");
  modal.addEventListener("close", () => {
    document.body.append($("dica"));
    $("dica").hidden = true;
    estado.jogador = null;
    render();
  });
  // Clique no fundo escurecido fecha (o conteúdo fica num filho, então o alvo é o próprio <dialog>)
  modal.addEventListener("click", (e) => { if (e.target === modal) fecharJogador(); });
}

// Métricas do perfil, comparadas por 90 minutos com jogadores da mesma posição.
// [campo, rótulo, já é taxa (não dividir por minutos), menor é melhor]
// Em cada seção, as métricas aparecem da melhor para a pior posição no elenco.
const PERFIL = {
  linha: [
    ["Ataque", [["gols", "Gols"], ["xg", "xG"], ["finalizacoes", "Finalizações"], ["dribles_certos", "Dribles certos"]]],
    ["Criação", [["assistencias", "Assistências"], ["xa", "xA"], ["passes_chave", "Passes decisivos"], ["passesPct", "% passes certos", true]]],
    ["Defesa", [["desarmes", "Desarmes"], ["interceptacoes", "Interceptações"], ["duelos_ganhos", "Duelos ganhos"]]],
    ["Geral", [["nota", "Nota média", true]]],
  ],
  Goleiro: [
    ["Gol", [["defesas", "Defesas"], ["xg_evitado", "Gols evitados (xG)"], ["gols_sofridos", "Gols sofridos", false, true]]],
    ["Geral", [["passesPct", "% passes certos", true], ["nota", "Nota média", true]]],
  ],
};

function renderPerfil(js, todos) {
  const caixa = $("detalhe-jogador");
  const a = todos.find((x) => x.id === estado.jogador);
  if (!a) {
    caixa.replaceChildren(h("div", { class: "perfil-topo" }, h("p", { class: "cresce sutil" },
      "Esse jogador não entrou em campo nos jogos do filtro atual."),
      h("button", { class: "fechar", onclick: fecharJogador, "aria-label": "Fechar perfil" }, "×")));
    return;
  }
  const goleiro = a.posicao === "Goleiro";
  let pares = todos.filter((x) => x.posicao === a.posicao && x.minutos >= MIN_MINUTOS);
  if (pares.length < 4) pares = todos.filter((x) => x.minutos >= MIN_MINUTOS && goleiro === (x.posicao === "Goleiro"));
  const taxa = (x, c, fixo) => (fixo ? x[c] : x[c] != null && x.minutos ? (x[c] / x.minutos) * 90 : null);
  const linhaPerfil = ({ rot, v, percentil, fixo, c }) => h("div", { class: "perfil-linha", title: `Melhor ou igual a ${pct(percentil, 0)} dos comparados` },
    h("span", { class: "perfil-rotulo" }, rot),
    h("span", { class: "perfil-barra" }, h("b", { style: `width:${Math.max(3, percentil * 100)}%`, class: percentil >= 0.75 ? "alto" : percentil < 0.25 ? "baixo" : "" })),
    h("span", { class: "perfil-valor" }, c === "passesPct" ? pct(v, 0) : num(v, 2), fixo ? "" : h("small", {}, "/90")));
  const linhasPerfil = PERFIL[goleiro ? "Goleiro" : "linha"].map(([secao, metricas]) => {
    const itens = metricas.map(([c, rot, fixo, menorMelhor]) => {
      const v = taxa(a, c, fixo);
      const valores = pares.map((x) => taxa(x, c, fixo)).filter((x) => x != null);
      if (v == null || valores.length < 2) return null;
      return { c, rot, fixo, v, percentil: valores.filter((x) => (menorMelhor ? x >= v : x <= v)).length / valores.length };
    }).filter(Boolean).sort((x, y) => y.percentil - x.percentil);
    return itens.length ? h("div", { class: "perfil-secao" }, h("span", { class: "perfil-secao-titulo" }, secao), itens.map(linhaPerfil)) : null;
  }).filter(Boolean);

  const jogosDet = comDetalhe(js); // jogos ainda sem detalhes deixariam buracos nos gráficos
  const participacoes = jogosDet.map((p) => [p, (D.jogadoresPorPartida.get(p.id_partida) ?? []).find((j) => j.jogador_id === a.id)]);
  const temNota = participacoes.some(([, j]) => j?.nota != null);
  const grafNota = h("div", { class: "grafico" }), grafMin = h("div", { class: "grafico" });
  caixa.replaceChildren(
    h("div", { class: "perfil-topo" },
      D.fotos.get(a.id)
        ? h("div", { class: "foto-jogador" }, h("img", { src: D.fotos.get(a.id), alt: `Foto de ${a.jogador}`, width: 88, height: 88,
            onerror: (e) => e.target.closest(".foto-jogador").replaceWith(h("div", { class: "camisa" }, a.numero ?? "–")) }),
          h("span", { class: "foto-numero" }, a.numero ?? ""))
        : h("div", { class: "camisa" }, a.numero ?? "–"),
      h("div", { class: "cresce" }, h("h2", {}, a.jogador),
        h("p", { class: "sutil" }, [a.posicao, `${a.jogos} jogos, ${a.titular} como titular`, `${num(a.minutos)} minutos`].join(" · "))),
      h("button", { class: "fechar", onclick: fecharJogador, "aria-label": "Fechar perfil", autofocus: true }, "×")),
    h("div", { class: "mini-kpis" }, ...[["Gols", a.gols], ["Assistências", a.assistencias], ["xG", num(a.xg, 1)], ["xA", num(a.xa, 1)],
      ["Nota média", num(a.nota, 2)], ["% dos minutos", pct(a.pctMin, 0)]]
      .filter(([, v]) => v !== "–").map(([r, v]) => h("div", {}, h("b", {}, v), h("span", {}, r)))),
    h("div", { class: "detalhe-grade" },
      h("div", {}, h("h3", {}, "Comparado ao elenco"),
        h("p", { class: "sutil" }, a.minutos < MIN_MINUTOS ? `Menos de ${MIN_MINUTOS} minutos: amostra pequena para comparar.`
          : !linhasPerfil.length ? `Poucos ${goleiro ? "goleiros" : "jogadores da posição"} com ${MIN_MINUTOS}+ minutos para comparar.`
          : `Por 90 minutos, contra ${pares.length} ${pares.length === 1 ? "jogador" : "jogadores"} (${goleiro ? "goleiros" : "mesma posição"}, ${MIN_MINUTOS}+ min). Barra cheia = o melhor do elenco.`),
        a.minutos >= MIN_MINUTOS && linhasPerfil.length ? h("div", { class: "perfil" }, linhasPerfil) : null),
      h("div", {},
        temNota ? h("h3", {}, "Nota por jogo") : null, temNota ? h("p", { class: "sutil" }, "Linha tracejada: média da temporada.") : null,
        temNota ? grafNota : null,
        h("h3", { style: "margin-top:12px" }, "Minutos por jogo"), grafMin)),
  );
  if (temNota) serie(grafNota, participacoes.map(([p, j]) => ({
    valor: j?.minutos > 0 ? j.nota : null, cor: corComp(p.competicao),
    dica: dicaJogo(p, [{ valor: `nota ${num(j?.nota, 1)}`, nome: `${j?.minutos ?? 0} min` }]),
  })), { min: 5, max: 9, referencia: a.nota, rotuloX: rotuloMes(jogosDet) });
  colunas(grafMin, participacoes.map(([p, j]) => ({ valor: j?.minutos ?? 0, cor: corComp(p.competicao),
    dica: dicaJogo(p, [{ valor: situacao(j, p) }]) })),
  { max: Math.max(90, ...participacoes.map(([, j]) => j?.minutos ?? 0)), rotuloX: rotuloMes(jogosDet), altura: 150 });
}

function situacao(j, p) {
  if (!p.detalhe) return "detalhes ainda não baixados";
  if (!j) return "não relacionado";
  if (!(j.minutos > 0)) return "no banco, não entrou";
  if (j.titular) return j.minutos < (p.duracao ?? 90) ? `titular, saiu (${j.minutos} min)` : "titular, jogo inteiro";
  return `entrou (${j.minutos} min)`;
}

const DISPERSOES = {
  ataque: { titulo: "Finalização: gols × xG", nota: "Acima da linha tracejada, o jogador marcou mais do que as chances indicavam; abaixo, menos.",
    x: (a) => a.xg, y: (a) => a.gols, nomeX: "xG", nomeY: "gols", diagonal: true },
  criacao: { titulo: "Criação: assistências × xA", nota: "Acima da linha, os companheiros converteram mais do que o esperado das chances criadas.",
    x: (a) => a.xa, y: (a) => a.assistencias, nomeX: "xA", nomeY: "assistências", diagonal: true },
  defesa: { titulo: "Defesa: desarmes × interceptações por 90", nota: `Jogadores com ${MIN_MINUTOS}+ minutos.`,
    x: (a) => (a.minutos >= MIN_MINUTOS ? (a.desarmes / a.minutos) * 90 : null),
    y: (a) => (a.minutos >= MIN_MINUTOS ? (a.interceptacoes / a.minutos) * 90 : null),
    nomeX: "desarmes/90", nomeY: "interceptações/90", diagonal: false },
};

function renderDispersao(todos) {
  const cfg = DISPERSOES[estado.grupo];
  const pts = cfg ? todos.filter((a) => cfg.x(a) != null && cfg.y(a) != null && (cfg.x(a) > 0 || cfg.y(a) > 0)) : [];
  if (!mostrar("card-dispersao", pts.length >= 3)) return;
  $("titulo-dispersao").textContent = cfg.titulo;
  $("nota-dispersao").textContent = cfg.nota;
  const destaques = new Set(pts.slice().sort((a, b) => (cfg.x(b) + cfg.y(b)) - (cfg.x(a) + cfg.y(a))).slice(0, 6).map((a) => a.id));
  dispersao($("graf-dispersao"), pts.map((a) => ({
    x: cfg.x(a), y: cfg.y(a), rotulo: a.jogador, destaque: destaques.has(a.id) || a.id === estado.jogador,
    cor: a.id === estado.jogador ? "var(--marca-forte)" : "var(--serie-1)",
    dica: () => conteudoDica(a.jogador, [{ valor: num(cfg.x(a), 2), nome: cfg.nomeX }, { valor: num(cfg.y(a), 2), nome: cfg.nomeY }]),
  })), { nomeX: cfg.nomeX, nomeY: cfg.nomeY, diagonal: cfg.diagonal });
}

// =====================================================================
// ELENCO
// =====================================================================
function renderElenco(js) {
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

const FAIXAS_MIN = [[15, "1–15"], [45, "16–45"], [70, "46–70"], [89, "71–89"], [Infinity, "90+"]];
const nivelMin = (m) => FAIXAS_MIN.findIndex(([lim]) => m <= lim);

function renderMinutagem(ps) {
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

// =====================================================================
// ESTILO DE JOGO
// =====================================================================
const STATS_ESTILO = [["posse", "Posse", (v) => pct(v, 0)], ["passes", "Passes", (v) => num(v, 0)],
  ["passes_pct", "Passes certos", (v) => pct(v, 0)], ["passes_ultimo_terco", "Passes no último terço", (v) => num(v, 0)],
  ["lancamentos", "Lançamentos", (v) => num(v, 1)], ["cruzamentos", "Cruzamentos", (v) => num(v, 1)],
  ["dribles_certos", "Dribles certos", (v) => num(v, 1)], ["grandes_chances", "Grandes chances", (v) => num(v, 1)],
  ["finalizacoes", "Finalizações", (v) => num(v, 1)], ["finalizacoes_dentro_area", "Finalizações na área", (v) => num(v, 1)],
  ["finalizacoes_alvo", "No alvo", (v) => num(v, 1)], ["xg", "xG", (v) => num(v, 2)], ["escanteios", "Escanteios", (v) => num(v, 1)],
  ["desarmes", "Desarmes", (v) => num(v, 1)], ["interceptacoes", "Interceptações", (v) => num(v, 1)],
  ["cortes", "Cortes", (v) => num(v, 1)], ["duelos_aereos_ganhos", "Duelos aéreos ganhos", (v) => num(v, 1)],
  ["faltas", "Faltas", (v) => num(v, 1)], ["amarelos", "Amarelos", (v) => num(v, 1)]];
const FAIXAS = ["1–15", "16–30", "31–45", "46–60", "61–75", "76–90", "90+"];
const faixaDe = (min, acrescimo) => (min > 90 || (min === 90 && acrescimo) ? 6 : Math.min(5, Math.max(0, Math.ceil(min / 15) - 1)));

function renderEstilo(js) {
  const det = comDetalhe(js);
  // Médias por jogo, Flamengo × adversários
  const medias = STATS_ESTILO.map(([k, rot, f]) => {
    const pares = det.map((p) => D.stats.get(p.id_partida)).filter((s) => s && s.fla[k] != null && s.adv[k] != null);
    if (pares.length < Math.max(2, det.length / 2)) return null;
    return { rotulo: rot, a: media(pares.map((s) => s.fla[k])), b: media(pares.map((s) => s.adv[k])), texto: f };
  }).filter(Boolean);
  $("nota-estilo").textContent = medias.length ? `Média por jogo em ${det.length} jogos com estatísticas.` : "";
  if (medias.length) barrasEspelhadas($("graf-estilo"), medias, { nomeA: "Flamengo", nomeB: "Adversários" });
  else $("graf-estilo").replaceChildren(vazio("Sem estatísticas de time nos jogos filtrados."));

  // Finalizações por momento do jogo (média por jogo)
  const comChutes = det.filter((p) => (D.finalizacoesPorPartida.get(p.id_partida) ?? []).length);
  if (mostrar("card-chutes-minuto", comChutes.length >= 2)) {
    const pro = Array(7).fill(0), contra = Array(7).fill(0);
    for (const p of comChutes) for (const c of D.finalizacoesPorPartida.get(p.id_partida)) (c.eh_flamengo ? pro : contra)[faixaDe(c.minuto, c.acrescimo)]++;
    const n = comChutes.length;
    colunasAgrupadas($("graf-chutes-minuto"), FAIXAS, [
      { nome: "Flamengo", cor: "var(--serie-1)", valores: pro.map((v) => +(v / n).toFixed(1)) },
      { nome: "Adversários", cor: "var(--serie-2)", valores: contra.map((v) => +(v / n).toFixed(1)) },
    ]);
  }

  // Gols por momento do jogo
  const gp = Array(7).fill(0), gc = Array(7).fill(0);
  for (const p of det) for (const e of D.eventosPorPartida.get(p.id_partida) ?? []) {
    if (e.tipo !== "Goal" || e.detalhe === "Missed Penalty") continue;
    (e.eh_flamengo ? gp : gc)[faixaDe(e.minuto, e.acrescimo)]++;
  }
  colunasAgrupadas($("graf-faixas"), FAIXAS, [
    { nome: "Marcados", cor: "var(--serie-1)", valores: gp },
    { nome: "Sofridos", cor: "var(--serie-2)", valores: gc },
  ]);

  // Gols × xG acumulados e posse/último terço dividem a linha
  const comXg = det.filter((p) => p.xg_pro != null);
  const comPosse = det.filter((p) => D.stats.get(p.id_partida)?.fla.posse != null);
  mostrar("card-xg", comXg.length >= 2);
  mostrar("card-posse", comPosse.length >= 5);
  if (comXg.length >= 2) {
    $("xg-nota").textContent = `${comXg.length} jogos com xG. Gols acima do xG: finalização acima do esperado (ataque) ou goleiro e sorte do adversário (defesa).`;
    const ataque = h("div"), defesa = h("div");
    $("graf-xg").replaceChildren(h("h3", {}, "Ataque"), ataque, h("h3", { style: "margin-top:12px" }, "Defesa"), defesa);
    const acum = (f) => { let t = 0; return comXg.map((p) => (t += f(p) ?? 0)); };
    const rot = comXg.map((p) => `${data(p.data_utc)} x ${p.adversario}`), curto = comXg.map((p) => data(p.data_utc));
    linhas(ataque, curto, [{ nome: "gols", cor: "var(--serie-1)", valores: acum((p) => p.gols_pro) },
      { nome: "xG", cor: "var(--serie-2)", valores: acum((p) => p.xg_pro) }], { formato: (v) => num(v, 1), dicaRotulos: rot, altura: 200 });
    linhas(defesa, curto, [{ nome: "sofridos", cor: "var(--serie-1)", valores: acum((p) => p.gols_contra) },
      { nome: "xG contra", cor: "var(--serie-2)", valores: acum((p) => p.xg_contra) }], { formato: (v) => num(v, 1), dicaRotulos: rot, altura: 200 });
  }
  if (comPosse.length >= 5) {
    const g1 = h("div"), g2 = h("div");
    $("graf-posse").replaceChildren(h("h3", {}, "Posse de bola (%)"), g1, h("h3", { style: "margin-top:12px" }, "Passes no último terço"), g2);
    const st = (p) => D.stats.get(p.id_partida);
    const rot = comPosse.map((p) => `${data(p.data_utc)} x ${p.adversario} (média dos 5 últimos)`), curto = comPosse.map((p) => data(p.data_utc));
    linhas(g1, curto, [{ nome: "Flamengo", cor: "var(--serie-1)", valores: movel(comPosse, (p) => st(p).fla.posse * 100) }],
      { formato: (v) => num(v, 0), dicaRotulos: rot, altura: 200 });
    if (comPosse.some((p) => st(p).fla.passes_ultimo_terco != null))
      linhas(g2, curto, [{ nome: "Flamengo", cor: "var(--serie-1)", valores: movel(comPosse, (p) => st(p).fla.passes_ultimo_terco) },
        { nome: "Adversários", cor: "var(--serie-2)", valores: movel(comPosse, (p) => st(p).adv.passes_ultimo_terco) }],
      { formato: (v) => num(v, 0), dicaRotulos: rot, altura: 200 });
    else g2.replaceChildren(vazio("A fonte não tem passes no último terço."));
  }
}

// =====================================================================
// SUA OPINIÃO
// =====================================================================
const NOME_FONTE = { highlightly: "Highlightly", "api-football": "API-Football" };
const nomeFonte = () => NOME_FONTE[D.bruto.meta.fonte ?? "api-football"] ?? D.bruto.meta.fonte;

// Firestore do projeto datafla. A chave é a chave pública do app web (feita para ficar no site):
// quem protege os dados são as regras em firestore.rules (só permitem criar; ninguém lê pelo site).
const URL_OPINIOES = "https://firestore.googleapis.com/v1/projects/datafla/databases/(default)/documents/opinioes"
  + "?key=AIzaSyBK83GdLEgnJPrn7NEtOSV2nTpySaAplYo";
const ESPERA_REENVIO_MS = 30_000;

async function gravarOpiniao(dados) {
  const fields = { criado_em: { timestampValue: new Date().toISOString() } };
  for (const [k, v] of Object.entries(dados)) if (v) fields[k] = { stringValue: v };
  const resp = await fetch(URL_OPINIOES, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
}

function montarOpiniao() {
  const form = $("form-opiniao"), msg = $("op-mensagem"), erro = $("op-erro"), status = $("op-status"), botao = $("op-enviar");
  const contar = () => { $("op-contador").textContent = `${msg.value.length}/2000`; };
  msg.addEventListener("input", () => { contar(); erro.textContent = ""; });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const texto = msg.value.trim();
    if (texto.length < 3) { erro.textContent = "Escreva a sua mensagem antes de enviar."; msg.focus(); return; }
    let ultimo = 0;
    try { ultimo = Number(localStorage.getItem("datafla-opiniao") || 0); } catch {}
    if (Date.now() - ultimo < ESPERA_REENVIO_MS) { status.textContent = "Você acabou de enviar uma mensagem. Espere alguns segundos."; return; }
    if (form.elements.site.value) { form.reset(); contar(); status.textContent = "Mensagem enviada. Obrigado!"; return; } // robô
    botao.disabled = true;
    status.textContent = "Enviando…";
    try {
      await gravarOpiniao({ tipo: form.elements.tipo.value, mensagem: texto, nome: $("op-nome").value.trim(),
        contato: $("op-contato").value.trim(), aba: "opiniao" });
      try { localStorage.setItem("datafla-opiniao", String(Date.now())); } catch {}
      form.reset();
      contar();
      status.textContent = "Mensagem enviada. Obrigado!";
    } catch {
      status.textContent = "Não foi possível enviar agora. Tente de novo em instantes.";
    } finally {
      botao.disabled = false;
    }
  });
}

// =====================================================================
// filtros, abas, carregamento
// =====================================================================
const BASE = DEMO ? "dados-demo/" : "dados/";
let TEMPORADAS = [];

// ---------- barra de filtros ----------
const slug = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
const NOME_PERIODO = { temporada: null, 10: "últimos 10", 5: "últimos 5" };

function montarCompeticoes() {
  // Seleção única: um clique mostra só aquela competição; "Todas" volta ao total.
  $("filtro-competicoes").replaceChildren(
    h("button", { "data-comp": "", onclick: () => mudarFiltro({ comp: "" }) }, "Todas"),
    ...D.competicoes.map((c) => h("button", { "data-comp": c, title: c, onclick: () => mudarFiltro({ comp: c }) }, simboloComp(c), h("span", {}, c))));
}

function montarMeses() {
  const meses = [...new Set(D.encerrados.map((p) => mesDe(p.data_utc)))].sort().reverse();
  $("filtro-mes").replaceChildren(h("option", { value: "" }, "Mês…"),
    ...meses.map((m) => h("option", { value: m }, nomeMes(m).replace(/^./, (l) => l.toUpperCase()))));
}

function mudarFiltro(mudanca) {
  Object.assign(estado, mudanca);
  estado.jogo = null;
  sincronizarFiltros();
  render();
}

function limparFiltros() { mudarFiltro({ comp: "", periodo: "temporada", mando: "" }); }

// Reflete o estado nos controles, no resumo e na URL (o link reproduz a mesma visão).
function sincronizarFiltros() {
  for (const b of $("filtro-competicoes").children) b.setAttribute("aria-pressed", String(b.dataset.comp === estado.comp));
  for (const b of $("filtro-periodo").children) b.setAttribute("aria-pressed", String(b.dataset.periodo === estado.periodo));
  $("filtro-mes").value = ehMes(estado.periodo) ? estado.periodo : "";
  $("filtro-mes").classList.toggle("ativo", ehMes(estado.periodo));
  for (const b of $("filtro-mando").children) b.setAttribute("aria-pressed", String(b.dataset.mando === estado.mando));

  const ativos = [estado.comp, estado.periodo !== "temporada", estado.mando].filter(Boolean).length;
  $("filtros-contador").hidden = !ativos;
  $("filtros-contador").textContent = ativos;
  $("limpar-filtros").hidden = !ativos;

  const js = filtrados();
  const periodo = ehMes(estado.periodo) ? nomeMes(estado.periodo) : NOME_PERIODO[estado.periodo];
  const recorte = [estado.comp || null, periodo, estado.mando ? (estado.mando === "Casa" ? "em casa" : "fora de casa") : null].filter(Boolean);
  $("resumo-filtros").replaceChildren(
    h("b", {}, `${js.length} jogos`), ` · ${contar(js, "V")}V ${contar(js, "E")}E ${contar(js, "D")}D`,
    js.length ? h("span", { class: "aprov" }, ` · ${pct(pontos(js) / (3 * js.length), 0)} de aproveitamento`) : "",
    recorte.length ? h("span", { class: "recorte" }, ` · ${recorte.join(" · ")}`) : "");

  const url = new URL(location);
  const definir = (k, v) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
  definir("comp", estado.comp ? slug(estado.comp) : "");
  definir("periodo", estado.periodo !== "temporada" ? estado.periodo : "");
  definir("mando", estado.mando ? slug(estado.mando) : "");
  history.replaceState(null, "", url);
}

// Lê os filtros do link (?comp=brasileirao&periodo=10&mando=casa); valores desconhecidos são ignorados.
function filtrosDaUrl() {
  const q = new URLSearchParams(location.search);
  const periodo = q.get("periodo");
  const meses = new Set(D.encerrados.map((p) => mesDe(p.data_utc)));
  estado.comp = D.competicoes.find((c) => slug(c) === q.get("comp")) ?? "";
  estado.periodo = ["10", "5"].includes(periodo) || meses.has(periodo) ? periodo : "temporada";
  estado.mando = { casa: "Casa", fora: "Fora" }[q.get("mando")] ?? "";
}

function montarTemporadas(atual) {
  // Com uma temporada só, o seletor não ajuda: some.
  $("filtro-temporada").closest(".grupo-filtro").hidden = TEMPORADAS.length < 2;
  $("filtro-temporada").replaceChildren(...TEMPORADAS.map((t) => h("button", {
    "aria-pressed": String(t.temporada === atual), onclick: () => carregarTemporada(t.temporada),
  }, String(t.temporada))));
}

function marcarAba(aba) {
  estado.aba = aba;
  document.body.classList.toggle("sem-filtros", aba === "opiniao");
  for (const x of document.querySelectorAll(".abas button")) x.setAttribute("aria-selected", x.dataset.aba === aba);
  for (const s of document.querySelectorAll(".aba")) s.hidden = s.id !== `aba-${aba}`;
}

function trocarAba(aba) {
  marcarAba(aba);
  const url = new URL(location);
  url.searchParams.set("aba", aba);
  history.replaceState(null, "", url);
  render();
}

function montarControlesFixos() {
  for (const b of $("filtro-mando").children) b.addEventListener("click", () => mudarFiltro({ mando: b.dataset.mando }));
  for (const b of $("filtro-periodo").children) b.addEventListener("click", () => mudarFiltro({ periodo: b.dataset.periodo }));
  $("filtro-mes").addEventListener("change", (e) => mudarFiltro({ periodo: e.target.value || "temporada" }));
  $("limpar-filtros").addEventListener("click", limparFiltros);
  // Celular: o botão abre e fecha o painel de filtros
  $("abrir-filtros").addEventListener("click", () => {
    const aberto = $("filtros").classList.toggle("aberto");
    $("abrir-filtros").setAttribute("aria-expanded", String(aberto));
  });
  for (const b of document.querySelectorAll(".abas button")) b.addEventListener("click", () => trocarAba(b.dataset.aba));
  for (const b of $("modo-metricas").children) b.addEventListener("click", () => { estado.modo = b.dataset.modo; render(); });
  $("busca-jogador").addEventListener("input", (e) => { estado.busca = e.target.value; render(); });
  $("botao-tema").addEventListener("click", () => {
    const novo = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = novo;
    document.querySelector('meta[name="theme-color"]').content = "#0e0f11"; // o topo é escuro nos dois temas
    try { localStorage.setItem("datafla-tema", novo); } catch {}
  });
}

function render() {
  const js = filtrados();
  ({ temporada: renderTemporada, jogos: renderJogos, jogadores: renderJogadores, elenco: renderElenco,
    estilo: renderEstilo, opiniao: () => {} })[estado.aba](js);
  if ($("modal-jogador").open) renderPerfil(js, agregarJogadores(js));
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
  $("aviso-demo").hidden = !D.bruto.meta.demo;
  $("fonte").textContent = nomeFonte();
  $("atualizado").textContent = `Temporada ${ano} · atualizado em ${new Date(D.bruto.meta.gerado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}`;
  estado.jogador = null;
  estado.jogo = null;
  montarTemporadas(ano);
  montarCompeticoes();
  montarMeses();
  filtrosDaUrl();
  sincronizarFiltros();
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
  const params = new URLSearchParams(location.search);
  const pedida = Number(params.get("t"));
  const ano = TEMPORADAS.some((t) => t.temporada === pedida) ? pedida : TEMPORADAS[0].temporada;
  montarControlesFixos();
  montarModal();
  montarOpiniao();
  const aba = params.get("aba");
  if (aba && document.getElementById(`aba-${aba}`)) marcarAba(aba);
  await carregarTemporada(ano);
  // A barra de filtros fica fixa logo abaixo do topo, que muda de altura no celular.
  const alturaTopo = () => document.documentElement.style.setProperty("--altura-topo", `${document.querySelector(".topo").offsetHeight}px`);
  alturaTopo();
  let t;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => { alturaTopo(); render(); }, 150); });
}

iniciar();
