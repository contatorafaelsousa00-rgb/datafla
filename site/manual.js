// Cadastros manuais feitos no admin (o que a fonte não traz): lesões recentes e onde passa cada jogo.
// Ficam num único documento do Firestore, `manual/cadastros`, que qualquer um lê e só o admin grava (firestore.rules).
// O site lê pela API REST com a chave pública do app web (sem carregar o SDK do Firebase na visita).
//   { lesoes: { "<jogador_id>": { nome, motivo, volta: "AAAA-MM-DD" } }, transmissao: { "<id_partida>": "Globo, Premiere" } }
const URL_CADASTROS = "https://firestore.googleapis.com/v1/projects/datafla/databases/(default)/documents/manual/cadastros"
  + "?key=AIzaSyBK83GdLEgnJPrn7NEtOSV2nTpySaAplYo";

export const VAZIO = { lesoes: {}, transmissao: {} };
export let MANUAL = VAZIO;

// Valor no formato da API REST do Firestore ({ stringValue: … }, { mapValue: { fields } }…) → valor JS
export function deFirestore(v) {
  if (!v) return null;
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, deFirestore(x)]));
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(deFirestore);
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("nullValue" in v) return null;
  return v.stringValue ?? v.booleanValue ?? v.timestampValue ?? null;
}

// Sem cadastro, sem rede ou demorando: o site segue sem eles (limite de tempo para não atrasar a 1ª tela)
export async function carregarManual(limiteMs = 2500) {
  try {
    const resp = await Promise.race([fetch(URL_CADASTROS, { cache: "no-cache" }), new Promise((_, nao) => setTimeout(() => nao(new Error("tempo")), limiteMs))]);
    if (!resp.ok) return MANUAL;
    const dados = deFirestore({ mapValue: { fields: (await resp.json()).fields ?? {} } });
    MANUAL = { lesoes: dados.lesoes ?? {}, transmissao: dados.transmissao ?? {} };
  } catch {}
  return MANUAL;
}

export const transmissaoDe = (idPartida) => MANUAL.transmissao[String(idPartida)] || null;
