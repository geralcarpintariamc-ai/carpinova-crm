// Lógica de cálculo da orçamentação — funções puras, sem dependências do React.

export const MARGEM_PADRAO = 0.30; // margem sobre o preço de venda (30%), com exceções por orçamento
export const DIAS_PRECO_ANTIGO = 30; // fornecedores mudam preços sem aviso: passado este prazo, o preço pede confirmação
export const ESPESSURAS_PAINEL = [8, 10, 12, 16, 19, 22]; // não existe 18 mm
export const CATEGORIAS_CATALOGO = ["Painel", "Ferragem", "Acabamento", "Mão de obra", "Outro"];
export const UNIDADES = ["m²", "ml", "un", "h", "m³", "kg", "vg"];

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Margem sobre o preço de venda: PVP = custo / (1 - margem). Com 30%, o custo é 70% do preço.
export function precoVenda(custo, margem = MARGEM_PADRAO) {
  const m = Math.min(Math.max(num(margem), 0), 0.95);
  return r2(num(custo) / (1 - m));
}

export function estadoPreco(item, hoje = new Date()) {
  if (!item || !item.precoData) return "porConfirmar";
  const dias = Math.floor((hoje - new Date(item.precoData)) / 86400000);
  return dias > DIAS_PRECO_ANTIGO ? "antigo" : "ok";
}

export function diasDesde(iso, hoje = new Date()) {
  if (!iso) return null;
  return Math.floor((hoje - new Date(iso)) / 86400000);
}

// Linha de orçamento: { qtd, custoUnit, desperdicio (0-1), ... } → custo total da linha
export function custoLinha(l) {
  return r2(num(l.qtd) * num(l.custoUnit) * (1 + num(l.desperdicio)));
}

export function totaisOrcamento(linhas = [], { margem = MARGEM_PADRAO, iva = 0.23, autoliquidacao = false, isento = false } = {}) {
  const custo = r2(linhas.reduce((s, l) => s + custoLinha(l), 0));
  const pvpExIva = precoVenda(custo, margem);
  const taxa = autoliquidacao || isento ? 0 : iva;
  const ivaValor = r2(pvpExIva * taxa);
  return { custo, pvpExIva, lucro: r2(pvpExIva - custo), margemReal: pvpExIva ? r2(((pvpExIva - custo) / pvpExIva) * 100) : 0, ivaValor, totalComIva: r2(pvpExIva + ivaValor) };
}

// Linhas sem preço confirmado: o orçamento deve avisar antes de ser enviado.
export function linhasComPrecoDuvidoso(linhas = [], catalogo = []) {
  const porId = new Map(catalogo.map((c) => [c.id, c]));
  return linhas.filter((l) => {
    if (!l.catalogoId) return num(l.custoUnit) <= 0;
    const it = porId.get(l.catalogoId);
    return !it || estadoPreco(it) !== "ok";
  });
}
