// Pré-jogo (tela de um próximo jogo): desfalques, prováveis escalações, árbitro e momento dos times.
// Desfalques são ESTIMATIVA: suspensões e pendurados pela regra de 3 amarelos na competição (a fonte não informa
// suspensões; algumas competições zeram cartões em certas fases) e lesões pelo perfil dos jogadores.
import { bola, D, data, h, num, pct, vazio } from "./comum.js";
import { campinho } from "./graficos.js";
import { abrirJogador, agregarJogadores } from "./jogadores.js";

const POS_ESCALACAO = { G: "Goleiro", D: "Defensor", M: "Meio-campo", F: "Atacante" };

export function desfalques(p) {
  const jogosComp = D.encerrados.filter((x) => x.competicao === p.competicao && x.detalhe).sort((a, b) => a.data_utc.localeCompare(b.data_utc));
  const ultimo = jogosComp.at(-1);
  const cont = new Map();
  for (const x of jogosComp) for (const j of D.jogadoresPorPartida.get(x.id_partida) ?? []) {
    const c = cont.get(j.jogador_id) ?? { id: j.jogador_id, nome: j.jogador, amarelos: 0 };
    c.amarelos += j.amarelos || 0;
    if (x === ultimo) { c.amareloNoUltimo = (j.amarelos || 0) > 0; c.vermelhoNoUltimo = (j.vermelhos || 0) > 0; }
    cont.set(j.jogador_id, c);
  }
  // quem já saiu do clube (perfil com outro clube atual) não entra na conta
  const saiu = new Set((D.bruto.perfis ?? []).filter((x) => x.clube_atual && !/flamengo/i.test(x.clube_atual)).map((x) => x.jogador_id));
  const suspensos = [], pendurados = [];
  for (const c of cont.values()) {
    if (saiu.has(c.id)) continue;
    if (c.vermelhoNoUltimo) suspensos.push({ ...c, motivo: "expulso no último jogo" });
    else if (c.amareloNoUltimo && c.amarelos > 0 && c.amarelos % 3 === 0) suspensos.push({ ...c, motivo: `${c.amarelos}º amarelo` });
    else if (c.amarelos % 3 === 2) pendurados.push({ ...c, motivo: `${c.amarelos} amarelos` });
  }
  const lesionados = (D.bruto.perfis ?? []).filter((x) => x.lesao_atual && /flamengo/i.test(x.clube_atual ?? ""))
    .map((x) => ({ id: x.jogador_id, nome: x.jogador, motivo: x.lesao_atual + (x.lesao_volta ? ` (volta prevista ${data(x.lesao_volta)})` : "") }));
  pendurados.sort((a, b) => a.nome.localeCompare(b.nome));
  return { suspensos, pendurados, lesionados, ultimo };
}

// Provável escalação do Flamengo: a do último jogo, trocando quem está fora por quem mais jogou na mesma posição
function provavelFlamengo(fora) {
  const recentes = D.encerrados.filter((x) => x.detalhe).sort((a, b) => b.data_utc.localeCompare(a.data_utc));
  const base = recentes.find((x) => (D.escalacoesPorPartida.get(x.id_partida) ?? []).some((e) => e.eh_flamengo && e.titular));
  if (!base) return null;
  const xi = (D.escalacoesPorPartida.get(base.id_partida) ?? []).filter((e) => e.eh_flamengo && e.titular);
  const minutos = agregarJogadores(recentes.slice(0, 8));
  const usados = new Set(xi.map((e) => e.jogador_id));
  const trocas = [];
  const linhas = [];
  for (const e of xi) {
    let j = { numero: e.numero, nome: e.jogador, id: e.jogador_id };
    if (fora.has(e.jogador_id)) {
      const sub = minutos.filter((a) => a.posicao === POS_ESCALACAO[e.posicao] && !usados.has(a.id) && !fora.has(a.id))
        .sort((a, b) => b.minutos - a.minutos)[0];
      if (sub) { usados.add(sub.id); trocas.push([e.jogador, sub.jogador]); j = { numero: sub.numero, nome: sub.jogador, id: sub.id, duvida: true }; }
    }
    (linhas[e.linha] ??= []).push({ ...j, ordem: e.ordem });
  }
  return { base, formacao: xi[0]?.formacao, trocas,
    linhas: linhas.filter(Boolean).map((l) => l.sort((a, b) => a.ordem - b.ordem)) };
}

// Provável escalação do adversário: a do último jogo dele
function provavelAdversario(p) {
  const ultimo = (D.bruto.forma_adversario ?? []).filter((c) => c.adversario_id === p.adversario_id)
    .sort((a, b) => b.data_utc.localeCompare(a.data_utc))[0];
  if (!ultimo) return null;
  const xi = (D.escalacoesPorPartida.get(ultimo.id_partida) ?? []).filter((e) => e.time_id === p.adversario_id && e.titular);
  if (!xi.length) return { ultimo, linhas: null };
  const linhas = [];
  for (const e of xi) (linhas[e.linha] ??= []).push({ numero: e.numero, nome: e.jogador, id: e.jogador_id, ordem: e.ordem });
  return { ultimo, formacao: xi[0].formacao, linhas: linhas.filter(Boolean).map((l) => l.sort((a, b) => a.ordem - b.ordem)) };
}

