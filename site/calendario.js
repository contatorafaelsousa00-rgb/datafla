// Aba Jogos → "Comparar calendário": os jogos que faltam no Brasileirão para dois times, lado a lado.
// Para cada jogo: posição do adversário, mando e a chance de vitória/empate/derrota pelo modelo do simulador
// (Poisson com força de ataque e defesa em casa e fora). Soma os pontos esperados até o fim.
import { $, D, data, estado, h, num, pct, preencher, vazio } from "./comum.js";
import { horaBR } from "./temporada.js";
import { modeloLiga, probabilidades } from "./classificacao.js";
import { exportarImagem } from "./imagem.js";

const escudo = (src) => (src ? h("img", { src, alt: "", width: 18, height: 18, loading: "lazy", class: "escudo-time" }) : null);

function jogosDoTime(modelo, id) {
  const pos = new Map(modelo.atual.map((l, i) => [l.id, i + 1]));
  return modelo.restantes.filter((m) => m.casa_id === id || m.fora_id === id).map((m) => {
    const casa = m.casa_id === id;
    const p = probabilidades(modelo, m);
    const [v, d] = casa ? [p.casa, p.fora] : [p.fora, p.casa];
    const adv = modelo.times.get(casa ? m.fora_id : m.casa_id);
    return { m, casa, adv, posAdv: pos.get(adv.id), v, e: p.empate, d, pontos: 3 * v + p.empate };
  });
}

function barra(j) {
  return h("span", { class: "prob-mini", title: `Vitória ${pct(j.v, 0)} · empate ${pct(j.e, 0)} · derrota ${pct(j.d, 0)}` },
    h("b", { class: "v", style: `flex:${j.v}` }), h("b", { class: "e", style: `flex:${j.e}` }), h("b", { class: "d", style: `flex:${j.d}` }));
}

function coluna(modelo, id, outro) {
  const t = modelo.times.get(id), linha = modelo.atual.find((l) => l.id === id), pos = modelo.atual.indexOf(linha) + 1;
  const js = jogosDoTime(modelo, id);
  const esperados = js.reduce((s, j) => s + j.pontos, 0);
  const posMedia = js.length ? js.reduce((s, j) => s + j.posAdv, 0) / js.length : null;
  const fortes = js.filter((j) => j.posAdv <= 6).length;
  return h("article", { class: "cartao" },
    h("h2", {}, escudo(t.logo), ` ${t.nome}`, h("span", { class: "sutil" }, ` · ${pos}º, ${linha.pontos} pts`)),
    h("div", { class: "mini-kpis" },
      ...[[js.length, "jogos restantes"], [`${js.filter((j) => j.casa).length}/${js.filter((j) => !j.casa).length}`, "em casa / fora"],
        [num(esperados, 1), "pontos esperados"], [num(linha.pontos + esperados, 0), "projeção final"],
        [posMedia ? `${num(posMedia, 1)}º` : "–", "posição média dos rivais"], [fortes, "contra o Top 6"]]
        .map(([v, r]) => h("div", {}, h("b", {}, v), h("span", {}, r)))),
    js.length ? h("ul", { class: "lista-calendario" }, js.map((j) => h("li", { class: j.adv.id === outro ? "confronto-direto" : "" },
      h("span", { class: "sutil cal-data" }, `${j.m.rodada ?? ""}`, h("br"), j.m.status === "PST" ? "adiado" : `${data(j.m.data_utc)} ${horaBR(j.m.data_utc)}`),
      h("span", { class: "cal-adv" }, h("small", { class: "sutil" }, j.casa ? "x " : "@ "), escudo(j.adv.logo), ` ${j.adv.nome}`,
        h("small", { class: "sutil" }, ` ${j.posAdv}º`), j.adv.id === outro ? h("span", { class: "selo-nova" }, "confronto direto") : null),
      h("span", { class: "cal-prob" }, barra(j), h("small", {}, `${pct(j.v, 0)} vitória`))))) : vazio("Sem jogos restantes."));
}

