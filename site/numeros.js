// Aba Números: dados consolidados da temporada — artilharia, assistências, participações, jogos sem sofrer gol,
// saiu na frente/atrás e viradas, pênaltis, disciplina, marcas e sequências.
// Segue os filtros da barra (competição, período, mando). Amistosos ficam fora por padrão (como nas estatísticas
// oficiais); a chave "Incluir amistosos" soma os amistosos. Prorrogação conta pelo resultado final.
// Jogos sem box-score na fonte (ex.: volta da Recopa) têm gols e assistências tirados dos lances.
import { $, D, data, estado, h, num, pct, preencher, vazio } from "./comum.js";
import { abrirJogador } from "./jogadores.js";
import { abrirJogo } from "./jogos.js";
import { render, trocarAba } from "./app.js";

const TOP = 10;
const abertos = new Set(); // cartões com "ver todos"

const ehGol = (e) => e.tipo === "Goal" && e.detalhe !== "Missed Penalty";
const ordemLance = (a, b) => (a.minuto ?? 0) - (b.minuto ?? 0) || (a.acrescimo ?? 0) - (b.acrescimo ?? 0) || a.ordem - b.ordem;
const resultadoTexto = { V: "venceu", E: "empatou", D: "perdeu" };

function jogosDaTela(js) {
  return estado.numerosAmistosos || estado.comp === "Amistosos" ? js : js.filter((p) => p.competicao !== "Amistosos");
}

// Números por jogador, somando jogo a jogo (box-score; sem box-score, os lances)
function porJogador(jogos) {
  const nomes = new Map((D.bruto.jogadores ?? []).map((j) => [j.jogador_id, j.jogador]));
  const t = new Map();
  const linha = (id, nome) => {
    if (!t.has(id)) t.set(id, { id, nome: nomes.get(id) ?? nome ?? "?", gols: 0, penaltis: 0, assistencias: 0, jogos: 0, minutos: 0,
      amarelos: 0, expulsoes: 0, jogosComGol: [], titular: 0 });
    return t.get(id);
  };
  for (const p of jogos) {
    if (!p.detalhe) continue;
    const linhas = D.jogadoresPorPartida.get(p.id_partida) ?? [];
    const lances = (D.eventosPorPartida.get(p.id_partida) ?? []).filter((e) => e.eh_flamengo);
    const golsNoJogo = new Map();
    if (linhas.length) {
      for (const j of linhas) {
        const l = linha(j.jogador_id, j.jogador);
        if (j.minutos > 0) { l.jogos++; l.minutos += j.minutos; if (j.titular) l.titular++; }
        l.gols += j.gols ?? 0; l.assistencias += j.assistencias ?? 0; l.amarelos += j.amarelos ?? 0;
        if (j.gols) golsNoJogo.set(j.jogador_id, j.gols);
      }
    } else {
      for (const e of lances.filter((e) => ehGol(e) && e.detalhe !== "Own Goal")) {
        linha(e.jogador_id, e.jogador).gols++;
        golsNoJogo.set(e.jogador_id, (golsNoJogo.get(e.jogador_id) ?? 0) + 1);
        if (e.assist_id) linha(e.assist_id, e.assist).assistencias++;
      }
    }
    for (const e of lances) {
      if (e.tipo === "Goal" && e.detalhe === "Penalty") linha(e.jogador_id, e.jogador).penaltis++;
      // expulsão: só de quem estava na relação do jogo (a fonte às vezes marca gente de fora como do Flamengo)
      if (e.tipo === "Card" && e.detalhe !== "Yellow Card" && (!linhas.length || linhas.some((j) => j.jogador_id === e.jogador_id)))
        linha(e.jogador_id, e.jogador).expulsoes++;
    }
    for (const [id, n] of golsNoJogo) linha(id).jogosComGol.push({ p, n });
  }
  return [...t.values()];
}

function primeiroGol(p) {
  const gols = (D.eventosPorPartida.get(p.id_partida) ?? []).filter(ehGol).sort(ordemLance);
  return gols.length ? (gols[0].eh_flamengo ? "fla" : "adv") : null;
}