const listaNomes = (itens, vazioTexto) => (itens.length
  ? h("ul", { class: "lista-simples" }, itens.map((x) => h("li", { class: "clicavel", onclick: () => abrirJogador(x.id) },
      h("span", { class: "cresce" }, x.nome), h("span", { class: "sutil" }, x.motivo))))
  : h("p", { class: "sutil" }, vazioTexto));

// Elementos do pré-jogo + função que desenha o campinho depois que eles estão na tela (o desenho mede a largura)
export function secoesPreview(p) {
  const { suspensos, pendurados, lesionados } = desfalques(p);
  const fora = new Set([...suspensos, ...lesionados].map((x) => x.id));
  const fla = provavelFlamengo(fora), adv = provavelAdversario(p);
  const campo = h("div", { class: "grafico" });

  // árbitro, momento, campanha na competição
  const comArbitro = p.arbitro ? D.encerrados.filter((x) => x.arbitro === p.arbitro) : [];
  const cartoes = comArbitro.map((x) => D.stats.get(x.id_partida)?.fla?.amarelos).filter((v) => v != null);
  const ultimos5 = D.encerrados.slice().sort((a, b) => b.data_utc.localeCompare(a.data_utc)).slice(0, 5).reverse();
  const naComp = D.encerrados.filter((x) => x.competicao === p.competicao && x.mando === p.mando);
  const conta = (l, r) => l.filter((x) => x.resultado === r).length;
  const pts = (l) => conta(l, "V") * 3 + conta(l, "E");

  const casaPrimeiro = p.mando !== "Fora";
  const timeFla = fla && { nome: "Flamengo", fla: true, formacao: fla.formacao, linhas: fla.linhas };
  const timeAdv = adv?.linhas && { nome: p.adversario, fla: false, formacao: adv.formacao, linhas: adv.linhas };

  const elementos = [
    h("div", { class: "detalhe-grade" },
      h("div", {}, h("h3", {}, "Desfalques do Flamengo"),
        h("p", { class: "sutil" }, "Estimativa pelos cartões na competição (3 amarelos = suspensão) e pelo perfil dos jogadores."),
        h("h4", {}, "Suspensos"), listaNomes(suspensos, "Nenhum pela conta dos cartões."),
        h("h4", {}, "Lesionados"), listaNomes(lesionados, "Nenhum informado."),
        h("h4", {}, "Pendurados"), listaNomes(pendurados, "Ninguém com 2 amarelos.")),
      h("div", {}, h("h3", {}, "Momento"),
        h("p", {}, h("b", {}, "Flamengo: "), h("span", { class: "forma" }, ultimos5.map((x) => bola(x.resultado))), h("span", { class: "sutil" }, " últimos 5, mais recente à direita")),
        naComp.length ? h("p", {}, h("b", {}, `${p.competicao}, ${p.mando === "Fora" ? "fora de casa" : "em casa"}: `),
          `${conta(naComp, "V")}V ${conta(naComp, "E")}E ${conta(naComp, "D")}D · ${pct(pts(naComp) / (3 * naComp.length), 0)} de aproveitamento`) : null,
        p.arbitro ? h("p", {}, h("b", {}, `Árbitro ${p.arbitro}: `), comArbitro.length
          ? `${comArbitro.length} jogo${comArbitro.length > 1 ? "s" : ""} do Flamengo em 2026 (${conta(comArbitro, "V")}V ${conta(comArbitro, "E")}E ${conta(comArbitro, "D")}D)`
            + (cartoes.length ? ` · ${num(cartoes.reduce((a, b) => a + b, 0) / cartoes.length, 1)} amarelos por jogo para o Flamengo` : "")
          : "primeiro jogo dele com o Flamengo em 2026.") : null)),
    h("div", { class: "bloco" }, h("h3", {}, "Prováveis escalações"),
      h("p", { class: "sutil" }, [
        fla ? `Flamengo: a do último jogo (${data(fla.base.data_utc)}, ${fla.base.adversario})` + (fla.trocas.length
          ? `, trocando ${fla.trocas.map(([s, e]) => `${s} por ${e}`).join(", ")} (círculo tracejado)` : "") : "Flamengo: sem escalação recente",
        adv?.linhas ? `${p.adversario}: a do último jogo (${data(adv.ultimo.data_utc)}, contra ${adv.ultimo.oponente})`
          : `${p.adversario}: escalação do último jogo ainda não baixada`].join(" · ")),
      timeFla && timeAdv ? campo : timeFla ? campo : vazio("Sem escalações para estimar.")),
  ];
  const desenhar = () => {
    if (!timeFla) return;
    const vazioAdv = { nome: p.adversario, fla: false, formacao: "", linhas: [] };
    const [a, b] = casaPrimeiro ? [timeFla, timeAdv ?? vazioAdv] : [timeAdv ?? vazioAdv, timeFla];
    campinho(campo, a, b, { aoClicar: (id, ehFla) => { if (ehFla && id != null) abrirJogador(id); } });
  };
  return { elementos, desenhar };
}