// Dados da imagem para compartilhar (imagem.js)
function dadosImagem(modelo, a, b, resumo) {
  const times = [a, b].map((id) => {
    const t = modelo.times.get(id), linha = modelo.atual.find((l) => l.id === id);
    const js = jogosDoTime(modelo, id), esperados = js.reduce((s, j) => s + j.pontos, 0);
    return { id, nome: t.nome, logo: t.logo, pos: modelo.atual.indexOf(linha) + 1, pontos: linha.pontos, esperados,
      projecao: linha.pontos + esperados, posMedia: js.length ? js.reduce((s, j) => s + j.posAdv, 0) / js.length : null,
      jogos: js.map((j) => ({ rodada: j.m.rodada, data_utc: j.m.data_utc, adiado: j.m.status === "PST", casa: j.casa,
        adv: { nome: j.adv.nome, logo: j.adv.logo }, posAdv: j.posAdv, v: j.v, e: j.e, d: j.d, direto: j.adv.id === (id === a ? b : a) })) };
  });
  const atualizado = new Date(D.bruto.meta.coletado_em ?? D.bruto.meta.gerado_em)
    .toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return { competicao: modelo.competicao, resumo, atualizado, times,
    metodo: "Chances pelo modelo do datafla (gols marcados e sofridos em casa e fora); pontos esperados = 3 × vitória + empate; posição = tabela atual." };
}

export function renderComparar() {
  const caixa = $("comparar-calendario");
  const modelo = modeloLiga();
  if (!modelo) { preencher(caixa, h("article", { class: "cartao" }, vazio("O calendário do Brasileirão chega na próxima coleta."))); return; }
  const ids = modelo.atual.map((l) => l.id);
  // Padrão: Flamengo × o time mais perto dele na tabela
  const posFla = ids.indexOf(modelo.idFla);
  estado.compararA ??= modelo.idFla;
  estado.compararB ??= ids[posFla === 0 ? 1 : posFla - 1];
  const seletor = (chave) => h("select", { "aria-label": "Escolher time", onchange: (e) => { estado[chave] = Number(e.target.value); renderComparar(); } },
    modelo.atual.map((l, i) => h("option", { value: l.id, selected: l.id === estado[chave] || null }, `${i + 1}º ${l.nome}`)));
  const a = estado.compararA, b = estado.compararB;
  const ja = jogosDoTime(modelo, a), jb = jogosDoTime(modelo, b);
  const ea = ja.reduce((s, j) => s + j.pontos, 0), eb = jb.reduce((s, j) => s + j.pontos, 0);
  const la = modelo.atual.find((l) => l.id === a), lb = modelo.atual.find((l) => l.id === b);
  const fa = la.pontos + ea, fb = lb.pontos + eb;
  const resumo = `Nos jogos que faltam, o modelo espera ${num(ea, 1)} pontos para o ${la.nome} e ${num(eb, 1)} para o ${lb.nome}: `
    + (Math.abs(ea - eb) < 0.5 ? "calendários equivalentes. " : `calendário mais fácil para o ${ea > eb ? la.nome : lb.nome} (+${num(Math.abs(ea - eb), 1)}). `)
    + `Projeção: ${la.nome} ~${num(fa, 0)} × ~${num(fb, 0)} ${lb.nome}.`;
  const botao = (modo, rotulo, classe) => h("button", { type: "button", class: classe, onclick: async (e) => {
    const el = e.currentTarget, antes = el.textContent;
    el.disabled = true; el.textContent = "Gerando…";
    try { await exportarImagem(dadosImagem(modelo, a, b, resumo), modo); }
    finally { el.disabled = false; el.textContent = antes; }
  } }, rotulo);
  preencher(caixa,
    h("article", { class: "cartao" },
      h("h2", {}, "Comparar calendário"),
      h("p", { class: "sutil" }, `Jogos que faltam no ${modelo.competicao} para dois times. A chance de cada jogo vem do mesmo modelo do simulador `
        + "(gols marcados e sofridos em casa e fora); pontos esperados = 3 × vitória + empate."),
      h("div", { class: "acoes comparar-seletores" }, seletor("compararA"), h("span", { class: "sutil" }, "×"), seletor("compararB")),
      a !== b ? h("p", { class: "comparar-resumo" },
        `Nos jogos que faltam, o modelo espera ${num(ea, 1)} pontos para o ${la.nome} e ${num(eb, 1)} para o ${lb.nome}: `,
        h("b", {}, Math.abs(ea - eb) < 0.5 ? "calendários equivalentes. " : `calendário mais fácil para o ${ea > eb ? la.nome : lb.nome} (+${num(Math.abs(ea - eb), 1)}). `),
        `Somando à pontuação atual, a projeção é ${la.nome} ~${num(fa, 0)} × ~${num(fb, 0)} ${lb.nome}.`) : null,
      a !== b ? h("div", { class: "acoes comparar-exportar" }, h("span", { class: "sutil" }, "Exportar imagem:"),
        botao("simplificada", "Simplificada", "botao-primario"), botao("detalhada", "Detalhada", "botao-secundario")) : null),
    h("div", { class: "grade-2" }, coluna(modelo, a, b), coluna(modelo, b, a)));
}
