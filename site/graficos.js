// Gráficos em SVG, sem bibliotecas. Cores vêm das variáveis CSS (--s1..--s6, --serie-*, --seq-*).

const NS = "http://www.w3.org/2000/svg";

export function el(tag, attrs = {}, pai) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
  if (pai) pai.appendChild(n);
  return n;
}

function texto(pai, x, y, conteudo, attrs = {}) {
  const t = el("text", { x, y, ...attrs }, pai);
  t.textContent = conteudo;
  return t;
}

function novoSvg(container, altura, resumo) {
  container.replaceChildren();
  const largura = Math.max(280, container.clientWidth || 600);
  const s = el("svg", { width: largura, height: altura, viewBox: `0 0 ${largura} ${altura}`, role: "img" }, container);
  rotular(s, container, resumo);
  return { s, largura };
}

// ---------- texto alternativo (leitores de tela) ----------
// Cada gráfico vira "Título do cartão. Resumo dos dados"; o resumo sai dos próprios dados do gráfico.
const fmtNum = (v) => (typeof v === "number" ? v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : String(v ?? "–"));

function rotular(svg, container, resumo) {
  const titulo = container.closest(".cartao")?.querySelector("h2, h3")?.textContent?.trim();
  const texto = [titulo, resumo].filter(Boolean).join(". ");
  if (texto) svg.setAttribute("aria-label", texto);
}

// ---------- dica (tooltip) ----------
const dicaEl = () => document.getElementById("dica");

export function dica(no, montar) {
  const mostrar = (ev) => {
    const d = dicaEl();
    d.replaceChildren(...montar());
    d.hidden = false;
    posicionar(ev);
  };
  const posicionar = (ev) => {
    const d = dicaEl();
    let x = ev.clientX, y = ev.clientY;
    if (ev.type === "focus") {
      const r = no.getBoundingClientRect();
      x = r.left + r.width / 2; y = r.top;
    }
    const w = d.offsetWidth, h = d.offsetHeight;
    d.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, x + 12)) + "px";
    d.style.top = (y - h - 12 < 8 ? y + 16 : y - h - 12) + "px";
  };
  const esconder = () => { dicaEl().hidden = true; };
  no.addEventListener("pointerenter", mostrar);
  no.addEventListener("pointermove", posicionar);
  no.addEventListener("pointerleave", esconder);
  no.addEventListener("focus", mostrar);
  no.addEventListener("blur", esconder);
}

// Conteúdo padrão da dica: título + linhas {valor, nome, cor}
export function conteudoDica(titulo, linhas) {
  const nos = [];
  const t = document.createElement("div");
  t.textContent = titulo;
  t.style.color = "var(--texto-2)";
  nos.push(t);
  for (const l of linhas) {
    const div = document.createElement("div");
    div.className = "linha";
    if (l.cor) {
      const i = document.createElement("i");
      i.style.background = l.cor;
      div.appendChild(i);
    }
    const b = document.createElement("b");
    b.textContent = l.valor;
    div.appendChild(b);
    if (l.nome) div.appendChild(document.createTextNode(" " + l.nome));
    nos.push(div);
  }
  return nos;
}

// ---------- utilidades ----------
function divisoes(max, n = 4) {
  if (max <= 0) return [0, 1];
  const bruto = max / n;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto);
  const ticks = [];
  for (let v = 0; v <= max + passo * 0.001; v += passo) ticks.push(+v.toFixed(6));
  if (ticks[ticks.length - 1] < max) ticks.push(+(ticks[ticks.length - 1] + passo).toFixed(6));
  return ticks;
}

