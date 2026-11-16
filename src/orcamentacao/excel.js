// Ficha de custo interna em Excel, com fórmulas vivas (editar custos/margem recalcula tudo).
import { normalizaOrcamento, qtdArtigo } from "./calc";

const EUR = '#,##0.00" €"';

export async function gerarFichaCustoXLSX({ obra, orcamento }) {
  const ExcelJS = (await import("exceljs")).default || (await import("exceljs"));
  const o = normalizaOrcamento(orcamento);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ficha de custo", { views: [{ state: "frozen", ySplit: 5 }] });
  ws.columns = [{ width: 8 }, { width: 58 }, { width: 10 }, { width: 8 }, { width: 14 }, { width: 10 }, { width: 16 }];

  ws.getCell("A1").value = `FICHA DE CUSTO INTERNA - ${obra.ref || ""}`; ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = [obra.cliente && `Cliente: ${obra.cliente}`, obra.projeto && `Obra: ${obra.projeto}`].filter(Boolean).join(" | ");
  ws.getCell("A3").value = "Margem sobre o preço:"; ws.getCell("A3").font = { bold: true };
  ws.getCell("C3").value = o.margem; ws.getCell("C3").numFmt = "0.0%"; ws.getCell("C3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
  ws.getCell("D3").value = "(editável)"; ws.getCell("D3").font = { italic: true, color: { argb: "FF888888" } };
  const cab = ws.getRow(5);
  ["Art.", "Descrição", "Qtd.", "Un.", "Custo unit. €", "Desp. %", "Custo €"].forEach((t, i) => {
    const c = cab.getCell(i + 1); c.value = t; c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } }; c.alignment = { horizontal: i > 1 ? "right" : "left" };
  });

  let r = 6; const custos = [], pvs = [];
  const estilo = (row, argb) => row.eachCell({ includeEmpty: true }, (c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb } }; c.font = { bold: true }; });
  o.artigos.forEach((a) => {
    const t = ws.getRow(r); t.getCell(1).value = a.num || ""; t.getCell(2).value = a.descricao || "";
    ws.mergeCells(r, 2, r, 7); t.getCell(2).alignment = { wrapText: true, vertical: "top" };
    t.height = Math.max(15, Math.ceil(String(a.descricao || "").length / 70) * 15);
    estilo(t, "FFDDE6F0"); r++;
    const ini = r;
    (a.linhas || []).forEach((l) => {
      const row = ws.getRow(r);
      row.getCell(2).value = l.descricao || ""; row.getCell(3).value = Number(l.qtd) || 0; row.getCell(4).value = l.unidade || "";
      row.getCell(5).value = Number(l.custoUnit) || 0; row.getCell(5).numFmt = EUR;
      row.getCell(6).value = Number(l.desperdicio) || 0; row.getCell(6).numFmt = "0%";
      row.getCell(7).value = { formula: `ROUND(C${r}*E${r}*(1+F${r}),2)` }; row.getCell(7).numFmt = EUR;
      r++;
    });
    const fim = r - 1;
    const temQ = Number(a.qtd) > 0;
    const soma = fim >= ini ? `SUM(G${ini}:G${fim})` : "0";
    const rowU = ws.getRow(r);
    rowU.getCell(2).value = temQ ? `Custo de 1 ${a.unidade || "un"}` : "Custo do artigo"; rowU.getCell(2).alignment = { horizontal: "right" };
    rowU.getCell(7).value = { formula: soma }; rowU.getCell(7).numFmt = EUR; estilo(rowU, "FFF3F6FA");
    const rU = r; r++;
    let rCusto = rU;
    if (temQ) {
      const rq = ws.getRow(r);
      rq.getCell(2).value = `× quantidade (${a.unidade || "un"})`; rq.getCell(2).alignment = { horizontal: "right" };
      rq.getCell(3).value = qtdArtigo(a);
      rq.getCell(7).value = { formula: `ROUND(G${rU}*C${r},2)` }; rq.getCell(7).numFmt = EUR; estilo(rq, "FFF3F6FA");
      rCusto = r; r++;
    }
    const rp = ws.getRow(r);
    rp.getCell(2).value = temQ ? `Preço de venda (P. unit. × qtd)` : "Preço de venda"; rp.getCell(2).alignment = { horizontal: "right" };
    if (Number(a.precoFixo) > 0) rp.getCell(7).value = Number(a.precoFixo);
    else if (temQ) rp.getCell(7).value = { formula: `ROUND(ROUND(G${rU}/(1-$C$3),2)*C${rCusto},2)` };
    else rp.getCell(7).value = { formula: `ROUND(G${rCusto}/(1-$C$3),2)` };
    rp.getCell(7).numFmt = EUR; estilo(rp, "FFE8F3E8");
    custos.push(`G${rCusto}`); pvs.push(`G${r}`); r += 2;
  });

  const resumo = [["Custo total", custos.length ? `SUM(${custos.join(",")})` : "0"], ["Preço de venda (ex-IVA)", pvs.length ? `SUM(${pvs.join(",")})` : "0"]];
  resumo.forEach(([t, f], i) => { const row = ws.getRow(r + i); row.getCell(2).value = t; row.getCell(2).alignment = { horizontal: "right" }; row.getCell(7).value = { formula: f }; row.getCell(7).numFmt = EUR; estilo(row, "FFDDE6F0"); });
  const rc = r, rv = r + 1;
  const rl = ws.getRow(r + 2); rl.getCell(2).value = "Lucro"; rl.getCell(2).alignment = { horizontal: "right" }; rl.getCell(7).value = { formula: `G${rv}-G${rc}` }; rl.getCell(7).numFmt = EUR; estilo(rl, "FFDDE6F0");
  const rm = ws.getRow(r + 3); rm.getCell(2).value = "Margem real"; rm.getCell(2).alignment = { horizontal: "right" }; rm.getCell(7).value = { formula: `IF(G${rv}=0,0,G${rl.number}/G${rv})` }; rm.getCell(7).numFmt = "0.0%"; estilo(rm, "FFDDE6F0");
  ws.getCell(`A${r + 5}`).value = "Documento interno — não enviar ao cliente"; ws.getCell(`A${r + 5}`).font = { italic: true, color: { argb: "FF888888" } };

  const buf = await wb.xlsx.writeBuffer();
  return { buf, nome: `FICHA-CUSTO-${obra.ref || "orcamento"}.xlsx` };
}

export async function descarregarFichaCustoXLSX(args) {
  const { buf, nome } = await gerarFichaCustoXLSX(args);
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
