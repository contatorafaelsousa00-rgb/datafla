// Aba Estilo de jogo: médias contra os adversários e padrões por momento do jogo.
import { barrasEspelhadas, colunasAgrupadas, linhas, serie } from "./graficos.js";
import { $, bola, comDetalhe, D, data, filtrados, h, media, mostrar, movel, num, pct, preencher, vazio } from "./comum.js";

// =====================================================================
// ESTILO DE JOGO
// =====================================================================
export const STATS_ESTILO = [["posse", "Posse", (v) => pct(v, 0)], ["passes", "Passes", (v) => num(v, 0)],
  ["passes_pct", "Passes certos", (v) => pct(v, 0)], ["passes_ultimo_terco", "Passes no último terço", (v) => num(v, 0)],
  ["lancamentos", "Lançamentos", (v) => num(v, 1)], ["cruzamentos", "Cruzamentos", (v) => num(v, 1)],
  ["dribles_certos", "Dribles certos", (v) => num(v, 1)], ["grandes_chances", "Grandes chances", (v) => num(v, 1)],
  ["finalizacoes", "Finalizações", (v) => num(v, 1)], ["finalizacoes_dentro_area", "Finalizações na área", (v) => num(v, 1)],
  ["finalizacoes_alvo", "No alvo", (v) => num(v, 1)], ["xg", "xG", (v) => num(v, 2)], ["escanteios", "Escanteios", (v) => num(v, 1)],
  ["desarmes", "Desarmes", (v) => num(v, 1)], ["interceptacoes", "Interceptações", (v) => num(v, 1)],
  ["cortes", "Cortes", (v) => num(v, 1)], ["duelos_aereos_ganhos", "Duelos aéreos ganhos", (v) => num(v, 1)],
  ["faltas", "Faltas", (v) => num(v, 1)], ["amarelos", "Amarelos", (v) => num(v, 1)]];
export const FAIXAS = ["1–15", "16–30", "31–45", "46–60", "61–75", "76–90", "90+"];
export const faixaDe = (min, acrescimo) => (min > 90 || (min === 90 && acrescimo) ? 6 : Math.min(5, Math.max(0, Math.ceil(min / 15) - 1)));

function renderFormacoes(js) {
  const comFormacao = js.filter((p) => p.formacao);
  if (!mostrar("card-formacoes", comFormacao.length > 0)) return;
  const grupos = new Map();
  for (const p of comFormacao) { if (!grupos.has(p.formacao)) grupos.set(p.formacao, []); grupos.get(p.formacao).push(p); }
  const linhas = [...grupos].sort((a, b) => b[1].length - a[1].length);
  const conta = (l, r) => l.filter((p) => p.resultado === r).length;
  const pts = (l) => l.reduce((t, p) => t + (p.resultado === "V" ? 3 : p.resultado === "E" ? 1 : 0), 0);
  const comXg = (l) => l.filter((p) => p.xg_pro != null);
  preencher($("tabela-formacoes"),
    h("thead", {}, h("tr", {}, ["Formação", "Jogos", "V-E-D", "Aproveit.", "Gols por jogo", "xG por jogo", "Último uso"]
      .map((t, i) => h("th", { class: i ? "num" : "" }, t)))),
    h("tbody", {}, linhas.map(([f, l]) => h("tr", {},
      h("td", {}, h("b", {}, f)), h("td", { class: "num" }, l.length), h("td", { class: "num" }, `${conta(l, "V")}-${conta(l, "E")}-${conta(l, "D")}`),
      h("td", { class: "num" }, pct(pts(l) / (3 * l.length), 0)),
      h("td", { class: "num" }, `${num(media(l.map((p) => p.gols_pro)), 1)} × ${num(media(l.map((p) => p.gols_contra)), 1)}`),
      h("td", { class: "num" }, comXg(l).length ? `${num(media(comXg(l).map((p) => p.xg_pro)), 2)} × ${num(media(comXg(l).map((p) => p.xg_contra)), 2)}` : "–"),
      h("td", { class: "num" }, data(l.reduce((a, p) => (p.data_utc > a ? p.data_utc : a), "")))))));
}

