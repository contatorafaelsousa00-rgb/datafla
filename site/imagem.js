// Imagem para compartilhar do "Comparar calendário" (canvas, PNG). Sempre leva a marca datafla. e o endereço do site.
// Simplificada: os jogos de cada time, casa ou fora e a posição do adversário.
// Detalhada: + data, chance de vitória por jogo, pontos esperados, projeção e o resumo.
import { data, num, pct } from "./comum.js";

const COR = { pagina: "#0E0F11", cartao: "#17191C", cartao2: "#1D2024", borda: "#2C2F34", texto: "#F2F3F5", texto2: "#B0B5BD",
  mudo: "#8A9099", marca: "#FF3341", marcaSuave: "rgba(255, 51, 65, 0.14)", bom: "#1FAE5B", neutro: "#5B6068", barra1: "#5B6068", barra3: "#8A9099" };
const F = { titulo: '"Space Grotesk", Inter, sans-serif', texto: 'Inter, system-ui, sans-serif', numero: '"JetBrains Mono", Consolas, monospace' };
const SITE = "datafla.web.app";
const L = 1080, M = 48, GAP = 24, COL = (L - 2 * M - GAP) / 2;

const carregar = (src) => new Promise((ok) => {
  if (!src) return ok(null);
  const img = new Image();
  img.onload = () => ok(img); img.onerror = () => ok(null);
  img.src = src;
});

function retangulo(c, x, y, w, h, r, cor, borda) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
  if (cor) { c.fillStyle = cor; c.fill(); }
  if (borda) { c.strokeStyle = borda; c.lineWidth = 1; c.stroke(); }
}

function texto(c, t, x, y, { fonte = `400 20px ${F.texto}`, cor = COR.texto, alinhar = "left", max } = {}) {
  c.font = fonte; c.fillStyle = cor; c.textAlign = alinhar; c.textBaseline = "middle";
  let s = String(t);
  if (max && c.measureText(s).width > max) {
    while (s.length > 1 && c.measureText(s + "…").width > max) s = s.slice(0, -1);
    s += "…";
  }
  c.fillText(s, x, y);
  return c.measureText(s).width;
}

