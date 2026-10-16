// Painel organizado pelas perguntas que os dados respondem: como está a temporada, como foi cada
// jogo, quem rende o quê, como está o elenco, como o time joga e quanto confiar nos dados.
// Feito para a temporada 2026 (fonte Highlightly); uma visão some quando a fonte não tem o dado.

import { $, contar, D, data, DEMO, ehMes, estado, definirDados, filtrados, h, mes, mesDe, nomeMes, pct, pontos, preparar, simboloComp } from "./comum.js";
import { renderTemporada } from "./temporada.js";
import { abrirJogo, abrirProximo, montarModalJogo, renderJogos } from "./jogos.js";
import { agregarJogadores, montarModal, renderJogadores, renderPerfil } from "./jogadores.js";
import { renderElenco } from "./elenco.js";
import { renderEstilo } from "./estilo.js";
import { montarOpiniao, nomeFonte } from "./opiniao.js";
import { renderClassificacao } from "./classificacao.js";
import { registrarAba, registrarVisita } from "./acessos.js";
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
  document.body.classList.toggle("sem-filtros", aba === "opiniao" || aba === "classificacao"); // filtros do Flamengo não se aplicam
  for (const x of document.querySelectorAll(".abas button")) x.setAttribute("aria-selected", x.dataset.aba === aba);
  for (const s of document.querySelectorAll(".aba")) s.hidden = s.id !== `aba-${aba}`;
}

export function trocarAba(aba) {
  marcarAba(aba);
  registrarAba(aba);
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
  for (const b of $("subaba-elenco").children) b.addEventListener("click", () => {
    estado.subElenco = b.dataset.sub;
    const url = new URL(location);
    url.searchParams.set("sub", estado.subElenco);
    history.replaceState(null, "", url);
    render();
  });
  for (const b of $("lista-jogos").children) b.addEventListener("click", () => {
    estado.lista = b.dataset.lista;
    const url = new URL(location);
    url.searchParams.set("lista", estado.lista);
    if (estado.lista === "proximos") url.searchParams.delete("jogo");
    history.replaceState(null, "", url);
    render();
  });
  $("busca-jogador").addEventListener("input", (e) => { estado.busca = e.target.value; render(); });
  $("botao-tema").addEventListener("click", () => {
    const novo = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = novo;
    document.querySelector('meta[name="theme-color"]').content = "#0e0f11"; // o topo é escuro nos dois temas
    try { localStorage.setItem("datafla-tema", novo); } catch {}
  });
}

// ---------- admin (entrada escondida no canto do topo, ou o link #admin) ----------
function abrirAdmin() {
  import("./admin.js").then((m) => m.abrirAdmin()).catch(() => alert("Não foi possível abrir a administração."));
}

function montarAdmin() {
  const modal = $("modal-admin");
  $("entrada-admin").addEventListener("click", abrirAdmin);
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });
  modal.addEventListener("close", () => {
    document.body.append($("dica"));
    $("dica").hidden = true;
    if (location.hash === "#admin") history.replaceState(null, "", location.pathname + location.search);
  });
}

export function render() {
  const js = filtrados();
  ({ temporada: renderTemporada, jogos: renderJogos, jogadores: renderJogadores, elenco: renderElenco,
    estilo: renderEstilo, classificacao: renderClassificacao, opiniao: () => {} })[estado.aba](js);
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
    definirDados(preparar(await buscarJson(`${ano}.json`)));
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
  $("atualizado").textContent = `Temporada ${ano} · atualizado em ${new Date(D.bruto.meta.coletado_em ?? D.bruto.meta.gerado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}`;
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
  montarAdmin();
  montarModalJogo();
  const aba = params.get("aba");
  if (aba && document.getElementById(`aba-${aba}`)) marcarAba(aba);
  registrarVisita(estado.aba);
  await carregarTemporada(ano);
  estado.subElenco = params.get("sub") === "ficha" ? "ficha" : "desempenho";
  const jogo = Number(params.get("jogo"));
  estado.lista = jogo ? "disputados" : ["disputados", "comparar"].includes(params.get("lista")) ? params.get("lista") : "proximos";
  const proximo = Number(params.get("proximo"));
  if (jogo && estado.aba === "jogos") abrirJogo(jogo);
  else if (proximo && estado.aba === "jogos") abrirProximo(proximo);
  else render();
  if (location.hash === "#admin") abrirAdmin(); // depois dos dados: o admin mostra a situação da coleta
  // A barra de filtros fica fixa logo abaixo do topo, que muda de altura no celular.
  const alturaTopo = () => document.documentElement.style.setProperty("--altura-topo", `${document.querySelector(".topo").offsetHeight}px`);
  alturaTopo();
  let t;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => { alturaTopo(); render(); }, 150); });
}

iniciar();
