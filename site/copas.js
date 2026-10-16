// Aba Classificação → outras competições: tabelas dos grupos (fonte: /standings) e chaveamento do mata-mata
// (fonte: todos os jogos da copa, tabela `mata_mata`). Confrontos de ida e volta somam o placar; empate vai aos pênaltis.
import { D, data, escudoImg, h, preencher, vazio } from "./comum.js";

const nomeGrupo = (g) => {
  if (!g) return "Tabela";
  const partes = g.split(",").map((x) => x.trim());
  const ultimo = partes.at(-1).replace(/^Group\s+/i, "Grupo ").replace(/Relegation round/i, "Quadrangular do rebaixamento");
  const fase = partes.find((x) => /ta[cç]a|turno/i.test(x))?.replace(/Taca/i, "Taça");
  return fase && fase !== partes.at(-1) ? `${fase} · ${ultimo}` : ultimo;
};

// ---------- grupos ----------
export function grupos(comp) {
  const linhas = (D.bruto.classificacao ?? []).filter((l) => l.competicao === comp);
  const porGrupo = new Map();
  for (const l of linhas) (porGrupo.get(l.grupo) ?? porGrupo.set(l.grupo, []).get(l.grupo)).push(l);
  // o grupo do Flamengo primeiro, depois na ordem do nome
  return [...porGrupo].map(([g, ls]) => ({ nome: nomeGrupo(g), linhas: ls.sort((a, b) => a.posicao - b.posicao), fla: ls.some((l) => l.eh_flamengo) }))
    .sort((a, b) => b.fla - a.fla || /rebaixamento/i.test(a.nome) - /rebaixamento/i.test(b.nome) || a.nome.localeCompare(b.nome));
}

function tabelaGrupo(g, comp) {
  const classifica = comp === "Libertadores" ? 2 : 0;
  return h("article", { class: "cartao grupo" + (g.fla ? " grupo-fla" : "") },
    h("h3", {}, g.nome, g.fla ? h("span", { class: "selo-nova" }, "Flamengo") : null),
    h("table", { class: "tabela tabela-grupo" },
      h("thead", {}, h("tr", {}, ["#", "Time", "P", "J", "V", "E", "D", "SG"].map((t, i) => h("th", { class: i >= 2 ? "num" : "" }, t)))),
      h("tbody", {}, g.linhas.map((l) => h("tr", { class: [l.eh_flamengo ? "destaque-fla" : "", l.posicao <= classifica ? "zona-g4" : ""].join(" ") },
        h("td", { class: "num" }, l.posicao),
        h("td", {}, h("span", { class: "time" }, escudoImg(l.time_logo), l.time)),
        h("td", { class: "num" }, h("b", {}, l.pontos)), h("td", { class: "num" }, l.jogos), h("td", { class: "num" }, l.vitorias),
        h("td", { class: "num" }, l.empates), h("td", { class: "num" }, l.derrotas),
        h("td", { class: "num" }, (l.gols_pro - l.gols_contra > 0 ? "+" : "") + (l.gols_pro - l.gols_contra)))))));
}

// ---------- mata-mata ----------
// Confrontos (ida e volta juntos) por fase, na ordem do chaveamento: cada confronto de uma fase fica na altura dos dois
// confrontos da fase anterior de onde vieram os times.
export function confrontos(comp) {
  const jogos = (D.bruto.mata_mata ?? []).filter((m) => m.competicao === comp).sort((a, b) => a.data_utc.localeCompare(b.data_utc));
  const fases = new Map(); // ordem_fase -> { nome, confrontos: Map(par -> confronto) }
  for (const m of jogos) {
    const f = fases.get(m.ordem_fase) ?? fases.set(m.ordem_fase, { ordem: m.ordem_fase, nome: m.fase, mapa: new Map() }).get(m.ordem_fase);
    const par = [m.casa_id, m.fora_id].sort((a, b) => a - b).join("-");
    const c = f.mapa.get(par) ?? f.mapa.set(par, {
      a: { id: m.casa_id, nome: m.casa, logo: m.casa_logo }, b: { id: m.fora_id, nome: m.fora, logo: m.fora_logo }, jogos: [] }).get(par);
    c.jogos.push(m);
  }
  const lista = [...fases.values()].sort((x, y) => x.ordem - y.ordem).map((f) => ({ ordem: f.ordem, nome: f.nome, confrontos: [...f.mapa.values()].map(resultado) }));
  // ordem do chaveamento, da última fase para a primeira
  for (let i = lista.length - 2; i >= 0; i--) {
    const seguinte = lista[i + 1].confrontos, atual = lista[i].confrontos;
    const ordenados = [];
    for (const c of seguinte) for (const t of [c.a.id, c.b.id]) {
      const veio = atual.find((x) => !ordenados.includes(x) && (x.a.id === t || x.b.id === t));
      if (veio) ordenados.push(veio);
    }
    lista[i].confrontos = [...ordenados, ...atual.filter((x) => !ordenados.includes(x))];
  }
  return lista;
}

