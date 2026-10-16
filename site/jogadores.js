// Aba Jogadores: tabela por grupo de métricas, perfil (modal) e dispersões.
import { colunas, conteudoDica, dica, dispersao, serie } from "./graficos.js";
import { $, assinado, comDetalhe, corComp, D, dicaJogo, estado, filtrados, h, MIN_MINUTOS, mostrar, notaTag, num, pct, rotuloMes, soma, vazio } from "./comum.js";
import { render } from "./app.js";

// =====================================================================
// JOGADORES
// =====================================================================
export const SOMAS = ["minutos", "gols", "assistencias", "finalizacoes", "finalizacoes_alvo", "passes", "passes_certos", "passes_chave",
  "desarmes", "interceptacoes", "duelos", "duelos_ganhos", "dribles_tentados", "dribles_certos", "faltas_cometidas",
  "faltas_sofridas", "amarelos", "vermelhos", "defesas", "gols_sofridos"];
export const OPCIONAIS = ["xg", "xa", "xgot", "xg_evitado"]; // null = a fonte não tem (diferente de 0)

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
};
export const GRUPOS = {
  geral: { nome: "Geral", ordem: "minutos", cols: ["jogos", "titular", "minutos", "pctMin", "gols", "assistencias", "xg", "xa", "nota", "amarelos", "vermelhos"] },
  ataque: { nome: "Ataque", ordem: "gols", cols: ["minutos", "gols", "xg", "gMenosXg", "finalizacoes", "finalizacoes_alvo", "precisaoFin", "xgot"] },
  criacao: { nome: "Criação", ordem: "assistencias", cols: ["minutos", "assistencias", "xa", "aMenosXa", "passes_chave", "passes", "passesPct", "dribles_certos", "driblesPct", "faltas_sofridas"] },
  defesa: { nome: "Defesa", ordem: "desarmes", cols: ["minutos", "desarmes", "interceptacoes", "duelos_ganhos", "duelosPct", "faltas_cometidas", "amarelos"] },
  goleiros: { nome: "Goleiros", ordem: "xg_evitado", cols: ["jogos", "minutos", "defesas", "gols_sofridos", "xg_evitado", "passesPct", "nota"], filtro: (a) => a.posicao === "Goleiro" },
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
  const modal = $("modal-jogador");
  if (!modal.open) {
    modal.showModal();
    modal.append($("dica")); // a dica precisa estar dentro do modal para aparecer por cima dele
  }
  modal.querySelector(".modal-corpo").scrollTop = 0;
  render(); // desenha o perfil (largura já conhecida) e destaca o jogador na aba de jogadores
}

export function fecharJogador() {
  const modal = $("modal-jogador");
  if (modal.open) modal.close();
}

export function montarModal() {
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
