// Tela de admin (um único usuário): uma tela própria (#admin), com menu lateral e seções.
//   Visão geral  — o que pede atenção agora (coleta atrasada, falha no workflow, opiniões novas, cota) + números-chave
//   Acessos      — visitas do público por dia, abas, origem, dispositivo; comparação com a semana anterior
//   Opiniões     — filtro por tipo/novas, busca, marcar como lida (por mensagem ou todas), apagar
//   Coleta       — situação dos dados, histórico de cada coleta e execuções do workflow
//   Qualidade    — apontamentos da validação, agrupados por regra, com link para o jogo
// Carregada só quando alguém abre a entrada escondida no canto do topo (ou o link #admin).
// Login com a conta Google pelo Firebase Authentication. Esconder a entrada não é a proteção:
// quem protege os dados são as regras do Firestore, que só deixam a conta do dono ler (firestore.rules).
import { $, D, data, dataLonga, ENCERRADO, h, num, pct, preencher } from "./comum.js";
import { horaBR } from "./temporada.js";
import { barrasHorizontais, colunas, conteudoDica } from "./graficos.js";
import { ABAS_CONTADAS, hojeBR } from "./acessos.js";

const SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
const CONFIG = {
  apiKey: "AIzaSyBK83GdLEgnJPrn7NEtOSV2nTpySaAplYo",
  authDomain: "datafla.firebaseapp.com",
  projectId: "datafla",
  appId: "1:922676088917:web:836b40fa801dfcd7a9c4dc",
};
const REPO = "https://github.com/contatorafaelsousa00-rgb/datafla";
const LINKS = [
  ["Rodar a coleta agora (GitHub → Run workflow)", `${REPO}/actions/workflows/atualizar.yml`],
  ["Opiniões no console do Firestore", "https://console.firebase.google.com/project/datafla/firestore/databases/-default-/data/~2Fopinioes"],
  ["Hospedagem (Firebase Hosting)", "https://console.firebase.google.com/project/datafla/hosting/sites"],
  ["Agendamento (cron-job.org)", "https://console.cron-job.org/jobs"],
  ["Repositório no GitHub", REPO],
];
const NOME_ABA = { temporada: "Temporada", jogos: "Jogos", jogadores: "Jogadores", elenco: "Elenco", estilo: "Estilo de jogo",
  numeros: "Números", classificacao: "Classificação", opiniao: "Sua opinião" };
