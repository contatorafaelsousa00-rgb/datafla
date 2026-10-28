// Base do painel: constantes, formatação, montagem de elementos, dados carregados (D) e filtros.
import { conteudoDica } from "./graficos.js";

export const DEMO = new URLSearchParams(location.search).has("demo");
export const CORES_COMP = {
  "Brasileirão": "var(--s1)", "Libertadores": "var(--s2)", "Copa do Brasil": "var(--s3)",
  "Carioca": "var(--s4)", "Supercopa": "var(--s5)", "Recopa": "var(--s6)",
};
export const ORDEM_COMP = Object.keys(CORES_COMP);
export const ORDEM_POS = ["Goleiro", "Defensor", "Meio-campo", "Atacante"];
export const ENCERRADO = new Set(["FT", "AET", "PEN", "WO"]); // WO: vitória por W.O. (correção manual)
export const MIN_MINUTOS = 450; // amostra mínima para comparar jogadores por 90 minutos
export const corComp = (c) => CORES_COMP[c] ?? "var(--s7)"; // fora da lista (ex.: amistosos): cinza da identidade
export let LOGOS = new Map(); // competição -> símbolo da fonte (a cor fica nos gráficos)
// Logos da fonte feitos para fundo branco e quase pretos: no tema escuro viram silhueta clara (CSS).
export const LOGOS_ESCUROS = new Set(["Libertadores", "Supercopa", "Recopa", "Copa do Brasil"]);
// A fonte usa o logo da FIFA para amistosos, que não representa a competição.
export const SEM_LOGO = new Set(["Amistosos"]);
// Símbolo da competição; sem símbolo, cai na bolinha com a cor da competição.
export const simboloComp = (c) => (LOGOS.get(c) && !SEM_LOGO.has(c)
  ? h("img", { class: "logo-comp" + (LOGOS_ESCUROS.has(c) ? " escuro" : ""), src: LOGOS.get(c), alt: "", loading: "lazy",
    width: 22, height: 22, onerror: (e) => e.target.replaceWith(h("i", { class: "ponto", style: `background:${corComp(c)}` })) })
  : h("i", { class: "ponto", style: `background:${corComp(c)}` }));
export const $ = (id) => document.getElementById(id);

// Filtros: comp ("" = todas), periodo ("temporada" | "10" | "5" | "AAAA-MM"), mando ("" | "Casa" | "Fora")
export const estado = { comp: "", periodo: "temporada", mando: "", aba: "temporada", jogador: null, jogo: null,
  lista: "proximos", proximo: null, // aba Jogos: qual lista aparece e qual próximo jogo está aberto
  subElenco: "desempenho", // aba Elenco: "desempenho" ou "ficha"
  partidaJogador: null, vistaJogador: "temporada", // ficha do jogador: aberta a partir de um jogo, "partida" ou "temporada"
  ordem: { campo: "minutos", desc: true }, busca: "", grupo: "geral", modo: "total" };
export let D; // dados preparados

