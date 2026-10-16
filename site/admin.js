// Tela de admin (um único usuário): acessos, opiniões e situação dos dados.
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
const LINKS = [
  ["Execuções da coleta (GitHub Actions)", "https://github.com/contatorafaelsousa00-rgb/datafla/actions/workflows/atualizar.yml"],
  ["Opiniões no console do Firestore", "https://console.firebase.google.com/project/datafla/firestore/databases/-default-/data/~2Fopinioes"],
  ["Hospedagem (Firebase Hosting)", "https://console.firebase.google.com/project/datafla/hosting/sites"],
  ["Agendamento (cron-job.org)", "https://console.cron-job.org/jobs"],
];
const NOME_ABA = { temporada: "Temporada", jogos: "Jogos", jogadores: "Jogadores", elenco: "Elenco", estilo: "Estilo de jogo",
  classificacao: "Classificação", opiniao: "Sua opinião" };
const NOME_ORIGEM = { direto: "Direto / app", google: "Google", whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook", x: "X (Twitter)", outros: "Outros sites" };
const NOME_TIPO = { elogio: "Elogio", critica: "Crítica", sugestao: "Sugestão" };
const PLURAL_TIPO = { elogio: "elogios", critica: "críticas", sugestao: "sugestões" };

let fb; // SDK do Firebase, carregado na primeira abertura

async function carregarSdk() {
  if (fb) return fb;
  const [app, auth, fs] = await Promise.all(["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"].map((m) => import(SDK + m)));
  const aplicativo = app.initializeApp(CONFIG);
  fb = { auth: auth.getAuth(aplicativo), db: fs.getFirestore(aplicativo), A: auth, F: fs };
  return fb;
}

const corpo = () => $("corpo-admin");
const aviso = (titulo, ...texto) => corpo().replaceChildren(h("div", { class: "admin-aviso" }, h("h2", {}, titulo), ...texto.map((t) => h("p", { class: "sutil" }, t))));
const botao = (texto, onclick, classe = "botao-secundario") => h("button", { type: "button", class: classe, onclick }, texto);

export async function abrirAdmin() {
  const modal = $("modal-admin");
  if (!modal.open) { modal.showModal(); modal.append($("dica")); }
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
  return usuario ? mostrarPainel(usuario) : mostrarLogin();
}

function mostrarLogin(erro) {
  corpo().replaceChildren(h("div", { class: "admin-aviso" },
    h("h2", {}, "Administração"),
    h("p", { class: "sutil" }, "Entre com a conta Google do administrador."),
    erro ? h("p", { class: "erro" }, erro) : null,
    h("div", { class: "acoes" }, botao("Entrar com Google", entrar, "botao-primario"), botao("Fechar", fechar))));
}

async function entrar() {
  try {
    await fb.A.signInWithPopup(fb.auth, new fb.A.GoogleAuthProvider());
    await mostrarPainel(fb.auth.currentUser);
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
  mostrarLogin();
}

function fechar() { $("modal-admin").close(); }

// ---------------------------------------------------------------------
async function mostrarPainel(usuario) {
  aviso("Administração", "Carregando dados…");
  const { F, db } = fb;
  let acessos, opinioes;
  const [historico, execucoes] = await Promise.all([buscarHistorico(), buscarExecucoes()]);
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
  try { localStorage.setItem("datafla-admin", "1"); } catch {} // este navegador deixa de contar acessos

  const visto = Number(localStorage.getItem("datafla-admin-visto") || 0);
  preencher(corpo(),
    h("div", { class: "admin-topo" },
      h("div", {}, h("h2", {}, "Administração"), h("p", { class: "sutil" }, usuario.email)),
      h("div", { class: "acoes" }, botao("Atualizar", () => mostrarPainel(usuario)), botao("Sair", sair), botao("Fechar", fechar))),
    secaoAcessos(acessos.docs.map((d) => ({ dia: d.id, ...d.data() }))),
    secaoOpinioes(opinioes.docs, visto),
    secaoAtualizacoes(historico, execucoes),
    secaoDados(),
  );
  desenharAcessos(acessos.docs.map((d) => ({ dia: d.id, ...d.data() })));
  try { localStorage.setItem("datafla-admin-visto", String(Date.now())); } catch {}
}

// ---------- acessos ----------
function ultimosDias(n) {
  const dias = [];
  const base = new Date(`${hojeBR()}T12:00:00Z`);
  for (let i = n - 1; i >= 0; i--) dias.push(new Date(base - i * 864e5).toISOString().slice(0, 10));
  return dias;
}

function somaCampo(lista, campo) { return lista.reduce((t, d) => t + (d[campo] ?? 0), 0); }

function secaoAcessos(docs) {
  const porDia = new Map(docs.map((d) => [d.dia, d]));
  const periodo = (n) => ultimosDias(n).map((dia) => porDia.get(dia) ?? {});
  const kpi = (rotulo, lista) => h("div", { class: "kpi" }, h("div", { class: "rotulo" }, rotulo),
    h("div", { class: "valor" }, num(somaCampo(lista, "visitas"))),
    h("div", { class: "extra" }, `${num(somaCampo(lista, "unicos"))} visitantes únicos`));
  const reais = docs.filter((d) => d.dia >= "2026-01-01");
  return h("section", { class: "admin-secao" },
    h("h3", { class: "admin-titulo" }, "Acessos"),
    h("div", { class: "kpis" }, kpi("Hoje", periodo(1)), kpi("7 dias", periodo(7)), kpi("30 dias", periodo(30)), kpi("Desde o início", reais)),
    h("article", { class: "cartao" }, h("h2", {}, "Visitas por dia"), h("p", { class: "sutil" }, "Últimos 30 dias. Seus próprios acessos não contam neste navegador."),
      h("div", { id: "adm-dias" })),
    h("div", { class: "grade-2" },
      h("article", { class: "cartao" }, h("h2", {}, "Abas mais vistas"), h("p", { class: "sutil" }, "Últimos 30 dias; cada aba conta uma vez por visita."), h("div", { id: "adm-abas" })),
      h("article", { class: "cartao" }, h("h2", {}, "De onde vêm"), h("p", { class: "sutil" }, "Últimos 30 dias. Links abertos no WhatsApp costumam aparecer como diretos."), h("div", { id: "adm-origem" }))),
    h("article", { class: "cartao" }, h("h2", {}, "Dispositivo"), h("div", { id: "adm-dispositivo" })));
}

function desenharAcessos(docs) {
  const porDia = new Map(docs.map((d) => [d.dia, d]));
  const dias = ultimosDias(30);
  const lista = dias.map((dia) => porDia.get(dia) ?? {});
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
  barras("adm-abas", ABAS_CONTADAS.map((a) => [NOME_ABA[a], somaCampo(lista, `aba_${a}`)]));
  barras("adm-origem", Object.keys(NOME_ORIGEM).map((o) => [NOME_ORIGEM[o], somaCampo(lista, `origem_${o}`)]).filter(([, v]) => v));
  barras("adm-dispositivo", [["Celular", somaCampo(lista, "celular")], ["Computador", somaCampo(lista, "computador")]]);
}

// ---------- opiniões ----------
function secaoOpinioes(docs, visto) {
  const itens = docs.map((d) => ({ ref: d.ref, ...d.data() }));
  const quando = (o) => o.criado_em?.toDate?.() ?? null;
  const novas = itens.filter((o) => (quando(o)?.getTime() ?? 0) > visto).length;
  const contagem = Object.keys(NOME_TIPO).map((t) => `${itens.filter((o) => o.tipo === t).length} ${PLURAL_TIPO[t]}`).join(" · ");
  const lista = h("ul", { class: "admin-opinioes" }, itens.map((o) => {
    const d = quando(o);
    const li = h("li", { class: "admin-opiniao" + ((d?.getTime() ?? 0) > visto ? " nova" : "") },
      h("div", { class: "admin-opiniao-topo" },
        h("span", { class: `tipo-op ${o.tipo}` }, NOME_TIPO[o.tipo] ?? o.tipo),
        h("span", { class: "sutil" }, d ? `${dataLonga(d.toISOString())} · ${horaBR(d.toISOString())}` : ""),
        (d?.getTime() ?? 0) > visto ? h("span", { class: "selo-nova" }, "nova") : null,
        botao("Apagar", async () => {
          if (!confirm("Apagar esta mensagem? Não dá para desfazer.")) return;
          try { await fb.F.deleteDoc(o.ref); li.remove(); } catch (e) { alert(`Não foi possível apagar (${e?.code ?? e.message}).`); }
        }, "botao-texto")),
      h("p", { class: "admin-opiniao-texto" }, o.mensagem),
      o.nome || o.contato ? h("p", { class: "sutil" }, [o.nome, o.contato].filter(Boolean).join(" · ")) : null);
    return li;
  }));
  return h("section", { class: "admin-secao" },
    h("h3", { class: "admin-titulo" }, "Opiniões", novas ? h("span", { class: "selo-nova" }, `${novas} nova${novas > 1 ? "s" : ""}`) : null),
    h("article", { class: "cartao" },
      h("p", { class: "sutil" }, itens.length ? `${itens.length} mensagens: ${contagem}.` : "Nenhuma mensagem ainda."),
      itens.length ? lista : null));
}

// ---------- atualizações ----------
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

function secaoAtualizacoes(historico, execucoes) {
  const coletas = historico.length
    ? h("table", { class: "tabela admin-tabela" },
        h("thead", {}, h("tr", {}, ["Quando", "Por quê", "Jogos novos", "Recoletados", "Pendentes", "Cota"].map((t) => h("th", {}, t)))),
        h("tbody", {}, historico.slice(0, 30).map((a) => h("tr", { class: a.erro ? "linha-erro" : "" },
          h("td", {}, quandoBR(a.quando), h("div", { class: "sutil" }, a.origem)),
          h("td", {}, a.motivo, a.erro ? h("div", { class: "erro" }, `Erro: ${a.erro}`) : null),
          h("td", {}, a.novos.length ? `${a.novos.length}: ${listaJogos(a.novos)}` : "–"),
          h("td", {}, a.recoletados.length ? `${a.recoletados.length}: ${listaJogos(a.recoletados)}` : "–"),
          h("td", { class: "num" }, `${a.pendentes} de ${a.encerrados}`),
          h("td", { class: "num" }, `${a.requisicoes} usadas${a.cota_restante != null ? ` · restam ${a.cota_restante}` : ""}`)))))
    : h("p", { class: "vazio" }, "Nenhuma coleta registrada ainda. A próxima coleta aparece aqui.");

  // Execução que coletou = houve registro no histórico entre o início e o fim dela
  const s19 = (iso) => (iso ?? "").slice(0, 19); // "2026-10-16T00:05:10" (UTC nos dois lados)
  const coletou = (r) => historico.some((a) => s19(a.quando) >= s19(r.run_started_at) && s19(a.quando) <= s19(r.updated_at));
  const execs = execucoes === null
    ? h("p", { class: "vazio" }, "Não foi possível consultar o GitHub agora.")
    : h("table", { class: "tabela admin-tabela" },
        h("thead", {}, h("tr", {}, ["Quando", "Gatilho", "Resultado", ""].map((t) => h("th", {}, t)))),
        h("tbody", {}, execucoes.map((r) => {
          const res = r.status !== "completed" ? "em andamento"
            : r.conclusion !== "success" ? `falhou (${r.conclusion})`
            : r.event === "push" ? "publicou" : coletou(r) ? "coletou e publicou" : "nada a coletar";
          return h("tr", { class: r.conclusion && r.conclusion !== "success" ? "linha-erro" : "" },
            h("td", {}, quandoBR(r.created_at)), h("td", {}, GATILHO[r.event] ?? r.event),
            h("td", {}, res), h("td", {}, h("a", { href: r.html_url, target: "_blank", rel: "noopener" }, "detalhes")));
        })));

  const falhas = (execucoes ?? []).filter((r) => r.conclusion && r.conclusion !== "success").length;
  return h("section", { class: "admin-secao" },
    h("h3", { class: "admin-titulo" }, "Atualizações", falhas ? h("span", { class: "selo-nova" }, `${falhas} falha${falhas > 1 ? "s" : ""}`) : null),
    h("article", { class: "cartao" }, h("h2", {}, "Coletas"),
      h("p", { class: "sutil" }, "O que cada coleta trouxe: jogos baixados pela primeira vez, jogos baixados de novo (correções da fonte nas primeiras 48 h) e a cota da Highlightly."),
      h("div", { class: "rolagem" }, coletas)),
    h("article", { class: "cartao" }, h("h2", {}, "Execuções recentes"),
      h("p", { class: "sutil" }, "Cada disparo do agendamento no GitHub. A maioria termina em \"nada a coletar\": só confere se um jogo acabou."),
      h("div", { class: "rolagem" }, execs)));
}

// ---------- dados ----------
function secaoDados() {
  const b = D.bruto;
  const encerrados = (b.calendario ?? []).filter((j) => ENCERRADO.has(j.status));
  const baixados = new Set(b.partidas.map((p) => p.id_partida));
  const pendentes = encerrados.filter((j) => !baixados.has(j.id_partida));
  const coletado = new Date(b.meta.coletado_em ?? b.meta.gerado_em);
  const horas = (Date.now() - coletado) / 36e5;
  const proximo = b.proximo?.[0];
  const linha = (rotulo, valor) => h("tr", {}, h("td", {}, rotulo), h("td", { class: "num" }, valor));
  return h("section", { class: "admin-secao" },
    h("h3", { class: "admin-titulo" }, "Dados"),
    h("div", { class: "grade-2" },
      h("article", { class: "cartao" }, h("h2", {}, "Situação da coleta"),
        h("table", { class: "tabela" }, h("tbody", {},
          linha("Última coleta", `${dataLonga(coletado.toISOString())} · ${horaBR(coletado.toISOString())} (há ${horas < 1 ? "menos de 1 h" : `${num(horas, 0)} h`})`),
          linha("Jogos encerrados no calendário", num(encerrados.length)),
          linha("Com detalhes baixados", num(baixados.size)),
          linha("Pendentes", pendentes.length ? `${pendentes.length} (${pendentes.slice(0, 3).map((j) => j.adversario).join(", ")}${pendentes.length > 3 ? "…" : ""})` : "nenhum"),
          linha("Próximo jogo", proximo ? `${proximo.adversario} · ${dataLonga(proximo.data_utc)} ${horaBR(proximo.data_utc)}` : "–"),
          linha("Apontamentos da validação", num((b.validacao?.checagens ?? []).length)))),
        horas > 30 ? h("p", { class: "erro" }, "A última coleta tem mais de 30 h: confira as execuções no GitHub.") : null),
      h("article", { class: "cartao" }, h("h2", {}, "Atalhos"),
        h("ul", { class: "lista-simples" }, LINKS.map(([t, url]) => h("li", {}, h("a", { href: url, target: "_blank", rel: "noopener" }, t)))))));
}
