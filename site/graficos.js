// Gráficos em SVG, sem bibliotecas. Cores vêm das variáveis CSS (--s1..--s6, --seq-*).

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

function novoSvg(container, altura) {
  container.replaceChildren();
  const largura = Math.max(280, container.clientWidth || 600);
  const s = el("svg", { width: largura, height: altura, viewBox: `0 0 ${largura} ${altura}`, role: "img" }, container);
  return { s, largura };
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
// itens: [{rotulo, valor, texto, cor, dica: () => nós}]
export function barrasHorizontais(container, itens, { max, larguraRotulo = 120 } = {}) {
  const linha = 30, espessura = 16;
  const { s, largura } = novoSvg(container, itens.length * linha + 4);
  const maxV = max ?? Math.max(...itens.map((i) => i.valor), 1);
  const util = largura - larguraRotulo - 56;
  itens.forEach((it, k) => {
    const y = k * linha;
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
  const { s, largura } = novoSvg(container, altura);
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
  const { s, largura } = novoSvg(container, altura);
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
  const { s, largura } = novoSvg(container, altura);
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
