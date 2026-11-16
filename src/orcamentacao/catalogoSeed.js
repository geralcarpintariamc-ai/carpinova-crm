// Ponto de partida do catálogo, vindo da app antiga carpinova-orcamentos.
// TODOS os preços estão por confirmar (sem data): os fornecedores mudam preços constantemente.
// Espessuras de painel usadas na Carpinova: 8, 10, 12, 16, 19 e 22 mm (não existe 18 mm; os artigos de 18 mm foram retirados).
const P = (id, nome, preco, unidade, categoria, extra = {}) => ({ id, nome, preco, unidade, categoria, precoData: null, fornecedor: "", espessura: null, nota: "", historico: [], ...extra });

export const CATALOGO_SEED = [
  P("cat_mdf-hid-19", "MDF HID EZ 19mm", 10.1, "m²", "Painel", { fornecedor: "Finsa / Balbino & Faustino", espessura: 19 }),
  P("cat_innovus-mdf-hid-19", "MDF HID 19mm", 12.17, "m²", "Painel", { fornecedor: "Innovus", espessura: 19 }),
  P("cat_innovus-pb-hid-19", "PB HID 19mm L166 (promoção)", 10.93, "m²", "Painel", { fornecedor: "Innovus", espessura: 19, nota: "Preço de promoção" }),
  P("cat_bloma-13", "Fenólico BLOMA 13mm", 53.02, "m²", "Painel", { fornecedor: "Covema", espessura: 13, nota: "Espessura 13 mm fora da lista habitual — confirmar" }),
  P("cat_lac-interno", "Lacado interno", 20, "m²", "Acabamento"),
  P("cat_lac-serlaca-mate", "Lacado Serlaca 2F mate", 47, "m²", "Acabamento", { fornecedor: "Serlaca" }),
  P("cat_lac-serlaca-brilho", "Lacado Serlaca 2F alto brilho", 58, "m²", "Acabamento", { fornecedor: "Serlaca" }),
  P("cat_verniz-interno", "Verniz interno mate natural", 13, "m²", "Acabamento"),
  P("cat_ripado-lacado", "Ripado lacado", 65, "m²", "Acabamento", { fornecedor: "Serlaca" }),
];
