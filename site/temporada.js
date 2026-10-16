// Aba Temporada: cartão do próximo jogo, indicadores e gráficos da temporada.
import { barrasHorizontais, colunasDivergentes, conteudoDica, dica, linhas, serie } from "./graficos.js";
import { $, assinado, bola, comDetalhe, compOk, confronto, contar, corComp, D, data, dataLonga, dicaJogo, ENCERRADO, escudo, estado, filtrados, h, iconeComp, kpi, media, mostrar, movel, NOME_RES, num, pct, pontos, pontosDe, resultado, rotuloMes, soma, tagComp, textoConfronto, vazio } from "./comum.js";
import { abrirJogo, barraProbabilidade } from "./jogos.js";
import { trocarAba } from "./app.js";

// =====================================================================
// PRÓXIMO JOGO
// =====================================================================
export const CANCELADO = new Set(["ABD", "PST", "CANC"]);
export const horaBR = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
export const diaBR = (iso) => new Date(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
export const CLIMA = { rain: "chuva", cloudy: "nublado", clear: "céu limpo", sunny: "sol", "partly cloudy": "parcialmente nublado",
  overcast: "encoberto", snow: "neve", fog: "neblina", thunderstorm: "tempestade", drizzle: "garoa" };
export let relogio; // atualiza a contagem regressiva

// Próximos jogos do calendário que passam pelos filtros de competição e mando (o período não se aplica ao futuro).
export const futurosFiltrados = () => D.calendario
  .filter((j) => !ENCERRADO.has(j.status) && !CANCELADO.has(j.status) && new Date(j.data_utc) > Date.now() - 3 * 3600e3
    && compOk(j.competicao) && (!estado.mando || j.mando === estado.mando))
  .sort((a, b) => a.data_utc.localeCompare(b.data_utc));

export function contagem(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return "em andamento";
  const min = Math.floor(ms / 6e4), d = Math.floor(min / 1440), hr = Math.floor((min % 1440) / 60), m = min % 60;
  if (d >= 2) return `em ${d} dias`;
  if (d === 1) return `em 1 dia e ${hr} h`;
  if (hr >= 1) return `em ${hr} h ${String(m).padStart(2, "0")} min`;
  return `em ${m} min`;
}

export function renderProximo() {
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
export function renderTemporada(js) {
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
    comXg.length ? kpi("xG a favor × contra", `${num(soma(comXg, (p) => p.xg_pro), 1)} × ${num(soma(comXg, (p) => p.xg_contra), 1)}`,
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
        dica: dicaJogo(p, [{ valor: `xG ${textoConfronto(p, p.xg_pro, p.xg_contra, (v) => num(v, 2))}`, nome: "" },
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
      bola(p.resultado), h("span", { class: "cresce" }, confronto(p),
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