// Barra vertical: topo arredondado (4px), base reta.
function caminhoColuna(x, y, w, h, r = 4) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
// Barra horizontal: ponta direita arredondada.
function caminhoBarra(x, y, w, h, r = 4) {
  r = Math.min(r, h / 2, w);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

export function legenda(container, itens, tipo = "caixa") {
  const div = document.createElement("div");
  div.className = "legenda";
  for (const it of itens) {
    const span = document.createElement("span");
    const i = document.createElement("i");
    if (tipo === "traco") i.className = "traco";
    i.style.background = it.cor;
    span.append(i, document.createTextNode(it.nome));
    div.appendChild(span);
  }
  container.appendChild(div);
}

// ---------- barras horizontais ----------
// itens: [{rotulo, valor, texto, cor, dica: () => nós, icone?: {src, classe}}]
// Com ícones (ex.: logos das competições), uma coluna à esquerda mostra o ícone, ou a bolinha da cor se faltar.
export function barrasHorizontais(container, itens, { max, larguraRotulo = 120 } = {}) {
  const linha = 30, espessura = 16, icone = 24;
  const comIcone = itens.some((i) => i.icone);
  const { s, largura } = novoSvg(container, itens.length * linha + 4,
    itens.map((i) => `${i.rotulo}: ${i.texto ?? fmtNum(i.valor)}`).join("; "));
  const maxV = max ?? Math.max(...itens.map((i) => i.valor), 1);
  const inicio = larguraRotulo + (comIcone ? icone + 8 : 0);
  larguraRotulo = inicio;
  const util = largura - larguraRotulo - 56;
  itens.forEach((it, k) => {
    const y = k * linha;
    if (comIcone) {
      if (it.icone) el("image", { href: it.icone.src, x: 0, y: y + (linha - icone) / 2, width: icone, height: icone,
        class: it.icone.classe, preserveAspectRatio: "xMidYMid meet" }, s);
      else el("circle", { cx: icone / 2, cy: y + linha / 2, r: 5, fill: it.cor }, s);
    }
    texto(s, larguraRotulo - 10, y + linha / 2 + 4, it.rotulo, { class: "rotulo-cat", "text-anchor": "end" });
    const w = Math.max(2, (it.valor / maxV) * util);
    const g = el("g", { class: "marca", tabindex: 0 }, s);
    el("rect", { x: larguraRotulo, y, width: util + 50, height: linha, fill: "transparent" }, g);
    el("path", { d: caminhoBarra(larguraRotulo, y + (linha - espessura) / 2, w, espessura), fill: it.cor }, g);
    texto(s, larguraRotulo + w + 6, y + linha / 2 + 4, it.texto, { class: "rotulo-dado" });
    if (it.dica) dica(g, it.dica);
  });
  el("line", { x1: larguraRotulo, x2: larguraRotulo, y1: 0, y2: itens.length * linha, class: "linha-base" }, s);
}

// ---------- colunas agrupadas ----------
// categorias: [rótulo], series: [{nome, cor, valores: []}]
export function colunasAgrupadas(container, categorias, series, { altura = 230 } = {}) {
  const m = { t: 10, r: 8, b: 26, l: 32 };
  const { s, largura } = novoSvg(container, altura,
    series.map((x) => `${x.nome}: ` + categorias.map((c, k) => `${c} ${fmtNum(x.valores[k])}`).join(", ")).join("; "));
  const max = Math.max(...series.flatMap((x) => x.valores), 1);
  const ticks = divisoes(max);
  const topo = ticks[ticks.length - 1];
  const h = altura - m.t - m.b, w = largura - m.l - m.r;
  const y = (v) => m.t + h - (v / topo) * h;
  for (const t of ticks) {
    el("line", { x1: m.l, x2: largura - m.r, y1: y(t), y2: y(t), class: t === 0 ? "linha-base" : "linha-grade" }, s);
    texto(s, m.l - 6, y(t) + 4, String(t), { class: "eixo-texto", "text-anchor": "end" });
  }
  const banda = w / categorias.length;
  const barra = Math.min(24, (banda * 0.7 - 2 * (series.length - 1)) / series.length);
  const grupo = barra * series.length + 2 * (series.length - 1);
  categorias.forEach((cat, ci) => {
    const x0 = m.l + ci * banda + (banda - grupo) / 2;
    texto(s, m.l + ci * banda + banda / 2, altura - 8, cat, { class: "eixo-texto", "text-anchor": "middle" });
    const g = el("g", { class: "marca", tabindex: 0 }, s);
    el("rect", { x: m.l + ci * banda, y: m.t, width: banda, height: h, fill: "transparent" }, g);
    series.forEach((se, si) => {
      const v = se.valores[ci];
      if (v > 0) el("path", { d: caminhoColuna(x0 + si * (barra + 2), y(v), barra, y(0) - y(v)), fill: se.cor }, g);
    });
    dica(g, () => conteudoDica(cat, series.map((se) => ({ valor: se.valores[ci], nome: se.nome, cor: se.cor }))));
  });
  legenda(container, series);
}

// ---------- linhas com mira ----------
// rotulosX: [texto], series: [{nome, cor, valores: []}]
export function linhas(container, rotulosX, series, { altura = 260, formato = (v) => v.toFixed(1), dicaRotulos = rotulosX } = {}) {
  // Margem direita do tamanho do maior rótulo de fim de linha (~6,6 px por caractere a 12px)
  const maiorRotulo = Math.max(...series.map((se) => `${formato(se.valores[se.valores.length - 1])} ${se.nome}`.length));
  const m = { t: 12, r: Math.ceil(maiorRotulo * 6.6) + 14, b: 26, l: 32 };
  const { s, largura } = novoSvg(container, altura, rotulosX.length
    ? `De ${rotulosX[0]} a ${rotulosX[rotulosX.length - 1]} (${rotulosX.length} jogos). No fim: `
      + series.map((x) => `${x.nome} ${formato(x.valores[x.valores.length - 1])}`).join(", ")
    : "Sem dados");
  const n = rotulosX.length;
  const max = Math.max(...series.flatMap((x) => x.valores), 1);
  const ticks = divisoes(max);
  const topo = ticks[ticks.length - 1];
  const h = altura - m.t - m.b, w = largura - m.l - m.r;
  const x = (i) => m.l + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v) => m.t + h - (v / topo) * h;
  for (const t of ticks) {
    el("line", { x1: m.l, x2: m.l + w, y1: y(t), y2: y(t), class: t === 0 ? "linha-base" : "linha-grade" }, s);
    texto(s, m.l - 6, y(t) + 4, String(t), { class: "eixo-texto", "text-anchor": "end" });
  }
  // Rótulos do eixo X espaçados para não colidir
  const passo = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 70))));
  for (let i = 0; i < n; i += passo) texto(s, x(i), altura - 8, rotulosX[i], { class: "eixo-texto", "text-anchor": "middle" });

  for (const se of series) {
    const d = se.valores.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
    el("path", { d, fill: "none", stroke: se.cor, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, s);
    const ult = se.valores.length - 1;
    el("circle", { cx: x(ult), cy: y(se.valores[ult]), r: 4, fill: se.cor, stroke: "var(--superficie)", "stroke-width": 2 }, s);
  }
  // Rótulos no fim das linhas; afasta quando colidem
  const fins = series.map((se) => ({ se, y: y(se.valores[se.valores.length - 1]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < fins.length; i++) if (fins[i].y - fins[i - 1].y < 14) fins[i].y = fins[i - 1].y + 14;
  for (const f of fins) texto(s, x(n - 1) + 8, f.y + 4, `${formato(f.se.valores[f.se.valores.length - 1])} ${f.se.nome}`, { class: "rotulo-dado" });

  const mira = el("line", { y1: m.t, y2: m.t + h, class: "mira", visibility: "hidden" }, s);
  const area = el("rect", { x: m.l, y: m.t, width: w, height: h, fill: "transparent", tabindex: 0 }, s);
  let atual = n - 1;
  const indice = (ev) => {
    const r = s.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * largura;
    return Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / w) * (n - 1))));
  };
  const mover = (ev) => {
    if (ev.clientX !== undefined) atual = indice(ev);
    mira.setAttribute("x1", x(atual)); mira.setAttribute("x2", x(atual));
    mira.setAttribute("visibility", "visible");
  };
  area.addEventListener("pointermove", mover);
  area.addEventListener("pointerenter", mover);
  area.addEventListener("pointerleave", () => mira.setAttribute("visibility", "hidden"));
  dica(area, () => conteudoDica(dicaRotulos[atual], series.map((se) => ({ valor: formato(se.valores[atual]), nome: se.nome, cor: se.cor }))));
  legenda(container, series, "traco");
}