export function renderEstilo(js) {
  renderFormacoes(js);
  const det = comDetalhe(js);
  // Médias por jogo, Flamengo × adversários
  const medias = STATS_ESTILO.map(([k, rot, f]) => {
    const pares = det.map((p) => D.stats.get(p.id_partida)).filter((s) => s && s.fla[k] != null && s.adv[k] != null);
    if (pares.length < Math.max(2, det.length / 2)) return null;
    return { rotulo: rot, a: media(pares.map((s) => s.fla[k])), b: media(pares.map((s) => s.adv[k])), texto: f };
  }).filter(Boolean);
  $("nota-estilo").textContent = medias.length ? `Média por jogo em ${det.length} jogos com estatísticas.` : "";
  if (medias.length) barrasEspelhadas($("graf-estilo"), medias, { nomeA: "Flamengo", nomeB: "Adversários" });
  else $("graf-estilo").replaceChildren(vazio("Sem estatísticas de time nos jogos filtrados."));

  // Finalizações por momento do jogo (média por jogo)
  const comChutes = det.filter((p) => (D.finalizacoesPorPartida.get(p.id_partida) ?? []).length);
  if (mostrar("card-chutes-minuto", comChutes.length >= 2)) {
    const pro = Array(7).fill(0), contra = Array(7).fill(0);
    for (const p of comChutes) for (const c of D.finalizacoesPorPartida.get(p.id_partida)) (c.eh_flamengo ? pro : contra)[faixaDe(c.minuto, c.acrescimo)]++;
    const n = comChutes.length;
    colunasAgrupadas($("graf-chutes-minuto"), FAIXAS, [
      { nome: "Flamengo", cor: "var(--serie-1)", valores: pro.map((v) => +(v / n).toFixed(1)) },
      { nome: "Adversários", cor: "var(--serie-2)", valores: contra.map((v) => +(v / n).toFixed(1)) },
    ]);
  }

  // Gols por momento do jogo
  const gp = Array(7).fill(0), gc = Array(7).fill(0);
  for (const p of det) for (const e of D.eventosPorPartida.get(p.id_partida) ?? []) {
    if (e.tipo !== "Goal" || e.detalhe === "Missed Penalty") continue;
    (e.eh_flamengo ? gp : gc)[faixaDe(e.minuto, e.acrescimo)]++;
  }
  colunasAgrupadas($("graf-faixas"), FAIXAS, [
    { nome: "Marcados", cor: "var(--serie-1)", valores: gp },
    { nome: "Sofridos", cor: "var(--serie-2)", valores: gc },
  ]);

  // Gols × xG acumulados e posse/último terço dividem a linha
  const comXg = det.filter((p) => p.xg_pro != null);
  const comPosse = det.filter((p) => D.stats.get(p.id_partida)?.fla.posse != null);
  mostrar("card-xg", comXg.length >= 2);
  mostrar("card-posse", comPosse.length >= 5);
  if (comXg.length >= 2) {
    $("xg-nota").textContent = `${comXg.length} jogos com xG. Gols acima do xG: finalização acima do esperado (ataque) ou goleiro e sorte do adversário (defesa).`;
    const ataque = h("div"), defesa = h("div");
    $("graf-xg").replaceChildren(h("h3", {}, "Ataque"), ataque, h("h3", { style: "margin-top:12px" }, "Defesa"), defesa);
    const acum = (f) => { let t = 0; return comXg.map((p) => (t += f(p) ?? 0)); };
    const rot = comXg.map((p) => `${data(p.data_utc)} x ${p.adversario}`), curto = comXg.map((p) => data(p.data_utc));
    linhas(ataque, curto, [{ nome: "gols", cor: "var(--serie-1)", valores: acum((p) => p.gols_pro) },
      { nome: "xG", cor: "var(--serie-2)", valores: acum((p) => p.xg_pro) }], { formato: (v) => num(v, 1), dicaRotulos: rot, altura: 200 });
    linhas(defesa, curto, [{ nome: "sofridos", cor: "var(--serie-1)", valores: acum((p) => p.gols_contra) },
      { nome: "xG contra", cor: "var(--serie-2)", valores: acum((p) => p.xg_contra) }], { formato: (v) => num(v, 1), dicaRotulos: rot, altura: 200 });
  }
  if (comPosse.length >= 5) {
    const g1 = h("div"), g2 = h("div");
    $("graf-posse").replaceChildren(h("h3", {}, "Posse de bola (%)"), g1, h("h3", { style: "margin-top:12px" }, "Passes no último terço"), g2);
    const st = (p) => D.stats.get(p.id_partida);
    const rot = comPosse.map((p) => `${data(p.data_utc)} x ${p.adversario} (média dos 5 últimos)`), curto = comPosse.map((p) => data(p.data_utc));
    linhas(g1, curto, [{ nome: "Flamengo", cor: "var(--serie-1)", valores: movel(comPosse, (p) => st(p).fla.posse * 100) }],
      { formato: (v) => num(v, 0), dicaRotulos: rot, altura: 200 });
    if (comPosse.some((p) => st(p).fla.passes_ultimo_terco != null))
      linhas(g2, curto, [{ nome: "Flamengo", cor: "var(--serie-1)", valores: movel(comPosse, (p) => st(p).fla.passes_ultimo_terco) },
        { nome: "Adversários", cor: "var(--serie-2)", valores: movel(comPosse, (p) => st(p).adv.passes_ultimo_terco) }],
      { formato: (v) => num(v, 0), dicaRotulos: rot, altura: 200 });
    else g2.replaceChildren(vazio("A fonte não tem passes no último terço."));
  }
}
