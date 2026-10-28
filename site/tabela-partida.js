// Relatório do jogo → aba "Jogadores": números de todos que entraram em campo, dos dois times (box-score da fonte).
// Ordena pelo clique no cabeçalho; filtro Todos | mandante | visitante. Clique na linha abre a ficha do jogador no jogo.
import { D, escudoImg, h, logoFla, num } from "./comum.js";
import { abrirJogadorNaPartida } from "./jogadores.js";

const fracao = (a, b) => (b ? `${a ?? 0}/${b}` : "–");
// [chave de ordenação, rótulo, descrição, texto]
const COLUNAS = [
  ["minutos", "Min", "Minutos jogados", (j) => j.minutos],
  ["gols", "G", "Gols", (j) => j.gols],
  ["assistencias", "A", "Assistências", (j) => j.assistencias],
  ["xg", "xG", "Gols esperados", (j) => (j.xg != null ? num(j.xg, 2) : "–")],
  ["xa", "xA", "Assistências esperadas", (j) => (j.xa != null ? num(j.xa, 2) : "–")],
  ["finalizacoes", "Fin", "Finalizações (inclui bloqueadas)", (j) => j.finalizacoes],
  ["finalizacoes_alvo", "Alvo", "Finalizações no alvo", (j) => j.finalizacoes_alvo],
  ["finalizacoes_bloqueadas", "Bloq", "Finalizações bloqueadas", (j) => j.finalizacoes_bloqueadas],
  ["passes", "Passes", "Passes certos / tentados", (j) => fracao(j.passes_certos, j.passes)],
  ["passes_chave", "PD", "Passes decisivos (que viram finalização)", (j) => j.passes_chave],
  ["dribles_certos", "Dri", "Dribles certos / tentados", (j) => fracao(j.dribles_certos, j.dribles_tentados)],
  ["duelos_ganhos", "Duelos", "Duelos ganhos / disputados", (j) => fracao(j.duelos_ganhos, j.duelos)],
  ["desarmes", "Des", "Desarmes", (j) => j.desarmes],
  ["interceptacoes", "Int", "Interceptações", (j) => j.interceptacoes],
  ["faltas_cometidas", "FC", "Faltas cometidas", (j) => j.faltas_cometidas],
  ["faltas_sofridas", "FS", "Faltas sofridas", (j) => j.faltas_sofridas],
  ["impedimentos", "Imp", "Impedimentos", (j) => j.impedimentos],
  ["amarelos", "CA", "Cartões amarelos", (j) => j.amarelos],
  ["vermelhos", "CV", "Cartões vermelhos", (j) => j.vermelhos],
  ["defesas", "Def", "Defesas (goleiro)", (j) => j.defesas],
  ["nota", "Nota", "Nota da fonte", (j) => (j.nota != null ? num(j.nota, 1) : "–")],
];
const ORDEM_POS = ["Goleiro", "Defensor", "Meio-campo", "Atacante"];

const filtro = { time: "todos", chave: null, desc: true };

export function tabelaJogadoresPartida(p, flaPrimeiro) {
  const caixa = h("div", { class: "bloco" });
  if (!D.extras) { // jogadores do adversário ainda chegando (arquivo extra): mostra quando chegar
    caixa.append(h("p", { class: "sutil" }, "Carregando os jogadores…"));
    D.extrasPromessa.then(() => caixa.replaceWith(tabelaJogadoresPartida(p, flaPrimeiro)));
    return caixa;
  }
  const fla = (D.jogadoresPorPartida.get(p.id_partida) ?? []).map((j) => ({ ...j, eh_flamengo: true }));
  const adv = (D.adversariosPorPartida.get(p.id_partida) ?? []).map((j) => ({ ...j, eh_flamengo: false }));
  const times = flaPrimeiro
    ? [["fla", "Flamengo", logoFla()], ["adv", p.adversario, p.adversario_logo]]
    : [["adv", p.adversario, p.adversario_logo], ["fla", "Flamengo", logoFla()]];
  const todos = [...fla, ...adv].filter((j) => j.minutos > 0);
  // só as colunas que a fonte trouxe neste jogo
  const colunas = COLUNAS.filter(([k]) => todos.some((j) => j[k] != null && j[k] !== 0) || ["minutos", "gols", "assistencias"].includes(k));

  const render = () => {
    let lista = todos.filter((j) => filtro.time === "todos" || (filtro.time === "fla") === j.eh_flamengo);
    const lado = (j) => times.findIndex(([t]) => (t === "fla") === j.eh_flamengo);
    lista = lista.slice().sort(filtro.chave
      ? (a, b) => ((b[filtro.chave] ?? -1) - (a[filtro.chave] ?? -1)) * (filtro.desc ? 1 : -1)
      : (a, b) => lado(a) - lado(b) || (b.titular - a.titular) || ORDEM_POS.indexOf(a.posicao) - ORDEM_POS.indexOf(b.posicao) || b.minutos - a.minutos);
    const botao = (t, rotulo) => h("button", { type: "button", "aria-pressed": String(filtro.time === t),
      onclick: () => { filtro.time = t; render(); } }, rotulo);
    const th = ([k, rot, desc]) => h("th", { class: "num ordenavel" + (filtro.chave === k ? " ativo" : ""), title: desc, scope: "col",
      onclick: () => { if (filtro.chave === k) filtro.desc = !filtro.desc; else { filtro.chave = k; filtro.desc = true; } render(); } },
      rot, filtro.chave === k ? (filtro.desc ? " ↓" : " ↑") : "");
    caixa.replaceChildren(
      h("div", { class: "acoes" }, h("div", { class: "segmentado" }, botao("todos", "Todos"), ...times.map(([t, nome]) => botao(t, nome))),
        filtro.chave ? h("button", { type: "button", class: "botao-texto", onclick: () => { filtro.chave = null; render(); } }, "ordem original") : null),
      h("div", { class: "tabela-rolagem" }, h("table", { class: "tabela tabela-partida" },
        h("thead", {}, h("tr", {}, h("th", { class: "fixa", scope: "col" }, "Jogador"), ...colunas.map(th))),
        h("tbody", {}, lista.map((j) => h("tr", { class: "clicavel" + (j.eh_flamengo ? " linha-fla" : ""),
          onclick: () => abrirJogadorNaPartida(j.jogador_id, p.id_partida, j.eh_flamengo) },
          h("td", { class: "fixa" }, escudoImg(times[lado(j)][2], 16), " ", j.jogador,
            h("small", { class: "sutil" }, ` ${j.posicao?.[0] ?? ""}${j.titular ? "" : " · entrou"}`)),
          ...colunas.map(([k, , , f]) => h("td", { class: "num" + (filtro.chave === k ? " ativo" : "") }, f(j) ?? "–"))))))),
      h("p", { class: "sutil legenda-colunas" }, colunas.map(([, r, d]) => `${r} = ${d}`).join(" · ")
        + ". Escanteios e cruzamentos não vêm por jogador na fonte."));
  };
  if (!todos.length) return h("div", { class: "bloco" }, h("p", { class: "vazio" }, "Sem números por jogador na fonte para este jogo."));
  render();
  return caixa;
}
