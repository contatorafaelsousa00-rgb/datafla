// Contagem de acessos para a tela de admin: só contadores por dia no Firestore (acessos/<aaaa-mm-dd>),
// sem cookies e sem dado pessoal. "Únicos" = navegadores no dia (marca local no próprio navegador).
// Não conta: localhost e dados fictícios (?demo=1). Aparelhos do dono (marcados ao entrar no admin ou pelo link
// ?eu=1; ?eu=0 desfaz) somam só no contador "dono", à parte, para o admin ver os próprios acessos sem misturar.
// As regras do Firestore só aceitam somar 1 aos contadores conhecidos.
import { DEMO } from "./comum.js";

const URL_COMMIT = "https://firestore.googleapis.com/v1/projects/datafla/databases/(default)/documents:commit"
  + "?key=AIzaSyBK83GdLEgnJPrn7NEtOSV2nTpySaAplYo";
const caminho = (dia) => `projects/datafla/databases/(default)/documents/acessos/${dia}`;
export const ABAS_CONTADAS = ["temporada", "jogos", "jogadores", "elenco", "estilo", "numeros", "classificacao", "opiniao"];

const ler = (chave) => { try { return localStorage.getItem(chave); } catch { return null; } };
const gravar = (chave, valor) => { try { localStorage.setItem(chave, valor); } catch {} };

export const ehAdmin = () => ler("datafla-admin") === "1";
const ativo = () => !DEMO && !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

// Link para marcar (ou desmarcar) este aparelho como do dono, sem login; o parâmetro some da barra de endereço
(function marcarAparelho() {
  const url = new URL(location);
  const eu = url.searchParams.get("eu");
  if (eu === null) return;
  if (eu === "1") gravar("datafla-admin", "1");
  else try { localStorage.removeItem("datafla-admin"); } catch {}
  url.searchParams.delete("eu");
  history.replaceState(null, "", url);
})();
export const hojeBR = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

function origem() {
  let host = "";
  try { host = document.referrer ? new URL(document.referrer).hostname : ""; } catch {}
  if (!host || host === location.hostname) return "direto";
  if (/(^|\.)google\./.test(host)) return "google";
  if (/whatsapp|(^|\.)wa\.me$/.test(host)) return "whatsapp";
  if (/instagram/.test(host)) return "instagram";
  if (/facebook|(^|\.)fb\./.test(host)) return "facebook";
  if (/(^|\.)(x\.com|twitter\.com|t\.co)$/.test(host)) return "x";
  return "outros";
}

function somar(campos) {
  if (!ativo() || !campos.length) return;
  if (ehAdmin()) campos = campos.includes("visitas") ? ["dono"] : []; // acesso do dono: só o contador à parte
  if (!campos.length) return;
  const corpo = { writes: [{ transform: { document: caminho(hojeBR()),
    fieldTransforms: campos.map((c) => ({ fieldPath: c, increment: { integerValue: "1" } })) } }] };
  fetch(URL_COMMIT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), keepalive: true })
    .catch(() => {}); // contagem nunca atrapalha o painel
}

const vistas = new Set(); // cada aba conta uma vez por carregamento da página

export function registrarVisita(aba) {
  const dia = hojeBR();
  const campos = ["visitas", matchMedia("(pointer: coarse)").matches ? "celular" : "computador", `origem_${origem()}`];
  if (ler("datafla-dia") !== dia) { campos.push("unicos"); gravar("datafla-dia", dia); }
  if (ABAS_CONTADAS.includes(aba)) { vistas.add(aba); campos.push(`aba_${aba}`); }
  somar(campos);
}

export function registrarAba(aba) {
  if (vistas.has(aba) || !ABAS_CONTADAS.includes(aba)) return;
  vistas.add(aba);
  somar([`aba_${aba}`]);
}
