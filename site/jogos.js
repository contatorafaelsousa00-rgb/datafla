// Aba Jogos: lista e relatório de cada jogo.
import { barrasEspelhadas, conteudoDica, dica, linhaTempo, mapaGol, serie } from "./graficos.js";
import { $, bola, D, data, dataLonga, escudo, estado, h, NOME_RES, notaTag, num, ORDEM_POS, pct, resultado, tagComp, vazio } from "./comum.js";
import { abrirJogador } from "./jogadores.js";
import { render } from "./app.js";
import { CLIMA, futurosFiltrados, horaBR } from "./temporada.js";

// =====================================================================
// JOGOS
// =====================================================================
// Próximos jogos (calendário, com os mesmos filtros de competição e mando; o período não se aplica ao futuro)
const diaSemana = (iso) => new Date(iso).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" }).replace(".", "");
const diaDe = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
function faltam(iso) {
  const dias = Math.round((new Date(`${diaDe(iso)}T12:00:00Z`) - new Date(`${diaDe(new Date().toISOString())}T12:00:00Z`)) / 864e5);
  return dias <= 0 ? "hoje" : dias === 1 ? "amanhã" : `em ${dias} dias`;
}

function renderProximosJogos() {
  const futuros = futurosFiltrados();
  const det = new Map((D.bruto.proximo ?? []).map((p) => [p.id_partida, p])); // previsão e estádio do próximo jogo
  const porComp = {};
  for (const j of futuros) porComp[j.competicao] = (porComp[j.competicao] ?? 0) + 1;
  const semana = futuros.filter((j) => new Date(j.data_utc) - Date.now() < 7 * 864e5).length;
  $("resumo-proximos").textContent = futuros.length
    ? `${futuros.length} jogo${futuros.length > 1 ? "s" : ""} no calendário (${Object.entries(porComp).map(([c, n]) => `${n} ${c}`).join(", ")})`
      + (semana ? ` · ${semana} nos próximos 7 dias` : "")
    : "";
  if (!futuros.length) { $("tabela-proximos").replaceChildren(h("tbody", {}, h("tr", {}, h("td", { class: "vazio" }, "Nenhum jogo futuro no calendário para este filtro.")))); return; }
  const aberto = futuros.find((j) => j.id_partida === estado.proximo) ?? futuros[0];
  const abrir = (id) => { estado.proximo = id; render(); };
  $("tabela-proximos").replaceChildren(
    h("thead", {}, h("tr", {}, ["Data", "Hora", "Competição", "Fase", "Mando", "Adversário", "Local", "Chance pré-jogo", ""]
      .map((t, i) => h("th", { class: i === 7 ? "num" : "" }, t)))),
    h("tbody", {}, futuros.map((j) => {
      const p = det.get(j.id_partida);
      return h("tr", { class: "clicavel" + (j === aberto ? " selecionado" : ""), tabindex: 0,
        onclick: () => abrir(j.id_partida), onkeydown: (e) => { if (e.key === "Enter") abrir(j.id_partida); } },
        h("td", {}, `${diaSemana(j.data_utc)}, ${dataLonga(j.data_utc)}`), h("td", { class: "num" }, horaBR(j.data_utc)),
        h("td", {}, tagComp(j.competicao)), h("td", {}, j.rodada ?? "–"), h("td", {}, j.mando), h("td", {}, escudo(j)),
        h("td", {}, (p?.estadio ?? j.estadio) || "–"),
        h("td", { class: "num" }, p?.prob_vitoria != null
          ? [h("span", { class: "medidor" }, h("b", { style: `width:${p.prob_vitoria * 100}%` })), pct(p.prob_vitoria, 0)] : "–"),
        h("td", { class: "sutil" }, faltam(j.data_utc)));
    })));
  renderDetalheProximo(aberto, det.get(aberto.id_partida));
}

