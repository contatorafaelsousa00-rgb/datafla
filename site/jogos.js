// Aba Jogos: lista e relatório de cada jogo.
import { barrasEspelhadas, campinho, conteudoDica, dica, linhaTempo, mapaGol, serie } from "./graficos.js";
import { $, bola, confronto, D, data, dataLonga, escudo, escudoImg, estado, h, logoFla, mandanteVisitante, NOME_RES, notaTag, num, ORDEM_POS, pct, preencher, resultado, tagComp, vazio } from "./comum.js";
import { abrirJogadorNaPartida } from "./jogadores.js";
import { render } from "./app.js";
import { CLIMA, futurosFiltrados, horaBR } from "./temporada.js";
import { secoesPreview } from "./preview.js";
import { tabelaJogadoresPartida } from "./tabela-partida.js";
import { renderComparar } from "./calendario.js";

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
  const aberto = futuros.find((j) => j.id_partida === estado.proximo);
  const abrir = abrirProximo;
  $("tabela-proximos").replaceChildren(
    h("thead", {}, h("tr", {}, ["Data", "Hora", "Competição", "Fase", "Jogo (mandante × visitante)", "Local", "Chance do Fla", ""]
      .map((t, i) => h("th", { class: i === 6 ? "num" : "" }, t)))),
    h("tbody", {}, futuros.map((j) => {
      const p = det.get(j.id_partida);
      return h("tr", { class: "clicavel" + (j === aberto ? " selecionado" : ""), tabindex: 0,
        onclick: () => abrir(j.id_partida), onkeydown: (e) => { if (e.key === "Enter") abrir(j.id_partida); } },
        h("td", {}, `${diaSemana(j.data_utc)}, ${dataLonga(j.data_utc)}`), h("td", { class: "num" }, horaBR(j.data_utc)),
        h("td", {}, tagComp(j.competicao)), h("td", {}, j.rodada ?? "–"), h("td", {}, confronto(j, "", "", () => "")),
        h("td", {}, (p?.estadio ?? j.estadio) || "–"),
        h("td", { class: "num" }, p?.prob_vitoria != null
          ? [h("span", { class: "medidor" }, h("b", { style: `width:${p.prob_vitoria * 100}%` })), pct(p.prob_vitoria, 0)] : "–"),
        h("td", { class: "sutil" }, faltam(j.data_utc)));
    })));
  if (aberto) renderDetalheProximo(aberto, det.get(aberto.id_partida));
  else $("detalhe-proximo").hidden = true;
}

// Posição dos dois times na tabela da competição do jogo (quando a competição tem tabela)
function posicoesNaTabela(p) {
  const tab = (D.bruto.classificacao ?? []).filter((c) => c.competicao === p.competicao);
  const fla = tab.find((c) => c.eh_flamengo), adv = tab.find((c) => c.time_id === p.adversario_id);
  if (!fla || !adv || fla.grupo !== adv.grupo) return null;
  const t = (c) => `${c.time} ${c.posicao}º (${c.pontos} pts)`;
  const variosGrupos = new Set(tab.map((c) => c.grupo)).size > 1; // fase de grupos: mostra o grupo
  return h("p", { class: "sutil" }, `Na tabela${variosGrupos ? ` (${fla.grupo})` : ""}: `,
    h("b", {}, p.mando === "Fora" ? `${t(adv)} × ${t(fla)}` : `${t(fla)} × ${t(adv)}`));
}

