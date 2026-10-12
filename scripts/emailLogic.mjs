// Lógica pura (sem rede) para decidir que emails interessam e a que obra pertencem.
// Fica separada do sync para se poder testar sem ligar a nenhum servidor.

export const KEYWORDS = /(or[çc]amento|cota[çc][ãa]o|cota[çc][õo]es|pedido de pre[çc]o|pedido de proposta|proposta|consulta de pre[çc]os?|consulta|rfq|carp-?or[çc]?-?\d{4}|CPV-\d{4})/i;
export const REF_RE = /CARP-(?:OR[ÇC]-)?(\d{4})-(\d{1,5})/gi;

export function normRef(r) {
  const m = /CARP-(?:OR[ÇC]-)?(\d{4})-(\d{1,5})/i.exec(r || "");
  return m ? `${m[1]}-${parseInt(m[2], 10)}` : null;
}

export function refsNoTexto(texto) {
  const out = new Set();
  let m;
  const re = new RegExp(REF_RE.source, "gi");
  while ((m = re.exec(texto || ""))) out.add(`${m[1]}-${parseInt(m[2], 10)}`);
  return [...out];
}

export function relevante({ assunto, texto }) {
  const corpo = (texto || "").slice(0, 3000);
  return KEYWORDS.test(assunto || "") || KEYWORDS.test(corpo);
}

// obras: [{id, ref, clienteEmail, estado, projeto}]
export function ligarObra({ assunto, texto, enderecos }, obras) {
  const refs = refsNoTexto(`${assunto}\n${(texto || "").slice(0, 3000)}`);
  if (refs.length) {
    const achadas = obras.filter((o) => refs.includes(normRef(o.ref)));
    if (achadas.length === 1) return { obraId: achadas[0].id, motivo: "referência" };
  }
  const emails = new Set((enderecos || []).map((e) => e.toLowerCase()));
  const porCliente = obras.filter((o) => o.clienteEmail && emails.has(String(o.clienteEmail).toLowerCase().trim()));
  const abertas = porCliente.filter((o) => !["rejeitado_nos", "rejeitado_cliente", "concluido", "rejeitado"].includes(o.estado));
  if (abertas.length === 1) return { obraId: abertas[0].id, motivo: "email do cliente" };
  if (!abertas.length && porCliente.length === 1) return { obraId: porCliente[0].id, motivo: "email do cliente" };
  return { obraId: null, motivo: null };
}
