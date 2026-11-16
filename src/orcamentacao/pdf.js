// Geração dos PDFs da orçamentação: Proposta Comercial (para o cliente) e Ficha de Custo Interna.
// jsPDF só é carregado quando o utilizador gera um PDF (import dinâmico no chamador).
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { PROPOSTA_DEFAULTS } from "./pdfDefaults";
import { custoArtigo, precoArtigo, custoLinha, totaisOrcamento, normalizaOrcamento } from "./calc";

export const EMPRESA = {
  nome: "Pátio Exímio, Lda",
  nif: "518 637 026",
  morada: "Lugar de Regadias 1, 4705-671 Tadim, Braga",
  site: "www.carpinova.pt",
  telefone: "+351 911 573 616",
};

const NAVY = [31, 56, 100];       // #1F3864
const STEEL = [46, 83, 149];      // #2E5395
const LIGHT = [217, 225, 242];    // #D9E1F2
const ZEBRA = [234, 239, 248];
const GREEN = [198, 224, 180];
const GOLD = [176, 124, 38];
const MARGIN = 15;

const grupos = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
export const eur = (v) => {
  const n = Number.isFinite(v) ? v : 0;
  const [i, d] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}${grupos(i)},${d}`;
};
const dataPT = (d = new Date()) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
const refSegura = (r) => String(r || "orcamento").replace(/[^\w.-]+/g, "-");

function cabecalho(doc, logo, largura) {
  if (logo) { try { doc.addImage(logo, "PNG", MARGIN, 9, 20, 20); } catch (e) { /* sem logótipo */ } }
  doc.setFont("times", "normal"); doc.setFontSize(21); doc.setTextColor(...GOLD);
  doc.text("CARPINOVA", MARGIN + 25, 20, { charSpace: 1.6 });
  doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(120, 120, 120);
  doc.text("PROCESSO EM CADA DETALHE", MARGIN + 25, 24.5, { charSpace: 1.1 });
  doc.setFillColor(...NAVY); doc.rect(MARGIN, 32, largura, 5.2, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.setTextColor(255, 255, 255);
  doc.text(`${EMPRESA.nome} | NIF ${EMPRESA.nif} | ${EMPRESA.morada} | ${EMPRESA.site} | ${EMPRESA.telefone}`, MARGIN + 1.5, 35.6);
}

function rodape(doc, texto) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const h = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(130, 130, 130);
    if (texto) doc.text(texto, MARGIN, h - 8);
    if (n > 1) doc.text(`Página ${i} de ${n}`, doc.internal.pageSize.getWidth() - MARGIN, h - 8, { align: "right" });
  }
}

function paragrafos(doc, y, textos, largura, { bold = false, size = 6.8, gap = 1.2 } = {}) {
  const h = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(40, 40, 40);
  textos.filter(Boolean).forEach((t) => {
    const linhas = doc.splitTextToSize(t, largura);
    if (y + linhas.length * 3 > h - 14) { doc.addPage(); y = 18; }
    doc.text(linhas, MARGIN, y);
    y += linhas.length * 3 + gap;
  });
  return y;
}

function contexto(obra, orc) {
  const o = normalizaOrcamento(orc);
  const iva = obra.ivaTipo === "autoliquidacao" ? { taxa: 0, label: "Autoliquidação" } : obra.ivaTipo === "isento" ? { taxa: 0, label: "Isento" } : { taxa: 0.23, label: "IVA 23%" };
  const t = totaisOrcamento(o.artigos, { margem: o.margem, iva: 0.23, autoliquidacao: iva.taxa === 0 && obra.ivaTipo === "autoliquidacao", isento: obra.ivaTipo === "isento" });
  return { o, t, iva, p: { ...PROPOSTA_DEFAULTS, ...(o.proposta || {}) } };
}

// ---------------------------------------------------------------- Proposta comercial
export function gerarPropostaPDF({ obra, orcamento, logo }) {
  const { o, t, iva, p } = contexto(obra, orcamento);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth() - MARGIN * 2;
  cabecalho(doc, logo, W);

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
  doc.text(`PROPOSTA COMERCIAL - ${obra.ref || ""}`, MARGIN, 45);
  doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(110, 110, 110);
  const sub = [obra.cliente && `Cliente: ${obra.cliente}`, (obra.moradaObra || obra.projeto) && `Local da obra: ${obra.moradaObra || obra.projeto}`, `Data: ${dataPT()}`, `Validade: ${p.validadeDias} dias`].filter(Boolean).join(" | ");
  doc.text(doc.splitTextToSize(sub, W), MARGIN, 49.5);

  const corpo = o.artigos.map((a) => [String(a.num || ""), a.descricao || "", eur(precoArtigo(a, o.margem))]);
  autoTable(doc, {
    startY: 55,
    margin: { left: MARGIN, right: MARGIN, bottom: 18 },
    head: [["Art.", "Descrição", "Valor ex-IVA (€)"]],
    body: corpo,
    theme: "plain",
    styles: { font: "helvetica", fontSize: 7.6, cellPadding: { top: 2.6, bottom: 2.6, left: 2, right: 2 }, textColor: [30, 30, 30], valign: "middle" },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", halign: "center" },
    columnStyles: { 0: { cellWidth: 12, halign: "center" }, 1: { cellWidth: "auto" }, 2: { cellWidth: 32, halign: "right" } },
    didParseCell: (d) => {
      if (d.section === "body" && d.row.index % 2 === 0) d.cell.styles.fillColor = ZEBRA;
      if (d.section === "head" && d.column.index === 2) d.cell.styles.halign = "right";
    },
  });

  const linhasTot = [["TOTAL ex-IVA", eur(t.pvpExIva)], [iva.label === "IVA 23%" ? "IVA 23%" : `IVA — ${iva.label}`, eur(t.ivaValor)], ["TOTAL c/IVA", eur(t.totalComIva)]];
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    margin: { left: MARGIN, right: MARGIN },
    body: linhasTot,
    theme: "plain",
    styles: { font: "helvetica", fontSize: 8, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 }, fillColor: [240, 240, 240] },
    columnStyles: { 0: { halign: "right", fontStyle: "bold" }, 1: { cellWidth: 32, halign: "right", fontStyle: "bold" } },
    didParseCell: (d) => { if (d.row.index === 2) { d.cell.styles.fillColor = GREEN; } if (d.row.index === 1) d.cell.styles.fontStyle = "normal"; },
  });

  let y = doc.lastAutoTable.finalY + 7;
  y = paragrafos(doc, y, [p.condicoes && `Condições de pagamento: ${p.condicoes}`, p.prazo && `Prazo de execução estimado: ${p.prazo}`], W);
  y += 1;
  const notas = String(p.notas || "").split("\n").map((x) => x.trim()).filter(Boolean);
  paragrafos(doc, y, notas, W, { size: 6.3, gap: 0.8 });
  rodape(doc, "");
  doc.save(`${refSegura(obra.ref)}.pdf`);
  return doc;
}

// ---------------------------------------------------------------- Ficha de custo interna
export function gerarFichaCustoPDF({ obra, orcamento, logo, catalogo = [] }) {
  const { o, t, iva, p } = contexto(obra, orcamento);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth() - MARGIN * 2;
  cabecalho(doc, logo, W);

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
  doc.text(`FICHA DE CUSTO INTERNA - ${obra.ref || ""}`, MARGIN, 45);
  doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(110, 110, 110);
  doc.text(doc.splitTextToSize([obra.cliente && `Cliente: ${obra.cliente}`, obra.projeto && `Obra: ${obra.projeto}`, `Data: ${dataPT()}`, `Margem alvo: ${Math.round(o.margem * 1000) / 10}% sobre o preço`].filter(Boolean).join(" | "), W), MARGIN, 49.5);

  const porId = new Map(catalogo.map((c) => [c.id, c]));
  let y = 55;
  o.artigos.forEach((a) => {
    const custo = custoArtigo(a); const pv = precoArtigo(a, o.margem);
    const body = (a.linhas || []).map((l) => [l.descricao || "", `${String(l.qtd).replace(".", ",")} ${l.unidade || ""}`, eur(Number(l.custoUnit) || 0), l.desperdicio ? `${Math.round(l.desperdicio * 100)}%` : "—", eur(custoLinha(l))]);
    body.push([{ content: "Custo do artigo", colSpan: 4, styles: { halign: "right", fontStyle: "bold", fillColor: LIGHT } }, { content: eur(custo), styles: { halign: "right", fontStyle: "bold", fillColor: LIGHT } }]);
    body.push([{ content: `Preço de venda (margem ${pv ? Math.round(((pv - custo) / pv) * 1000) / 10 : 0}%)`, colSpan: 4, styles: { halign: "right", fontStyle: "bold", fillColor: LIGHT } }, { content: eur(pv), styles: { halign: "right", fontStyle: "bold", fillColor: LIGHT } }]);
    autoTable(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN, bottom: 18 }, theme: "plain",
      head: [[{ content: `Art. ${a.num || ""} — ${a.descricao || ""}`, colSpan: 5, styles: { halign: "left", fillColor: STEEL } }], ["Descrição", "Qtd.", "Custo unit. (€)", "Desp.", "Custo (€)"]],
      body,
      styles: { font: "helvetica", fontSize: 7.2, cellPadding: 1.8, textColor: [30, 30, 30] },
      headStyles: { fillColor: STEEL, textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 24, halign: "right" }, 2: { cellWidth: 26, halign: "right" }, 3: { cellWidth: 14, halign: "right" }, 4: { cellWidth: 24, halign: "right" } },
      didParseCell: (d) => {
        if (d.section === "head" && d.row.index === 1) { d.cell.styles.fillColor = LIGHT; d.cell.styles.textColor = NAVY; if (d.column.index > 0) d.cell.styles.halign = "right"; }
        if (d.section === "body" && d.row.index < (a.linhas || []).length && d.row.index % 2 === 1) d.cell.styles.fillColor = ZEBRA;
      },
    });
    y = doc.lastAutoTable.finalY + 5;
  });

  const resumo = [
    ["Custo total", eur(t.custo)],
    ["Preço de venda ex-IVA", eur(t.pvpExIva)],
    ["Lucro", eur(t.lucro)],
    ["Margem real sobre o preço", `${String(t.margemReal).replace(".", ",")}%`],
    [iva.label === "IVA 23%" ? "IVA 23%" : `IVA — ${iva.label}`, eur(t.ivaValor)],
    ["TOTAL c/IVA", eur(t.totalComIva)],
  ];
  autoTable(doc, {
    startY: y, margin: { left: MARGIN, right: MARGIN }, body: resumo, theme: "plain",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.7, fillColor: [240, 240, 240] },
    columnStyles: { 0: { halign: "right", fontStyle: "bold" }, 1: { cellWidth: 32, halign: "right", fontStyle: "bold" } },
    didParseCell: (d) => { if (d.row.index === 5) d.cell.styles.fillColor = GREEN; },
  });

  const duvid = o.artigos.flatMap((a) => (a.linhas || []).filter((l) => (l.catalogoId ? !porId.get(l.catalogoId) || !porId.get(l.catalogoId).precoData : Number(l.custoUnit) <= 0)));
  if (duvid.length) {
    paragrafos(doc, doc.lastAutoTable.finalY + 7, [`Atenção: ${duvid.length} linha(s) com preço por confirmar ou sem custo — confirmar antes de enviar a proposta.`], W, { bold: true, size: 7 });
  }
  rodape(doc, "Documento interno — não enviar ao cliente");
  doc.save(`FICHA-CUSTO-${refSegura(obra.ref)}.pdf`);
  return doc;
}