const NOME_ORIGEM = { direto: "Direto / app", google: "Google", whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook", x: "X (Twitter)", outros: "Outros sites" };
const NOME_TIPO = { elogio: "Elogio", critica: "Crítica", sugestao: "Sugestão" };
const PLURAL_TIPO = { elogio: "Elogios", critica: "Críticas", sugestao: "Sugestões" };
const NOME_REGRA = { minutos: "Minutos somados", finalizacoes: "Finalizações (jogadores × time)", substituicoes_vs_eventos: "Substituições × lances",
  escalacao: "Escalação", titulares: "Titulares", gols: "Gols (jogadores × placar)" };
const SECOES = [["geral", "Visão geral"], ["acessos", "Acessos"], ["opinioes", "Opiniões"], ["cadastros", "Cadastros"], ["coleta", "Coleta"], ["qualidade", "Qualidade dos dados"]];

let fb; // SDK do Firebase, carregado na primeira abertura
const st = { secao: "geral", usuario: null, acessos: [], opinioes: [], historico: [], execucoes: null, filtroOp: "todas", busca: "", regra: "",
  cadastros: { lesoes: {}, transmissao: {} }, cadastrosErro: null };

async function carregarSdk() {
  if (fb) return fb;
  const [app, auth, fs] = await Promise.all(["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"].map((m) => import(SDK + m)));
  const aplicativo = app.initializeApp(CONFIG);
  fb = { auth: auth.getAuth(aplicativo), db: fs.getFirestore(aplicativo), A: auth, F: fs };
  return fb;
}

const tela = () => $("tela-admin");
const corpo = () => $("corpo-admin");
const aviso = (titulo, ...texto) => corpo().replaceChildren(h("div", { class: "admin-aviso cartao" }, h("h2", {}, titulo),
  ...texto.map((t) => h("p", { class: "sutil" }, t)), h("div", { class: "acoes" }, botao("← Voltar ao site", voltarAoSite))));
const botao = (texto, onclick, classe = "botao-secundario") => h("button", { type: "button", class: classe, onclick }, texto);

// ---------- abrir / fechar (a rota é o hash: #admin ou #admin/<seção>) ----------
export async function abrirAdmin(secao) {
  if (secao && SECOES.some(([s]) => s === secao)) st.secao = secao;
  tela().hidden = false;
  document.body.classList.add("modo-admin");
  window.scrollTo(0, 0);
  if (st.usuario && fb?.auth.currentUser) return desenhar(); // só trocou de seção
  aviso("Administração", "Carregando…");
  try {
    await carregarSdk();
  } catch {
    aviso("Sem conexão", "Não foi possível carregar o login. Confira a internet e tente de novo.");
    return;
  }
  // Espera o Firebase recuperar a sessão salva (com limite: sem resposta, mostra o login).
  await Promise.race([fb.auth.authStateReady(), new Promise((ok) => setTimeout(ok, 5000))]);
  const usuario = fb.auth.currentUser;
  return usuario ? carregarPainel(usuario) : mostrarLogin();
}

export function fecharAdmin() {
  tela().hidden = true;
  document.body.classList.remove("modo-admin");
}

function voltarAoSite() { history.pushState(null, "", location.pathname + location.search); fecharAdmin(); }
function irPara(secao) { history.replaceState(null, "", `#admin/${secao}`); st.secao = secao; desenhar(); window.scrollTo(0, 0); }

function mostrarLogin(erro) {
  corpo().replaceChildren(h("div", { class: "admin-aviso cartao" },
    h("h2", {}, "Administração"),
    h("p", { class: "sutil" }, "Entre com a conta Google do administrador."),
    erro ? h("p", { class: "erro" }, erro) : null,
    h("div", { class: "acoes" }, botao("Entrar com Google", entrar, "botao-primario"), botao("← Voltar ao site", voltarAoSite))));
}

async function entrar() {
  try {
    await fb.A.signInWithPopup(fb.auth, new fb.A.GoogleAuthProvider());
    await carregarPainel(fb.auth.currentUser);
  } catch (e) {
    const codigo = e?.code ?? "";
    if (codigo === "auth/popup-closed-by-user" || codigo === "auth/cancelled-popup-request") return mostrarLogin();
    if (codigo === "auth/operation-not-allowed" || codigo === "auth/configuration-not-found")
      return mostrarLogin("O login com Google ainda não está ativado no Firebase (Authentication → Método de login → Google).");
    if (codigo === "auth/popup-blocked") return mostrarLogin("O navegador bloqueou a janela de login. Libere pop-ups para este site.");
    mostrarLogin(`Não foi possível entrar (${codigo || e.message}).`);
  }
}

async function sair() {
  await fb.A.signOut(fb.auth);
  st.usuario = null;
  mostrarLogin();
}

// ---------- carga dos dados ----------
async function carregarPainel(usuario) {
  aviso("Administração", "Carregando dados…");
  const { F, db } = fb;
  const [historico, execucoes] = await Promise.all([buscarHistorico(), buscarExecucoes()]);
  let acessos, opinioes;
  try {
    [acessos, opinioes] = await Promise.all([
      F.getDocs(F.collection(db, "acessos")),
      F.getDocs(F.query(F.collection(db, "opinioes"), F.orderBy("criado_em", "desc"), F.limit(300))),
    ]);
  } catch (e) {
    if (e?.code === "permission-denied") {
      await fb.A.signOut(fb.auth);
      return mostrarLogin(`A conta ${usuario.email} não é a de administrador.`);
    }
    return aviso("Erro", `Não foi possível ler os dados (${e?.code ?? e.message}).`);
  }
  try { localStorage.setItem("datafla-admin", "1"); } catch {} // este navegador passa a contar como acesso seu, à parte
  // Cadastros manuais à parte: um erro aqui (ex.: regras ainda não publicadas) não pode derrubar o resto do admin
  try {
    const doc = await F.getDoc(F.doc(db, "manual", "cadastros"));
    const d = doc.exists() ? doc.data() : {};
    st.cadastros = { lesoes: d.lesoes ?? {}, transmissao: d.transmissao ?? {} };
    st.cadastrosErro = null;
  } catch (e) { st.cadastrosErro = e?.code ?? e.message; }
  Object.assign(st, {
    usuario, historico, execucoes,
    acessos: acessos.docs.map((d) => ({ dia: d.id, ...d.data() })),
    opinioes: opinioes.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() })),
  });
  desenhar();
}

// ---------- opiniões lidas (guardado neste navegador; o admin é um só) ----------
// Versões antigas marcavam "visto" a cada abertura: o que chegou antes disso conta como lido.
const lerJSON = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
const lidas = new Set(lerJSON("datafla-admin-lidas", []));
const vistoAntigo = Number(lerJSON("datafla-admin-visto", 0)) || 0;
const quando = (o) => o.criado_em?.toDate?.() ?? null;
const ehNova = (o) => !lidas.has(o.id) && (quando(o)?.getTime() ?? 0) > vistoAntigo;
function marcarLidas(ids) {
  for (const id of ids) lidas.add(id);
  try { localStorage.setItem("datafla-admin-lidas", JSON.stringify([...lidas])); } catch {}
  desenhar();
}

// ---------- estrutura da tela ----------
function contadores() {
  const novas = st.opinioes.filter(ehNova).length;
  const falhas = (st.execucoes ?? []).filter((r) => r.conclusion && r.conclusion !== "success").length;
  const apontamentos = (D.bruto.validacao?.checagens ?? []).length;
  return { novas, falhas, apontamentos };
}