// ---------- componentes ----------
const foto = (id) => { const f = D.fotos.get(id); return f ? h("img", { src: f, alt: "", class: "mini-foto", loading: "lazy", width: 24, height: 24 }) : h("span", { class: "mini-foto vazia" }); };
const jogadorEl = (l) => h("button", { type: "button", class: "link-jogador", onclick: () => abrirJogador(l.id) }, foto(l.id), l.nome);
const irJogo = (p) => { trocarAba("jogos"); abrirJogo(p.id_partida); };
const jogoEl = (p, extra = "") => h("button", { type: "button", class: "chip-jogo", onclick: () => irJogo(p), title: "Abrir o jogo" },
  h("span", { class: `resultado ${p.resultado}` }, p.resultado), ` ${p.mando === "Fora" ? `${p.adversario} ${p.gols_contra} × ${p.gols_pro} Fla` : `Fla ${p.gols_pro} × ${p.gols_contra} ${p.adversario}`}`,
  h("small", {}, ` · ${data(p.data_utc)}${extra}`));

function ranking(chave, titulo, subtitulo, linhas, colunas) {
  const mostrar = abertos.has(chave) ? linhas : linhas.slice(0, TOP);
  let pos = 0, anterior;
  return h("article", { class: "cartao" }, h("h2", {}, titulo), subtitulo ? h("p", { class: "sutil" }, subtitulo) : null,
    linhas.length ? h("div", { class: "tabela-rolagem" }, h("table", { class: "tabela tabela-ranking" },
      h("thead", {}, h("tr", {}, h("th", { class: "num" }, "#"), h("th", {}, "Jogador"), ...colunas.map(([t]) => h("th", { class: "num" }, t)))),
      h("tbody", {}, mostrar.map((l, i) => {
        const v = colunas[0][1](l);
        if (v !== anterior) { pos = i + 1; anterior = v; }  // empate divide a posição
        return h("tr", {}, h("td", { class: "num sutil" }, `${pos}º`), h("td", {}, jogadorEl(l)),
          ...colunas.map(([, f], k) => h("td", { class: "num" }, k === 0 ? h("b", {}, f(l)) : f(l))));
      })))) : vazio("Nenhum jogador no filtro."),
    linhas.length > TOP ? h("button", { type: "button", class: "botao-texto", onclick: () => { abertos.has(chave) ? abertos.delete(chave) : abertos.add(chave); render(); } },
      abertos.has(chave) ? "Mostrar menos" : `Ver todos (${linhas.length})`) : null);
}

function listaJogos(chave, jogos, extra) {
  const mostrar = abertos.has(chave) ? jogos : jogos.slice(-12).reverse();
  return [h("div", { class: "chips-jogos" }, (abertos.has(chave) ? mostrar.slice().reverse() : mostrar).map((p) => jogoEl(p, extra ? extra(p) : ""))),
    jogos.length > 12 ? h("button", { type: "button", class: "botao-texto", onclick: () => { abertos.has(chave) ? abertos.delete(chave) : abertos.add(chave); render(); } },
      abertos.has(chave) ? "Mostrar só os 12 mais recentes" : `Ver todos (${jogos.length})`) : null];
}

const ved = (l) => `${l.filter((p) => p.resultado === "V").length}V ${l.filter((p) => p.resultado === "E").length}E ${l.filter((p) => p.resultado === "D").length}D`;
const aproveit = (l) => (l.length ? pct(l.reduce((t, p) => t + (p.resultado === "V" ? 3 : p.resultado === "E" ? 1 : 0), 0) / (3 * l.length), 0) : "–");

function sequencias(jogos) {
  const maior = (ok) => { let m = 0, a = 0, ini = null, melhor = null;
    for (const p of jogos) { if (ok(p)) { if (!a) ini = p; a++; if (a > m) { m = a; melhor = [ini, p]; } } else a = 0; }
    return { n: m, de: melhor?.[0], ate: melhor?.[1] }; };
  const atual = (ok) => { let n = 0; for (let i = jogos.length - 1; i >= 0 && ok(jogos[i]); i--) n++; return n; };
  return [["Invencibilidade", (p) => p.resultado !== "D"], ["Vitórias seguidas", (p) => p.resultado === "V"],
    ["Sem sofrer gol", (p) => p.gols_contra === 0 && p.status !== "WO"], ["Marcando gol", (p) => p.gols_pro > 0]]
    .map(([nome, ok]) => ({ nome, ...maior(ok), atual: atual(ok) }));
}