// Detalhe de um próximo jogo: previsão, local, árbitro, clima, confronto direto e forma do adversário
function renderDetalheProximo(j, detalhe) {
  const caixa = $("detalhe-proximo");
  caixa.hidden = false;
  const p = { ...j, ...(detalhe ?? {}) };
  const pre = secoesPreview(p); // desfalques, prováveis escalações, árbitro, momento
  const [casa, fora] = p.mando === "Fora" ? [p.adversario, "Flamengo"] : ["Flamengo", p.adversario];
  const clima = p.clima ? [CLIMA[p.clima?.toLowerCase()] ?? p.clima, p.temperatura != null ? `${num(p.temperatura, 0)} °C` : null].filter(Boolean).join(", ") : null;
  const confrontos = (D.bruto.confrontos ?? []).filter((c) => c.adversario_id === p.adversario_id)
    .sort((a, b) => b.data_utc.localeCompare(a.data_utc));
  const forma = (D.bruto.forma_adversario ?? []).filter((c) => c.adversario_id === p.adversario_id)
    .sort((a, b) => b.data_utc.localeCompare(a.data_utc));
  const contar = (l, r) => l.filter((c) => c.resultado === r).length;
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  // c vem do ponto de vista de "time" (Flamengo nos confrontos, o adversário na forma); mostra mandante × visitante
  const linhaJogo = (c, time, logoTime) => {
    const [casaJ, foraJ] = c.mando === "Casa" ? [[time, c.gols_pro, logoTime], [c.oponente, c.gols_contra, c.oponente_logo]]
      : [[c.oponente, c.gols_contra, c.oponente_logo], [time, c.gols_pro, logoTime]];
    return h("li", {}, bola(c.resultado),
      h("span", { class: "cresce confronto" }, h("span", { class: "confronto-time" }, escudoImg(casaJ[2]), casaJ[0]),
        h("b", { class: "confronto-placar" }, `${casaJ[1]} × ${foraJ[1]}`), h("span", { class: "confronto-time" }, escudoImg(foraJ[2]), foraJ[0])),
      h("span", { class: "sutil" }, `${data(c.data_utc)}/${c.data_utc.slice(2, 4)} · ${c.competicao}`));
  };

  preencher(caixa,
    h("div", { class: "placar" }, h("h2", {}, escudoImg(casa === "Flamengo" ? logoFla() : p.adversario_logo, 26), casa),
      h("span", { class: "gols" }, horaBR(p.data_utc)), h("h2", {}, escudoImg(fora === "Flamengo" ? logoFla() : p.adversario_logo, 26), fora)),
    h("p", { class: "sutil" }, [`${dataLonga(p.data_utc)} · ${horaBR(p.data_utc)} (${faltam(p.data_utc)})`, p.competicao, p.rodada,
      p.estadio ? `${p.estadio}${p.cidade ? `, ${p.cidade}` : ""}` : null, p.arbitro ? `Árbitro: ${p.arbitro}` : null, clima ? `Previsão do tempo: ${clima}` : null]
      .filter(Boolean).join(" · ")),
    posicoesNaTabela(p),
    barraProbabilidade(p) ?? h("p", { class: "sutil" }, detalhe
      ? "A fonte ainda não publicou a previsão deste jogo."
      : "Previsão, árbitro e clima chegam nos dias antes do jogo (os 3 próximos jogos são atualizados, o mais próximo primeiro)."),
    ...pre.elementos,
    h("div", { class: "detalhe-grade" },
      h("div", {}, h("h3", {}, `Confronto direto com o ${p.adversario}`),
        confrontos.length
          ? [h("p", { class: "sutil" }, `Últimos ${confrontos.length}: ${plural(contar(confrontos, "V"), "vitória", "vitórias")}, `
              + `${plural(contar(confrontos, "E"), "empate", "empates")} e ${plural(contar(confrontos, "D"), "derrota", "derrotas")} do Flamengo`
              + ` · gols ${confrontos.reduce((t, c) => t + c.gols_pro, 0)} × ${confrontos.reduce((t, c) => t + c.gols_contra, 0)}`),
             h("ul", { class: "lista-simples" }, confrontos.map((c) => linhaJogo(c, "Flamengo", logoFla())))]
          : vazio("Ainda sem confrontos baixados para este adversário.")),
      h("div", {}, h("h3", {}, `Forma recente do ${p.adversario}`),
        forma.length
          ? [h("p", { class: "forma" }, forma.slice().reverse().map((c) => bola(c.resultado)),
               h("span", { class: "sutil" }, ` ${contar(forma, "V")}V ${contar(forma, "E")}E ${contar(forma, "D")}D nos últimos ${forma.length} (mais recente à direita)`)),
             h("ul", { class: "lista-simples" }, forma.map((c) => linhaJogo(c, p.adversario, p.adversario_logo)))]
          : vazio("Ainda sem os últimos jogos deste adversário."))),
    pre.final,
  );
  pre.desenhar();
}

