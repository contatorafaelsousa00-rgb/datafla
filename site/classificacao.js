// Aba Classificação: tabela do Brasileirão calculada a partir de todos os jogos do campeonato e simulador.
// Palpites: o visitante escolhe casa/empate/fora em qualquer jogo restante e a tabela se refaz na hora.
// Chances: os jogos sem palpite são sorteados milhares de vezes (modelo de Poisson com a força de ataque e defesa
// de cada time em casa e fora, puxada para a média do campeonato para não exagerar amostras pequenas).
import { $, D, data, h, num, pct, preencher, vazio } from "./comum.js";
import { horaBR } from "./temporada.js";

const SIMULACOES = 4000;
const ZONAS = [["titulo", "Título", (p) => p === 1], ["g4", "Top 4", (p) => p <= 4], ["g6", "Top 6", (p) => p <= 6], ["z4", "Rebaixamento", (p, n) => p > n - 4]];
const CHAVE = "datafla-palpites";
let palpites = carregar();
let soFla = false;

function carregar() {
  try { return new Map(JSON.parse(localStorage.getItem(CHAVE) || "[]")); } catch { return new Map(); }
}
function guardar() {
  try { localStorage.setItem(CHAVE, JSON.stringify([...palpites])); } catch {}
}

// ---------- tabela ----------
const novaLinha = (t) => ({ ...t, pontos: 0, jogos: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 });
function somar(linha, pro, contra) {
  linha.jogos += 1; linha.gp += pro; linha.gc += contra;
  if (pro > contra) { linha.v += 1; linha.pontos += 3; } else if (pro === contra) { linha.e += 1; linha.pontos += 1; } else linha.d += 1;
}
// Critérios do Brasileirão: pontos, vitórias, saldo, gols pró
const ordenar = (linhas) => linhas.sort((a, b) => b.pontos - a.pontos || b.v - a.v || (b.gp - b.gc) - (a.gp - a.gc) || b.gp - a.gp || a.nome.localeCompare(b.nome));

function tabela(times, encerrados, comPalpites = []) {
  const t = new Map([...times.values()].map((x) => [x.id, novaLinha(x)]));
  for (const m of encerrados) { somar(t.get(m.casa_id), m.gols_casa, m.gols_fora); somar(t.get(m.fora_id), m.gols_fora, m.gols_casa); }
  for (const [m, r] of comPalpites) {  // palpite sem placar: 1 × 0, 0 × 0 ou 0 × 1 (só muda pontos, V/E/D e saldo em 1)
    const [gc, gf] = r === "C" ? [1, 0] : r === "E" ? [0, 0] : [0, 1];
    somar(t.get(m.casa_id), gc, gf); somar(t.get(m.fora_id), gf, gc);
  }
  return ordenar([...t.values()]);
}