// Detalhe de um próximo jogo: previsão, local, árbitro, clima, confronto direto e forma do adversário
function renderDetalheProximo(j, detalhe) {
  const caixa = $("detalhe-proximo");
  caixa.hidden = false;
  const p = { ...j, ...(detalhe ?? {}) };
  const [casa, fora] = p.mando === "Fora" ? [p.adversario, "Flamengo"] : ["Flamengo", p.adversario];
  const clima = p.clima ? [CLIMA[p.clima?.toLowerCase()] ?? p.clima, p.temperatura != null ? `${num(p.temperatura, 0)} °C` : null].filter(Boolean).join(", ") : null;
  const confrontos = (D.bruto.confrontos ?? []).filter((c) => c.adversario_id === p.adversario_id)
    .sort((a, b) => b.data_utc.localeCompare(a.data_utc));
  const forma = (D.bruto.forma_adversario ?? []).filter((c) => c.adversario_id === p.adversario_id)
    .sort((a, b) => b.data_utc.localeCompare(a.data_utc));
  const contar = (l, r) => l.filter((c) => c.resultado === r).length;
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const linhaJogo = (c, quem) => h("li", {}, bola(c.resultado),
    h("span", { class: "cresce" }, h("b", {}, `${c.gols_pro} × ${c.gols_contra} `), quem(c)),
    h("span", { class: "sutil" }, `${data(c.data_utc)}/${c.data_utc.slice(2, 4)} · ${c.competicao}`));

  caixa.replaceChildren(
    h("div", { class: "placar" }, h("h2", {}, casa), h("span", { class: "gols" }, horaBR(p.data_utc)), h("h2", {}, fora)),
    h("p", { class: "sutil" }, [`${dataLonga(p.data_utc)} · ${horaBR(p.data_utc)} (${faltam(p.data_utc)})`, p.competicao, p.rodada,
      p.estadio ? `${p.estadio}${p.cidade ? `, ${p.cidade}` : ""}` : null, p.arbitro ? `Árbitro: ${p.arbitro}` : null, clima ? `Previsão do tempo: ${clima}` : null]
      .filter(Boolean).join(" · ")),
    barraProbabilidade(p) ?? h("p", { class: "sutil" }, detalhe
      ? "A fonte ainda não publicou a previsão deste jogo."
      : "Previsão, árbitro e clima chegam nos dias antes do jogo (os 3 próximos jogos são atualizados, o mais próximo primeiro)."),
    h("div", { class: "detalhe-grade" },
      h("div", {}, h("h3", {}, `Confronto direto com o ${p.adversario}`),
        confrontos.length
          ? [h("p", { class: "sutil" }, `Últimos ${confrontos.length}: ${plural(contar(confrontos, "V"), "vitória", "vitórias")}, `
              + `${plural(contar(confrontos, "E"), "empate", "empates")} e ${plural(contar(confrontos, "D"), "derrota", "derrotas")} do Flamengo`
              + ` · gols ${confrontos.reduce((t, c) => t + c.gols_pro, 0)} × ${confrontos.reduce((t, c) => t + c.gols_contra, 0)}`),
             h("ul", { class: "lista-simples" }, confrontos.map((c) => linhaJogo(c, (x) => h("span", { class: "sutil" }, x.mando === "Casa" ? "em casa" : "fora"))))]
          : vazio("Ainda sem confrontos baixados para este adversário.")),
      h("div", {}, h("h3", {}, `Forma recente do ${p.adversario}`),
        forma.length
          ? [h("p", { class: "forma" }, forma.slice().reverse().map((c) => bola(c.resultado)),
               h("span", { class: "sutil" }, ` ${contar(forma, "V")}V ${contar(forma, "E")}E ${contar(forma, "D")}D nos últimos ${forma.length} (mais recente à direita)`)),
             h("ul", { class: "lista-simples" }, forma.map((c) => linhaJogo(c, (x) => h("span", {}, `x ${x.oponente} `,
               h("span", { class: "sutil" }, x.mando === "Casa" ? "(em casa)" : "(fora)")))))]
          : vazio("Ainda sem os últimos jogos deste adversário."))),
  );
}