// ---------- colunas simples (ex.: minutos por jogo) ----------
// itens: [{valor, cor, rotulo, dica}]; rotulosX: índice -> texto (opcional)
export function colunas(container, itens, { altura = 200, max, rotuloX } = {}) {
  const m = { t: 10, r: 8, b: 26, l: 32 };
  const { s, largura } = novoSvg(container, altura, itens.length
    ? `${itens.length} colunas, média ${fmtNum(itens.reduce((t, i) => t + (i.valor ?? 0), 0) / itens.length)}, máximo ${fmtNum(Math.max(...itens.map((i) => i.valor ?? 0)))}`
    : "Sem dados");
  const maxV = max ?? Math.max(...itens.map((i) => i.valor), 1);
  const ticks = divisoes(maxV, 3);
  const topo = ticks[ticks.length - 1];
  const h = altura - m.t - m.b, w = largura - m.l - m.r;
  const y = (v) => m.t + h - (v / topo) * h;
  for (const t of ticks) {
    el("line", { x1: m.l, x2: largura - m.r, y1: y(t), y2: y(t), class: t === 0 ? "linha-base" : "linha-grade" }, s);
    texto(s, m.l - 6, y(t) + 4, String(t), { class: "eixo-texto", "text-anchor": "end" });
  }
  const banda = w / Math.max(1, itens.length);
  const barra = Math.max(2, Math.min(24, banda - 2));
  let ultimoRotulo = -Infinity;
  itens.forEach((it, i) => {
    const x0 = m.l + i * banda + (banda - barra) / 2;
    const g = el("g", { class: "marca", tabindex: 0 }, s);
    el("rect", { x: m.l + i * banda, y: m.t, width: banda, height: h, fill: "transparent" }, g);
    if (it.valor > 0) el("path", { d: caminhoColuna(x0, y(it.valor), barra, y(0) - y(it.valor), Math.min(4, barra / 2)), fill: it.cor }, g);
    if (it.dica) dica(g, it.dica);
    const rx = rotuloX?.(i);
    if (rx && m.l + i * banda - ultimoRotulo > 56) {
      texto(s, m.l + i * banda + banda / 2, altura - 8, rx, { class: "eixo-texto", "text-anchor": "middle" });
      ultimoRotulo = m.l + i * banda;
    }
  });
}