function desenhar() {
  const c = contadores();
  const selo = { opinioes: c.novas, coleta: c.falhas, qualidade: null };
  const menu = h("nav", { class: "admin-menu", "aria-label": "Seções da administração" },
    SECOES.map(([s, nome]) => h("button", { type: "button", "aria-current": st.secao === s ? "page" : null, onclick: () => irPara(s) },
      h("span", {}, nome), selo[s] ? h("span", { class: "selo-nova" }, selo[s]) : null)));
  const conteudo = { geral: secaoGeral, acessos: secaoAcessos, opinioes: secaoOpinioes, cadastros: secaoCadastros, coleta: secaoColeta, qualidade: secaoQualidade }[st.secao]();
  preencher(corpo(),
    h("div", { class: "admin-cabecalho" },
      h("div", {}, h("h1", {}, "Administração"), h("p", { class: "sutil" }, st.usuario.email)),
      h("div", { class: "acoes" }, botao("Atualizar", () => carregarPainel(st.usuario)), botao("Sair", sair), botao("← Voltar ao site", voltarAoSite, "botao-primario"))),
    h("div", { class: "admin-layout" }, menu, h("div", { class: "admin-conteudo" }, conteudo.elementos)));
  conteudo.desenhar?.();
}

// ---------- visão geral ----------
function ultimosDias(n, fim = 0) {
  const dias = [];
  const base = new Date(`${hojeBR()}T12:00:00Z`);
  for (let i = n - 1 + fim; i >= fim; i--) dias.push(new Date(base - i * 864e5).toISOString().slice(0, 10));
  return dias;
}
const somaCampo = (lista, campo) => lista.reduce((t, d) => t + (d[campo] ?? 0), 0);
const periodo = (n, fim = 0) => { const porDia = new Map(st.acessos.map((d) => [d.dia, d])); return ultimosDias(n, fim).map((dia) => porDia.get(dia) ?? {}); };
const variacao = (atual, antes) => (antes ? `${atual >= antes ? "+" : ""}${pct((atual - antes) / antes, 0)} vs 7 dias anteriores` : "sem base de comparação");

function situacaoColeta() {
  const b = D.bruto;
  const coletado = new Date(b.meta.coletado_em ?? b.meta.gerado_em);
  const horas = (Date.now() - coletado) / 36e5;
  const encerrados = (b.calendario ?? []).filter((j) => ENCERRADO.has(j.status));
  const baixados = new Set(b.partidas.map((p) => p.id_partida));
  const pendentes = encerrados.filter((j) => !baixados.has(j.id_partida) && j.status !== "WO");
  const proximo = (b.calendario ?? []).filter((j) => !ENCERRADO.has(j.status) && j.data_utc > new Date().toISOString())
    .sort((x, y) => x.data_utc.localeCompare(y.data_utc))[0];
  const posJogo = proximo ? new Date(new Date(proximo.data_utc).getTime() + 130 * 60e3) : null; // início + 2h10
  const ultimaExec = (st.execucoes ?? [])[0];
  const cota = st.historico.find((a) => a.cota_restante != null)?.cota_restante;
  return { coletado, horas, encerrados, baixados, pendentes, proximo, posJogo, ultimaExec, cota };
}

const cartaoStatus = (nivel, rotulo, valor, extra, secao) => h("button", { type: "button", class: `admin-status ${nivel}`, onclick: secao ? () => irPara(secao) : null },
  h("span", { class: "rotulo" }, rotulo), h("b", {}, valor), h("span", { class: "sutil" }, extra));

