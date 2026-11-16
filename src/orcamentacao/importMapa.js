// Importação de mapas de quantidades (Excel) — leitura + deteção de colunas e linhas.
// Funções puras (exceto lerFicheiro, que carrega o exceljs sob demanda).

const UNIDADES_APP = ["m²", "ml", "un", "h", "m³", "kg", "vg"];

export function parseNumeroPT(v) {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s| /g, "").replace(/€/g, "");
  if (!s || !/^[-+]?[\d.,]+$/.test(s)) return null;
  const temV = s.includes(","), temP = s.includes(".");
  if (temV && temP) {
    // o último separador é o decimal
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (temV) s = s.replace(",", ".");
  else if (temP && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

export function normalizaUnidade(u) {
  if (!u) return "un";
  const s = String(u).trim().toLowerCase().replace(/\s/g, "").replace(/\./g, "");
  if (["m2", "m²", "mq", "metroquadrado", "metrosquadrados"].includes(s)) return "m²";
  if (["ml", "m", "mlin", "metro", "metros", "metrolinear", "metroslineares"].includes(s)) return "ml";
  if (["m3", "m³"].includes(s)) return "m³";
  if (["h", "hr", "hora", "horas"].includes(s)) return "h";
  if (["kg", "quilo", "kgs"].includes(s)) return "kg";
  if (["vg", "vb", "global", "gl", "verba", "vgl"].includes(s)) return "vg";
  if (["un", "und", "unid", "unidade", "unidades", "uni", "pç", "pc", "pcs", "peça", "peças", "cj", "conj", "conjunto", "x"].includes(s)) return "un";
  return UNIDADES_APP.includes(s) ? s : "un";
}

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const KW = {
  art: ["art", "artigo", "n", "no", "n.", "nº", "n°", "item", "ref", "cod", "codigo", "numero", "num"],
  desc: ["descri", "designa", "trabalhos", "artigo", "especifica", "descricao"],
  un: ["un", "unid", "unidade", "und", "u.m", "um"],
  qtd: ["quant", "qtd", "qt", "qtde", "medicao", "medicoes"],
};
const casa = (cel, lista) => {
  const c = norm(cel).replace(/[.:]/g, "");
  if (!c) return false;
  return lista.some((k) => (k.length <= 3 ? c === k : c.startsWith(k) || c.includes(k)));
};

// Procura a linha de cabeçalho e as colunas. rows: array de arrays de strings.
export function detetarColunas(rows) {
  let melhor = null;
  const lim = Math.min(rows.length, 60);
  for (let i = 0; i < lim; i++) {
    const r = rows[i] || [];
    const cols = { art: -1, desc: -1, un: -1, qtd: -1 };
    r.forEach((cel, j) => {
      if (casa(cel, KW.qtd) && cols.qtd < 0) cols.qtd = j;
      else if (casa(cel, KW.desc) && cols.desc < 0) cols.desc = j;
      else if (casa(cel, KW.un) && cols.un < 0) cols.un = j;
    });
    r.forEach((cel, j) => { if (cols.art < 0 && j !== cols.desc && j !== cols.qtd && j !== cols.un && casa(cel, KW.art)) cols.art = j; });
    const pontos = (cols.qtd >= 0) + (cols.desc >= 0) + (cols.un >= 0) + (cols.art >= 0);
    if (cols.desc >= 0 && cols.qtd >= 0 && (!melhor || pontos > melhor.pontos)) melhor = { cabecalho: i, cols, pontos };
    if (melhor && melhor.pontos >= 4) break;
  }
  if (melhor) return { cabecalho: melhor.cabecalho, ...melhor.cols, detetado: true };
  // Fallback por estatística de colunas: descrição = texto mais longo, qtd = coluna numérica à direita
  const nCols = Math.max(0, ...rows.map((r) => r.length));
  let desc = -1, bestLen = 0;
  for (let j = 0; j < nCols; j++) {
    const len = rows.reduce((s, r) => s + ((r[j] || "").length > 12 && parseNumeroPT(r[j]) == null ? 1 : 0), 0);
    if (len > bestLen) { bestLen = len; desc = j; }
  }
  let qtd = -1, bestNum = 0;
  for (let j = desc + 1; j < nCols; j++) {
    const n = rows.reduce((s, r) => s + (parseNumeroPT(r[j]) != null && parseNumeroPT(r[j]) > 0 ? 1 : 0), 0);
    if (n > bestNum) { bestNum = n; qtd = j; }
  }
  return { cabecalho: -1, art: desc > 0 ? 0 : -1, desc, un: qtd > 0 && qtd - 1 > desc ? qtd - 1 : -1, qtd, detetado: false };
}

// Classifica cada linha depois do cabeçalho: "item" | "titulo" | "vazio"
export function classificar(rows, cols) {
  const ini = cols.cabecalho + 1;
  const out = [];
  for (let i = ini; i < rows.length; i++) {
    const r = rows[i] || [];
    const desc = (cols.desc >= 0 ? r[cols.desc] : "") || "";
    const art = (cols.art >= 0 ? r[cols.art] : "") || "";
    const qtd = cols.qtd >= 0 ? parseNumeroPT(r[cols.qtd]) : null;
    const un = cols.un >= 0 ? r[cols.un] || "" : "";
    const texto = desc || art;
    if (!texto.trim() && qtd == null) continue;
    let tipo = "vazio";
    if (desc.trim().length >= 3 && qtd != null && qtd > 0) tipo = "item";
    else if (texto.trim()) tipo = "titulo";
    if (tipo === "vazio") continue;
    out.push({ linha: i, tipo, art: art.trim(), descricao: desc.trim() || art.trim(), unidade: normalizaUnidade(un), unidadeOriginal: un.trim(), qtd: qtd ?? 0 });
  }
  return out;
}

// Junta o título (capítulo) mais próximo a cada item, para dar contexto
export function comCapitulos(linhas) {
  let cap = "";
  return linhas.map((l) => {
    if (l.tipo === "titulo") { cap = l.descricao; return { ...l, capitulo: "" }; }
    return { ...l, capitulo: cap };
  });
}

export function analisarFolha(rows) {
  const cols = detetarColunas(rows);
  const linhas = comCapitulos(classificar(rows, cols));
  return { cols, linhas };
}

// Lê todas as folhas de um .xlsx/.xlsm → [{nome, rows}]
export async function lerFicheiro(arrayBuffer) {
  const ExcelJS = (await import("exceljs")).default || (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  const folhas = [];
  wb.eachSheet((ws) => {
    if (ws.state && ws.state !== "visible") return;
    const rows = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const arr = [];
      for (let j = 1; j <= Math.min(30, ws.columnCount || 30); j++) {
        let t = "";
        try { const c = row.getCell(j); t = c.value != null && typeof c.value === "object" && "result" in c.value ? String(c.value.result ?? "") : c.text ?? ""; } catch { t = ""; }
        arr.push(String(t).replace(/\s+/g, " ").trim());
      }
      rows[n - 1] = arr;
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    if (rows.some((r) => r.some(Boolean))) folhas.push({ nome: ws.name, rows });
  });
  return folhas;
}

// Linhas selecionadas → artigos do orçamento
export function linhasParaArtigos(selecionadas, novoId, numInicial = 1) {
  let seq = numInicial;
  return selecionadas.map((l) => ({
    id: novoId(),
    num: l.art || String(seq++),
    descricao: l.descricao,
    qtd: l.qtd,
    unidade: l.unidade,
    precoFixo: null,
    linhas: [],
  }));
}