// ---------- mapa de calor ----------
// linhas: [{rotulo, extra}], colunas: [{cor, dica}], valor(li, ci) -> {estado: 'fora'|'banco'|'jogou', minutos}
export function mapaCalor(container, linhasM, colunasM, valor, { celula = 14, larguraRotulo = 150, nivel, dicaCelula } = {}) {
  container.replaceChildren();
  const larguraTotal = larguraRotulo + colunasM.length * (celula + 2) + 60;
  const altura = 14 + linhasM.length * (celula + 2) + 4;
  const s = el("svg", { width: larguraTotal, height: altura, viewBox: `0 0 ${larguraTotal} ${altura}`, role: "img" }, container);
  rotular(s, container, `${linhasM.length} jogadores em ${colunasM.length} jogos`);
  colunasM.forEach((c, ci) => {
    const g = el("g", { class: "marca", tabindex: -1 }, s);
    el("rect", { x: larguraRotulo + ci * (celula + 2), y: 2, width: celula, height: 6, rx: 2, fill: c.cor }, g);
    if (c.dica) dica(g, c.dica);
  });
  linhasM.forEach((l, li) => {
    const y = 14 + li * (celula + 2);
    texto(s, larguraRotulo - 8, y + celula - 3, l.rotulo, { class: "rotulo-cat", "text-anchor": "end" });
    colunasM.forEach((c, ci) => {
      const v = valor(li, ci);
      if (v.estado === "fora") return;
      const x = larguraRotulo + ci * (celula + 2);
      const attrs = v.estado === "banco"
        ? { fill: "none", stroke: "var(--eixo)", "stroke-width": 1, x: x + 0.5, y: y + 0.5, width: celula - 1, height: celula - 1 }
        : { fill: `var(--seq-${nivel(v.minutos)})`, x, y, width: celula, height: celula };
      const r = el("rect", { ...attrs, rx: 3, class: "marca" }, s);
      if (dicaCelula) dica(r, () => dicaCelula(li, ci, v));
    });
    texto(s, larguraRotulo + colunasM.length * (celula + 2) + 6, y + celula - 3, l.extra, { class: "eixo-texto" });
  });
}