export function resultado(c) {
  const gols = (time) => c.jogos.reduce((s, m) => s + ((m.casa_id === time ? m.gols_casa : m.gols_fora) ?? 0), 0);
  const encerrado = c.jogos.length > 0 && c.jogos.every((m) => m.gols_casa != null);
  // ida e volta: o confronto só se decide depois do 2º jogo (final única: 1 jogo)
  const decidido = encerrado && (c.jogos.length >= 2 || c.jogos[0].fase === "Final");
  const ga = gols(c.a.id), gb = gols(c.b.id);
  const ultimo = c.jogos.at(-1);
  const pen = ultimo?.penaltis_casa != null
    ? (ultimo.casa_id === c.a.id ? [ultimo.penaltis_casa, ultimo.penaltis_fora] : [ultimo.penaltis_fora, ultimo.penaltis_casa]) : null;
  let vencedor = null;
  if (decidido) vencedor = ga > gb ? c.a.id : gb > ga ? c.b.id : pen ? (pen[0] > pen[1] ? c.a.id : c.b.id) : null;
  const jogou = c.jogos.some((m) => m.gols_casa != null);
  return { ...c, gols: jogou ? [ga, gb] : null, penaltis: pen, vencedor, fla: [c.a.nome, c.b.nome].includes("Flamengo") };
}

function cartaoConfronto(c) {
  const linha = (t, g) => h("div", { class: "chave-time" + (c.vencedor === t.id ? " vencedor" : c.vencedor ? " eliminado" : "") + (t.nome === "Flamengo" ? " fla" : "") },
    escudoImg(t.logo), h("span", { class: "cresce" }, t.nome), h("b", { class: "chave-gols" }, g ?? "–"));
  const pernas = c.jogos.map((m, i) => `${c.jogos.length > 1 ? (i ? "volta" : "ida") : "jogo"} ${data(m.data_utc)}`
    + (m.gols_casa != null ? `: ${m.casa} ${m.gols_casa}×${m.gols_fora} ${m.fora}` : ""));
  return h("div", { class: "chave-confronto" + (c.fla ? " chave-fla" : ""), title: pernas.join("\n") },
    linha(c.a, c.gols?.[0]), linha(c.b, c.gols?.[1]),
    h("small", { class: "sutil" }, c.aDefinir ? "jogo único · data a definir" : c.penaltis ? `pênaltis ${c.penaltis[0]}×${c.penaltis[1]}`
      : c.vencedor ? (c.jogos.length > 1 ? "placar somado" : "") : pernas.filter((p) => !p.includes(":")).map((p) => p.replace(/^(ida|volta|jogo) /, "$1 ")).join(" · ") || "em andamento"));
}

function chaveamento(comp) {
  const fases = confrontos(comp);
  if (!fases.length) return null;
  // a final ainda não está na fonte: coluna com os vencedores das semifinais (ou "a definir")
  const ultima = fases.at(-1);
  if (ultima.nome === "Semifinal") {
    const lado = (c) => (c.vencedor ? (c.vencedor === c.a.id ? c.a : c.b) : { id: null, nome: `${c.a.nome} ou ${c.b.nome}`, logo: null });
    const [s1, s2] = ultima.confrontos;
    fases.push({ nome: "Final", confrontos: [{ a: s1 ? lado(s1) : { nome: "a definir" }, b: s2 ? lado(s2) : { nome: "a definir" },
      jogos: [], gols: null, penaltis: null, vencedor: null, fla: false, aDefinir: true }] });
  }
  return h("article", { class: "cartao" },
    h("h2", {}, "Mata-mata"),
    h("p", { class: "sutil" }, "Placar somado da ida e da volta; empate vai aos pênaltis. Passe o mouse num confronto para ver os jogos."),
    h("div", { class: "rolagem" }, h("div", { class: "chaveamento", style: `--fases:${fases.length}` },
      fases.map((f) => h("div", { class: "chave-fase" }, h("h4", {}, f.nome),
        h("div", { class: "chave-lista" }, f.confrontos.map(cartaoConfronto)))))));
}

export function renderCopa(caixa, comp) {
  const gs = grupos(comp);
  const chave = chaveamento(comp);
  if (!gs.length && !chave) { preencher(caixa, h("article", { class: "cartao" }, vazio(`A tabela da ${comp} chega na próxima coleta.`))); return; }
  preencher(caixa,
    chave,
    gs.length ? h("article", { class: "cartao" }, h("h2", {}, gs.length > 1 ? "Fase de grupos" : "Tabela"),
      comp === "Libertadores" ? h("p", { class: "sutil" }, "Os 2 primeiros de cada grupo vão às oitavas.") : null,
      h("div", { class: "grade-grupos" }, gs.map((g) => tabelaGrupo(g, comp)))) : null);
}

// competições com algo a mostrar além do Brasileirão (na ordem do seletor)
export function competicoesComTabela() {
  const tem = new Set([...(D.bruto.classificacao ?? []).map((l) => l.competicao), ...(D.bruto.mata_mata ?? []).map((m) => m.competicao)]);
  return ["Libertadores", "Copa do Brasil", "Carioca"].filter((c) => tem.has(c));
}
