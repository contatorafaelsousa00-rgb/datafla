// Pré-jogo (tela de um próximo jogo): desfalques, prováveis escalações, árbitro e momento dos times.
// Desfalques são ESTIMATIVA: suspensões e pendurados pela regra de 3 amarelos na competição (a fonte não informa
// suspensões; algumas competições zeram cartões em certas fases) e lesões pelo perfil dos jogadores.
import { bola, D, data, h, num, pct, vazio } from "./comum.js";
import { MANUAL } from "./manual.js";
import { campinho } from "./graficos.js";
import { abrirJogador, agregarJogadores } from "./jogadores.js";

const naNo = (comp) => (/^(Libertadores|Copa|Recopa|Supercopa|Taça)/.test(comp) ? `na ${comp}` : `no ${comp}`);
const POS_ESCALACAO = { G: "Goleiro", D: "Defensor", M: "Meio-campo", F: "Atacante" };

// Suspenso num jogo? Pela regra de 3 amarelos ou expulsão no jogo anterior DA MESMA competição.
// Devolve o motivo (texto) ou null.
function motivoSuspensao(idJogador, partida) {
  const daComp = D.encerrados.filter((x) => x.competicao === partida.competicao && x.detalhe && x.data_utc < partida.data_utc)
    .sort((a, b) => a.data_utc.localeCompare(b.data_utc));
  const anterior = daComp.at(-1);
  if (!anterior) return null;
  const j = (D.jogadoresPorPartida.get(anterior.id_partida) ?? []).find((x) => x.jogador_id === idJogador);
  if (!j) return null;
  if (j.vermelhos) return `expulso contra o ${anterior.adversario} (${data(anterior.data_utc)})`;
  if (j.amarelos) {
    const total = daComp.reduce((s, x) => s + ((D.jogadoresPorPartida.get(x.id_partida) ?? []).find((y) => y.jogador_id === idJogador)?.amarelos || 0), 0);
    if (total % 3 === 0) return `${total}º amarelo contra o ${anterior.adversario}`;
  }
  return null;
}

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
  // lesões cadastradas no admin (a fonte não traz as recentes); valem enquanto a volta prevista não passou
  const hoje = new Date().toISOString().slice(0, 10);
  for (const [id, l] of Object.entries(MANUAL.lesoes)) {
    if (lesionados.some((x) => x.id === Number(id)) || (l.volta && l.volta < hoje)) continue;
    lesionados.push({ id: Number(id), nome: l.nome, motivo: (l.motivo || "lesionado") + (l.volta ? ` (volta prevista ${data(l.volta + "T12:00:00Z")})` : "") });
  }
  pendurados.sort((a, b) => a.nome.localeCompare(b.nome));

  // Ausentes: titulares frequentes que não foram relacionados (nem no banco) nos últimos jogos do Flamengo.
  // A fonte não informa lesões recentes (ex.: Arrascaeta); o sumiço da lista de relacionados é o sinal disponível.
  const recentes = D.encerrados.filter((x) => x.detalhe).sort((a, b) => b.data_utc.localeCompare(a.data_utc));
  const ids = recentes.map((x) => new Set((D.jogadoresPorPartida.get(x.id_partida) ?? []).map((j) => j.jogador_id)));
  const jaListados = new Set([...suspensos, ...lesionados].map((x) => x.id));
  const candidatos = agregarJogadores(recentes).filter((a) => a.minutos >= 900 && !saiu.has(a.id) && !jaListados.has(a.id))
    .map((a) => {
      // ausências seguidas desde o jogo mais recente; as explicadas por suspensão não contam
      let seguidos = 0;
      const cumpridas = [];
      for (let i = 0; i < ids.length && !ids[i].has(a.id); i++) {
        const motivo = motivoSuspensao(a.id, recentes[i]);
        if (motivo) cumpridas.push([recentes[i], motivo]); else seguidos++;
      }
      const ultimoJogo = recentes.find((x, i) => ids[i].has(a.id));
      return { id: a.id, nome: a.jogador, seguidos, cumpridas, ultimoJogo };
    });
  const ausentes = candidatos.filter((a) => a.seguidos >= 2).sort((a, b) => b.seguidos - a.seguidos)
    .map((a) => ({ ...a, motivo: `fora dos últimos ${a.seguidos} jogos` + (a.ultimoJogo ? ` (jogou até ${data(a.ultimoJogo.data_utc)})` : "") }));
  // Voltam de suspensão: faltaram por suspensão e não estão suspensos para este jogo
  const suspensosIds = new Set(suspensos.map((x) => x.id));
  const voltam = candidatos.filter((a) => a.cumpridas.length && a.seguidos === 0 && !suspensosIds.has(a.id))
    .map((a) => ({ id: a.id, nome: a.nome, motivo: `cumpriu suspensão (${a.cumpridas.map(([, m]) => m).join("; ")})` }));
  return { suspensos, pendurados, lesionados, ausentes, voltam, ultimo };
}