// ---------- dispersão (ex.: gols × xG por jogador) ----------
// pontos: [{x, y, rotulo, cor, destaque, dica}]; desenha a diagonal y = x como referência.
export function dispersao(container, pontos, { altura = 320, nomeX = "x", nomeY = "y", diagonal = true } = {}) {
  const m = { t: 14, r: 16, b: 38, l: 40 };
  const { s, largura } = novoSvg(container, altura, `${pontos.length} jogadores; horizontal: ${nomeX}; vertical: ${nomeY}. `
    + pontos.filter((p) => p.destaque).map((p) => `${p.rotulo}: ${fmtNum(p.x)} e ${fmtNum(p.y)}`).join("; "));
  const max = Math.max(1, ...pontos.flatMap((p) => [p.x, p.y]));
  const ticks = divisoes(max);
  const topo = ticks[ticks.length - 1];
  const h = altura - m.t - m.b, w = largura - m.l - m.r;
  const x = (v) => m.l + (v / topo) * w;
  const y = (v) => m.t + h - (v / topo) * h;
  for (const t of ticks) {
    el("line", { x1: m.l, x2: m.l + w, y1: y(t), y2: y(t), class: t === 0 ? "linha-base" : "linha-grade" }, s);
    el("line", { x1: x(t), x2: x(t), y1: m.t, y2: m.t + h, class: t === 0 ? "linha-base" : "linha-grade" }, s);
    texto(s, m.l - 6, y(t) + 4, String(t), { class: "eixo-texto", "text-anchor": "end" });
    texto(s, x(t), m.t + h + 16, String(t), { class: "eixo-texto", "text-anchor": "middle" });
  }
  texto(s, m.l + w, altura - 4, nomeX, { class: "eixo-texto", "text-anchor": "end" });
  texto(s, m.l + 4, m.t + 10, nomeY, { class: "eixo-texto" });
  if (diagonal) el("line", { x1: x(0), y1: y(0), x2: x(topo), y2: y(topo), stroke: "var(--eixo)", "stroke-dasharray": "4 4" }, s);
  const ordenados = pontos.slice().sort((a, b) => (a.destaque ? 1 : 0) - (b.destaque ? 1 : 0));
  for (const p of ordenados) {
    const g = el("g", { class: "marca", tabindex: 0 }, s);
    el("circle", { cx: x(p.x), cy: y(p.y), r: p.destaque ? 6 : 4.5, fill: p.cor, "fill-opacity": p.destaque ? 1 : 0.75,
      stroke: "var(--superficie)", "stroke-width": 1.5 }, g);
    if (p.destaque) texto(s, x(p.x) + 9, y(p.y) + 4, p.rotulo, { class: "rotulo-dado" });
    if (p.dica) dica(g, p.dica);
  }
}

// ---------- barras espelhadas (Flamengo × adversário) ----------
// linhas: [{rotulo, a, b, texto: v => string}]; cada linha é normalizada pelo maior dos dois lados.
export function barrasEspelhadas(container, linhasE, { nomeA = "A", nomeB = "B", corA = "var(--serie-1)", corB = "var(--serie-2)" } = {}) {
  const linha = 34, espessura = 8;
  const { s, largura } = novoSvg(container, linhasE.length * linha + 4, linhasE.map((l) => {
    const fmt = l.texto ?? fmtNum;
    return `${l.rotulo}: ${nomeA} ${l.a == null ? "–" : fmt(l.a)}, ${nomeB} ${l.b == null ? "–" : fmt(l.b)}`;
  }).join("; "));
  const meio = largura / 2, raio = espessura / 2;
  linhasE.forEach((l, i) => {
    const y0 = i * linha;
    const total = Math.max((l.a ?? 0) + (l.b ?? 0), 1e-9);
    const metade = meio - 4;
    const wa = ((l.a ?? 0) / total) * metade, wb = ((l.b ?? 0) / total) * metade;
    const fmt = l.texto ?? ((v) => String(v));
    texto(s, meio, y0 + 12, l.rotulo, { class: "rotulo-cat", "text-anchor": "middle" });
    texto(s, 0, y0 + 12, l.a === null || l.a === undefined ? "–" : fmt(l.a), { class: "rotulo-dado", "font-weight": (l.a ?? 0) > (l.b ?? 0) ? 700 : 400 });
    texto(s, largura, y0 + 12, l.b === null || l.b === undefined ? "–" : fmt(l.b), { class: "rotulo-dado", "text-anchor": "end", "font-weight": (l.b ?? 0) > (l.a ?? 0) ? 700 : 400 });
    el("rect", { x: 0, y: y0 + 18, width: largura, height: espessura, rx: raio, fill: "var(--grade)" }, s);
    if (wa > 0) el("rect", { x: meio - 2 - wa, y: y0 + 18, width: wa, height: espessura, rx: raio, fill: corA }, s);
    if (wb > 0) el("rect", { x: meio + 2, y: y0 + 18, width: wb, height: espessura, rx: raio, fill: corB }, s);
  });
  legenda(container, [{ nome: nomeA, cor: corA }, { nome: nomeB, cor: corB }]);
}

