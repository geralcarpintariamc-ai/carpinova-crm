// Regras fixas da proposta. Depois da validade o orçamento tem de ser reavaliado.
export const VALIDADE_DIAS = 8;
export const LIMITE_PAGAMENTO_EM_PRESTACOES = 10000; // ex-IVA: a partir daqui, 40/40/20 (ou 5 × 20%); abaixo, 50/50

export const PAGAMENTO_PRESETS = [
  { key: "50-50", label: "50/50", texto: "50% na adjudicação | 50% na finalização / entrega ao cliente." },
  { key: "40-40-20", label: "40/40/20", texto: "40% na adjudicação | 40% no início da obra / entrega em armazém | 20% na finalização / entrega ao cliente." },
  { key: "20x5", label: "20/20/20/20/20", texto: "20% na adjudicação | 20% no início da obra / entrega em armazém | 20% a meio da obra | 20% na conclusão da produção | 20% na finalização / entrega ao cliente." },
];

export const PROPOSTA_DEFAULTS = {
  pagamento: "auto", // "auto" (pelo valor) | chave de um preset | "custom"
  condicoes: "",     // texto, só usado em "custom"
  prazo: "",
  notas: "Medidas indicativas, a retificar em obra.",
};

export const presetAutomatico = (totalExIva) => (totalExIva >= LIMITE_PAGAMENTO_EM_PRESTACOES ? "40-40-20" : "50-50");

// Texto final das condições de pagamento de uma proposta.
export function condicoesPagamento(proposta, totalExIva) {
  const p = { ...PROPOSTA_DEFAULTS, ...(proposta || {}) };
  if (p.pagamento === "custom") return p.condicoes || "";
  const key = p.pagamento === "auto" ? presetAutomatico(totalExIva) : p.pagamento;
  return (PAGAMENTO_PRESETS.find((x) => x.key === key) || PAGAMENTO_PRESETS[0]).texto;
}