function quebrar(c, t, max, fonte) {
  c.font = fonte;
  const linhas = [];
  let atual = "";
  for (const p of t.split(" ")) {
    const teste = atual ? `${atual} ${p}` : p;
    if (c.measureText(teste).width > max && atual) { linhas.push(atual); atual = p; } else atual = teste;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

// logo de barras crescentes (a última vermelha) + "datafla." — o mesmo desenho do topo do site
function marca(c, x, y, tam) {
  const k = tam / 56;
  retangulo(c, x + k, y + k, 54 * k, 54 * k, 12 * k, COR.cartao, COR.borda);
  for (const [bx, by, bh, cor] of [[11, 32, 13, "#5B6068"], [21, 25, 20, "#5B6068"], [31, 18, 27, "#8A9099"], [41, 10, 35, COR.marca]])
    retangulo(c, x + bx * k, y + by * k, 7 * k, bh * k, 2 * k, cor);
  const w = texto(c, "datafla", x + tam + 14, y + tam / 2, { fonte: `700 ${tam * 0.62}px ${F.titulo}` });
  texto(c, ".", x + tam + 14 + w, y + tam / 2, { fonte: `700 ${tam * 0.62}px ${F.titulo}`, cor: COR.marca });
}

function escudo(c, img, x, y, tam) {
  if (img) c.drawImage(img, x, y, tam, tam);
  else retangulo(c, x, y, tam, tam, tam / 2, COR.cartao2);
}

const rodadaCurta = (r) => (r ? String(r).replace(/^Rodada\s*/i, "R") : "");

/**
 * dados = { competicao, resumo, metodo, atualizado, times: [{ id, nome, logo, pos, pontos, esperados, projecao, posMedia, fortes,
 *   jogos: [{ rodada, data_utc, adiado, casa, adv: { nome, logo }, posAdv, v, e, d, direto }] }] }
 */
export async function gerarImagem(dados, modo) {
  const det = modo === "detalhada";
  await Promise.all([`700 40px ${F.titulo}`, `600 20px ${F.texto}`, `400 20px ${F.texto}`, `500 20px ${F.numero}`]
    .map((f) => document.fonts?.load(f).catch(() => null)));
  const logos = new Map();
  for (const t of dados.times) {
    logos.set(t.logo, await carregar(t.logo));
    for (const j of t.jogos) if (!logos.has(j.adv.logo)) logos.set(j.adv.logo, await carregar(j.adv.logo));
  }

  // medidas
  const ALT_LINHA = det ? 76 : 56;
  const medidor = document.createElement("canvas").getContext("2d");
  const resumo = det && dados.resumo ? quebrar(medidor, dados.resumo, L - 2 * M, `400 21px ${F.texto}`) : [];
  const nJogos = Math.max(...dados.times.map((t) => t.jogos.length), 1);
  const topo = 150, cabecalhoCol = det ? 232 : 96;
  const altResumo = resumo.length ? resumo.length * 30 + 24 : 0;
  const altCol = cabecalhoCol + nJogos * ALT_LINHA + 20;
  const rodape = det ? 110 : 84;
  const A = topo + altResumo + altCol + rodape;

  const tela = document.createElement("canvas");
  const esc = 2;
  tela.width = L * esc; tela.height = A * esc;
  const c = tela.getContext("2d");
  c.scale(esc, esc);
  c.fillStyle = COR.pagina; c.fillRect(0, 0, L, A);
  c.fillStyle = COR.marca; c.fillRect(0, 0, L, 6);

  // topo: marca à esquerda, título à direita
  marca(c, M, 40, 64);
  texto(c, `Jogos que faltam · ${dados.competicao}`, L - M, 58, { fonte: `600 26px ${F.titulo}`, alinhar: "right" });
  texto(c, `${dados.times[0].nome} × ${dados.times[1].nome}`, L - M, 92, { fonte: `400 21px ${F.texto}`, cor: COR.texto2, alinhar: "right" });

  let y = topo;
  resumo.forEach((l, i) => texto(c, l, M, y + 12 + i * 30, { fonte: `400 21px ${F.texto}`, cor: COR.texto2 }));
  y += altResumo;

  dados.times.forEach((t, k) => {
    const x = M + k * (COL + GAP);
    retangulo(c, x, y, COL, altCol, 16, COR.cartao, COR.borda);
    escudo(c, logos.get(t.logo), x + 22, y + 24, 44);
    texto(c, t.nome, x + 78, y + 38, { fonte: `700 27px ${F.titulo}`, max: COL - 100 });
    texto(c, `${t.pos}º · ${t.pontos} pontos · ${t.jogos.length} jogos`, x + 78, y + 68, { fonte: `400 18px ${F.texto}`, cor: COR.mudo });
    if (det) {
      const kpis = [[num(t.esperados, 1), "pontos esperados"], [`~${num(t.projecao, 0)}`, "projeção final"],
        [`${t.jogos.filter((j) => j.casa).length}/${t.jogos.filter((j) => !j.casa).length}`, "casa / fora"],
        [t.posMedia ? `${num(t.posMedia, 1)}º` : "–", "posição média dos rivais"]];
      const kw = (COL - 44 - 12) / 2;
      kpis.forEach(([v, r], i) => {
        const kx = x + 22 + (i % 2) * (kw + 12), ky = y + 96 + Math.floor(i / 2) * 64;
        retangulo(c, kx, ky, kw, 56, 10, COR.cartao2);
        texto(c, v, kx + 14, ky + 20, { fonte: `600 21px ${F.texto}` });
        texto(c, r, kx + 14, ky + 42, { fonte: `400 14px ${F.texto}`, cor: COR.mudo, max: kw - 28 });
      });
    }
    let ly = y + cabecalhoCol;
    for (const j of t.jogos) {
      if (j.direto) retangulo(c, x + 10, ly + 2, COL - 20, ALT_LINHA - 4, 10, COR.marcaSuave);
      const meio = det ? ly + 26 : ly + ALT_LINHA / 2;
      texto(c, rodadaCurta(j.rodada), x + 22, meio, { fonte: `500 16px ${F.numero}`, cor: COR.mudo });
      // casa ou fora
      const bx = x + 70;
      if (j.casa) retangulo(c, bx, meio - 13, 64, 26, 13, COR.marca);
      else retangulo(c, bx, meio - 13, 64, 26, 13, null, COR.mudo);
      texto(c, j.casa ? "CASA" : "FORA", bx + 32, meio + 1, { fonte: `700 13px ${F.texto}`, cor: j.casa ? "#fff" : COR.texto2, alinhar: "center" });
      escudo(c, logos.get(j.adv.logo), bx + 78, meio - 15, 30);
      const posTxt = j.posAdv ? `${j.posAdv}º` : "";
      texto(c, posTxt, x + COL - 22, meio, { fonte: `500 18px ${F.texto}`, cor: j.posAdv <= 6 ? COR.texto : COR.mudo, alinhar: "right" });
      const tag = det && j.direto ? 132 : 0; // selo "confronto direto" antes da posição
      if (tag) {
        retangulo(c, x + COL - 64 - tag, meio - 12, tag - 8, 24, 12, null, COR.marca);
        texto(c, "confronto direto", x + COL - 64 - tag / 2 - 4, meio + 1, { fonte: `600 12px ${F.texto}`, cor: COR.marca, alinhar: "center" });
      }
      texto(c, j.adv.nome, bx + 118, meio, { fonte: `600 19px ${F.texto}`, max: COL - (bx - x) - 118 - 60 - tag });
      if (det) {
        const y2 = ly + 56;
        texto(c, j.adiado ? "adiado" : data(j.data_utc), x + 22, y2, { fonte: `400 14px ${F.numero}`, cor: COR.mudo });
        const bw = 150, bxx = bx;
        let acc = bxx;
        for (const [v, cor] of [[j.v, COR.bom], [j.e, COR.neutro], [j.d, COR.marca]]) {
          c.save(); c.beginPath(); c.roundRect(bxx, y2 - 4, bw, 8, 4); c.clip();
          c.fillStyle = cor; c.fillRect(acc, y2 - 4, bw * v, 8); c.restore();
          acc += bw * v;
        }
        texto(c, `${pct(j.v, 0)} vitória · ${pct(j.e, 0)} empate`, bxx + bw + 12, y2, { fonte: `400 14px ${F.texto}`, cor: COR.texto2 });
      } else if (j.direto) {
        // no simplificado, o confronto direto aparece só pelo fundo; uma marquinha ajuda
        retangulo(c, x + 10, ly + 8, 4, ALT_LINHA - 16, 2, COR.marca);
      }
      ly += ALT_LINHA;
    }
  });
  y += altCol;

  // rodapé: endereço do site em destaque
  const ry = y + 26;
  if (det) texto(c, dados.metodo, M, ry, { fonte: `400 14px ${F.texto}`, cor: COR.mudo, max: L - 2 * M });
  const fy = det ? ry + 44 : ry + 18;
  c.fillStyle = COR.borda; c.fillRect(M, fy - 22, L - 2 * M, 1);
  const w = texto(c, SITE, M, fy + 8, { fonte: `600 22px ${F.numero}`, cor: COR.marca });
  texto(c, "  painel de dados do Flamengo", M + w, fy + 8, { fonte: `400 17px ${F.texto}`, cor: COR.mudo });
  texto(c, `CASA = joga em casa · destaque = confronto direto · dados de ${dados.atualizado}`, L - M, fy + 8,
    { fonte: `400 14px ${F.texto}`, cor: COR.mudo, alinhar: "right" });
  return tela;
}

// Gera e entrega: no celular abre o compartilhar (WhatsApp, Instagram...); no computador baixa o PNG
export async function exportarImagem(dados, modo) {
  const tela = await gerarImagem(dados, modo);
  const blob = await new Promise((ok) => tela.toBlob(ok, "image/png"));
  const nome = `datafla-${dados.times.map((t) => t.nome).join("-x-")}-${modo}.png`.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9.-]+/g, "-");
  const arquivo = new File([blob], nome, { type: "image/png" });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [arquivo] })) {
    try { await navigator.share({ files: [arquivo], title: "datafla.", text: SITE }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