function secaoGeral() {
  const s = situacaoColeta();
  const c = contadores();
  const v7 = somaCampo(periodo(7), "visitas"), v7a = somaCampo(periodo(7, 7), "visitas");
  const resultadoExec = (r) => (!r ? "sem dados do GitHub" : r.status !== "completed" ? "em andamento"
    : r.conclusion !== "success" ? `falhou (${r.conclusion})` : "ok");
  // pendências: o que pede ação, do mais grave para o menos
  const pend = [];
  if (s.horas > 30) pend.push(["erro", `A última coleta foi há ${num(s.horas, 0)} h (o normal é até 24 h).`, "coleta"]);
  if (c.falhas) pend.push(["erro", `${c.falhas} execução${c.falhas > 1 ? "ões" : ""} do workflow com falha nas últimas 20.`, "coleta"]);
  if (s.pendentes.length) pend.push(["alerta", `${s.pendentes.length} jogo(s) encerrado(s) ainda sem detalhes: ${s.pendentes.slice(0, 3).map((j) => j.adversario).join(", ")}.`, "coleta"]);
  if (s.cota != null && s.cota < 15) pend.push(["alerta", `Cota da Highlightly baixa na última coleta: restavam ${s.cota} de 100.`, "coleta"]);
  if (c.novas) pend.push(["info", `${c.novas} opinião(ões) nova(s) para ler.`, "opinioes"]);
  const erros = (D.bruto.validacao?.checagens ?? []).filter((x) => x.status === "erro").length;
  if (erros) pend.push(["info", `${erros} apontamento(s) de erro na validação dos dados (limitações da fonte, em geral).`, "qualidade"]);

  return { elementos: [
    h("div", { class: "admin-grade-status" },
      cartaoStatus(s.horas > 30 ? "erro" : "ok", "Última coleta", `há ${s.horas < 1 ? "menos de 1 h" : `${num(s.horas, 0)} h`}`,
        `${dataLonga(s.coletado.toISOString())} · ${horaBR(s.coletado.toISOString())}`, "coleta"),
      cartaoStatus(c.falhas ? "alerta" : "ok", "Workflow", `última: ${resultadoExec(s.ultimaExec)}`,
        (s.ultimaExec ? quandoBR(s.ultimaExec.created_at) : "") + (c.falhas ? ` · ${c.falhas} falha${c.falhas > 1 ? "s" : ""} nas últimas 20` : ""), "coleta"),
      cartaoStatus("neutro", "Próxima coleta pós-jogo", s.posJogo ? `${data(s.posJogo.toISOString())} · ${horaBR(s.posJogo.toISOString())}` : "–",
        s.proximo ? `${s.proximo.adversario} (início + 2h10)` : "sem jogo marcado", "coleta"),
      cartaoStatus(c.novas ? "alerta" : "ok", "Opiniões novas", num(c.novas), `${st.opinioes.length} no total`, "opinioes"),
      cartaoStatus("neutro", "Visitas em 7 dias", num(v7), variacao(v7, v7a), "acessos"),
      cartaoStatus(s.cota != null && s.cota < 15 ? "alerta" : "neutro", "Cota da API (última coleta)", s.cota != null ? `${s.cota} restantes` : "–", "de 100 por dia", "coleta")),
    h("article", { class: "cartao" }, h("h2", {}, "Pendências"),
      pend.length
        ? h("ul", { class: "admin-pendencias" }, pend.map(([nivel, texto, secao]) => h("li", { class: nivel },
            h("span", { class: "cresce" }, texto), botao("Ver", () => irPara(secao), "botao-texto"))))
        : h("p", { class: "sutil" }, "Nada pendente: coleta em dia, workflow sem falhas e nenhuma opinião nova.")),
    h("div", { class: "grade-2" },
      h("article", { class: "cartao" }, h("h2", {}, "Últimas opiniões"),
        st.opinioes.length ? listaOpinioes(st.opinioes.slice(0, 3), false) : h("p", { class: "vazio" }, "Nenhuma mensagem ainda.")),
      h("article", { class: "cartao" }, h("h2", {}, "Atalhos"),
        h("ul", { class: "lista-simples" }, LINKS.map(([t, url]) => h("li", {}, h("a", { href: url, target: "_blank", rel: "noopener" }, t + " ↗")))))),
  ] };
}

// ---------- acessos ----------
function secaoAcessos() {
  const kpi = (rotulo, lista, extra) => h("div", { class: "kpi" }, h("div", { class: "rotulo" }, rotulo),
    h("div", { class: "valor" }, num(somaCampo(lista, "visitas"))),
    h("div", { class: "extra" }, extra ?? `${num(somaCampo(lista, "unicos"))} visitantes únicos`));
  const reais = st.acessos.filter((d) => d.dia >= "2026-01-01");
  const v7 = somaCampo(periodo(7), "visitas"), v7a = somaCampo(periodo(7, 7), "visitas");
  return {
    elementos: [
      h("div", { class: "kpis" }, kpi("Hoje", periodo(1)), kpi("7 dias", periodo(7), variacao(v7, v7a)), kpi("30 dias", periodo(30)), kpi("Desde o início", reais),
        h("div", { class: "kpi" }, h("div", { class: "rotulo" }, "Seus acessos (30 dias)"), h("div", { class: "valor" }, num(somaCampo(periodo(30), "dono"))),
          h("div", { class: "extra" }, `hoje ${num(somaCampo(periodo(1), "dono"))} · fora dos números ao lado`))),
      h("article", { class: "cartao" }, h("h2", {}, "Visitas por dia"), h("p", { class: "sutil" }, "Últimos 30 dias, só do público (sem os seus acessos)."),
        h("div", { id: "adm-dias" })),
      h("div", { class: "grade-2" },
        h("article", { class: "cartao" }, h("h2", {}, "Abas mais vistas"), h("p", { class: "sutil" }, "Últimos 30 dias; cada aba conta uma vez por visita."), h("div", { id: "adm-abas" })),
        h("article", { class: "cartao" }, h("h2", {}, "De onde vêm"), h("p", { class: "sutil" }, "Últimos 30 dias. Links abertos no WhatsApp costumam aparecer como diretos."), h("div", { id: "adm-origem" }))),
      h("article", { class: "cartao" }, h("h2", {}, "Dispositivo"), h("div", { id: "adm-dispositivo" })),
      h("p", { class: "sutil" }, "Seus aparelhos não entram nos números do público: este navegador já está marcado. Para marcar o celular ou outro navegador, "
        + "abra uma vez nele datafla.web.app/?eu=1 (?eu=0 desfaz). Acessos de antes da marcação não têm como ser separados."),
    ],
    desenhar: () => {
      const dias = ultimosDias(30), lista = periodo(30);
      colunas($("adm-dias"), dias.map((dia, i) => ({
        valor: lista[i].visitas ?? 0, cor: "var(--serie-1)",
        dica: () => conteudoDica(dataLonga(`${dia}T12:00:00Z`), [{ valor: num(lista[i].visitas ?? 0), nome: "visitas" }, { valor: num(lista[i].unicos ?? 0), nome: "únicos" }]),
      })), { rotuloX: (i) => (i % 5 === 0 || i === dias.length - 1 ? dias[i].slice(8) + "/" + dias[i].slice(5, 7) : null) });
      const barras = (id, pares) => {
        const total = pares.reduce((t, [, v]) => t + v, 0);
        if (!total) { $(id).replaceChildren(h("p", { class: "vazio" }, "Nenhum acesso registrado ainda.")); return; }
        barrasHorizontais($(id), pares.sort((a, b) => b[1] - a[1]).map(([rotulo, v]) => ({
          rotulo, valor: v, cor: "var(--serie-1)", texto: `${num(v)} · ${pct(v / total, 0)}` })), { larguraRotulo: 120 });
      };
      barras("adm-abas", ABAS_CONTADAS.map((a) => [NOME_ABA[a] ?? a, somaCampo(lista, `aba_${a}`)]));
      barras("adm-origem", Object.keys(NOME_ORIGEM).map((o) => [NOME_ORIGEM[o], somaCampo(lista, `origem_${o}`)]).filter(([, v]) => v));
      barras("adm-dispositivo", [["Celular", somaCampo(lista, "celular")], ["Computador", somaCampo(lista, "computador")]]);
    },
  };
}