// ---------- simulação ----------
function rng(semente) { // mulberry32: mesmos números a cada carga (chances não ficam mudando sozinhas)
  return () => { semente |= 0; semente = (semente + 0x6D2B79F5) | 0; let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function poisson(l, r) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }

function forcas(times, encerrados) {
  const media = { casa: 0, fora: 0 }, n = encerrados.length || 1;
  for (const m of encerrados) { media.casa += m.gols_casa; media.fora += m.gols_fora; }
  media.casa /= n; media.fora /= n;
  const f = new Map([...times.keys()].map((id) => [id, { gpc: 0, gsc: 0, jc: 0, gpf: 0, gsf: 0, jf: 0 }]));
  for (const m of encerrados) {
    const c = f.get(m.casa_id), v = f.get(m.fora_id);
    c.gpc += m.gols_casa; c.gsc += m.gols_fora; c.jc++;
    v.gpf += m.gols_fora; v.gsf += m.gols_casa; v.jf++;
  }
  const K = 5; // jogos "fictícios" na média: puxa para o centro quem tem poucos jogos
  const taxa = (g, j, base) => (g + base * K) / (j + K) / base;
  for (const x of f.values()) {
    x.ataqueCasa = taxa(x.gpc, x.jc, media.casa); x.defesaCasa = taxa(x.gsc, x.jc, media.fora);
    x.ataqueFora = taxa(x.gpf, x.jf, media.fora); x.defesaFora = taxa(x.gsf, x.jf, media.casa);
  }
  return { f, media };
}

function simular(times, encerrados, restantes) {
  const { f, media } = forcas(times, encerrados);
  const ids = [...times.keys()], n = ids.length;
  const base = new Map(tabela(times, encerrados).map((l) => [l.id, l]));
  const conta = new Map(ids.map((id) => [id, { titulo: 0, g4: 0, g6: 0, z4: 0, soma: 0 }]));
  const r = rng(2026);
  const jogos = restantes.map((m) => ({ m, palpite: palpites.get(m.id_partida),
    lc: media.casa * f.get(m.casa_id).ataqueCasa * f.get(m.fora_id).defesaFora,
    lf: media.fora * f.get(m.fora_id).ataqueFora * f.get(m.casa_id).defesaCasa }));
  for (let s = 0; s < SIMULACOES; s++) {
    const t = new Map(ids.map((id) => { const b = base.get(id); return [id, { id, nome: b.nome, pontos: b.pontos, v: b.v, gp: b.gp, gc: b.gc }]; }));
    for (const { m, palpite, lc, lf } of jogos) {
      let gc, gf;
      if (palpite) [gc, gf] = palpite === "C" ? [1, 0] : palpite === "E" ? [0, 0] : [0, 1];
      else { gc = poisson(lc, r); gf = poisson(lf, r); }
      const c = t.get(m.casa_id), v = t.get(m.fora_id);
      c.gp += gc; c.gc += gf; v.gp += gf; v.gc += gc;
      if (gc > gf) { c.pontos += 3; c.v++; } else if (gc < gf) { v.pontos += 3; v.v++; } else { c.pontos++; v.pontos++; }
    }
    ordenar([...t.values()]).forEach((x, i) => {
      const c = conta.get(x.id), pos = i + 1;
      c.soma += pos;
      for (const [k, , regra] of ZONAS) if (regra(pos, n)) c[k]++;
    });
  }
  for (const c of conta.values()) { for (const [k] of ZONAS) c[k] /= SIMULACOES; c.media = c.soma / SIMULACOES; }
  return conta;
}

// ---------- tela ----------
const logo = (src) => (src ? h("img", { src, alt: "", width: 18, height: 18, loading: "lazy" }) : null);
const chance = (v) => h("td", { class: "num chance-celula", style: v > 0.005 ? `--v:${v}` : "" },
  v >= 0.995 ? ">99%" : v > 0 && v < 0.005 ? "<1%" : v === 0 ? "–" : pct(v, 0));

export function renderClassificacao() {
  const liga = D.bruto.liga ?? [];
  if (!liga.length) {
    preencher($("classificacao-corpo"), vazio("A tabela do Brasileirão chega na próxima coleta."));
    return;
  }
  const times = new Map();
  for (const m of liga) {
    times.set(m.casa_id, { id: m.casa_id, nome: m.casa, logo: m.casa_logo });
    times.set(m.fora_id, { id: m.fora_id, nome: m.fora, logo: m.fora_logo });
  }
  const encerrados = liga.filter((m) => m.gols_casa != null);
  const restantes = liga.filter((m) => m.gols_casa == null && m.status !== "CANC")
    .sort((a, b) => (parseInt(a.rodada?.replace(/\D/g, "")) || 99) - (parseInt(b.rodada?.replace(/\D/g, "")) || 99) || a.data_utc.localeCompare(b.data_utc));
  for (const id of [...palpites.keys()]) if (!restantes.some((m) => m.id_partida === id)) palpites.delete(id); // jogo já aconteceu

  const atual = tabela(times, encerrados);
  const posAtual = new Map(atual.map((l, i) => [l.id, i + 1]));
  const escolhidos = restantes.filter((m) => palpites.has(m.id_partida)).map((m) => [m, palpites.get(m.id_partida)]);
  const comPalpites = escolhidos.length ? tabela(times, encerrados, escolhidos) : atual;
  const chances = simular(times, encerrados, restantes);
  const idFla = liga.find((m) => m.casa === "Flamengo")?.casa_id ?? liga.find((m) => m.fora === "Flamengo")?.fora_id;
  const posFla = comPalpites.findIndex((l) => l.id === idFla) + 1;
  const lFla = comPalpites[posFla - 1], segundo = comPalpites[posFla === 1 ? 1 : 0];
  const cFla = chances.get(idFla);
  // até onde cada time ainda pode chegar (jogos sem palpite valem 3 pontos no máximo)
  const semPalpite = new Map();
  for (const m of restantes) if (!palpites.has(m.id_partida)) for (const id of [m.casa_id, m.fora_id]) semPalpite.set(id, (semPalpite.get(id) ?? 0) + 1);
  const maximo = (l) => l.pontos + 3 * (semPalpite.get(l.id) ?? 0);
  const rivalMax = comPalpites.filter((l) => l.id !== idFla).reduce((a, b) => (maximo(b) > maximo(a) ? b : a), comPalpites.find((l) => l.id !== idFla));
  const campeao = lFla && maximo(rivalMax) < lFla.pontos;

  const resumo = lFla ? [
    h("div", { class: "kpis" },
      h("div", { class: "kpi destaque" }, h("div", { class: "rotulo" }, escolhidos.length ? "Posição com seus palpites" : "Posição do Flamengo"),
        h("div", { class: "valor" }, `${posFla}º`), h("div", { class: "extra" }, `${lFla.pontos} pontos em ${lFla.jogos} jogos`)),
      escolhidos.length
        ? h("div", { class: "kpi" }, h("div", { class: "rotulo" }, campeao ? "Título garantido" : "Quem ainda alcança"),
            h("div", { class: "valor" }, campeao ? "Sim" : `${maximo(rivalMax)} pts`),
            h("div", { class: "extra" }, campeao ? `ninguém passa de ${maximo(rivalMax)} pontos` : `máximo possível do ${rivalMax.nome}`))
        : h("div", { class: "kpi" }, h("div", { class: "rotulo" }, posFla === 1 ? "Vantagem para o 2º" : "Distância do líder"),
            h("div", { class: "valor" }, `${Math.abs(lFla.pontos - segundo.pontos)} pts`), h("div", { class: "extra" }, segundo.nome)),
      ...ZONAS.slice(0, 3).map(([k, nome], i) => h("div", { class: "kpi" }, h("div", { class: "rotulo" }, `Chance: ${nome}`),
        h("div", { class: "valor" }, cFla[k] >= 0.995 ? ">99%" : pct(cFla[k], 0)),
        i === 0 ? h("div", { class: "extra" }, `posição média nas simulações: ${num(cFla.media, 1)}º`) : null))),
  ] : [];

  const n = comPalpites.length;
  const tabelaEl = h("table", { class: "tabela tabela-classificacao" },
    h("thead", {}, h("tr", {}, ["#", "", "Time", "P", "J", "V", "E", "D", "SG", "GP", ...ZONAS.map(([, nome]) => nome)]
      .map((t, i) => h("th", { class: i >= 3 ? "num" : "" }, t)))),
    h("tbody", {}, comPalpites.map((l, i) => {
      const pos = i + 1, antes = posAtual.get(l.id), c = chances.get(l.id);
      const zona = pos <= 4 ? "zona-g4" : pos <= 6 ? "zona-g6" : pos > n - 4 ? "zona-z4" : "";
      return h("tr", { class: [l.id === idFla ? "destaque-fla" : "", zona].join(" ") },
        h("td", { class: "num" }, pos),
        h("td", { class: "sutil movimento" }, escolhidos.length && antes !== pos ? (antes > pos ? `▲${antes - pos}` : `▼${pos - antes}`) : ""),
        h("td", {}, h("span", { class: "time" }, logo(l.logo), l.nome)),
        h("td", { class: "num" }, h("b", {}, l.pontos)), h("td", { class: "num" }, l.jogos), h("td", { class: "num" }, l.v),
        h("td", { class: "num" }, l.e), h("td", { class: "num" }, l.d), h("td", { class: "num" }, (l.gp - l.gc > 0 ? "+" : "") + (l.gp - l.gc)),
        h("td", { class: "num" }, l.gp), ...ZONAS.map(([k]) => chance(c[k])));
    })));

  // jogos restantes por rodada, com os botões de palpite
  const visiveis = soFla ? restantes.filter((m) => m.casa_id === idFla || m.fora_id === idFla) : restantes;
  const rodadas = new Map();
  for (const m of visiveis) { const k = m.rodada ?? "Sem rodada"; if (!rodadas.has(k)) rodadas.set(k, []); rodadas.get(k).push(m); }
  const botao = (m, r, rotulo) => h("button", { type: "button", "aria-pressed": String(palpites.get(m.id_partida) === r), title: rotulo,
    onclick: () => { palpites.get(m.id_partida) === r ? palpites.delete(m.id_partida) : palpites.set(m.id_partida, r); guardar(); renderClassificacao(); } },
    r === "E" ? "Empate" : "Vence");
  const jogosEl = h("div", { class: "rodadas" }, [...rodadas].map(([rod, ms]) => h("div", { class: "rodada" },
    h("h3", {}, rod, h("span", { class: "sutil" }, ` · ${data(ms[0].data_utc)}${ms.some((m) => m.status === "PST") ? " · inclui jogo adiado" : ""}`)),
    h("ul", { class: "lista-palpites" }, ms.map((m) => h("li", { class: m.casa_id === idFla || m.fora_id === idFla ? "jogo-fla" : "" },
      h("span", { class: "palpite-time casa" }, m.casa, logo(m.casa_logo)),
      h("span", { class: "segmentado palpite" }, botao(m, "C", `${m.casa} vence`), botao(m, "E", "Empate"), botao(m, "F", `${m.fora} vence`)),
      h("span", { class: "palpite-time fora" }, logo(m.fora_logo), m.fora),
      h("span", { class: "sutil palpite-data" }, m.status === "PST" ? "adiado" : `${data(m.data_utc)} ${horaBR(m.data_utc)}`)))))));

  const acoes = h("div", { class: "acoes" },
    h("div", { class: "segmentado" },
      h("button", { type: "button", "aria-pressed": String(!soFla), onclick: () => { soFla = false; renderClassificacao(); } }, "Todos os jogos"),
      h("button", { type: "button", "aria-pressed": String(soFla), onclick: () => { soFla = true; renderClassificacao(); } }, "Só do Flamengo")),
    h("button", { type: "button", class: "botao-secundario", onclick: () => {
      for (const m of restantes) if (m.casa_id === idFla) palpites.set(m.id_partida, "C"); else if (m.fora_id === idFla) palpites.set(m.id_partida, "F");
      guardar(); renderClassificacao(); } }, "Flamengo vence todos"),
    escolhidos.length ? h("button", { type: "button", class: "botao-secundario", onclick: () => { palpites.clear(); guardar(); renderClassificacao(); } },
      `Limpar ${escolhidos.length} palpite${escolhidos.length > 1 ? "s" : ""}`) : null);

  preencher($("classificacao-corpo"),
    ...resumo,
    h("article", { class: "cartao" }, h("h2", {}, escolhidos.length ? "Tabela com seus palpites" : "Tabela"),
      h("p", { class: "sutil" }, `${encerrados.length} jogos disputados, ${restantes.length} por jogar. As chances vêm de ${num(SIMULACOES)} simulações dos jogos restantes`
        + (escolhidos.length ? ", respeitando seus palpites." : ".") + " Top 4/Top 6 são referência: as vagas da Libertadores mudam com os campeões das copas."),
      h("div", { class: "tabela-rolagem" }, tabelaEl)),
    h("article", { class: "cartao" }, h("h2", {}, "Simulador"),
      h("p", { class: "sutil" }, "Escolha o resultado dos jogos que faltam: a tabela e as chances acima se refazem na hora. Clique de novo para desfazer. Os palpites ficam salvos só neste navegador."),
      acoes, visiveis.length ? jogosEl : vazio("Nenhum jogo restante.")),
  );
}