export function renderJogos(js) {
  for (const b of $("lista-jogos").children) b.setAttribute("aria-pressed", String(b.dataset.lista === estado.lista));
  const proximos = estado.lista === "proximos", comparar = estado.lista === "comparar";
  $("detalhe-jogo").hidden = estado.jogo == null; // só um dos dois aparece no modal
  $("detalhe-proximo").hidden = estado.proximo == null;
  $("card-proximos").hidden = !proximos;
  $("card-disputados").hidden = proximos || comparar;
  $("comparar-calendario").hidden = !comparar;
  if (comparar) return renderComparar();
  if (proximos) {
    renderProximosJogos();
    return;
  }
  const lista = js.slice().reverse();
  const cab = ["Data", "Competição", "Jogo (mandante × visitante)", "Res.", D.tem.xg ? "xG (mandante × visitante)" : null,
    D.tem.previsao ? "Chance do Fla" : null].filter((t) => t !== null);
  $("tabela-jogos").replaceChildren(
    h("thead", {}, h("tr", {}, cab.map((t, i) => h("th", { class: i >= 3 ? "num" : "" }, t)))),
    h("tbody", {}, lista.length ? lista.map((p) => h("tr", {
      class: "clicavel" + (estado.jogo === p.id_partida ? " selecionado" : ""), tabindex: 0,
      onclick: () => abrirJogo(p.id_partida), onkeydown: (e) => { if (e.key === "Enter") abrirJogo(p.id_partida); },
    },
      h("td", {}, dataLonga(p.data_utc)), h("td", {}, tagComp(p.competicao)),
      h("td", {}, confronto(p), p.penaltis_pro != null
        ? h("span", { class: "sutil" }, ` (pên. ${mandanteVisitante(p, p.penaltis_pro, p.penaltis_contra).map((t) => t.valor).join("–")})`) : null),
      h("td", { class: "num" }, bola(p.resultado)),
      D.tem.xg ? h("td", { class: "num" }, p.xg_pro != null
        ? mandanteVisitante(p, p.xg_pro, p.xg_contra).map((t) => num(t.valor, 2)).join(" × ") : "–") : null,
      D.tem.previsao ? h("td", { class: "num" }, p.prob_vitoria != null ? h("span", { class: "medidor" }, h("b", { style: `width:${p.prob_vitoria * 100}%` })) : null,
        p.prob_vitoria != null ? pct(p.prob_vitoria, 0) : "–") : null,
    )) : h("tr", {}, h("td", { colspan: cab.length, class: "vazio" }, "Nenhum jogo no filtro."))));
  renderDetalheJogo(js);
}

// O jogo (disputado ou próximo) abre numa tela própria por cima da lista, como o perfil do jogador.
function mostrarModalJogo() {
  const modal = $("modal-jogo");
  if (!modal.open) {
    modal.showModal();
    modal.append($("dica")); // a dica precisa estar dentro do modal para aparecer por cima dele
  }
  modal.querySelector(".modal-corpo").scrollTop = 0;
}

export function abrirJogo(id) {
  estado.jogo = id;
  estado.proximo = null;
  estado.lista = "disputados";
  const url = new URL(location); // link direto para o jogo: ?aba=jogos&jogo=<id>
  url.searchParams.set("jogo", id);
  url.searchParams.set("lista", "disputados"); // URL coerente com o que está na tela
  url.searchParams.delete("proximo");
  history.replaceState(null, "", url);
  mostrarModalJogo(); // antes de desenhar: os gráficos medem a largura do modal
  render();
}

export function abrirProximo(id) {
  estado.proximo = id;
  estado.jogo = null;
  estado.lista = "proximos";
  const url = new URL(location); // link direto: ?aba=jogos&proximo=<id>
  url.searchParams.set("proximo", id);
  url.searchParams.set("lista", "proximos");
  url.searchParams.delete("jogo");
  history.replaceState(null, "", url);
  mostrarModalJogo();
  render();
}