// ---------- opiniões ----------
function listaOpinioes(itens, comAcoes = true) {
  return h("ul", { class: "admin-opinioes" }, itens.map((o) => {
    const d = quando(o), nova = ehNova(o);
    return h("li", { class: "admin-opiniao" + (nova ? " nova" : "") },
      h("div", { class: "admin-opiniao-topo" },
        h("span", { class: `tipo-op ${o.tipo}` }, NOME_TIPO[o.tipo] ?? o.tipo),
        h("span", { class: "sutil" }, d ? `${dataLonga(d.toISOString())} · ${horaBR(d.toISOString())}` : ""),
        nova ? h("span", { class: "selo-nova" }, "nova") : null,
        comAcoes ? h("span", { class: "admin-opiniao-acoes" },
          nova ? botao("Marcar como lida", () => marcarLidas([o.id]), "botao-texto") : null,
          o.contato ? botao("Copiar contato", () => navigator.clipboard?.writeText(o.contato), "botao-texto") : null,
          botao("Apagar", async () => {
            if (!confirm("Apagar esta mensagem? Não dá para desfazer.")) return;
            try { await fb.F.deleteDoc(o.ref); st.opinioes = st.opinioes.filter((x) => x.id !== o.id); desenhar(); }
            catch (e) { alert(`Não foi possível apagar (${e?.code ?? e.message}).`); }
          }, "botao-texto perigo")) : null),
      h("p", { class: "admin-opiniao-texto" }, o.mensagem),
      o.nome || o.contato ? h("p", { class: "sutil" }, [o.nome, o.contato].filter(Boolean).join(" · ")) : null);
  }));
}

function secaoOpinioes() {
  const todas = st.opinioes;
  const filtros = [["todas", "Todas", todas.length], ["novas", "Novas", todas.filter(ehNova).length],
    ...Object.keys(NOME_TIPO).map((t) => [t, PLURAL_TIPO[t], todas.filter((o) => o.tipo === t).length])];
  const termo = st.busca.trim().toLowerCase();
  const visiveis = todas.filter((o) => (st.filtroOp === "todas" || (st.filtroOp === "novas" ? ehNova(o) : o.tipo === st.filtroOp))
    && (!termo || [o.mensagem, o.nome, o.contato].some((x) => (x ?? "").toLowerCase().includes(termo))));
  const novasVisiveis = visiveis.filter(ehNova);
  const busca = h("input", { type: "search", class: "busca", placeholder: "Buscar no texto, nome ou contato", value: st.busca,
    oninput: (e) => { st.busca = e.target.value; const pos = e.target.selectionStart; desenhar();
      const campo = document.querySelector(".admin-conteudo .busca"); campo.focus(); campo.setSelectionRange(pos, pos); } });
  return { elementos: [
    h("article", { class: "cartao" },
      h("div", { class: "acoes" },
        h("div", { class: "segmentado" }, filtros.map(([k, nome, n]) => h("button", { type: "button", "aria-pressed": String(st.filtroOp === k),
          onclick: () => { st.filtroOp = k; desenhar(); } }, `${nome} (${n})`))),
        busca,
        novasVisiveis.length ? botao(`Marcar ${novasVisiveis.length} como lida${novasVisiveis.length > 1 ? "s" : ""}`, () => marcarLidas(novasVisiveis.map((o) => o.id))) : null),
      visiveis.length ? listaOpinioes(visiveis) : h("p", { class: "vazio" }, todas.length ? "Nenhuma mensagem neste filtro." : "Nenhuma mensagem ainda.")),
  ] };
}

