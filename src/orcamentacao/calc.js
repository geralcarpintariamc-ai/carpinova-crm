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

export const ARREDONDAR_A = 0; // cêntimos exatos: sem arredondamento do preço do artigo

const arredondaCima = (v, passo = ARREDONDAR_A) => (passo > 0 ? Math.ceil(r2(v) / passo - 1e-9) * passo : r2(v));

// Artigos vindos de um mapa de quantidades têm qtd/unidade: as linhas são o custo de UMA unidade.
export const qtdArtigo = (a) => (num(a.qtd) > 0 ? num(a.qtd) : 1);
export const custoUnitArtigo = (a) => r2((a.linhas || []).reduce((s, l) => s + custoLinha(l), 0));

export function custoArtigo(a) {
  return r2(custoUnitArtigo(a) * qtdArtigo(a));
}

// Preço de venda do artigo (ex-IVA): preço fixo, se existir; senão custo/(1-margem) arredondado para cima.
export function precoArtigo(a, margem = MARGEM_PADRAO) {
  if (a.precoFixo !== null && a.precoFixo !== undefined && a.precoFixo !== "" && num(a.precoFixo) > 0) return r2(num(a.precoFixo));
  if (num(a.qtd) > 0) { // artigo de mapa: preço unitário em cêntimos exatos × quantidade, para a conta bater certo no PDF
    const cu = custoUnitArtigo(a);
    return cu > 0 ? r2(arredondaCima(precoVenda(cu, margem)) * qtdArtigo(a)) : 0;
  }
  const c = custoArtigo(a);
  return c > 0 ? arredondaCima(precoVenda(c, margem)) : 0;
}

export function precoUnitArtigo(a, margem = MARGEM_PADRAO) {
  return r2(precoArtigo(a, margem) / qtdArtigo(a));
}

// Orçamentos criados só com "linhas" passam a ter um único artigo.
export function normalizaOrcamento(orc) {
  const base = orc || {};
  let artigos = base.artigos;
  if (!artigos) artigos = base.linhas && base.linhas.length ? [{ id: "a_1", num: "1", descricao: "", linhas: base.linhas, precoFixo: null }] : [];
  return { margem: base.margem != null ? base.margem : MARGEM_PADRAO, artigos, proposta: base.proposta || {} };
}

export function totaisOrcamento(artigos = [], { margem = MARGEM_PADRAO, iva = 0.23, autoliquidacao = false, isento = false } = {}) {
  const custo = r2(artigos.reduce((s, a) => s + custoArtigo(a), 0));
  const pvpExIva = r2(artigos.reduce((s, a) => s + precoArtigo(a, margem), 0));
  const taxa = autoliquidacao || isento ? 0 : iva;
  const ivaValor = r2(pvpExIva * taxa);
  return { custo, pvpExIva, lucro: r2(pvpExIva - custo), margemReal: pvpExIva ? r2(((pvpExIva - custo) / pvpExIva) * 100) : 0, taxaIva: taxa, ivaValor, totalComIva: r2(pvpExIva + ivaValor) };
}

// Linhas sem preço confirmado: o orçamento deve avisar antes de ser enviado.
export function linhasComPrecoDuvidoso(artigos = [], catalogo = []) {
  const porId = new Map(catalogo.map((c) => [c.id, c]));
  return artigos.flatMap((a) => (a.linhas || []).filter((l) => {
    if (!l.catalogoId) return num(l.custoUnit) <= 0;
    const it = porId.get(l.catalogoId);
    return !it || estadoPreco(it) !== "ok";
  }));
}