// Provável escalação do Flamengo: a formação e as vagas do último jogo. Em cada posição (detalhada, do perfil:
// lateral-direito, zagueiro, volante...) entra quem mais jogou NA COMPETIÇÃO deste jogo, fora os desfalques
// (assim um time poupado no último jogo não vira o provável). Quem volta de suspensão retoma a vaga.
function provavelFlamengo(p, fora, voltam = []) {
  const recentes = D.encerrados.filter((x) => x.detalhe).sort((a, b) => b.data_utc.localeCompare(a.data_utc));
  const base = recentes.find((x) => (D.escalacoesPorPartida.get(x.id_partida) ?? []).some((e) => e.eh_flamengo && e.titular));
  if (!base) return null;
  const xi = (D.escalacoesPorPartida.get(base.id_partida) ?? []).filter((e) => e.eh_flamengo && e.titular);
  const posDet = new Map((D.bruto.perfis ?? []).filter((x) => /flamengo/i.test(x.clube_atual ?? "")).map((x) => [x.jogador_id, x.posicao_detalhada]));
  const naComp = agregarJogadores(recentes.filter((x) => x.competicao === p.competicao));
  const minComp = new Map(naComp.map((a) => [a.id, a.minutos]));
  const temporada = agregarJogadores(recentes);
  const minTemp = new Map(temporada.map((a) => [a.id, a.minutos]));
  const numero = new Map(temporada.map((a) => [a.id, a.numero]));
  const vagas = xi.map((e) => ({ numero: e.numero, nome: e.jogador, id: e.jogador_id, ordem: e.ordem, linha: e.linha, posicao: e.posicao }));
  const usados = new Set(vagas.filter((v) => !fora.has(v.id)).map((v) => v.id));
  const trocas = [];
  const trocar = (vaga, novo, motivo, duvida) => {
    trocas.push(motivo ? [vaga.nome, novo.jogador, motivo] : [vaga.nome, novo.jogador]);
    usados.delete(vaga.id); usados.add(novo.id);
    Object.assign(vaga, { id: novo.id, nome: novo.jogador, numero: numero.get(novo.id) ?? novo.numero, duvida });
  };
  // 1) quem volta de suspensão entra no lugar do menos usado da posição dele (se jogou mais que ele na temporada)
  for (const r of voltam) {
    if (usados.has(r.id) || fora.has(r.id)) continue;
    const pos = recentes.map((x) => (D.escalacoesPorPartida.get(x.id_partida) ?? []).find((e) => e.jogador_id === r.id && e.titular)).find(Boolean)?.posicao;
    const sai = vagas.filter((v) => v.posicao === pos).sort((a, b) => (minTemp.get(a.id) ?? 0) - (minTemp.get(b.id) ?? 0))[0];
    if (!sai || (minTemp.get(sai.id) ?? 0) >= (minTemp.get(r.id) ?? 0)) continue;
    trocar(sai, { id: r.id, jogador: r.nome }, "volta de suspensão", false);
  }
  // 2) por posição detalhada: os k mais usados na competição ficam com as k vagas da posição
  const grupos = new Map();
  for (const v of vagas) { const g = posDet.get(v.id); if (g) (grupos.get(g) ?? grupos.set(g, []).get(g)).push(v); }
  for (const [g, vs] of grupos) {
    const top = naComp.filter((a) => posDet.get(a.id) === g && !fora.has(a.id) && a.minutos > 0)
      .sort((a, b) => b.minutos - a.minutos).slice(0, vs.length);
    const ficam = new Set(top.map((a) => a.id));
    const livres = top.filter((a) => !vs.some((v) => v.id === a.id) && !usados.has(a.id));
    for (const v of vs) {
      if (ficam.has(v.id) && !fora.has(v.id)) continue;
      const novo = livres.shift();
      if (!novo) continue;
      if (fora.has(v.id)) trocar(v, novo, null, true);
      else if ((minComp.get(novo.id) ?? 0) > (minComp.get(v.id) ?? 0)) trocar(v, novo, `mais minutos ${naNo(p.competicao)}`, false);
    }
  }
  // 3) desfalque sem substituto da mesma posição detalhada: o mais usado da mesma linha nos últimos 8 jogos
  const recentes8 = agregarJogadores(recentes.slice(0, 8));
  for (const v of vagas) {
    if (!fora.has(v.id)) continue;
    const sub = recentes8.filter((a) => a.posicao === POS_ESCALACAO[v.posicao] && !usados.has(a.id) && !fora.has(a.id))
      .sort((a, b) => b.minutos - a.minutos)[0];
    if (sub) trocar(v, sub, null, true);
  }
  const linhas = [];
  for (const v of vagas) (linhas[v.linha] ??= []).push(v);
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
      h("span", { class: "nome-lista" }, x.nome), h("span", { class: "sutil motivo" }, x.motivo))))
  : h("p", { class: "sutil" }, vazioTexto));