// ---------- coleta ----------
// Histórico gravado pela coleta (data/<ano>/atualizacoes.json, publicado em dados/atualizacoes-<ano>.json)
// e as execuções do workflow pela API pública do GitHub (o repositório é público; 60 consultas/hora por IP).
const URL_EXECUCOES = "https://api.github.com/repos/contatorafaelsousa00-rgb/datafla/actions/workflows/atualizar.yml/runs?per_page=20";
const GATILHO = { workflow_dispatch: "disparo externo / manual", schedule: "agenda do GitHub", push: "publicação" };

async function buscarHistorico() {
  try {
    const r = await fetch(`dados/atualizacoes-${D.bruto.meta.temporada}.json`, { cache: "no-store" });
    return r.ok ? (await r.json()).reverse() : [];
  } catch { return []; }
}

async function buscarExecucoes() {
  try {
    const r = await fetch(URL_EXECUCOES);
    return r.ok ? (await r.json()).workflow_runs : null;
  } catch { return null; }
}

const quandoBR = (iso) => `${dataLonga(iso)} · ${horaBR(iso)}`;
const listaJogos = (js) => js.map((j) => j.adversario + (j.data_utc ? ` (${data(j.data_utc)})` : "")).join(", ");

function secaoColeta() {
  const s = situacaoColeta();
  const linha = (rotulo, valor) => h("tr", {}, h("td", {}, rotulo), h("td", { class: "num" }, valor));
  const historico = st.historico;
  const coletas = historico.length
    ? h("table", { class: "tabela admin-tabela" },
        h("thead", {}, h("tr", {}, ["Quando", "Por quê", "Jogos novos", "Recoletados", "Pendentes", "Cota"].map((t) => h("th", {}, t)))),
        h("tbody", {}, historico.slice(0, 30).map((a) => h("tr", { class: a.erro ? "linha-erro" : "" },
          h("td", {}, quandoBR(a.quando), h("div", { class: "sutil" }, a.origem)),
          h("td", {}, a.motivo, a.erro ? h("div", { class: "erro" }, `Erro: ${a.erro}`) : null),
          h("td", {}, a.novos.length ? h("details", {}, h("summary", {}, `${a.novos.length} jogo${a.novos.length > 1 ? "s" : ""}`), listaJogos(a.novos)) : "–"),
          h("td", {}, a.recoletados.length ? h("details", {}, h("summary", {}, `${a.recoletados.length} jogo${a.recoletados.length > 1 ? "s" : ""}`), listaJogos(a.recoletados)) : "–"),
          h("td", { class: "num" }, `${a.pendentes} de ${a.encerrados}`),
          h("td", { class: "num" }, `${a.requisicoes} usadas${a.cota_restante != null ? ` · restam ${a.cota_restante}` : ""}`)))))
    : h("p", { class: "vazio" }, "Nenhuma coleta registrada ainda. A próxima coleta aparece aqui.");

  // Execução que coletou = houve registro no histórico entre o início e o fim dela
  const s19 = (iso) => (iso ?? "").slice(0, 19);
  const coletou = (r) => historico.some((a) => s19(a.quando) >= s19(r.run_started_at) && s19(a.quando) <= s19(r.updated_at));
  const execs = st.execucoes === null
    ? h("p", { class: "vazio" }, "Não foi possível consultar o GitHub agora.")
    : h("table", { class: "tabela admin-tabela" },
        h("thead", {}, h("tr", {}, ["Quando", "Gatilho", "Resultado", ""].map((t) => h("th", {}, t)))),
        h("tbody", {}, st.execucoes.map((r) => {
          const res = r.status !== "completed" ? "em andamento"
            : r.conclusion !== "success" ? `falhou (${r.conclusion})`
            : r.event === "push" ? "publicou" : coletou(r) ? "coletou e publicou" : "nada a coletar";
          return h("tr", { class: r.conclusion && r.conclusion !== "success" ? "linha-erro" : "" },
            h("td", {}, quandoBR(r.created_at)), h("td", {}, GATILHO[r.event] ?? r.event),
            h("td", {}, res), h("td", {}, h("a", { href: r.html_url, target: "_blank", rel: "noopener" }, "detalhes ↗")));
        })));

  return { elementos: [
    h("div", { class: "grade-2" },
      h("article", { class: "cartao" }, h("h2", {}, "Situação"),
        h("table", { class: "tabela admin-situacao" }, h("tbody", {},
          linha("Última coleta", `${quandoBR(s.coletado.toISOString())} (há ${s.horas < 1 ? "menos de 1 h" : `${num(s.horas, 0)} h`})`),
          linha("Jogos encerrados no calendário", num(s.encerrados.length)),
          linha("Com detalhes baixados", num(s.baixados.size)),
          linha("Pendentes", s.pendentes.length ? `${s.pendentes.length} (${s.pendentes.slice(0, 3).map((j) => j.adversario).join(", ")}${s.pendentes.length > 3 ? "…" : ""})` : "nenhum"),
          linha("Próximo jogo", s.proximo ? `${s.proximo.adversario} · ${quandoBR(s.proximo.data_utc)}` : "–"),
          linha("Coleta pós-jogo prevista", s.posJogo ? quandoBR(s.posJogo.toISOString()) : "–"),
          linha("Cota na última coleta", s.cota != null ? `${s.cota} de 100 restantes` : "–"))),
        s.horas > 30 ? h("p", { class: "erro" }, "A última coleta tem mais de 30 h: confira as execuções abaixo.") : null),
      h("article", { class: "cartao" }, h("h2", {}, "Ações"),
        h("p", { class: "sutil" }, "A coleta roda sozinha (cron-job.org a cada 30 min decide se há algo a baixar). Para forçar agora: GitHub → Actions → "
          + "Atualizar dados → Run workflow, marcando \"forçar\"."),
        h("ul", { class: "lista-simples" }, LINKS.map(([t, url]) => h("li", {}, h("a", { href: url, target: "_blank", rel: "noopener" }, t + " ↗")))))),
    h("article", { class: "cartao" }, h("h2", {}, "Coletas"),
      h("p", { class: "sutil" }, "O que cada coleta trouxe: jogos baixados pela primeira vez, jogos baixados de novo (correções da fonte nas primeiras 48 h) e a cota da Highlightly."),
      h("div", { class: "rolagem" }, coletas)),
    h("article", { class: "cartao" }, h("h2", {}, "Execuções recentes do workflow"),
      h("p", { class: "sutil" }, "Cada disparo do agendamento. A maioria termina em \"nada a coletar\": só confere se um jogo acabou."),
      h("div", { class: "rolagem" }, execs)),
  ] };
}