// ---------- mapa do gol (onde as finalizações foram) ----------
// finalizacoes: [{alvo: "Low Left" | "High Centre" | null, resultado: "Goal" | "Saved" | "Missed" | "Blocked" ...}]
// Vista de quem chuta: colunas esquerda/centro/direita, linhas alto/baixo; o que não foi no gol vai abaixo.
export function mapaGol(container, finalizacoes, { cor = "var(--serie-1)" } = {}) {
  const largura = Math.min(360, Math.max(260, container.clientWidth || 320));
  container.replaceChildren();
  const altura = 196;
  const s = el("svg", { width: largura, height: altura, viewBox: `0 0 ${largura} ${altura}`, role: "img" }, container);
  rotular(s, container, `${finalizacoes.length} finalizações, ${finalizacoes.filter((f) => f.resultado === "Goal").length} gols`);
  const gx = 20, gy = 18, gw = largura - 40, gh = 110;
  const col = (a) => (/left/i.test(a) ? 0 : /right/i.test(a) ? 2 : /cent/i.test(a) ? 1 : null);
  const lin = (a) => (/high|top/i.test(a) ? 0 : /low|bottom/i.test(a) ? 1 : null);
  const celulas = Array.from({ length: 6 }, () => ({ total: 0, gols: 0 }));
  const fora = { total: 0, gols: 0 };
  for (const f of finalizacoes) {
    const c = f.alvo ? col(f.alvo) : null, r = f.alvo ? lin(f.alvo) : null;
    const gol = /goal/i.test(f.resultado ?? "");
    const no = c !== null && r !== null && !/missed|blocked|post|bar/i.test(f.resultado ?? "") ? celulas[r * 3 + c] : fora;
    no.total++; if (gol) no.gols++;
  }
  const max = Math.max(1, ...celulas.map((c) => c.total));
  el("rect", { x: gx, y: gy, width: gw, height: gh, fill: "none", stroke: "var(--texto-2)", "stroke-width": 3 }, s);
  el("line", { x1: 0, x2: largura, y1: gy + gh, y2: gy + gh, class: "linha-base" }, s);
  celulas.forEach((c, i) => {
    const cx = gx + (i % 3) * (gw / 3), cy = gy + Math.floor(i / 3) * (gh / 2);
    const g = el("g", { class: "marca", tabindex: 0 }, s);
    el("rect", { x: cx + 3, y: cy + 3, width: gw / 3 - 6, height: gh / 2 - 6, rx: 6, fill: cor,
      "fill-opacity": c.total ? 0.15 + 0.75 * (c.total / max) : 0.04 }, g);
    if (c.total) texto(s, cx + gw / 6, cy + gh / 4 + 5, c.gols ? `${c.total} · ${c.gols} gol${c.gols > 1 ? "s" : ""}` : String(c.total),
      { class: "rotulo-dado", "text-anchor": "middle", "font-weight": 600 });
    const nomes = ["alto à esquerda", "alto no centro", "alto à direita", "baixo à esquerda", "baixo no centro", "baixo à direita"];
    dica(g, () => conteudoDica(`Canto ${nomes[i]}`, [{ valor: c.total, nome: "no alvo" }, { valor: c.gols, nome: "gols" }]));
  });
  texto(s, largura / 2, gy + gh + 30, `${fora.total} finalizações fora do alvo ou bloqueadas`, { class: "eixo-texto", "text-anchor": "middle" });
  texto(s, largura / 2, gy + gh + 48, `Total: ${finalizacoes.length}`, { class: "eixo-texto", "text-anchor": "middle" });
}