// Elementos do pré-jogo + função que desenha o campinho depois que eles estão na tela (o desenho mede a largura)
export function secoesPreview(p) {
  const { suspensos, pendurados, lesionados, ausentes, voltam } = desfalques(p);
  const fora = new Set([...suspensos, ...lesionados, ...ausentes].map((x) => x.id));
  const penduradosIds = new Set(pendurados.map((x) => x.id));
  const fla = provavelFlamengo(p, fora, voltam), adv = provavelAdversario(p);
  const campo = h("div", { class: "grafico" });

  // árbitro, momento, campanha na competição
  const comArbitro = p.arbitro ? D.encerrados.filter((x) => x.arbitro === p.arbitro) : [];
  const cartoes = comArbitro.map((x) => D.stats.get(x.id_partida)?.fla?.amarelos).filter((v) => v != null);
  const ultimos5 = D.encerrados.slice().sort((a, b) => b.data_utc.localeCompare(a.data_utc)).slice(0, 5).reverse();
  const naComp = D.encerrados.filter((x) => x.competicao === p.competicao && x.mando === p.mando);
  const conta = (l, r) => l.filter((x) => x.resultado === r).length;
  const pts = (l) => conta(l, "V") * 3 + conta(l, "E");

  const casaPrimeiro = p.mando !== "Fora";
  const timeFla = fla && { nome: "Flamengo", fla: true, formacao: fla.formacao,
    linhas: fla.linhas.map((l) => l.map((j) => ({ ...j, pendurado: penduradosIds.has(j.id) }))) };
  const timeAdv = adv?.linhas && { nome: p.adversario, fla: false, formacao: adv.formacao, linhas: adv.linhas };

  const elementos = [
    h("div", { class: "bloco" }, h("h3", {}, "Prováveis escalações"),
      h("p", { class: "sutil" }, [
        fla ? `Flamengo: formação do último jogo (${data(fla.base.data_utc)}, ${fla.base.adversario}), com o mais usado de cada posição ${naNo(p.competicao)}` + (fla.trocas.length
          ? `, trocando ${fla.trocas.map(([s, e, m]) => `${s} por ${e}${m ? ` (${m})` : ""}`).join(", ")}`
            + (fla.trocas.some((t) => !t[2]) ? " (círculo tracejado = substituto provável)" : "") : "")
          + (penduradosIds.size ? "; dois cartões amarelos = pendurado" : "") : "Flamengo: sem escalação recente",
        adv?.linhas ? `${p.adversario}: a do último jogo (${data(adv.ultimo.data_utc)}, contra ${adv.ultimo.oponente})`
          : `${p.adversario}: escalação do último jogo ainda não baixada`].join(" · ")),
      timeFla && timeAdv ? campo : timeFla ? campo : vazio("Sem escalações para estimar.")),
    h("div", { class: "detalhe-grade" },
      h("div", {}, h("h3", {}, "Desfalques do Flamengo"),
        h("p", { class: "sutil" }, "Estimativa pelos cartões na competição (3 amarelos = suspensão), pelo perfil dos jogadores e por quem ficou fora dos últimos jogos."),
        h("h4", {}, "Suspensos"), listaNomes(suspensos, "Nenhum pela conta dos cartões."),
        // lesão informada no perfil + titulares que sumiram dos relacionados (a fonte não traz lesões recentes)
        h("h4", {}, "Lesionados ou fora dos últimos jogos"),
        listaNomes([...lesionados, ...ausentes], "Nenhum titular frequente fora."),
        ausentes.length ? h("p", { class: "sutil" }, "\"Fora dos últimos jogos\" = titular frequente que não foi relacionado (nem no banco), "
          + "descontadas as suspensões. Provável lesão, mas a fonte não confirma o motivo.") : null,
        voltam.length ? [h("h4", {}, "Voltam de suspensão"), listaNomes(voltam, "")] : null),
      h("div", {}, h("h3", {}, "Momento"),
        h("p", {}, h("b", {}, "Flamengo: "), h("span", { class: "forma" }, ultimos5.map((x) => bola(x.resultado))), h("span", { class: "sutil" }, " últimos 5, mais recente à direita")),
        naComp.length ? h("p", {}, h("b", {}, `${p.competicao}, ${p.mando === "Fora" ? "fora de casa" : "em casa"}: `),
          `${conta(naComp, "V")}V ${conta(naComp, "E")}E ${conta(naComp, "D")}D · ${pct(pts(naComp) / (3 * naComp.length), 0)} de aproveitamento`) : null,
        p.arbitro ? h("p", {}, h("b", {}, `Árbitro ${p.arbitro}: `), comArbitro.length
          ? `${comArbitro.length} jogo${comArbitro.length > 1 ? "s" : ""} do Flamengo em 2026 (${conta(comArbitro, "V")}V ${conta(comArbitro, "E")}E ${conta(comArbitro, "D")}D)`
            + (cartoes.length ? ` · ${num(cartoes.reduce((a, b) => a + b, 0) / cartoes.length, 1)} amarelos por jogo para o Flamengo` : "")
          : "primeiro jogo dele com o Flamengo em 2026.") : null)),
  ];
  const desenhar = () => {
    if (!timeFla) return;
    const vazioAdv = { nome: p.adversario, fla: false, formacao: "", linhas: [] };
    const [a, b] = casaPrimeiro ? [timeFla, timeAdv ?? vazioAdv] : [timeAdv ?? vazioAdv, timeFla];
    campinho(campo, a, b, { aoClicar: (id, ehFla) => { if (ehFla && id != null) abrirJogador(id); } });
  };
  // pendurados vão no fim da tela (lista longa)
  const final = h("div", { class: "bloco" }, h("h3", {}, "Pendurados"),
    h("p", { class: "sutil" }, "Com o próximo amarelo na competição, cumprem suspensão (conta de 3 em 3)."),
    listaNomes(pendurados, "Ninguém com 2 amarelos."));
  return { elementos, final, desenhar };
}