// ---------- cadastros manuais (o que a fonte não traz) ----------
// Documento manual/cadastros no Firestore; o site lê em manual.js. Lesão: some dos desfalques depois da volta prevista.
async function salvarCadastros(botaoEl) {
  const antes = botaoEl?.textContent;
  if (botaoEl) { botaoEl.disabled = true; botaoEl.textContent = "Salvando…"; }
  try {
    await fb.F.setDoc(fb.F.doc(fb.db, "manual", "cadastros"),
      { lesoes: st.cadastros.lesoes, transmissao: st.cadastros.transmissao, atualizado_em: fb.F.serverTimestamp() });
    st.cadastrosErro = null;
    desenhar();
    return true;
  } catch (e) {
    alert(`Não foi possível salvar (${e?.code ?? e.message}).`);
    if (botaoEl) { botaoEl.disabled = false; botaoEl.textContent = antes; }
    return false;
  }
}

function elencoParaCadastro() {
  // quem jogou pelo Flamengo na temporada e não saiu do clube (perfil com outro clube atual), por nome
  const saiu = new Set((D.bruto.perfis ?? []).filter((x) => x.clube_atual && !/flamengo/i.test(x.clube_atual)).map((x) => x.jogador_id));
  const nomes = new Map();
  for (const j of D.bruto.jogadores) if (!saiu.has(j.jogador_id)) nomes.set(j.jogador_id, j.jogador);
  return [...nomes].sort((a, b) => a[1].localeCompare(b[1]));
}