// ---------- formatação ----------
export const nf = (casas) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const num = (v, casas = 0) => (v === null || v === undefined || Number.isNaN(v) ? "–" : nf(casas).format(v));
export const pct = (v, casas = 1) => (v === null || v === undefined || Number.isNaN(v) ? "–" : nf(casas).format(v * 100) + "%");
export const data = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
export const dataLonga = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });
export const mes = (iso) => new Date(iso).toLocaleDateString("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).replace(".", "");
export const assinado = (v, casas = 0) => {
  const r = Math.round(v * 10 ** casas) / 10 ** casas || 0; // evita "-0"
  return (r > 0 ? "+" : "") + num(r, casas);
};
export const NOME_RES = { V: "vitória", E: "empate", D: "derrota" };

export function h(tag, attrs = {}, ...filhos) {
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
export const iconeComp = (c) => (LOGOS.get(c) && !SEM_LOGO.has(c)
  ? { src: LOGOS.get(c), classe: "logo-comp" + (LOGOS_ESCUROS.has(c) ? " escuro" : "") } : null);
export const tagComp = (c) => h("span", { class: "tag-comp" }, simboloComp(c), c);
export const escudo = (j) => h("span", { class: "time" },
  j.adversario_logo ? h("img", { src: j.adversario_logo, alt: "", loading: "lazy", width: 18, height: 18 }) : null, j.adversario);
export const vazio = (texto) => h("p", { class: "vazio" }, texto);
// replaceChildren escreve "null" na tela quando recebe null; aqui itens vazios (null, false) são ignorados
export const preencher = (el, ...filhos) => el.replaceChildren(...filhos.flat().filter((f) => f !== null && f !== undefined && f !== false));

// Regra do painel: todo placar ou xG de UM jogo aparece na ordem mandante × visitante, com os nomes.
// (Somas da temporada continuam "a favor × contra", sempre rotuladas assim.)
export const mandanteVisitante = (p, pro, contra) => (p.mando === "Fora"
  ? [{ nome: p.adversario, valor: contra, fla: false }, { nome: "Flamengo", valor: pro, fla: true }]
  : [{ nome: "Flamengo", valor: pro, fla: true }, { nome: p.adversario, valor: contra, fla: false }]);
export const textoConfronto = (p, pro, contra, fmt = (v) => v ?? "–") => {
  const [a, b] = mandanteVisitante(p, pro, contra);
  return `${a.nome} ${fmt(a.valor)} × ${fmt(b.valor)} ${b.nome}`;
};
// Escudo do time (o do Flamengo vem da fonte, como o dos adversários; a marca do datafla continua própria)
export const logoFla = () => D?.bruto.partidas.find((x) => x.flamengo_logo)?.flamengo_logo ?? "logos/teams/108861.png";
export const escudoImg = (src, tamanho = 18) => (src ? h("img", { src, alt: "", loading: "lazy", width: tamanho, height: tamanho, class: "escudo-time" }) : null);

// Célula com os dois times e o placar no meio; o lado do Flamengo em destaque
export function confronto(p, pro = p.gols_pro, contra = p.gols_contra, fmt = (v) => v ?? "–") {
  const [a, b] = mandanteVisitante(p, pro, contra);
  const time = (t, lado) => h("span", { class: `confronto-time ${lado}` + (t.fla ? " fla" : "") },
    escudoImg(t.fla ? logoFla() : p.adversario_logo), t.nome);
  return h("span", { class: "confronto" }, time(a, "casa"), h("b", { class: "confronto-placar" }, `${fmt(a.valor)} × ${fmt(b.valor)}`), time(b, "fora"));
}
export const media = (lista) => (lista.length ? lista.reduce((s, v) => s + v, 0) / lista.length : null);
export const soma = (lista, f) => lista.reduce((s, x) => s + (f(x) ?? 0), 0);
export const pontosDe = (r) => (r === "V" ? 3 : r === "E" ? 1 : 0);
export const pontos = (js) => js.reduce((s, j) => s + pontosDe(j.resultado), 0);
export const contar = (js, r) => js.filter((j) => j.resultado === r).length;
export const movel = (lista, f, n = 5) => lista.map((_, i) => media(lista.slice(Math.max(0, i - n + 1), i + 1).map(f).filter((v) => v != null)) ?? 0);
export const rotuloMes = (lista) => (i) => (i === 0 || mes(lista[i].data_utc) !== mes(lista[i - 1].data_utc) ? mes(lista[i].data_utc) : null);

// ---------- dados ----------
export function agrupar(lista, chave) {
  const m = new Map();
  for (const x of lista) {
    const k = x[chave];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

export function resultado(pro, contra) {
  if (pro == null || contra == null) return null;
  return pro > contra ? "V" : pro < contra ? "D" : "E";
}

// Tabelas grandes chegam como { colunas, linhas } (JSON menor); aqui voltam a ser objetos.
export const expandir = (t) => (t && !Array.isArray(t) && Array.isArray(t.colunas)
  ? t.linhas.map((l) => Object.fromEntries(t.colunas.map((c, i) => [c, l[i]]))) : t);

export function preparar(bruto) {
  for (const k of Object.keys(bruto)) bruto[k] = expandir(bruto[k]);
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
    escalacoesPorPartida: agrupar(bruto.escalacoes ?? [], "id_partida"),
    // adversários e carreira vêm de <ano>-extra.json, depois da 1ª tela (carregarExtras); os JSON antigos/demo já os trazem
    adversariosPorPartida: agrupar(bruto.adversarios ?? [], "id_partida"),
    carreiraPorJogador: agrupar(bruto.carreira ?? [], "jogador_id"),
    extras: !bruto.meta?.extras,
    extrasPromessa: Promise.resolve(),
    fotos: new Map((bruto.fotos ?? []).map((f) => [f.jogador_id, f.foto])),
    competicoes: ORDEM_COMP.filter((c) => comps.has(c)).concat([...comps].filter((c) => !ORDEM_COMP.includes(c))),
    tem: {
      xg: bruto.partidas.some((p) => p.xg_pro != null),
      previsao: bruto.partidas.some((p) => p.xp != null),
    },
  };
}

export const mesDe = (iso) => new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", timeZone: "America/Sao_Paulo" }).slice(0, 7);
export const nomeMes = (aaaamm) => new Date(`${aaaamm}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
export const ehMes = (periodo) => /^\d{4}-\d{2}$/.test(periodo);
export const compOk = (c) => !estado.comp || estado.comp === c;
// Jogos encerrados que passam pelos filtros. O período vale depois de competição e mando:
// "últimos 10" com Brasileirão = os 10 últimos jogos do Brasileirão.
export function filtrados({ comMando = true } = {}) {
  let js = D.encerrados.filter((p) => compOk(p.competicao) && (!comMando || !estado.mando || p.mando === estado.mando));
  if (ehMes(estado.periodo)) js = js.filter((p) => mesDe(p.data_utc) === estado.periodo);
  else if (estado.periodo !== "temporada") js = js.slice(-Number(estado.periodo));
  return js;
}
export const comDetalhe = (js) => js.filter((p) => p.detalhe);

// ---------- componentes ----------
export function kpi(rotulo, valor, extra, destaque = false) {
  return h("div", { class: "kpi" + (destaque ? " destaque" : "") },
    h("div", { class: "rotulo" }, rotulo), h("div", { class: "valor" }, valor), extra ? h("div", { class: "extra" }, extra) : null);
}
export const bola = (r) => h("span", { class: `resultado ${r}`, "aria-label": NOME_RES[r] }, r);
export const dicaJogo = (p, linhasDica = []) => () => conteudoDica(`${dataLonga(p.data_utc)} · ${p.competicao}`,
  [{ valor: textoConfronto(p, p.gols_pro, p.gols_contra), nome: "" }, ...linhasDica]);
export function mostrar(id, sim) { $(id).hidden = !sim; return sim; }
export const notaTag = (v) => (v == null ? "–" : h("span", { class: "nota" + (v >= 7.5 ? " alta" : v < 6.3 ? " baixa" : "") }, num(v, 1)));

export function definirDados(dados) { D = dados; }