// ---------- tela ----------
export function renderNumeros(js) {
  const jogos = jogosDaTela(js);
  const amistososFora = js.length - jogos.length;
  const chave = h("label", { class: "chave" }, h("input", { type: "checkbox", checked: estado.numerosAmistosos || null,
    onchange: (e) => { estado.numerosAmistosos = e.target.checked; render(); } }), " Incluir amistosos");
  if (!jogos.length) {
    preencher($("numeros-corpo"), h("div", { class: "acoes" }, chave), vazio("Nenhum jogo no filtro."));
    return;
  }
  const J = porJogador(jogos);
  const ord = (f, ...desempate) => J.filter((l) => f(l) > 0).sort((a, b) => f(b) - f(a) || desempate.reduce((r, g) => r || g(a, b), 0) || a.nome.localeCompare(b.nome));
  const golsTotal = jogos.reduce((t, p) => t + (p.gols_pro ?? 0), 0);
  // Gol contra a favor = o que o placar tem a mais que os gols dos jogadores. A fonte às vezes marca "gol contra" num lance
  // que o box-score dá a um jogador (Santos 3 × 1, 05/04: Pedro); aí vale o box-score, como nas contas oficiais.
  const golsContraAFavor = jogos.filter((p) => p.detalhe).reduce((t, p) => {
    const linhas = D.jogadoresPorPartida.get(p.id_partida) ?? [];
    const contra = (D.eventosPorPartida.get(p.id_partida) ?? []).filter((e) => e.eh_flamengo && e.tipo === "Goal" && e.detalhe === "Own Goal").length;
    return t + (linhas.length ? Math.max(0, Math.min(contra, p.gols_pro - linhas.reduce((s, j) => s + (j.gols ?? 0), 0))) : contra);
  }, 0);

  // jogos: saiu na frente/atrás, viradas, sem sofrer gol
  const comGol = jogos.map((p) => ({ p, primeiro: primeiroGol(p) }));
  const frente = comGol.filter((x) => x.primeiro === "fla").map((x) => x.p);
  const atras = comGol.filter((x) => x.primeiro === "adv").map((x) => x.p);
  const viradas = atras.filter((p) => p.resultado === "V");
  const viradasSofridas = frente.filter((p) => p.resultado === "D");
  const semSofrer = jogos.filter((p) => p.gols_contra === 0 && p.status !== "WO"); // W.O. não foi disputado
  const semMarcar = jogos.filter((p) => p.gols_pro === 0);
  const goleiroDoJogo = (p) => (D.jogadoresPorPartida.get(p.id_partida) ?? []).filter((j) => j.posicao === "Goleiro" && j.minutos > 0).sort((a, b) => b.minutos - a.minutos)[0];
  const porGoleiro = new Map();
  for (const p of semSofrer) { const g = goleiroDoJogo(p); if (g) porGoleiro.set(g.jogador_id, { id: g.jogador_id, nome: g.jogador, n: (porGoleiro.get(g.jogador_id)?.n ?? 0) + 1 }); }

  // pênaltis
  const lancesDe = (p) => D.eventosPorPartida.get(p.id_partida) ?? [];
  const pen = (fla, conv) => jogos.flatMap((p) => lancesDe(p).filter((e) => e.eh_flamengo === fla && e.tipo === "Goal"
    && e.detalhe === (conv ? "Penalty" : "Missed Penalty")).map((e) => ({ e, p })));
  const penLinha = ({ e, p }) => h("li", {}, h("span", { class: "cresce" }, e.jogador ?? "jogador não informado", h("span", { class: "sutil" }, ` · ${p.adversario}`)),
    h("button", { type: "button", class: "botao-texto", onclick: () => irJogo(p) }, `${data(p.data_utc)} · ${p.competicao}`));
  const penaltis = [["Convertidos pelo Flamengo", pen(true, true)], ["Perdidos pelo Flamengo", pen(true, false)],
    ["Convertidos contra", pen(false, true)], ["Não convertidos contra (defendidos ou para fora)", pen(false, false)]];

  // disciplina e marcas
  const expulsoes = jogos.flatMap((p) => {
    const linhas = D.jogadoresPorPartida.get(p.id_partida) ?? [];
    return lancesDe(p).filter((e) => e.eh_flamengo && e.tipo === "Card" && e.detalhe !== "Yellow Card"
      && (!linhas.length || linhas.some((j) => j.jogador_id === e.jogador_id))).map((e) => ({ e, p }));
  });
  const multiplos = J.flatMap((l) => l.jogosComGol.filter((x) => x.n >= 2).map((x) => ({ l, ...x }))).sort((a, b) => b.n - a.n || b.p.data_utc.localeCompare(a.p.data_utc));
  const maioresVitorias = jogos.filter((p) => p.resultado === "V").sort((a, b) => (b.gols_pro - b.gols_contra) - (a.gols_pro - a.gols_contra) || b.gols_pro - a.gols_pro).slice(0, 5);

  const cartaoJogos = (titulo, lista, texto, chaveLista, extra) => h("article", { class: "cartao" }, h("h2", {}, titulo),
    h("p", { class: "sutil" }, texto), lista.length ? listaJogos(chaveLista, lista, extra) : vazio("Nenhum jogo no filtro."));

  preencher($("numeros-corpo"),
    h("div", { class: "acoes" }, chave, h("span", { class: "sutil" },
      `${jogos.length} jogos · ${golsTotal} gols (${golsContraAFavor} contra a favor)` + (amistososFora && !estado.numerosAmistosos ? ` · ${amistososFora} amistoso${amistososFora > 1 ? "s" : ""} fora da conta` : ""))),
    h("div", { class: "kpis" },
      ...[["Saiu na frente", frente], ["Saiu atrás", atras]].map(([r, l]) => h("div", { class: "kpi" }, h("div", { class: "rotulo" }, r),
        h("div", { class: "valor" }, l.length), h("div", { class: "extra" }, `${ved(l)} · ${aproveit(l)} de aproveitamento`))),
      h("div", { class: "kpi" }, h("div", { class: "rotulo" }, "Viradas"), h("div", { class: "valor" }, viradas.length), h("div", { class: "extra" }, `${viradasSofridas.length} sofrida${viradasSofridas.length === 1 ? "" : "s"}`)),
      h("div", { class: "kpi" }, h("div", { class: "rotulo" }, "Sem sofrer gol"), h("div", { class: "valor" }, semSofrer.length), h("div", { class: "extra" }, `${pct(semSofrer.length / jogos.length, 0)} dos jogos`)),
      h("div", { class: "kpi" }, h("div", { class: "rotulo" }, "Sem marcar"), h("div", { class: "valor" }, semMarcar.length), h("div", { class: "extra" }, `${pct(semMarcar.length / jogos.length, 0)} dos jogos`))),
    h("div", { class: "grade-2" },
      ranking("gols", "Artilharia", "Gols do jogador (pênaltis entre parênteses). Clique no nome para o perfil.",
        ord((l) => l.gols, (a, b) => a.minutos - b.minutos),
        [["Gols", (l) => (l.penaltis ? `${l.gols} (${l.penaltis})` : l.gols)], ["Jogos", (l) => l.jogos], ["Min./gol", (l) => (l.minutos ? num(l.minutos / l.gols) : "–")]]),
      ranking("assist", "Assistências", null, ord((l) => l.assistencias, (a, b) => a.minutos - b.minutos),
        [["Assist.", (l) => l.assistencias], ["Jogos", (l) => l.jogos]]),
      ranking("ga", "Participações em gol", "Gols + assistências.", ord((l) => l.gols + l.assistencias, (a, b) => b.gols - a.gols),
        [["G + A", (l) => l.gols + l.assistencias], ["Gols", (l) => l.gols], ["Assist.", (l) => l.assistencias]]),
      ranking("min", "Mais utilizados", "Minutos em campo.", ord((l) => l.minutos), [["Minutos", (l) => num(l.minutos)], ["Jogos", (l) => l.jogos], ["Titular", (l) => l.titular]]),
      cartaoJogos("Jogos sem sofrer gol", semSofrer, [...porGoleiro.values()].sort((a, b) => b.n - a.n).map((g) => `${g.nome}: ${g.n}`).join(" · ") || "Goleiro não informado pela fonte.", "semsofrer"),
      cartaoJogos("Viradas", viradas, viradasSofridas.length ? `Saiu atrás e venceu. Sofridas (saiu na frente e perdeu): ${viradasSofridas.map((p) => `${p.adversario} ${data(p.data_utc)}`).join(", ")}.` : "Saiu atrás e venceu.", "viradas"),
      cartaoJogos("Saiu na frente", frente, `${ved(frente)} — primeiro gol do jogo foi do Flamengo.`, "frente"),
      cartaoJogos("Saiu atrás", atras, `${ved(atras)} — o adversário marcou primeiro. Prorrogação conta pelo resultado final.`, "atras"),
      h("article", { class: "cartao" }, h("h2", {}, "Pênaltis"),
        ...penaltis.map(([t, l]) => h("div", { class: "bloco-penalti" }, h("h3", {}, `${t}: ${l.length}`), l.length ? h("ul", { class: "lista-simples" }, l.map(penLinha)) : null))),
      h("article", { class: "cartao" }, h("h2", {}, "Disciplina"),
        h("h3", {}, `Expulsões: ${expulsoes.length}`),
        expulsoes.length ? h("ul", { class: "lista-simples" }, expulsoes.map(({ e, p }) => h("li", {}, h("span", { class: "cresce" }, e.jogador,
          h("span", { class: "sutil" }, ` · ${e.detalhe === "Red Card" ? "vermelho" : "segundo amarelo"} aos ${e.minuto}' · ${p.adversario}`)),
          h("button", { type: "button", class: "botao-texto", onclick: () => irJogo(p) }, `${data(p.data_utc)} · ${p.competicao}`)))) : null,
        h("h3", { style: "margin-top:12px" }, "Mais cartões amarelos"),
        h("ul", { class: "lista-simples" }, ord((l) => l.amarelos).slice(0, 6).map((l) => h("li", {}, h("span", { class: "cresce" }, jogadorEl(l)), h("b", {}, l.amarelos))))),
      h("article", { class: "cartao" }, h("h2", {}, "Marcas"),
        h("h3", {}, "Dois gols ou mais num jogo"),
        multiplos.length ? h("ul", { class: "lista-simples" }, multiplos.map(({ l, p, n }) => h("li", {}, h("span", { class: "cresce" }, jogadorEl(l),
          h("span", { class: "sutil" }, ` · ${n === 3 ? "hat-trick" : n > 3 ? `${n} gols` : "2 gols"} contra o ${p.adversario}`)),
          h("button", { type: "button", class: "botao-texto", onclick: () => irJogo(p) }, `${data(p.data_utc)} · ${p.competicao}`)))) : vazio("Ninguém marcou 2+ gols num jogo no filtro."),
        h("h3", { style: "margin-top:12px" }, "Maiores vitórias"), h("div", { class: "chips-jogos" }, maioresVitorias.map((p) => jogoEl(p, p.status === "WO" ? " · W.O." : "")))),
      h("article", { class: "cartao" }, h("h2", {}, "Sequências"), h("p", { class: "sutil" }, "Na ordem dos jogos do filtro."),
        h("div", { class: "tabela-rolagem" }, h("table", { class: "tabela" }, h("thead", {}, h("tr", {}, ["", "Maior", "Período", "Atual"].map((t, i) => h("th", { class: i === 1 || i === 3 ? "num" : "" }, t)))),
          h("tbody", {}, sequencias(jogos).map((s) => h("tr", {}, h("td", {}, s.nome), h("td", { class: "num" }, h("b", {}, s.n)),
            h("td", { class: "sutil" }, s.n ? `${data(s.de.data_utc)} a ${data(s.ate.data_utc)}` : "–"), h("td", { class: "num" }, s.atual)))))))),
  );
}