function secaoCadastros() {
  const { lesoes, transmissao } = st.cadastros;
  const hoje = new Date().toISOString().slice(0, 10);
  const elenco = elencoParaCadastro();
  const selJogador = h("select", { "aria-label": "Jogador" }, h("option", { value: "" }, "Jogador…"),
    elenco.map(([id, nome]) => h("option", { value: id }, nome)));
  const motivo = h("input", { type: "text", placeholder: "Lesão (ex.: lesão muscular na coxa)", maxlength: 120, "aria-label": "Lesão" });
  const volta = h("input", { type: "date", "aria-label": "Volta prevista" });
  const listaLesoes = Object.entries(lesoes).sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  const proximos = (D.calendario ?? []).filter((j) => !ENCERRADO.has(j.status) && j.data_utc > new Date().toISOString())
    .sort((a, b) => a.data_utc.localeCompare(b.data_utc)).slice(0, 10);
  const campos = new Map(proximos.map((j) => [j.id_partida, h("input", { type: "text", value: transmissao[j.id_partida] ?? "",
    placeholder: "ex.: Globo, Premiere", maxlength: 80, "aria-label": `Onde passa: ${j.adversario}` })]));
  return { elementos: [
    st.cadastrosErro ? h("p", { class: "erro" }, `Não foi possível ler os cadastros (${st.cadastrosErro}). `
      + "Se for permission-denied, as regras do Firestore com a coleção manual ainda não foram publicadas.") : null,
    h("article", { class: "cartao" }, h("h2", {}, "Lesões"),
      h("p", { class: "sutil" }, "A fonte não informa lesões recentes. O que for cadastrado aqui aparece nos desfalques do pré-jogo e tira o "
        + "jogador da provável escalação, até a volta prevista (sem data: até você remover)."),
      listaLesoes.length ? h("table", { class: "tabela admin-tabela" },
        h("thead", {}, h("tr", {}, ["Jogador", "Lesão", "Volta prevista", ""].map((t) => h("th", {}, t)))),
        h("tbody", {}, listaLesoes.map(([id, l]) => h("tr", { class: l.volta && l.volta < hoje ? "sutil" : "" },
          h("td", {}, l.nome), h("td", {}, l.motivo || "–"),
          h("td", {}, l.volta ? data(l.volta + "T12:00:00Z") + (l.volta < hoje ? " (já passou)" : "") : "sem data"),
          h("td", {}, botao("Remover", (e) => { delete lesoes[id]; salvarCadastros(e.currentTarget); }, "botao-texto perigo"))))))
        : h("p", { class: "vazio" }, "Nenhuma lesão cadastrada."),
      h("div", { class: "acoes admin-form" }, selJogador, motivo, volta,
        botao("Adicionar", async (e) => {
          const id = selJogador.value;
          if (!id) { alert("Escolha o jogador."); return; }
          lesoes[id] = { nome: selJogador.selectedOptions[0].textContent, motivo: motivo.value.trim(), volta: volta.value || null };
          await salvarCadastros(e.currentTarget);
        }, "botao-primario"))),
    h("article", { class: "cartao" }, h("h2", {}, "Onde passa"),
      h("p", { class: "sutil" }, "Transmissão dos próximos jogos (nenhuma fonte grátis tem). Aparece no banner do próximo jogo, na lista de "
        + "próximos jogos e na tela do jogo. Deixe em branco para não mostrar."),
      proximos.length ? h("table", { class: "tabela admin-tabela" },
        h("tbody", {}, proximos.map((j) => h("tr", {},
          h("td", {}, `${data(j.data_utc)} ${horaBR(j.data_utc)}`),
          h("td", {}, j.mando === "Fora" ? `${j.adversario} × Flamengo` : `Flamengo × ${j.adversario}`),
          h("td", {}, campos.get(j.id_partida))))))
        : h("p", { class: "vazio" }, "Nenhum jogo futuro no calendário."),
      proximos.length ? h("div", { class: "acoes" }, botao("Salvar transmissões", (e) => {
        for (const [id, campo] of campos) { const v = campo.value.trim(); if (v) transmissao[id] = v; else delete transmissao[id]; }
        for (const id of Object.keys(transmissao)) if (!campos.has(Number(id))) delete transmissao[id]; // jogos que já passaram
        salvarCadastros(e.currentTarget);
      }, "botao-primario")) : null),
  ] };
}

// ---------- qualidade dos dados ----------
function secaoQualidade() {
  const todos = D.bruto.validacao?.checagens ?? [];
  const porRegra = new Map();
  for (const c of todos) porRegra.set(c.regra, (porRegra.get(c.regra) ?? 0) + 1);
  const lista = todos.filter((c) => !st.regra || c.regra === st.regra).sort((a, b) => b.data_utc.localeCompare(a.data_utc));
  return { elementos: [
    h("article", { class: "cartao" },
      h("h2", {}, "Apontamentos da validação"),
      h("p", { class: "sutil" }, "Checagens de coerência feitas a cada coleta (data/<ano>/validacao/). Quase todos são limitações da fonte "
        + "(acréscimos, box-score incompleto em jogos antigos do Carioca); um apontamento novo num jogo recente merece olhar."),
      h("div", { class: "segmentado admin-regras" },
        h("button", { type: "button", "aria-pressed": String(!st.regra), onclick: () => { st.regra = ""; desenhar(); } }, `Todos (${todos.length})`),
        [...porRegra].sort((a, b) => b[1] - a[1]).map(([r, n]) => h("button", { type: "button", "aria-pressed": String(st.regra === r),
          onclick: () => { st.regra = r; desenhar(); } }, `${NOME_REGRA[r] ?? r} (${n})`))),
      lista.length ? h("div", { class: "rolagem" }, h("table", { class: "tabela admin-tabela" },
        h("thead", {}, h("tr", {}, ["Jogo", "Time", "Regra", "Nível", "Detalhe"].map((t) => h("th", {}, t)))),
        h("tbody", {}, lista.map((c) => h("tr", {},
          h("td", {}, h("a", { href: `?aba=jogos&jogo=${c.id_partida}`, target: "_blank", rel: "noopener" }, `${c.adversario} (${data(c.data_utc)})`),
            h("div", { class: "sutil" }, c.competicao)),
          h("td", {}, c.time ?? "–"), h("td", {}, NOME_REGRA[c.regra] ?? c.regra),
          h("td", {}, h("span", { class: `nivel-${c.status}` }, c.status === "erro" ? "erro" : "alerta")),
          h("td", {}, c.detalhe)))))) : h("p", { class: "vazio" }, "Nenhum apontamento.")),
  ] };
}