export function renderJogos(js) {
  for (const b of $("lista-jogos").children) b.setAttribute("aria-pressed", String(b.dataset.lista === estado.lista));
  const proximos = estado.lista === "proximos";
  $("card-proximos").hidden = !proximos;
  $("card-disputados").hidden = proximos;
  if (proximos) {
    $("detalhe-jogo").hidden = true;
    renderProximosJogos();
    return;
  }
  $("detalhe-proximo").hidden = true;
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

export function abrirJogo(id) {
  estado.jogo = id;
  estado.lista = "disputados";
  const url = new URL(location); // link direto para o jogo: ?aba=jogos&jogo=<id>
  url.searchParams.set("jogo", id);
  history.replaceState(null, "", url);
  render();
  $("detalhe-jogo").scrollIntoView({ behavior: "smooth", block: "start" });
}

export const STATS_JOGO = [["xg", "xG", (v) => num(v, 2)], ["xa", "xA", (v) => num(v, 2)], ["grandes_chances", "Grandes chances"],
  ["finalizacoes", "Finalizações"], ["finalizacoes_alvo", "No alvo"], ["finalizacoes_dentro_area", "Dentro da área"],
  ["posse", "Posse", (v) => pct(v, 0)], ["passes", "Passes"], ["passes_pct", "Passes certos", (v) => pct(v, 0)],
  ["passes_ultimo_terco", "Passes no último terço"], ["cruzamentos", "Cruzamentos"], ["desarmes", "Desarmes"],
  ["interceptacoes", "Interceptações"], ["duelos_aereos_ganhos", "Duelos aéreos ganhos"], ["dribles_certos", "Dribles certos"],
  ["defesas", "Defesas do goleiro"], ["escanteios", "Escanteios"], ["faltas", "Faltas"], ["impedimentos", "Impedimentos"],
  ["amarelos", "Amarelos"], ["vermelhos", "Vermelhos"]];
export const NOME_EVENTO = { Goal: "Gol", Card: "Cartão", subst: "Substituição", Var: "VAR" };
export const NOME_CARTAO = { "Yellow Card": "Amarelo", "Second Yellow card": "Segundo amarelo", "Red Card": "Vermelho" };
export const NOME_CHUTE = { Saved: "defendida", Missed: "para fora", Blocked: "bloqueada", Post: "na trave", Goal: "gol" };

export function barraProbabilidade(p) {
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

export function marcasLinhaTempo(p) {
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

export function renderDetalheJogo(js) {
  const caixa = $("detalhe-jogo");
  const p = js.find((x) => x.id_partida === estado.jogo);
  caixa.hidden = !p;
  if (!p) return;
  // Tudo na ordem mandante × visitante, com o xG embaixo do nome de cada time (sem par solto, que confunde)
  const flaPrimeiro = p.mando !== "Fora";
  const fla = { nome: "Flamengo", gols: p.gols_pro, xg: p.xg_pro }, adv = { nome: p.adversario, gols: p.gols_contra, xg: p.xg_contra };
  const [esq, dir] = flaPrimeiro ? [fla, adv] : [adv, fla];
  const lado = (t, classe) => h("div", { class: `time-placar ${classe}` }, h("h2", {}, t.nome),
    t.xg != null ? h("span", { class: "sutil" }, `xG ${num(t.xg, 2)}`) : null);
  const cabecalho = [
    h("div", { class: "placar" }, lado(esq, "esq"), h("span", { class: "gols" }, `${esq.gols} × ${dir.gols}`), lado(dir, "dir")),
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
    .map(([k, rot, f = (v) => num(v)]) => {
      const [a, b] = flaPrimeiro ? [st.fla[k], st.adv[k]] : [st.adv[k], st.fla[k]];
      return { rotulo: rot, a: a ?? null, b: b ?? null, texto: f };
    });
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
      h("div", {}, h("h3", {}, "Comparativo"), h("p", { class: "sutil" }, `${esq.nome} à esquerda · ${dir.nome} à direita`),
        linhasStats.length ? grafStats : vazio("Sem estatísticas na fonte.")),
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
  if (linhasStats.length) barrasEspelhadas(grafStats, linhasStats, flaPrimeiro
    ? { nomeA: "Flamengo", nomeB: p.adversario }
    : { nomeA: p.adversario, nomeB: "Flamengo", corA: "var(--serie-2)", corB: "var(--serie-1)" });
  if (chutes.length) {
    mapaGol(golFla, chutes.filter((c) => c.eh_flamengo));
    mapaGol(golAdv, chutes.filter((c) => !c.eh_flamengo), { cor: "var(--serie-2)" });
  }
}