export function montarModalJogo() {
  const modal = $("modal-jogo");
  $("fechar-jogo").addEventListener("click", () => modal.close());
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });
  modal.addEventListener("close", () => {
    (document.querySelector("dialog[open]") ?? document.body).append($("dica"));
    $("dica").hidden = true;
    estado.jogo = null;
    estado.proximo = null;
    const url = new URL(location);
    url.searchParams.delete("jogo");
    url.searchParams.delete("proximo");
    history.replaceState(null, "", url);
    render();
  });
}

export const STATS_JOGO = [["xg", "xG", (v) => num(v, 2)], ["xa", "xA", (v) => num(v, 2)], ["grandes_chances", "Grandes chances"], ["ataques", "Ataques"],
  ["finalizacoes", "Finalizações"], ["finalizacoes_alvo", "No alvo"], ["finalizacoes_dentro_area", "Dentro da área"],
  ["posse", "Posse", (v) => pct(v, 0)], ["passes", "Passes"], ["passes_pct", "Passes certos", (v) => pct(v, 0)],
  ["passes_ultimo_terco", "Passes no último terço"], ["cruzamentos", "Cruzamentos"], ["desarmes", "Desarmes"],
  ["interceptacoes", "Interceptações"], ["duelos_aereos_ganhos", "Duelos aéreos ganhos"], ["dribles_certos", "Dribles certos"],
  ["defesas", "Defesas do goleiro"], ["escanteios", "Escanteios"], ["faltas", "Faltas"], ["impedimentos", "Impedimentos"],
  ["amarelos", "Amarelos"], ["vermelhos", "Vermelhos"]];
export const NOME_EVENTO = { Goal: "Gol", Card: "Cartão", subst: "Substituição", Var: "VAR", Shootout: "Pênalti na disputa" };
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

// Relatório do jogo em duas abas: Resumo (gráficos) e Jogadores (tabela dos dois times)
let abaJogo = "resumo";