// ---------- colunas divergentes (ex.: saldo de xG por jogo) ----------
// itens: [{valor (+/-), cor, marcador: 'V'|'E'|'D', dica}]; marcador aparece abaixo do eixo.
export function colunasDivergentes(container, itens, { altura = 220, rotuloX, formato = (v) => v.toFixed(1) } = {}) {
  const m = { t: 10, r: 8, b: 40, l: 36 };
  const { s, largura } = novoSvg(container, altura,
    `Positivo em ${itens.filter((i) => (i.valor ?? 0) > 0).length} de ${itens.length}; maior ${fmtNum(Math.max(...itens.map((i) => i.valor ?? 0)))}, menor ${fmtNum(Math.min(...itens.map((i) => i.valor ?? 0)))}`);
  const maxAbs = Math.max(0.5, ...itens.map((i) => Math.abs(i.valor ?? 0)));
  const ticks = divisoes(maxAbs, 2);
  const topo = ticks[ticks.length - 1];
  const h = altura - m.t - m.b, w = largura - m.l - m.r;
  const meio = m.t + h / 2;
  const y = (v) => meio - (v / topo) * (h / 2);
  for (const t of ticks) for (const sinal of t === 0 ? [1] : [1, -1]) {
    const v = t * sinal;
    el("line", { x1: m.l, x2: largura - m.r, y1: y(v), y2: y(v), class: v === 0 ? "linha-base" : "linha-grade" }, s);
    texto(s, m.l - 6, y(v) + 4, (v > 0 ? "+" : "") + formato(v).replace(/\.0$/, ""), { class: "eixo-texto", "text-anchor": "end" });
  }
  const banda = w / Math.max(1, itens.length);
  const barra = Math.max(2, Math.min(18, banda - 3));
  let ultimoRotulo = -Infinity;
  itens.forEach((it, i) => {
    const x0 = m.l + i * banda + (banda - barra) / 2;
    const g = el("g", { class: "marca", tabindex: 0 }, s);
    el("rect", { x: m.l + i * banda, y: m.t, width: banda, height: h + 22, fill: "transparent" }, g);
    if (it.valor !== null && it.valor !== undefined) {
      const y1 = Math.min(y(it.valor), meio), alt = Math.max(1, Math.abs(y(it.valor) - meio));
      el("rect", { x: x0, y: y1, width: barra, height: alt, rx: Math.min(3, barra / 2), fill: it.cor }, g);
    }
    if (it.marcador) el("circle", { cx: x0 + barra / 2, cy: m.t + h + 10, r: Math.min(4, barra / 2 + 1),
      class: `ponto-res ${it.marcador}` }, g);
    if (it.dica) dica(g, it.dica);
    const rx = rotuloX?.(i);
    if (rx && m.l + i * banda - ultimoRotulo > 56) {
      texto(s, m.l + i * banda + banda / 2, altura - 4, rx, { class: "eixo-texto", "text-anchor": "middle" });
      ultimoRotulo = m.l + i * banda;
    }
  });
}

// ---------- série com faixa fixa (ex.: nota por jogo, de 5 a 9) ----------
// itens: [{valor|null, cor, dica}]; referencia: linha tracejada (ex.: média).
export function serie(container, itens, { altura = 180, min = 0, max = 10, referencia, rotuloX, formato = (v) => v.toFixed(1) } = {}) {
  const m = { t: 12, r: 12, b: 26, l: 32 };
  const { s, largura } = novoSvg(container, altura, (() => {
    const v = itens.map((it) => it.valor).filter((x) => x != null);
    return v.length ? `${v.length} jogos, média ${formato(v.reduce((t, x) => t + x, 0) / v.length)}, de ${formato(Math.min(...v))} a ${formato(Math.max(...v))}` : "Sem dados";
  })());
  const h = altura - m.t - m.b, w = largura - m.l - m.r;
  const n = itens.length;
  const x = (i) => m.l + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v) => m.t + h - ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * h;
  const passo = (max - min) / 4;
  for (let v = min; v <= max + 1e-9; v += passo) {
    el("line", { x1: m.l, x2: m.l + w, y1: y(v), y2: y(v), class: v === min ? "linha-base" : "linha-grade" }, s);
    texto(s, m.l - 6, y(v) + 4, formato(v).replace(/\.0$/, ""), { class: "eixo-texto", "text-anchor": "end" });
  }
  if (referencia !== null && referencia !== undefined)
    el("line", { x1: m.l, x2: m.l + w, y1: y(referencia), y2: y(referencia), stroke: "var(--texto-2)", "stroke-dasharray": "4 4" }, s);
  let d = "", aberto = false;
  itens.forEach((it, i) => {
    if (it.valor === null || it.valor === undefined) { aberto = false; return; }
    d += `${aberto ? "L" : "M"}${x(i)},${y(it.valor)}`;
    aberto = true;
  });
  el("path", { d, fill: "none", stroke: "var(--eixo)", "stroke-width": 1.5 }, s);
  let ultimoRotulo = -Infinity;
  itens.forEach((it, i) => {
    if (it.valor !== null && it.valor !== undefined) {
      const g = el("g", { class: "marca", tabindex: 0 }, s);
      el("circle", { cx: x(i), cy: y(it.valor), r: 9, fill: "transparent" }, g);
      el("circle", { cx: x(i), cy: y(it.valor), r: 4, fill: it.cor ?? "var(--serie-1)", stroke: "var(--superficie)", "stroke-width": 1.5 }, g);
      if (it.dica) dica(g, it.dica);
    }
    const rx = rotuloX?.(i);
    if (rx && x(i) - ultimoRotulo > 56) { texto(s, x(i), altura - 8, rx, { class: "eixo-texto", "text-anchor": "middle" }); ultimoRotulo = x(i); }
  });
}

