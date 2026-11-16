// Ponto de partida do catálogo, vindo da app antiga carpinova-orcamentos.
// TODOS os preços estão por confirmar (sem data): os fornecedores mudam preços constantemente.
// Os painéis de 18 mm vêm assinalados porque a Carpinova não trabalha essa espessura (8, 10, 12, 16, 19, 22).
const P = (id, nome, preco, unidade, categoria, extra = {}) => ({ id, nome, preco, unidade, categoria, precoData: null, fornecedor: "", espessura: null, nota: "", historico: [], ...extra });
const REVER18 = "Espessura 18 mm não existe na Carpinova — rever para 16 ou 19 mm";

export const CATALOGO_SEED = [
  P("cat_agl-std-18", "AGL STD EZ 18mm", 5.09, "m²", "Painel", { fornecedor: "Finsa / Balbino & Faustino", espessura: 18, nota: REVER18 }),
  P("cat_agl-hid-18", "AGL HID EZ 18mm", 7.14, "m²", "Painel", { fornecedor: "Finsa / Balbino & Faustino", espessura: 18, nota: REVER18 }),
  P("cat_mdf-std-18", "MDF STD EZ 18mm", 7.5, "m²", "Painel", { fornecedor: "Finsa / Balbino & Faustino", espessura: 18, nota: REVER18 }),
  P("cat_mdf-hid-18", "MDF HID EZ 18mm", 9.57, "m²", "Painel", { fornecedor: "Finsa / Balbino & Faustino", espessura: 18, nota: REVER18 }),
  P("cat_mdf-hid-19", "MDF HID EZ 19mm", 10.1, "m²", "Painel", { fornecedor: "Finsa / Balbino & Faustino", espessura: 19 }),
  P("cat_superpan-std-18", "Superpan STD EZ 18mm", 6.39, "m²", "Painel", { fornecedor: "Finsa / Balbino & Faustino", espessura: 18, nota: REVER18 }),
  P("cat_duo-gr1-18", "DUO Gr1 AGL STD 18mm decorativo", 9.7, "m²", "Painel", { fornecedor: "Finsa / Balbino & Faustino", espessura: 18, nota: REVER18 }),
  P("cat_duo-gr2-18", "DUO Gr2 AGL STD 18mm decorativo", 12.04, "m²", "Painel", { fornecedor: "Finsa / Balbino & Faustino", espessura: 18, nota: REVER18 }),
  P("cat_innovus-mdf-std-18", "MDF STD 18mm", 8.87, "m²", "Painel", { fornecedor: "Innovus", espessura: 18, nota: REVER18 }),
  P("cat_innovus-mdf-hid-19", "MDF HID 19mm", 12.17, "m²", "Painel", { fornecedor: "Innovus", espessura: 19 }),
  P("cat_innovus-pb-hid-19", "PB HID 19mm L166 (promoção)", 10.93, "m²", "Painel", { fornecedor: "Innovus", espessura: 19, nota: "Preço de promoção" }),
  P("cat_bloma-13", "Fenólico BLOMA 13mm", 53.02, "m²", "Painel", { fornecedor: "Covema", espessura: 13, nota: "Espessura 13 mm fora da lista habitual — confirmar" }),
  P("cat_lac-interno", "Lacado interno", 20, "m²", "Acabamento"),
  P("cat_lac-serlaca-mate", "Lacado Serlaca 2F mate", 47, "m²", "Acabamento", { fornecedor: "Serlaca" }),
  P("cat_lac-serlaca-brilho", "Lacado Serlaca 2F alto brilho", 58, "m²", "Acabamento", { fornecedor: "Serlaca" }),
  P("cat_verniz-interno", "Verniz interno mate natural", 13, "m²", "Acabamento"),
  P("cat_ripado-lacado", "Ripado lacado", 65, "m²", "Acabamento", { fornecedor: "Serlaca" }),
];