export function renderDetalheJogo(js) {
  const caixa = $("detalhe-jogo");
  // fora do filtro atual o jogo ainda abre (ex.: link direto)
  const p = js.find((x) => x.id_partida === estado.jogo) ?? D.encerrados.find((x) => x.id_partida === estado.jogo);
  caixa.hidden = !p;
  if (!p) return;
  // Tudo na ordem mandante × visitante, com o xG embaixo do nome de cada time (sem par solto, que confunde)
  const flaPrimeiro = p.mando !== "Fora";
  const fla = { nome: "Flamengo", gols: p.gols_pro, xg: p.xg_pro }, adv = { nome: p.adversario, gols: p.gols_contra, xg: p.xg_contra };
  const [esq, dir] = flaPrimeiro ? [fla, adv] : [adv, fla];
  const lado = (t, classe) => h("div", { class: `time-placar ${classe}` }, h("h2", {}, escudoImg(t.nome === "Flamengo" ? logoFla() : p.adversario_logo, 26), t.nome),
    t.xg != null ? h("span", { class: "sutil" }, `xG ${num(t.xg, 2)}`) : null);
  const cabecalho = [
    h("div", { class: "placar" }, lado(esq, "esq"), h("span", { class: "gols" }, `${esq.gols} × ${dir.gols}`), lado(dir, "dir")),
    h("p", { class: "sutil" }, [p.competicao, p.rodada, dataLonga(p.data_utc), p.estadio, p.arbitro ? `Árbitro: ${p.arbitro}` : null,
      p.temperatura != null ? `${num(p.temperatura, 0)} °C` : null, p.formacao ? `Formação ${p.formacao}` : null].filter(Boolean).join(" · ")),
  ];
  if (!p.detalhe) {
    preencher(caixa, ...cabecalho, vazio("Os detalhes deste jogo ainda não foram baixados; entram na próxima coleta."));
    return;
  }
  const abas = h("div", { class: "segmentado abas-jogo", role: "group", "aria-label": "Parte do relatório" },
    [["resumo", "Resumo"], ["jogadores", "Jogadores"]].map(([a, r]) => h("button", { type: "button", "aria-pressed": String(abaJogo === a),
      onclick: () => { abaJogo = a; renderDetalheJogo(js); } }, r)));
  if (abaJogo === "jogadores") {
    preencher(caixa, ...cabecalho, abas, tabelaJogadoresPartida(p, flaPrimeiro));
    return;
  }
  const st = D.stats.get(p.id_partida) ?? { fla: {}, adv: {} };
  const jogadores = D.jogadoresPorPartida.get(p.id_partida) ?? [];
  const titulares = jogadores.filter((j) => j.titular).sort((a, b) => ORDEM_POS.indexOf(a.posicao) - ORDEM_POS.indexOf(b.posicao));
  const entraram = jogadores.filter((j) => !j.titular && j.minutos > 0).sort((a, b) => b.minutos - a.minutos);
  const temXg = jogadores.some((j) => j.xg != null);
  const linhaJog = (j) => h("tr", { class: "clicavel", onclick: () => abrirJogadorNaPartida(j.jogador_id, p.id_partida, true) },
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
  // escalação no campinho (mandante à esquerda, ou embaixo no celular)
  const escalacao = D.escalacoesPorPartida.get(p.id_partida) ?? [];
  const montarTime = (fla) => {
    const js = escalacao.filter((x) => x.eh_flamengo === fla && x.titular);
    const linhas = [];
    for (const x of js) (linhas[x.linha] ??= []).push(x);
    return { nome: fla ? "Flamengo" : p.adversario, fla, formacao: js[0]?.formacao ?? (fla ? p.formacao : p.formacao_adversario),
      linhas: linhas.filter(Boolean).map((l) => l.sort((a, b) => a.ordem - b.ordem).map((x) => ({ numero: x.numero, nome: x.jogador, id: x.jogador_id }))) };
  };
  const timesCampo = escalacao.length ? (flaPrimeiro ? [montarTime(true), montarTime(false)] : [montarTime(false), montarTime(true)]) : null;
  const campo = h("div", { class: "grafico" });

  preencher(caixa,
    ...cabecalho,
    abas,
    barraProbabilidade(p) ?? "",
    timesCampo ? h("div", { class: "bloco" }, h("h3", {}, "Escalações"),
      h("p", { class: "sutil" }, `${timesCampo[0].nome} ${timesCampo[0].formacao ?? ""} × ${timesCampo[1].formacao ?? ""} ${timesCampo[1].nome}`
        + " · Clique num jogador para ver os números dele no jogo."), campo) : null,
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
              e.jogador || h("span", { class: "sutil" }, "jogador não informado"), e.tipo === "subst" && e.assist ? ` ⇄ ${e.assist}` : "",
              e.tipo === "Goal" && e.assist ? ` (assist. ${e.assist})` : "", e.tipo === "Shootout" ? (e.detalhe === "Scored" ? " · convertido" : " · perdido") : "", e.eh_flamengo ? "" : ` · ${p.adversario}`))))
        : vazio("Sem lances na fonte."))),
    chutes.length ? h("div", { class: "detalhe-grade" },
      h("div", {}, h("h3", {}, "Finalizações do Flamengo"), golFla),
      h("div", {}, h("h3", {}, `Finalizações do ${p.adversario}`), golAdv)) : null,
  );
  if (timesCampo) campinho(campo, timesCampo[0], timesCampo[1], { aoClicar: (id, fla) => abrirJogadorNaPartida(id, p.id_partida, fla) });
  if (marcas.length) linhaTempo(tempo, marcas, { duracao: p.duracao ?? 90 });
  if (linhasStats.length) barrasEspelhadas(grafStats, linhasStats, flaPrimeiro
    ? { nomeA: "Flamengo", nomeB: p.adversario }
    : { nomeA: p.adversario, nomeB: "Flamengo", corA: "var(--serie-2)", corB: "var(--serie-1)" });
  if (chutes.length) {
    mapaGol(golFla, chutes.filter((c) => c.eh_flamengo));
    mapaGol(golAdv, chutes.filter((c) => !c.eh_flamengo), { cor: "var(--serie-2)" });
  }
}