// ---------- linha do tempo da partida ----------
// marcas: [{minuto, lado: 'pro'|'contra', tipo: 'chute'|'alvo'|'gol'|'amarelo'|'vermelho'|'sub', dica}]
export function linhaTempo(container, marcas, { duracao = 90 } = {}) {
  const altura = 132;
  const m = { l: 12, r: 12 };
  const { s, largura } = novoSvg(container, altura, `${marcas.filter((k) => k.tipo === "gol").length} gols e ${marcas.length} lances marcados ao longo de ${duracao} minutos`);
  const w = largura - m.l - m.r, meio = 66;
  const fim = Math.max(duracao, ...marcas.map((k) => k.minuto ?? 0));
  const x = (min) => m.l + (Math.min(min, fim) / fim) * w;
  el("line", { x1: m.l, x2: m.l + w, y1: meio, y2: meio, class: "linha-base" }, s);
  for (const t of [0, 15, 30, 45, 60, 75, 90].concat(fim > 95 ? [105, 120] : []).filter((t) => t <= fim)) {
    el("line", { x1: x(t), x2: x(t), y1: meio - 4, y2: meio + 4, class: "linha-base" }, s);
    texto(s, x(t), altura - 2, `${t}'`, { class: "eixo-texto", "text-anchor": "middle" });
  }
  el("rect", { x: x(45), y: 8, width: 0.5, height: altura - 26, fill: "var(--grade)" }, s);
  // Empilha marcas do mesmo lado que caem no mesmo minuto
  const pilha = new Map();
  const ordem = { gol: 0, alvo: 1, chute: 2, vermelho: 3, amarelo: 4, sub: 5 };
  for (const k of marcas.slice().sort((a, b) => (a.minuto - b.minuto) || ordem[a.tipo] - ordem[b.tipo])) {
    const chave = `${k.lado}:${Math.round(x(k.minuto) / 7)}`;
    const nivel = pilha.get(chave) ?? 0;
    pilha.set(chave, nivel + 1);
    const sinal = k.lado === "pro" ? -1 : 1;
    const cy = meio + sinal * (14 + nivel * 10);
    const cx = x(k.minuto);
    const g = el("g", { class: "marca", tabindex: 0 }, s);
    const cor = k.lado === "pro" ? "var(--serie-1)" : "var(--serie-2)";
    if (k.tipo === "gol") {
      el("circle", { cx, cy, r: 6.5, fill: cor, stroke: "var(--superficie)", "stroke-width": 2 }, g);
      el("circle", { cx, cy, r: 9.5, fill: "none", stroke: cor, "stroke-width": 1.5 }, g);
    } else if (k.tipo === "alvo") el("circle", { cx, cy, r: 4, fill: cor }, g);
    else if (k.tipo === "chute") el("circle", { cx, cy, r: 3.5, fill: "none", stroke: cor, "stroke-width": 1.5 }, g);
    else if (k.tipo === "amarelo" || k.tipo === "vermelho")
      el("rect", { x: cx - 3, y: cy - 4.5, width: 6, height: 9, rx: 1, fill: k.tipo === "amarelo" ? "var(--alerta)" : "var(--critico)" }, g);
    else el("path", { d: `M${cx - 4},${cy}h8M${cx + 1},${cy - 3}l3,3l-3,3`, fill: "none", stroke: "var(--texto-2)", "stroke-width": 1.5 }, g);
    if (k.dica) dica(g, k.dica);
  }
}
