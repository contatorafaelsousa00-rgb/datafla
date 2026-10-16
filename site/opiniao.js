// Aba Sua opinião: formulário de elogios, críticas e sugestões (Firestore).
import { $, contar, D } from "./comum.js";

// =====================================================================
// SUA OPINIÃO
// =====================================================================
export const NOME_FONTE = { highlightly: "Highlightly", "api-football": "API-Football" };
export const nomeFonte = () => NOME_FONTE[D.bruto.meta.fonte ?? "api-football"] ?? D.bruto.meta.fonte;

// Firestore do projeto datafla. A chave é a chave pública do app web (feita para ficar no site):
// quem protege os dados são as regras em firestore.rules (só permitem criar; ninguém lê pelo site).
export const URL_OPINIOES = "https://firestore.googleapis.com/v1/projects/datafla/databases/(default)/documents/opinioes"
  + "?key=AIzaSyBK83GdLEgnJPrn7NEtOSV2nTpySaAplYo";
export const ESPERA_REENVIO_MS = 30_000;

export async function gravarOpiniao(dados) {
  const fields = { criado_em: { timestampValue: new Date().toISOString() } };
  for (const [k, v] of Object.entries(dados)) if (v) fields[k] = { stringValue: v };
  const resp = await fetch(URL_OPINIOES, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
}

export function montarOpiniao() {
  const form = $("form-opiniao"), msg = $("op-mensagem"), erro = $("op-erro"), status = $("op-status"), botao = $("op-enviar");
  const contar = () => { $("op-contador").textContent = `${msg.value.length}/2000`; };
  msg.addEventListener("input", () => { contar(); erro.textContent = ""; });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const texto = msg.value.trim();
    if (texto.length < 3) { erro.textContent = "Escreva a sua mensagem antes de enviar."; msg.focus(); return; }
    let ultimo = 0;
    try { ultimo = Number(localStorage.getItem("datafla-opiniao") || 0); } catch {}
    if (Date.now() - ultimo < ESPERA_REENVIO_MS) { status.textContent = "Você acabou de enviar uma mensagem. Espere alguns segundos."; return; }
    if (form.elements.site.value) { form.reset(); contar(); status.textContent = "Mensagem enviada. Obrigado!"; return; } // robô
    botao.disabled = true;
    status.textContent = "Enviando…";
    try {
      await gravarOpiniao({ tipo: form.elements.tipo.value, mensagem: texto, nome: $("op-nome").value.trim(),
        contato: $("op-contato").value.trim(), aba: "opiniao" });
      try { localStorage.setItem("datafla-opiniao", String(Date.now())); } catch {}
      form.reset();
      contar();
      status.textContent = "Mensagem enviada. Obrigado!";
    } catch {
      status.textContent = "Não foi possível enviar agora. Tente de novo em instantes.";
    } finally {
      botao.disabled = false;
    }
  });
}
