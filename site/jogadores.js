// Aba Jogadores: tabela por grupo de métricas, perfil (modal) e dispersões.
import { colunas, conteudoDica, dica, dispersao, serie } from "./graficos.js";
import { $, assinado, comDetalhe, corComp, D, dataLonga, dicaJogo, estado, filtrados, h, MIN_MINUTOS, mostrar, notaTag, num, pct, preencher, rotuloMes, soma, textoConfronto, vazio } from "./comum.js";
import { render } from "./app.js";

// =====================================================================
// JOGADORES
// =====================================================================
export const SOMAS = ["minutos", "gols", "assistencias", "finalizacoes", "finalizacoes_alvo", "passes", "passes_certos", "passes_chave",
  "desarmes", "interceptacoes", "duelos", "duelos_ganhos", "dribles_tentados", "dribles_certos", "faltas_cometidas",
  "faltas_sofridas", "amarelos", "vermelhos", "defesas", "gols_sofridos"];
export const OPCIONAIS = ["xg", "xa", "xgot", "xg_evitado", "xgot_enfrentado"]; // null = a fonte não tem (diferente de 0)

export function agregarJogadores(js) {
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
export const COL = {
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
  xgot_enfrentado: { titulo: "xGOT enfrentado", tipo: "soma", casas: 1 },
};
export const GRUPOS = {
  geral: { nome: "Geral", ordem: "minutos", cols: ["jogos", "titular", "minutos", "pctMin", "gols", "assistencias", "xg", "xa", "nota", "amarelos", "vermelhos"] },
  ataque: { nome: "Ataque", ordem: "gols", cols: ["minutos", "gols", "xg", "gMenosXg", "finalizacoes", "finalizacoes_alvo", "precisaoFin", "xgot"] },
  criacao: { nome: "Criação", ordem: "assistencias", cols: ["minutos", "assistencias", "xa", "aMenosXa", "passes_chave", "passes", "passesPct", "dribles_certos", "driblesPct", "faltas_sofridas"] },
  defesa: { nome: "Defesa", ordem: "desarmes", cols: ["minutos", "desarmes", "interceptacoes", "duelos_ganhos", "duelosPct", "faltas_cometidas", "amarelos"] },
  goleiros: { nome: "Goleiros", ordem: "xg_evitado", cols: ["jogos", "minutos", "defesas", "gols_sofridos", "xgot_enfrentado", "xg_evitado", "passesPct", "nota"], filtro: (a) => a.posicao === "Goleiro" },
};

export function valorCol(a, campo) {
  const c = COL[campo];
  const v = a[campo];
  if (estado.modo === "p90" && (c.tipo === "soma" || c.tipo === "dif") && v != null) return a.minutos ? (v / a.minutos) * 90 : null;
  return v;
}
export function formatarCol(campo, v) {
  const c = COL[campo];
  if (v == null) return "–";
  if (c.tipo === "texto") return v;
  if (c.tipo === "pct") return pct(v, 0);
  if (c.tipo === "dif") return assinado(v, estado.modo === "p90" ? 2 : c.casas ?? 0);
  if (estado.modo === "p90" && c.tipo === "soma") return num(v, 2);
  return num(v, c.casas ?? 0);
}

export function renderJogadores(js) {
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
export function abrirJogador(id) {
  estado.jogador = id;
  estado.partidaJogador = null; // perfil da temporada
  estado.vistaJogador = "temporada";
  const modal = $("modal-jogador");
  if (!modal.open) {
    modal.showModal();
    modal.append($("dica")); // a dica precisa estar dentro do modal para aparecer por cima dele
  }
  modal.querySelector(".modal-corpo").scrollTop = 0;
  render(); // desenha o perfil (largura já conhecida) e destaca o jogador na aba de jogadores
}

// Ficha do jogador numa partida (clique no campinho ou na escalação); jogadores do Flamengo também têm a temporada
export function abrirJogadorNaPartida(id, idPartida, ehFlamengo = true) {
  estado.partidaJogador = idPartida;
  estado.vistaJogador = "partida";
  estado.jogadorAdversario = !ehFlamengo;
  estado.jogador = id;
  const modal = $("modal-jogador");
  if (!modal.open) {
    modal.showModal();
    modal.append($("dica"));
  }
  modal.querySelector(".modal-corpo").scrollTop = 0;
  render();
}

export function fecharJogador() {
  const modal = $("modal-jogador");
  if (modal.open) modal.close();
}

export function montarModal() {
  const modal = $("modal-jogador");
  modal.addEventListener("close", () => {
    (document.querySelector("dialog[open]") ?? document.body).append($("dica")); // volta para o jogo, se estiver aberto
    $("dica").hidden = true;
    estado.jogador = null;
    estado.partidaJogador = null;
    estado.vistaJogador = "temporada";
    render();
  });
  // Clique no fundo escurecido fecha (o conteúdo fica num filho, então o alvo é o próprio <dialog>)
  modal.addEventListener("click", (e) => { if (e.target === modal) fecharJogador(); });
}

// Métricas do perfil, comparadas por 90 minutos com jogadores da mesma posição.
// [campo, rótulo, já é taxa (não dividir por minutos), menor é melhor]
// Em cada seção, as métricas aparecem da melhor para a pior posição no elenco.
export const PERFIL = {
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

export function renderPerfil(js, todos) {
  if (estado.partidaJogador != null && estado.vistaJogador === "partida") return renderNaPartida(todos);
  const caixa = $("detalhe-jogador");
  const a = todos.find((x) => x.id === estado.jogador);
  if (!a) {
    preencher(caixa, h("div", { class: "perfil-topo" }, h("p", { class: "cresce sutil" },
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
  preencher(caixa,
    h("div", { class: "perfil-topo" },
      D.fotos.get(a.id)
        ? h("div", { class: "foto-jogador" }, h("img", { src: D.fotos.get(a.id), alt: `Foto de ${a.jogador}`, width: 88, height: 88,
            onerror: (e) => e.target.closest(".foto-jogador").replaceWith(h("div", { class: "camisa" }, a.numero ?? "–")) }),
          h("span", { class: "foto-numero" }, a.numero ?? ""))
        : h("div", { class: "camisa" }, a.numero ?? "–"),
      h("div", { class: "cresce" }, h("h2", {}, a.jogador),
        h("p", { class: "sutil" }, [a.posicao, `${a.jogos} jogos, ${a.titular} como titular`, `${num(a.minutos)} minutos`].join(" · "))),
      h("button", { class: "fechar", onclick: fecharJogador, "aria-label": "Fechar perfil", autofocus: true }, "×")),
    abasFicha(),
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
    secaoCarreira(a),
  );
  if (temNota) serie(grafNota, participacoes.map(([p, j]) => ({
    valor: j?.minutos > 0 ? j.nota : null, cor: corComp(p.competicao),
    dica: dicaJogo(p, [{ valor: `nota ${num(j?.nota, 1)}`, nome: `${j?.minutos ?? 0} min` }]),
  })), { min: 5, max: 9, referencia: a.nota, rotuloX: rotuloMes(jogosDet) });
  colunas(grafMin, participacoes.map(([p, j]) => ({ valor: j?.minutos ?? 0, cor: corComp(p.competicao),
    dica: dicaJogo(p, [{ valor: situacao(j, p) }]) })),
  { max: Math.max(90, ...participacoes.map(([, j]) => j?.minutos ?? 0)), rotuloX: rotuloMes(jogosDet), altura: 150 });
}

// ---------- ficha do jogador na partida ----------
function abasFicha() {
  if (estado.partidaJogador == null) return null;
  const aba = (v, rotulo, desligada) => h("button", { type: "button", "aria-pressed": String(estado.vistaJogador === v), disabled: desligada || null,
    title: desligada ? "A temporada completa está disponível só para jogadores do Flamengo" : null,
    onclick: () => { estado.vistaJogador = v; $("modal-jogador").querySelector(".modal-corpo").scrollTop = 0; render(); } }, rotulo);
  return h("div", { class: "segmentado abas-ficha" }, aba("partida", "Nesta partida"), aba("temporada", "Na temporada", estado.jogadorAdversario));
}

const NOME_POS = { G: "Goleiro", D: "Defensor", M: "Meio-campo", F: "Atacante" };

function renderNaPartida(todos) {
  const caixa = $("detalhe-jogador");
  if (estado.jogadorAdversario && !D.extras) { // adversário vem do arquivo extra
    preencher(caixa, h("p", { class: "sutil" }, "Carregando…"));
    D.extrasPromessa.then(() => renderNaPartida(todos));
    return;
  }
  const idp = estado.partidaJogador;
  const p = D.encerrados.find((x) => x.id_partida === idp);
  const lista = estado.jogadorAdversario ? D.adversariosPorPartida.get(idp) : D.jogadoresPorPartida.get(idp);
  const j = (lista ?? []).find((x) => x.jogador_id === estado.jogador);
  const fechar = h("button", { class: "fechar", onclick: fecharJogador, "aria-label": "Fechar", autofocus: true }, "×");
  if (!p || !j) {
    preencher(caixa, h("div", { class: "perfil-topo" }, h("p", { class: "cresce sutil" }, "A fonte não tem os números deste jogador neste jogo."), fechar));
    return;
  }
  const time = estado.jogadorAdversario ? p.adversario : "Flamengo";
  const temporada = estado.jogadorAdversario ? null : todos.find((x) => x.id === j.jogador_id);
  const eventos = (D.eventosPorPartida.get(idp) ?? []).filter((e) => e.jogador_id === j.jogador_id || e.assist_id === j.jogador_id);
  const entrou = eventos.find((e) => e.tipo === "subst" && e.assist_id === j.jogador_id);
  const saiu = eventos.find((e) => e.tipo === "subst" && e.jogador_id === j.jogador_id);
  const minuto = (e) => `${e.minuto}${e.acrescimo ? "+" + e.acrescimo : ""}'`;
  const participacao = !j.minutos ? "não entrou" : [j.titular ? "titular" : entrou ? `entrou aos ${minuto(entrou)}` : "entrou no 2º tempo",
    saiu ? `saiu aos ${minuto(saiu)}` : null, `${j.minutos} min`].filter(Boolean).join(", ");
  const foto = !estado.jogadorAdversario && D.fotos.get(j.jogador_id);
  const pctTexto = (a, b) => (b ? ` (${pct(a / b, 0)})` : "");
  // média por jogo na temporada (só Flamengo), para comparar
  const media = (c) => (temporada && temporada.jogos && temporada[c] != null ? temporada[c] / temporada.jogos : null);
  const linha = (rotulo, valor, c, casas = 0) => h("tr", {}, h("td", {}, rotulo), h("td", { class: "num" }, h("b", {}, valor ?? "–")),
    temporada ? h("td", { class: "num sutil" }, c && media(c) != null ? num(media(c), casas || 1) : "") : null);
  // xG/xGOT vazios na fonte quando o jogador não finalizou: isso é zero, não "sem dado"
  const v = (c, casas = 0) => (j[c] == null ? (["xg", "xgot"].includes(c) && j.finalizacoes === 0 ? num(0, casas) : null) : num(j[c], casas));
  const secao = (titulo, linhas) => h("div", {}, h("h3", {}, titulo),
    h("table", { class: "tabela" }, h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", { class: "num" }, "No jogo"),
      temporada ? h("th", { class: "num" }, "Média/jogo na temporada") : null)), h("tbody", {}, linhas)));
  const goleiro = j.posicao === "Goleiro" || j.posicao === "G";
  preencher(caixa,
    h("div", { class: "perfil-topo" },
      foto ? h("div", { class: "foto-jogador" }, h("img", { src: foto, alt: `Foto de ${j.jogador}`, width: 88, height: 88 }),
        h("span", { class: "foto-numero" }, j.numero ?? "")) : h("div", { class: "camisa" + (estado.jogadorAdversario ? " adv" : "") }, j.numero ?? "–"),
      h("div", { class: "cresce" }, h("h2", {}, j.jogador),
        h("p", { class: "sutil" }, [time, NOME_POS[j.posicao] ?? j.posicao, participacao].filter(Boolean).join(" · ")),
        h("p", { class: "sutil" }, `${textoConfronto(p, p.gols_pro, p.gols_contra)} · ${dataLonga(p.data_utc)} · ${p.competicao}`)),
      fechar),
    abasFicha(),
    h("div", { class: "mini-kpis" }, ...[["Nota", j.nota != null ? num(j.nota, 1) : null], ["Minutos", j.minutos], ["Gols", j.gols], ["Assistências", j.assistencias],
      ["xG", v("xg", 2)], ["xA", v("xa", 2)]].filter(([, x]) => x != null && x !== "–").map(([r, x]) => h("div", {}, h("b", {}, x), h("span", {}, r)))),
    eventos.length ? h("ul", { class: "lista-eventos" }, eventos.map((e) => h("li", {}, h("span", { class: "min" }, minuto(e)),
      h("span", {}, e.tipo === "Goal" ? (e.jogador_id === j.jogador_id ? (e.detalhe === "Own Goal" ? "Gol contra" : e.detalhe === "Penalty" ? "Gol de pênalti" : "Gol")
        : `Assistência para ${e.jogador}`) : e.tipo === "Card" ? (e.detalhe === "Yellow Card" ? "Cartão amarelo" : "Cartão vermelho")
        : e.tipo === "subst" ? (e.assist_id === j.jogador_id ? `Entrou no lugar de ${e.jogador ?? "outro jogador"}` : e.assist ? `Saiu para a entrada de ${e.assist}` : "Substituído")
        : e.tipo === "Shootout" ? `Pênalti na disputa (${e.detalhe === "Scored" ? "convertido" : "perdido"})` : e.tipo)))) : null,
    h("div", { class: "detalhe-grade" },
      goleiro ? secao("Goleiro", [linha("Defesas", v("defesas"), "defesas"), linha("Gols sofridos", v("gols_sofridos"), "gols_sofridos"),
        linha("xGOT enfrentado", v("xgot_enfrentado", 2), "xgot_enfrentado", 2), linha("Gols evitados (xG)", v("xg_evitado", 2), "xg_evitado", 2)]) : null,
      secao("Ataque", [
        linha("Finalizações", j.finalizacoes != null ? `${j.finalizacoes}` + (j.finalizacoes_alvo != null ? ` (${j.finalizacoes_alvo} no alvo)` : "") : null, "finalizacoes"),
        linha("Bloqueadas", v("finalizacoes_bloqueadas")), linha("xG", v("xg", 2), "xg", 2), linha("xGOT", v("xgot", 2), "xgot", 2),
        linha("Dribles certos", j.dribles_tentados ? `${j.dribles_certos ?? 0} de ${j.dribles_tentados}` : v("dribles_certos"), "dribles_certos"),
        linha("Faltas sofridas", v("faltas_sofridas"), "faltas_sofridas"), linha("Impedimentos", v("impedimentos"))]),
      secao("Criação", [
        linha("Passes certos", j.passes ? `${j.passes_certos ?? 0} de ${j.passes}${pctTexto(j.passes_certos ?? 0, j.passes)}` : null, "passes_certos"),
        linha("Passes decisivos", v("passes_chave"), "passes_chave"), linha("xA", v("xa", 2), "xa", 2), linha("Assistências", v("assistencias"), "assistencias")]),
      secao("Defesa", [
        linha("Desarmes", v("desarmes"), "desarmes"), linha("Interceptações", v("interceptacoes"), "interceptacoes"),
        linha("Duelos ganhos", j.duelos ? `${j.duelos_ganhos ?? 0} de ${j.duelos}${pctTexto(j.duelos_ganhos ?? 0, j.duelos)}` : null, "duelos_ganhos"),
        linha("Faltas cometidas", v("faltas_cometidas"), "faltas_cometidas"),
        linha("Cartões", (j.amarelos || j.vermelhos) ? [j.amarelos ? `${j.amarelos} amarelo` : null, j.vermelhos ? `${j.vermelhos} vermelho` : null].filter(Boolean).join(", ") : "0")])),
  );
}

// Carreira (fonte: /players/{id}/statistics): por temporada e competição, inclusive em outros clubes
let carreiraCompleta = false;
function secaoCarreira(a) {
  if (!D.extras) { // carreira vem do arquivo extra
    const espera = h("div", {}, h("h3", {}, "Carreira"), h("p", { class: "sutil" }, "Carregando…"));
    D.extrasPromessa.then(() => espera.replaceWith(secaoCarreira(a)));
    return espera;
  }
  // "25/26" e "2026" são a mesma temporada para a ordem (a europeia termina no ano do 2º número)
  const ano = (t) => { const m = /^(\d{2})\/(\d{2})$/.exec(String(t)); return m ? 2000 + Number(m[2]) : Number(t) || 0; };
  const linhas = (D.carreiraPorJogador.get(a.id) ?? []).slice()
    .sort((x, y) => ano(y.temporada) - ano(x.temporada) || (y.minutos ?? 0) - (x.minutos ?? 0));
  if (!linhas.length) return h("div", {}, h("h3", {}, "Carreira"), vazio("A carreira deste jogador chega nas próximas coletas."));
  const totais = linhas.reduce((t, l) => ({ jogos: t.jogos + (l.jogos ?? 0), gols: t.gols + (l.gols ?? 0), assistencias: t.assistencias + (l.assistencias ?? 0) }),
    { jogos: 0, gols: 0, assistencias: 0 });
  const mostrar = carreiraCompleta ? linhas : linhas.slice(0, 8);
  return h("div", {}, h("h3", {}, "Carreira"),
    h("p", { class: "sutil" }, `${linhas.length} temporadas/competições na fonte: ${num(totais.jogos)} jogos, ${num(totais.gols)} gols, ${num(totais.assistencias)} assistências.`),
    h("div", { class: "tabela-rolagem" }, h("table", { class: "tabela" },
      h("thead", {}, h("tr", {}, ["Temporada", "Competição", "Clube", "J", "Min.", "G", "A"].map((t, i) => h("th", { class: i >= 3 ? "num" : "" }, t)))),
      h("tbody", {}, mostrar.map((l) => h("tr", {}, h("td", {}, l.temporada), h("td", {}, l.competicao), h("td", {}, l.clube),
        h("td", { class: "num" }, l.jogos ?? "–"), h("td", { class: "num" }, num(l.minutos)), h("td", { class: "num" }, l.gols ?? "–"),
        h("td", { class: "num" }, l.assistencias ?? "–")))))),
    linhas.length > 8 ? h("button", { type: "button", class: "botao-texto", onclick: () => { carreiraCompleta = !carreiraCompleta; render(); } },
      carreiraCompleta ? "Mostrar menos" : `Mostrar as ${linhas.length} linhas`) : null);
}

export function situacao(j, p) {
  if (!p.detalhe) return "detalhes ainda não baixados";
  if (!j) return "não relacionado";
  if (!(j.minutos > 0)) return "no banco, não entrou";
  if (j.titular) return j.minutos < (p.duracao ?? 90) ? `titular, saiu (${j.minutos} min)` : "titular, jogo inteiro";
  return `entrou (${j.minutos} min)`;
}

export const DISPERSOES = {
  ataque: { titulo: "Finalização: gols × xG", nota: "Acima da linha tracejada, o jogador marcou mais do que as chances indicavam; abaixo, menos.",
    x: (a) => a.xg, y: (a) => a.gols, nomeX: "xG", nomeY: "gols", diagonal: true },
  criacao: { titulo: "Criação: assistências × xA", nota: "Acima da linha, os companheiros converteram mais do que o esperado das chances criadas.",
    x: (a) => a.xa, y: (a) => a.assistencias, nomeX: "xA", nomeY: "assistências", diagonal: true },
  defesa: { titulo: "Defesa: desarmes × interceptações por 90", nota: `Jogadores com ${MIN_MINUTOS}+ minutos.`,
    x: (a) => (a.minutos >= MIN_MINUTOS ? (a.desarmes / a.minutos) * 90 : null),
    y: (a) => (a.minutos >= MIN_MINUTOS ? (a.interceptacoes / a.minutos) * 90 : null),
    nomeX: "desarmes/90", nomeY: "interceptações/90", diagonal: false },
};

export function renderDispersao(todos) {
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
