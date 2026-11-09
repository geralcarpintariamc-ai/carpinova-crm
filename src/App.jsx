import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  Plus, Search, X, Mail, Phone, Calendar, AlertTriangle, TrendingUp,
  Package, CheckCircle2, XCircle, Clock, Download, Building2, ChevronDown,
  ChevronRight, ChevronUp, MapPin, Euro, FileText, Users, LayoutGrid, Table as TableIcon,
  Wallet, Wrench, ArrowRight, Trash2, Save, RotateCcw, Globe, Upload, Paperclip,
  FileSpreadsheet, Image as ImageIcon, FileType, Receipt, Banknote, Landmark, Check, Eye,
  Menu, Moon, Sun, LogOut, MessageCircle, ChevronLeft
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend, ComposedChart, Line
} from "recharts";

/* ============================================================
   DESIGN TOKENS
   Os valores reais vivem em src/theme.css (variáveis CSS) para
   haver modo claro/escuro. Os nomes mantêm-se para não mexer no resto.
   ============================================================ */
const T = {
  ink: "var(--ink)",
  paper: "var(--paper)",
  paper2: "var(--paper2)",
  paper3: "var(--paper3)",
  walnut: "var(--walnut)",
  walnutDark: "var(--walnutDark)",
  amber: "var(--amber)",
  navy: "var(--navy)",
  green: "var(--green)",
  rust: "var(--rust)",
  line: "var(--line)",
};
const mix = (cor, pct) => `color-mix(in srgb, ${cor} ${pct}%, transparent)`;

const FONT_IMPORT = ""; // a fonte é carregada em theme.css

/* ============================================================
   ESTADOS DO PIPELINE
   ============================================================ */
const STAGES = [
  { key: "orcamentar", label: "A Orçamentar", color: T.navy },
  { key: "entregue", label: "Orçamento Entregue", color: T.amber },
  { key: "retificacao", label: "Retificação", color: "#8A6A1E" },
  { key: "em_estudo", label: "Em Estudo pelo Cliente", color: "#5C6B8A" },
  { key: "aceite", label: "Orçamento Aceite", color: "#6B7F3E" },
  { key: "aguarda_adjudicacao", label: "Aguarda Adjudicação", color: "#9B8B3E" },
  { key: "adjudicado", label: "Adjudicado", color: T.green },
  { key: "producao", label: "Em Produção", color: T.walnut },
  { key: "concluido", label: "Concluído", color: "#3D4F44" },
  { key: "rejeitado_nos", label: "Rejeitado por Nós", color: "#8A7A6B" },
  { key: "rejeitado_cliente", label: "Rejeitado pelo Cliente", color: T.rust },
  // Cliente que não respondeu ao orçamento nem ao follow-up. Fica arquivado:
  // não conta para o valor do pipeline (não está em ACTIVE_KEYS) nem para a
  // taxa de conversão (não está em LOST_KEYS). Reativa-se arrastando para outra fase.
  { key: "sem_resposta", label: "Sem resposta", color: "#7A7F87" },
];
const stageOf = (key) => STAGES.find((s) => s.key === key) || STAGES[0];
// "Aceite" = o cliente disse que sim, mas ainda não há dinheiro entrado.
// Só passa a "Adjudicado" quando o 1º pagamento é marcado como pago.
const ACTIVE_KEYS = ["orcamentar", "entregue", "retificacao", "em_estudo"];
const WON_KEYS = ["adjudicado", "producao", "concluido"];
// Uma obra só conta como "perdida" (para a taxa de conversão) se for o
// CLIENTE a rejeitar. Se rejeitarmos nós (fora da nossa área, sem
// capacidade, etc.), não é uma venda perdida — é uma escolha nossa.
const REJECTED_KEYS = ["rejeitado_nos", "rejeitado_cliente"];
const LOST_KEYS = ["rejeitado_cliente"];
// Fases a partir das quais já faz sentido montar o plano de pagamentos
const COM_PAGAMENTOS_KEYS = ["aceite", "aguarda_adjudicacao", "adjudicado", "producao", "concluido"];
// Nas fases em que o orçamento já foi enviado mas ainda não aceite, o plano de pagamentos
// existe só como PREVISÃO: fica pronto, mas não conta para receitas, por receber nem tesouraria.
const PLANO_PREVISAO_KEYS = ["entregue", "retificacao", "em_estudo"];
const PLANO_VISIVEL_KEYS = [...PLANO_PREVISAO_KEYS, ...COM_PAGAMENTOS_KEYS];
// Esquemas de pagamento disponíveis. A última prestação absorve os cêntimos de arredondamento.
const ESQUEMAS_PAGAMENTO = [
  { key: "40-40-20", label: "40/40/20", partes: [["Adjudicação", 40], ["Início de obra", 40], ["Conclusão", 20]] },
  { key: "40-20-20-20", label: "40/20/20/20", partes: [["Adjudicação", 40], ["Início de obra", 20], ["A meio da obra", 20], ["Conclusão", 20]] },
  { key: "50-50", label: "50/50", partes: [["Adjudicação", 50], ["Conclusão", 50]] },
];

/* Tabela de margens (Secção 4 do perfil) — liga o tipo de cliente à margem sugerida */
const CLIENTE_TIPOS = [
  { key: "residencial", label: "Residencial direto", margem: 30 },
  { key: "arquiteto", label: "Indicação de arquiteto", margem: 28 },
  { key: "empreiteiro", label: "Empreiteiro / obra grande", margem: 25 },
  { key: "premium", label: "Projeto especial / direto premium", margem: 35 },
  { key: "industrial", label: "Industrial / série", margem: 15 },
];
const tipoClienteOf = (key) => CLIENTE_TIPOS.find((c) => c.key === key);

/* Categorias de despesa — usadas tanto nos custos de obra como nas despesas gerais */
const CATEGORIAS_DESPESA = [
  "Material", "Mão de obra", "Subcontratado", "Transporte",
  "Renda / Instalações", "Salários", "Equipamento / Ferramentas", "Combustível", "Outro",
];

/* Métodos de recebimento de pagamentos de clientes */
const METODOS_PAGAMENTO = ["Transferência Bancária", "Numerário", "MB Way", "Cheque", "Cartão", "Outro"];

/* Estados de uma cotação pedida a fornecedor */
const COTACAO_ESTADOS = [
  { key: "pedido", label: "Pedido", color: "#2C3E50" },
  { key: "recebido", label: "Recebido", color: "#BD7F22" },
  { key: "integrado", label: "Integrado no orçamento", color: "#496B3C" },
];
const cotacaoEstadoOf = (key) => COTACAO_ESTADOS.find((c) => c.key === key) || COTACAO_ESTADOS[0];

/* ============================================================
   FORNECEDORES — dados de partida (Secção 5 do perfil), agrupados
   por fornecedor num diretório de contactos (ver buildDirectorioFornecedores)
   ============================================================ */
const FORNECEDORES_ITENS = []; // sem dados reais no código: o repositório é público


const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/* Agrupa os itens por fornecedor num diretório de contactos:
   nome, categorias (o que fornece), pessoa de contacto, e a lista de
   materiais/preços fica guardada mas só aparece se se pedir ("ver preços"). */
function buildDirectorioFornecedores(itens) {
  const map = {};
  itens.forEach((it) => {
    if (!map[it.nome]) {
      map[it.nome] = {
        id: `f_${slugify(it.nome)}`,
        nome: it.nome,
        categorias: [],
        pessoaContacto: "",
        telefone: "",
        email: "",
        site: "",
        notas: "",
        materiais: [],
      };
    }
    const f = map[it.nome];
    if (!f.categorias.includes(it.categoria)) f.categorias.push(it.categoria);
    if (it.ref) f.materiais.push({ ref: it.ref, preco: it.preco });
    if (it.contacto) {
      if (!f.pessoaContacto && !/desc\.|verificar|ref\./i.test(it.contacto)) {
        f.pessoaContacto = it.contacto;
      } else {
        f.notas = f.notas ? `${f.notas} · ${it.contacto}` : it.contacto;
      }
    }
  });
  return Object.values(map);
}

const SEED_FORNECEDORES = buildDirectorioFornecedores(FORNECEDORES_ITENS);

/* ============================================================
   DADOS SEMEADOS a partir de Orçamentos_2026.xlsx
   ============================================================ */
const seedRow = (o, idx) => ({
  id: `seed-${String(idx + 1).padStart(3, "0")}`,
  ref: null,
  cliente: o.cliente,
  projeto: o.projeto || "—",
  descricao: o.descricao || "",
  canal: o.canal || "—",
  tipo: "Orçamento",
  dataEntrada: o.dataEntrada || null,
  estado: o.estado,
  valorOrcamento: null,
  valorAdjudicado: null,
  margem: null,
  dataEntrega: o.dataEntrega || null,
  dataAdjudicacao: null,
  dataInicioObra: o.dataInicioObra || null,
  dataConclusao: null,
  proximaAcaoTexto: o.proximaAcaoTexto || "",
  proximaAcaoData: o.proximaAcaoData || null,
  motivoRejeicao: o.motivoRejeicao || "",
  tipoCliente: o.tipoCliente || "",
  clienteEmail: o.clienteEmail || "",
  clienteTelefone: o.clienteTelefone || "",
  clienteNif: o.clienteNif || "",
  clienteMorada: o.clienteMorada || "",
  donoObra: o.donoObra || "",
  donoObraContacto: o.donoObraContacto || "",
  moradaObra: o.moradaObra || "",
  cotacoes: [],
  anexos: [],
  assistencias: [],
  pagamentos: [],
  historico: [
    { data: o.dataEntrada || new Date().toISOString().slice(0, 10), texto: o.notas || "Importado do histórico de emails." },
  ],
});

function uid() {
  return "o_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const SEED_DATA = []; // sem dados reais no código: o repositório é público

/* ============================================================
   HELPERS
   ============================================================ */
const fmtEUR = (v) => (v === null || v === undefined || v === "" || isNaN(v)) ? "—" :
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(v));
// O Valor Orçamentado é sempre o valor total de referência de uma obra —
// o Valor Adjudicado é só o montante necessário para dar início à obra
// (normalmente a 1ª prestação), não o valor da obra toda. Por isso, para
// tudo o que precisa do "valor total" (receita, margem, por receber),
// usa-se sempre o Orçamentado primeiro, com o Adjudicado só como reserva
// para obras antigas onde o Orçamentado nunca foi preenchido.
const valorTotalObra = (o) => {
  if (!o) return null;
  const orc = o.valorOrcamento;
  if (orc !== null && orc !== undefined && orc !== "" && !isNaN(Number(orc))) return Number(orc);
  const adj = o.valorAdjudicado;
  if (adj !== null && adj !== undefined && adj !== "" && !isNaN(Number(adj))) return Number(adj);
  return null;
};
/* ---------- IVA ----------
   O Valor Orçamentado é SEM IVA (é a receita real da Carpinova). O cliente
   paga o valor COM IVA, e o plano de pagamentos é feito com IVA incluído.
   Cada obra tem um regime: 23%, autoliquidação (fatura sem IVA, o IVA é
   liquidado pelo cliente) ou isento. Obras antigas ficam a 23%. */
const IVA_TIPOS = [
  { key: "normal", label: "23%", taxa: 0.23 },
  { key: "autoliquidacao", label: "Autoliquidação", taxa: 0 },
  { key: "isento", label: "Isento", taxa: 0 },
];
const ivaTipoOf = (o) => IVA_TIPOS.find((t) => t.key === (o && o.ivaTipo)) || IVA_TIPOS[0];
const fatorIva = (o) => 1 + ivaTipoOf(o).taxa;
/* Plano de pagamentos (valores COM IVA) para um esquema. Devolve null se a obra ainda não tem valor. */
function planoPagamentos(obra, esquema) {
  const base = valorTotalObra(obra);
  if (base === null) return null;
  const v = base * fatorIva(obra);
  let acumulado = 0;
  return esquema.partes.map(([nome, pct], i) => {
    const ultimo = i === esquema.partes.length - 1;
    const valor = ultimo ? +(v - acumulado).toFixed(2) : +(v * pct / 100).toFixed(2);
    acumulado += valor;
    return { label: `${nome} (${pct}%)`, valor, data: "", pago: false, metodo: "", faturaEmitida: false };
  });
}
const valorTotalComIva = (o) => {
  const v = valorTotalObra(o);
  return v === null ? null : v * fatorIva(o);
};
// Valores de pagamentos/faturas dos clientes estão COM IVA; isto devolve a parte sem IVA.
const semIva = (o, valorComIva) => (Number(valorComIva) || 0) / fatorIva(o);
// Faturas/custos: ivaPct (0, 23) sobre o valor total da fatura. Sem ivaPct = sem IVA indicado.
const despesaPct = (d) => Number(d && d.ivaPct) || 0;
const despesaBase = (d) => (Number(d && d.valor) || 0) / (1 + despesaPct(d) / 100);
const despesaIvaValor = (d) => (Number(d && d.valor) || 0) - despesaBase(d);
const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const todayISO = () => new Date().toISOString().slice(0, 10);
/* ---------- Lembretes de seguimento (automáticos) ----------
   Uma obra numa destas fases, sem ação agendada à mão, aparece como lembrete
   quando passam X dias sem "toque": entrada na fase, email ligado à obra
   (enviado ou recebido) ou um "Já contactei" registado no histórico. */
// Dias ÚTEIS sem "toque" até aparecer o lembrete (mínimo 7, por regra da casa).
const SEGUIMENTO_DIAS = {
  orcamentar: 7, entregue: 10, retificacao: 7, em_estudo: 7,
  aceite: 7, aguarda_adjudicacao: 7, adjudicado: 7, concluido: 7,
};
// O que há a fazer em cada fase (mostrado no lembrete).
const SEGUIMENTO_TEXTO = {
  orcamentar: "orçamento por fazer",
  aceite: "ver quando adjudicam (1.º pagamento)",
  aguarda_adjudicacao: "ver quando adjudicam (1.º pagamento)",
  adjudicado: "marcar o início da produção",
  concluido: "cobrar pagamentos em falta",
};
// Só nestas fases faz sentido o fluxo "follow-up → email de arquivo → Sem resposta".
const SEGUIMENTO_ARQUIVAVEL = ["entregue", "retificacao", "em_estudo"];
// Obra concluída só pede seguimento se ainda houver pagamentos por receber.
const seguimentoAplica = (o) => o.estado !== "concluido" || (o.pagamentos || []).some((p) => !p.pago && (Number(p.valor) || 0) > 0);
/* Dias úteis (seg–sex) entre duas datas ISO: conta os dias depois de a, até b inclusive. */
const diasEntre = (aISO, bISO) => {
  const a = new Date(aISO + "T00:00:00"), b = new Date(bISO + "T00:00:00");
  if (isNaN(a) || isNaN(b) || b <= a) return 0;
  let n = 0;
  for (const d = new Date(a); d < b; ) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
};
/* Quantos follow-ups já foram feitos nesta fase (conta desde a última mudança de fase). */
function followupsFeitos(o) {
  const hist = o.historico || [];
  let desde = -1;
  hist.forEach((h, i) => { if ((h.texto || "").startsWith("Estado alterado")) desde = i; });
  return hist.slice(desde + 1).filter((h) => (h.texto || "").startsWith("Seguimento: cliente contactado")).length;
}
/* Último "toque" com o cliente: entrada na fase, email ligado à obra ou follow-up registado. */
function ultimoToque(o, emails = []) {
  const label = stageOf(o.estado).label;
  let toque = o.dataEntrada || "";
  (o.historico || []).forEach((h) => {
    const t = h.texto || "";
    if ((t.endsWith(`→ ${label}.`) || t.startsWith("Seguimento")) && h.data > toque) toque = h.data;
  });
  emails.forEach((e) => {
    if (e.obraId === o.id && e.data) { const d = String(e.data).slice(0, 10); if (d > toque) toque = d; }
  });
  return toque;
}
/* Soma n dias úteis (seg–sex) a uma data ISO. */
function addDiasUteis(iso, n) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return "";
  let k = 0;
  while (k < n) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) k++; }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/* Data prevista/marcada que "segura" o lembrete: enquanto não for ultrapassada, não há follow-up.
   Aceite / Aguarda adjudicação → Data de adjudicação; Adjudicado → Início de obra. */
const dataPrevistaDe = (o) =>
  o.estado === "adjudicado" ? (o.dataInicioObra || "")
  : (o.estado === "aceite" || o.estado === "aguarda_adjudicacao") ? (o.dataAdjudicacao || "") : "";
/* Estado do lembrete de uma obra: null se não se aplica; senão { desde, pendente, proximo, motivo }. */
function lembreteDe(o, emails = []) {
  const limite = SEGUIMENTO_DIAS[o.estado];
  if (!limite || o.proximaAcaoData || !seguimentoAplica(o)) return null;
  const hoje = todayISO();
  const toque = ultimoToque(o, emails);
  const dp = dataPrevistaDe(o);
  if (dp) {
    if (dp >= hoje) return { desde: dp, pendente: false, proximo: addDiasUteis(dp, 1), motivo: "agendada", dataPrevista: dp };
    if (!toque || toque <= dp) return { desde: dp, pendente: true, proximo: dp, motivo: "ultrapassada", dataPrevista: dp };
  }
  if (!toque) return null;
  const proximo = addDiasUteis(toque, limite);
  return { desde: toque, pendente: proximo <= hoje, proximo, motivo: "normal" };
}
function seguimentosPendentes(obras, emails = []) {
  const hoje = todayISO();
  const out = [];
  obras.forEach((o) => {
    const l = lembreteDe(o, emails);
    if (l && l.pendente) out.push({ obra: o, dias: diasEntre(l.desde, hoje), desde: l.desde, motivo: l.motivo });
  });
  return out.sort((a, b) => b.dias - a.dias);
}

const isOverdue = (dateStr, estado) => {
  if (!dateStr) return false;
  if (["concluido", "sem_resposta", ...REJECTED_KEYS].includes(estado)) return false;
  return dateStr < todayISO();
};
const monthLabel = (isoMonth) => {
  const [y, m] = isoMonth.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return names[parseInt(m, 10) - 1] + "/" + y.slice(2);
};
// Soma (ou subtrai) meses a uma chave "YYYY-MM", com transporte de ano correto.
const addMonths = (mesKey, delta) => {
  let [y, m] = mesKey.split("-").map(Number);
  m += delta;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
};
/* Os anexos estão num bucket PRIVADO: para abrir um ficheiro geramos um link
   temporário (2 min) em vez de um URL público permanente. */
const abrirAnexo = async (anexo) => {
  if (!anexo || !anexo.path) return;
  const win = window.open("", "_blank");
  const { data, error } = await supabase.storage.from("anexos").createSignedUrl(anexo.path, 120);
  if (error || !data || !data.signedUrl) {
    if (win) win.close();
    alert("Não foi possível abrir o ficheiro. Tenta novamente.");
    return;
  }
  if (win) win.location.href = data.signedUrl; else window.location.href = data.signedUrl;
};

const REF_RE = /^CARP(?:-ORC)?-(\d{4})-(\d+)$/i;
const nextRef = (obras) => {
  const year = new Date().getFullYear();
  const nums = obras
    .map((o) => REF_RE.exec((o.ref || "").trim()))
    .filter((m) => m && Number(m[1]) === year)
    .map((m) => parseInt(m[2], 10));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `CARP-ORC-${year}-${String(next).padStart(3, "0")}`;
};

/* ============================================================
   STORAGE HOOK
   ============================================================ */
/* ============================================================
   STORAGE HOOK — Supabase (uma linha por obra + realtime)
   Cada obra é uma linha (id, payload jsonb). Ao gravar, atualizamos só
   a linha alterada — não o array inteiro — para que dois computadores a
   editar obras diferentes ao mesmo tempo nunca se pisem um ao outro.
   ============================================================ */
function useObrasStore() {
  const [obras, setObras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const obrasRef = useRef([]);
  obrasRef.current = obras;

  useEffect(() => {
    let channel;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("obras")
        .select("id, payload")
        .order("updated_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("Erro a carregar obras do Supabase:", error);
        setSaveState("error");
        setLoading(false);
        return;
      }

      if (data && data.length > 0) {
        const carregadas = data.map((r) => ({ ...r.payload, id: r.id }));
        // Migração: a fase única "rejeitado" foi dividida em "rejeitado_nos"
        // e "rejeitado_cliente". Obras antigas com o valor antigo ficavam
        // invisíveis no Pipeline (nenhuma coluna correspondia). Trazemo-las
        // de volta para "Rejeitado pelo Cliente" — o utilizador reorganiza
        // à mão as que afinal foram recusadas por nós.
        const corrigidas = carregadas.map((o) => (
          o.estado === "rejeitado" ? { ...o, estado: "rejeitado_cliente" } : o
        ));
        corrigidas.forEach((o, i) => {
          if (o.estado !== carregadas[i].estado) {
            supabase.from("obras")
              .upsert({ id: o.id, payload: o, updated_at: new Date().toISOString() }, { onConflict: "id" })
              .then(({ error }) => { if (error) console.error("Erro a migrar obra:", error); });
          }
        });
        setObras(corrigidas);
      } else {
        // Base de dados vazia — semear com o histórico do Excel.
        // IDs determinísticos + upsert: se os dois computadores arrancarem
        // ao mesmo tempo pela primeira vez, não duplicam registos.
        setObras([]);
      }
      setLoading(false);

      // Tempo real: qualquer alteração feita no outro computador chega aqui
      // sem precisar de refrescar a página.
      channel = supabase
        .channel("obras-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "obras" }, (msg) => {
          setObras((cur) => {
            if (msg.eventType === "DELETE") {
              return cur.filter((o) => o.id !== msg.old.id);
            }
            const incoming = { ...msg.new.payload, id: msg.new.id };
            const existe = cur.some((o) => o.id === incoming.id);
            return existe
              ? cur.map((o) => (o.id === incoming.id ? incoming : o))
              : [incoming, ...cur];
          });
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const persistRow = useCallback(async (id, payload) => {
    setSaveState("saving");
    const { error } = await supabase
      .from("obras")
      .upsert({ id, payload, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) {
      console.error("Erro a gravar obra:", error);
      setSaveState("error");
    } else {
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1200);
    }
  }, []);

  const addObra = useCallback((partial) => {
    const novaObra = {
      id: uid(), ref: nextRef(obrasRef.current), cliente: "", projeto: "", descricao: "", canal: "",
      tipo: "Orçamento", dataEntrada: todayISO(), estado: "orcamentar",
      valorOrcamento: null, valorAdjudicado: null, margem: null,
      dataEntrega: null, dataAdjudicacao: null, dataInicioObra: null, dataConclusao: null,
      proximaAcaoTexto: "", proximaAcaoData: null, motivoRejeicao: "",
      tipoCliente: "", clienteEmail: "", clienteTelefone: "", clienteNif: "", clienteMorada: "", donoObra: "", donoObraContacto: "", moradaObra: "",
      cotacoes: [], anexos: [], assistencias: [], pagamentos: [], historico: [{ data: todayISO(), texto: "Obra criada." }],
      ...partial,
    };
    setObras((cur) => [novaObra, ...cur]);
    persistRow(novaObra.id, novaObra);
  }, [persistRow]);

  // Gravações em fila: antes de gravar, vai buscar a versão mais recente à
  // base de dados e aplica só os campos alterados. Assim, se o outro
  // computador mexeu noutro campo da mesma obra ao mesmo tempo, não se perde.
  const fila = useRef(Promise.resolve());
  const updateObra = useCallback((id, patch) => {
    const next = obrasRef.current.map((o) => (o.id === id ? { ...o, ...patch } : o));
    setObras(next);
    obrasRef.current = next;
    fila.current = fila.current.then(async () => {
      setSaveState("saving");
      try {
        const { data } = await supabase.from("obras").select("payload").eq("id", id).maybeSingle();
        const local = obrasRef.current.find((o) => o.id === id);
        const base = data && data.payload ? data.payload : (local || {});
        const merged = { ...base, ...patch, id };
        const { error } = await supabase.from("obras")
          .upsert({ id, payload: merged, updated_at: new Date().toISOString() }, { onConflict: "id" });
        if (error) throw error;
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1200);
      } catch (e) {
        console.error("Erro a gravar obra:", e);
        setSaveState("error");
      }
    });
  }, []);

  /* Muda de fase e regista automaticamente no histórico — usado pelo drag-and-drop e pelo select de estado */
  const changeEstado = useCallback((id, novoEstado) => {
    const alvo = obrasRef.current.find((o) => o.id === id);
    if (!alvo || alvo.estado === novoEstado) return;
    const antiga = stageOf(alvo.estado).label;
    const nova = stageOf(novoEstado).label;
    const atualizado = {
      ...alvo, estado: novoEstado,
      historico: [...(alvo.historico || []), { data: todayISO(), texto: `Estado alterado: ${antiga} → ${nova}.` }],
    };
    setObras(obrasRef.current.map((o) => (o.id === id ? atualizado : o)));
    persistRow(id, atualizado);
  }, [persistRow]);

  const addHistorico = useCallback((id, texto) => {
    const alvo = obrasRef.current.find((o) => o.id === id);
    if (!alvo) return;
    const atualizado = { ...alvo, historico: [...(alvo.historico || []), { data: todayISO(), texto }] };
    setObras(obrasRef.current.map((o) => (o.id === id ? atualizado : o)));
    persistRow(id, atualizado);
  }, [persistRow]);

  const deleteObra = useCallback((id) => {
    setObras((cur) => cur.filter((o) => o.id !== id));
    supabase.from("obras").delete().eq("id", id).then(({ error }) => {
      if (error) console.error("Erro a eliminar obra:", error);
    });
  }, []);

  return { obras, loading, saveState, addObra, updateObra, changeEstado, addHistorico, deleteObra };
}

/* ============================================================
   FORNECEDORES STORE — mesmo padrão do useObrasStore, mais simples
   (sem histórico/estados, só ficha de contacto por fornecedor)
   ============================================================ */
function useFornecedoresStore() {
  const [fornecedores, setFornecedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const fRef = useRef([]);
  fRef.current = fornecedores;

  useEffect(() => {
    let channel;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.from("fornecedores").select("id, payload").order("updated_at", { ascending: true });
      if (cancelled) return;

      if (error) {
        console.error("Erro a carregar fornecedores:", error);
        setLoading(false);
        return;
      }

      if (data && data.length > 0) {
        setFornecedores(data.map((r) => ({ ...r.payload, id: r.id })));
      } else {
        setFornecedores([]);
      }
      setLoading(false);

      channel = supabase
        .channel("fornecedores-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "fornecedores" }, (msg) => {
          setFornecedores((cur) => {
            if (msg.eventType === "DELETE") return cur.filter((f) => f.id !== msg.old.id);
            const incoming = { ...msg.new.payload, id: msg.new.id };
            const existe = cur.some((f) => f.id === incoming.id);
            return existe ? cur.map((f) => (f.id === incoming.id ? incoming : f)) : [...cur, incoming];
          });
        })
        .subscribe();
    })();

    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, []);

  const persistRow = useCallback(async (id, payload) => {
    const { error } = await supabase.from("fornecedores").upsert({ id, payload, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) console.error("Erro a gravar fornecedor:", error);
  }, []);

  const addFornecedor = useCallback((partial) => {
    const novo = {
      id: `f_${slugify(partial.nome || "novo")}_${Date.now().toString(36)}`,
      nome: "", categorias: [], pessoaContacto: "", telefone: "", email: "", site: "", notas: "", materiais: [],
      ...partial,
    };
    setFornecedores((cur) => [...cur, novo]);
    persistRow(novo.id, novo);
    return novo.id;
  }, [persistRow]);

  const updateFornecedor = useCallback((id, patch) => {
    const next = fRef.current.map((f) => (f.id === id ? { ...f, ...patch } : f));
    setFornecedores(next);
    const atualizado = next.find((f) => f.id === id);
    if (atualizado) persistRow(id, atualizado);
  }, [persistRow]);

  const deleteFornecedor = useCallback((id) => {
    setFornecedores((cur) => cur.filter((f) => f.id !== id));
    supabase.from("fornecedores").delete().eq("id", id).then(({ error }) => {
      if (error) console.error("Erro a eliminar fornecedor:", error);
    });
  }, []);

  return { fornecedores, loading, addFornecedor, updateFornecedor, deleteFornecedor };
}

/* ============================================================
   EQUIPA STORE — funcionários e o seu custo/hora, para calcular o
   custo real de mão-de-obra lançado em cada obra.
   ============================================================ */
function useEquipaStore() {
  const [equipa, setEquipa] = useState([]);
  const [loading, setLoading] = useState(true);
  const eRef = useRef([]);
  eRef.current = equipa;

  useEffect(() => {
    let channel;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.from("equipa").select("id, payload").order("updated_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("Erro a carregar equipa:", error);
        setLoading(false);
        return;
      }
      setEquipa((data || []).map((r) => ({ ...r.payload, id: r.id })));
      setLoading(false);

      channel = supabase
        .channel("equipa-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "equipa" }, (msg) => {
          setEquipa((cur) => {
            if (msg.eventType === "DELETE") return cur.filter((m) => m.id !== msg.old.id);
            const incoming = { ...msg.new.payload, id: msg.new.id };
            const existe = cur.some((m) => m.id === incoming.id);
            return existe ? cur.map((m) => (m.id === incoming.id ? incoming : m)) : [...cur, incoming];
          });
        })
        .subscribe();
    })();

    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, []);

  const persistRow = useCallback(async (id, payload) => {
    const { error } = await supabase.from("equipa").upsert({ id, payload, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) console.error("Erro a gravar membro da equipa:", error);
  }, []);

  const addMembro = useCallback((partial) => {
    const id = uid();
    const novo = { id, nome: "", custoHora: null, notas: "", ...partial };
    setEquipa((cur) => [...cur, novo]);
    persistRow(id, novo);
    return id;
  }, [persistRow]);

  const updateMembro = useCallback((id, patch) => {
    const next = eRef.current.map((m) => (m.id === id ? { ...m, ...patch } : m));
    setEquipa(next);
    const atualizado = next.find((m) => m.id === id);
    if (atualizado) persistRow(id, atualizado);
  }, [persistRow]);

  const deleteMembro = useCallback((id) => {
    setEquipa((cur) => cur.filter((m) => m.id !== id));
    supabase.from("equipa").delete().eq("id", id).then(({ error }) => {
      if (error) console.error("Erro a eliminar membro da equipa:", error);
    });
  }, []);

  return { equipa, loading, addMembro, updateMembro, deleteMembro };
}

/* ============================================================
   DESPESAS STORE — custos de obra (obraId preenchido) e despesas
   gerais da empresa (obraId = null), tudo na mesma tabela
   ============================================================ */
function useDespesasStore() {
  const [despesas, setDespesas] = useState([]);
  const [loading, setLoading] = useState(true);
  const dRef = useRef([]);
  dRef.current = despesas;

  useEffect(() => {
    let channel;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.from("despesas").select("id, payload").order("updated_at", { ascending: false });
      if (cancelled) return;

      if (error) {
        console.error("Erro a carregar despesas:", error);
        setLoading(false);
        return;
      }
      setDespesas((data || []).map((r) => ({ ...r.payload, id: r.id })));
      setLoading(false);

      channel = supabase
        .channel("despesas-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "despesas" }, (msg) => {
          setDespesas((cur) => {
            if (msg.eventType === "DELETE") return cur.filter((d) => d.id !== msg.old.id);
            const incoming = { ...msg.new.payload, id: msg.new.id };
            const existe = cur.some((d) => d.id === incoming.id);
            return existe ? cur.map((d) => (d.id === incoming.id ? incoming : d)) : [incoming, ...cur];
          });
        })
        .subscribe();
    })();

    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, []);

  const persistRow = useCallback(async (id, payload) => {
    const { error } = await supabase.from("despesas").upsert({ id, payload, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) console.error("Erro a gravar despesa:", error);
  }, []);

  const addDespesa = useCallback((partial) => {
    const nova = {
      id: uid(), descricao: "", categoria: CATEGORIAS_DESPESA[0], valor: null,
      data: todayISO(), obraId: null, recorrente: false, notas: "",
      fornecedor: "", numeroFatura: "", dataVencimento: "", pago: false, anexo: null,
      ...partial,
    };
    setDespesas((cur) => [nova, ...cur]);
    persistRow(nova.id, nova);
    return nova.id;
  }, [persistRow]);

  const updateDespesa = useCallback((id, patch) => {
    const next = dRef.current.map((d) => (d.id === id ? { ...d, ...patch } : d));
    setDespesas(next);
    const atualizado = next.find((d) => d.id === id);
    if (atualizado) persistRow(id, atualizado);
  }, [persistRow]);

  const deleteDespesa = useCallback((id) => {
    setDespesas((cur) => cur.filter((d) => d.id !== id));
    supabase.from("despesas").delete().eq("id", id).then(({ error }) => {
      if (error) console.error("Erro a eliminar despesa:", error);
    });
  }, []);

  return { despesas, loading, addDespesa, updateDespesa, deleteDespesa };
}

/* ============================================================
   CLIENTES STORE — ficha de contacto por cliente (nome, NIF, morada,
   email, telefone). Sincronizada automaticamente a partir dos campos
   de contacto preenchidos em cada obra (ver syncCliente no App).
   ============================================================ */
const normalizaNome = (s) => (s || "").trim().toLowerCase();

function useClientesStore() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const cRef = useRef([]);
  cRef.current = clientes;

  useEffect(() => {
    let channel;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.from("clientes").select("id, payload").order("updated_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("Erro a carregar clientes:", error);
        setLoading(false);
        return;
      }
      setClientes((data || []).map((r) => ({ ...r.payload, id: r.id })));
      setLoading(false);

      channel = supabase
        .channel("clientes-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, (msg) => {
          setClientes((cur) => {
            if (msg.eventType === "DELETE") return cur.filter((c) => c.id !== msg.old.id);
            const incoming = { ...msg.new.payload, id: msg.new.id };
            const existe = cur.some((c) => c.id === incoming.id);
            return existe ? cur.map((c) => (c.id === incoming.id ? incoming : c)) : [...cur, incoming];
          });
        })
        .subscribe();
    })();

    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, []);

  const persistRow = useCallback(async (id, payload) => {
    const { error } = await supabase.from("clientes").upsert({ id, payload, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) console.error("Erro a gravar cliente:", error);
  }, []);

  const addCliente = useCallback((partial) => {
    const id = uid();
    const novo = { id, nome: "", nif: "", morada: "", email: "", telefone: "", notas: "", ...partial };
    setClientes((cur) => [...cur, novo]);
    persistRow(id, novo);
    return id;
  }, [persistRow]);

  const updateCliente = useCallback((id, patch) => {
    const next = cRef.current.map((c) => (c.id === id ? { ...c, ...patch } : c));
    setClientes(next);
    const atualizado = next.find((c) => c.id === id);
    if (atualizado) persistRow(id, atualizado);
  }, [persistRow]);

  const deleteCliente = useCallback((id) => {
    setClientes((cur) => cur.filter((c) => c.id !== id));
    supabase.from("clientes").delete().eq("id", id).then(({ error }) => {
      if (error) console.error("Erro a eliminar cliente:", error);
    });
  }, []);

  // Chamado a partir da ficha da obra sempre que o nome/email/telefone/NIF/
  // morada do cliente é editado — cria ou atualiza a ficha correspondente,
  // sem nunca apagar dados já preenchidos (só substitui campos não vazios).
  const syncCliente = useCallback((nome, contactoPatch) => {
    if (!nome || !nome.trim()) return;
    const chave = normalizaNome(nome);
    const limpo = Object.fromEntries(Object.entries(contactoPatch || {}).filter(([, v]) => v && String(v).trim() !== ""));
    const existente = cRef.current.find((c) => normalizaNome(c.nome) === chave);
    if (existente) {
      if (Object.keys(limpo).length > 0) updateCliente(existente.id, limpo);
    } else {
      addCliente({ nome: nome.trim(), ...limpo });
    }
  }, [addCliente, updateCliente]);

  return { clientes, loading, addCliente, updateCliente, deleteCliente, syncCliente };
}

/* ============================================================
   EMAILS STORE — emails de cotação/orçamento que o servidor importa
   sozinho do webmail (GitHub Actions → Supabase). Aqui só se lê e se
   classifica (ligar a obra, ignorar).
   ============================================================ */
function useEmailsStore() {
  const [emails, setEmails] = useState([]);
  const [carregado, setCarregado] = useState(false);
  const eRef = useRef([]);
  eRef.current = emails;

  useEffect(() => {
    let channel;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("emails").select("id, payload").order("updated_at", { ascending: false }).limit(1000);
      if (cancelled) return;
      if (error) { console.error("Erro a carregar emails:", error); return; }
      setEmails((data || []).map((r) => ({ ...r.payload, id: r.id })));
      setCarregado(true);
      channel = supabase
        .channel("emails-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "emails" }, (msg) => {
          setEmails((cur) => {
            if (msg.eventType === "DELETE") return cur.filter((e) => e.id !== msg.old.id);
            const incoming = { ...msg.new.payload, id: msg.new.id };
            return cur.some((e) => e.id === incoming.id) ? cur.map((e) => (e.id === incoming.id ? incoming : e)) : [incoming, ...cur];
          });
        })
        .subscribe();
    })();
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, []);

  const updateEmail = useCallback((id, patch) => {
    const next = eRef.current.map((e) => (e.id === id ? { ...e, ...patch } : e));
    setEmails(next);
    const atual = next.find((e) => e.id === id);
    if (atual) {
      supabase.from("emails").upsert({ id, payload: atual, updated_at: new Date().toISOString() }, { onConflict: "id" })
        .then(({ error }) => { if (error) console.error("Erro a gravar email:", error); });
    }
  }, []);

  const updateEmails = useCallback((ids, patch) => {
    const set = new Set(ids);
    const next = eRef.current.map((e) => (set.has(e.id) ? { ...e, ...patch } : e));
    eRef.current = next;
    setEmails(next);
    const rows = next.filter((e) => set.has(e.id)).map((e) => ({ id: e.id, payload: e, updated_at: new Date().toISOString() }));
    if (rows.length) {
      supabase.from("emails").upsert(rows, { onConflict: "id" })
        .then(({ error }) => { if (error) console.error("Erro a gravar emails:", error); });
    }
  }, []);

  return { emails, carregado, updateEmail, updateEmails };
}

/* ---------- Separador do browser: ícone + número de emails por ler ----------
   O ícone é o ficheiro public/logo.png do repositório (se existir); senão
   desenha um "C" castanho. Com emails por ler, o título passa a "(n) Carpinova CRM". */
function useAvisoSeparador(n) {
  const logoRef = useRef(undefined); // undefined = por carregar, null = não existe
  const desenhar = useCallback((img) => {
    try {
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const g = c.getContext("2d");
      if (img) {
        const k = Math.min(64 / img.width, 64 / img.height); // mantém as proporções do logo
        const w = img.width * k, h = img.height * k;
        g.drawImage(img, (64 - w) / 2, (64 - h) / 2, w, h);
      }
      else {
        g.fillStyle = T.walnut; g.beginPath(); g.roundRect(0, 0, 64, 64, 14); g.fill();
        g.fillStyle = "#fff"; g.font = "bold 40px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("C", 32, 35);
      }
      // Substitui o <link> do ícone por um novo (alguns browsers não atualizam o ícone se só se mudar o href)
      document.querySelectorAll("link[rel~='icon']").forEach((l) => l.remove());
      const link = document.createElement("link");
      link.rel = "icon"; link.type = "image/png"; link.href = c.toDataURL("image/png");
      document.head.appendChild(link);
    } catch { /* o ícone é só um extra */ }
  }, [n]);
  useEffect(() => {
    document.title = n > 0 ? `(${n}) Carpinova CRM` : "Carpinova CRM";
    if (logoRef.current !== undefined) { desenhar(logoRef.current); return; }
    const img = new Image();
    img.onload = () => { logoRef.current = img; desenhar(img); };
    img.onerror = () => { logoRef.current = null; desenhar(null); };
    img.src = `${import.meta.env.BASE_URL}logo.png`;
  }, [n, desenhar]);
}

/* Um email enviado por nós conta como lido. Não lido = recebido e ainda não aberto. */
const emailNaoLido = (e) => !e.lido && e.direcao !== "saida" && e.estado !== "ignorado" && !e.resolvido;
const emailPorTratar = (e) => !e.resolvido && e.estado !== "ignorado";

/* ============================================================
   PEQUENOS COMPONENTES
   ============================================================ */
function Tag({ children, color }) {
  return (
    <span style={{
      fontSize: 11.5, fontWeight: 600, letterSpacing: 0.1, color: "#fff", background: color,
      padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap", display: "inline-block", lineHeight: 1.4,
    }}>
      {children}
    </span>
  );
}

function CutDivider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "28px 0 14px" }}>
      {label && (
        <span style={{
          fontWeight: 700, fontSize: 12, letterSpacing: 0.9, textTransform: "uppercase",
          color: T.walnutDark, opacity: 0.55, whiteSpace: "nowrap",
        }}>{label}</span>
      )}
      <div style={{ flex: 1, height: 1, background: T.line }} />
    </div>
  );
}

function DeltaBadge({ atual, anterior, invertido }) {
  if (anterior === null || anterior === undefined || anterior === 0) return null;
  const delta = ((atual - anterior) / Math.abs(anterior)) * 100;
  if (!isFinite(delta)) return null;
  const positivo = invertido ? delta < 0 : delta > 0;
  const neutro = Math.abs(delta) < 1;
  const cor = neutro ? T.ink : (positivo ? T.green : T.rust);
  const seta = delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
  return (
    <span style={{ fontSize: 11.5, fontWeight: 700, color: cor, opacity: neutro ? 0.5 : 1 }}>
      {seta} {Math.abs(delta).toFixed(0)}% vs. período anterior
    </span>
  );
}

function KpiCard({ icon: Icon, label, value, sub, accent, delta }) {
  const cor = accent || T.walnut;
  return (
    <div className="ui-card hoverable" style={{
      background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 14,
      padding: "16px 18px", boxShadow: "var(--shadow-sm)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, background: mix(cor, 14), display: "grid", placeItems: "center", flex: "none" }}>
          <Icon size={16} color={cor} />
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, opacity: 0.6 }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 750, letterSpacing: -0.5, color: T.walnutDark }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: T.ink, opacity: 0.55, marginTop: 4 }}>{sub}</div>}
      {delta && <div style={{ marginTop: 4 }}>{delta}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
      <span style={{ fontWeight: 600, color: T.ink, opacity: 0.6, fontSize: 12 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  fontFamily: "'Inter', sans-serif", fontSize: 13.5, padding: "8px 11px",
  border: `1px solid ${T.line}`, borderRadius: 9, background: T.paper2, color: T.ink,
  outline: "none", transition: "border-color .15s, box-shadow .15s",
};
const selectStyle = { ...inputStyle };
const textareaStyle = { ...inputStyle, resize: "vertical", fontFamily: "'Inter', sans-serif" };

function Btn({ children, onClick, variant = "primary", icon: Icon, small, type = "button", disabled }) {
  const styles = {
    primary: { background: T.walnut, color: "var(--on-primary)", border: `1px solid ${T.walnut}` },
    ghost: { background: T.paper2, color: T.walnutDark, border: `1px solid ${T.line}` },
    danger: { background: "transparent", color: T.rust, border: `1px solid ${mix(T.rust, 45)}` },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`ui-btn ${variant}`}
      style={{
        ...styles[variant], fontFamily: "'Inter', sans-serif", fontWeight: 600,
        fontSize: small ? 12 : 13, padding: small ? "5px 11px" : "8px 15px",
        borderRadius: 9, cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex", alignItems: "center", gap: 6, opacity: disabled ? 0.5 : 1,
      }}
    >
      {Icon && <Icon size={small ? 13 : 14} />}
      {children}
    </button>
  );
}

/* ============================================================
   DOCUMENTOS DA OBRA — pastas de ficheiros, margem do orçamento,
   revisões e lista de corte. Tudo guardado na própria ficha da obra.
   ============================================================ */
const formatBytes = (n) => {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const PASTAS = [
  { key: "executivo", label: "Executivo", icon: FileText },
  { key: "3d", label: "3D", icon: ImageIcon },
  { key: "orcamento", label: "Orçamento", icon: FileSpreadsheet },
  { key: "fornecedores", label: "Fornecedores", icon: Package },
  { key: "faturas", label: "Faturas", icon: Receipt },
  { key: "fotos", label: "Fotos", icon: ImageIcon },
  { key: "outros", label: "Outros", icon: Paperclip },
];

// Ficheiros antigos (sem pasta) são arrumados automaticamente pelo nome/tipo.
function pastaDe(a) {
  if (a.pasta && PASTAS.some((p) => p.key === a.pasta)) return a.pasta;
  const n = (a.nome || "").toLowerCase();
  const ext = n.split(".").pop();
  if (/execut|prancha|desenho/.test(n) || ["dwg", "dxf"].includes(ext)) return "executivo";
  if (/3d|imagen|render/.test(n)) return "3d";
  if (/or[cç]amento|or[cç]_|proposta|ficha|mapa/.test(n)) return "orcamento";
  if (/fatura|\bft\b|recibo/.test(n)) return "faturas";
  if (["png", "jpg", "jpeg", "webp", "gif", "heic"].includes(ext)) return "fotos";
  return "outros";
}

function FicheirosObra({ obra, commit }) {
  const [aberta, setAberta] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [erro, setErro] = useState("");
  const [arrastar, setArrastar] = useState(false);
  const inputRef = useRef(null);
  const anexosRef = useRef([]);
  anexosRef.current = obra.anexos || [];

  const porPasta = useMemo(() => {
    const m = Object.fromEntries(PASTAS.map((p) => [p.key, []]));
    (obra.anexos || []).forEach((a) => m[pastaDe(a)].push(a));
    Object.values(m).forEach((l) => l.sort((x, y) => (y.dataUpload || "").localeCompare(x.dataUpload || "")));
    return m;
  }, [obra.anexos]);

  const pastaAtiva = aberta || (PASTAS.find((p) => porPasta[p.key].length > 0)?.key) || "executivo";
  const total = (obra.anexos || []).length;

  const enviar = async (files) => {
    files = Array.from(files || []);
    if (files.length === 0) return;
    setUploading(true); setErro("");
    const novos = [];
    for (const file of files) {
      const path = `${obra.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage.from("anexos").upload(path, file);
      if (error) { console.error("Erro a enviar ficheiro:", error); setErro(`Falhou "${file.name}": ${error.message}`); continue; }
      novos.push({ id: uid(), nome: file.name, path, tipo: file.type || "", tamanho: file.size, dataUpload: todayISO(), pasta: pastaAtiva });
    }
    if (novos.length) commit({ anexos: [...anexosRef.current, ...novos] });
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const mover = (a, pasta) => commit({ anexos: anexosRef.current.map((x) => (x.id === a.id ? { ...x, pasta } : x)) });
  const remover = async (a) => {
    commit({ anexos: anexosRef.current.filter((x) => x.id !== a.id) });
    const { error } = await supabase.storage.from("anexos").remove([a.path]);
    if (error) console.error("Erro a remover ficheiro do storage:", error);
  };
  const icone = (a) => {
    const ext = (a.nome.split(".").pop() || "").toLowerCase();
    if (["xlsx", "xls", "csv"].includes(ext)) return <FileSpreadsheet size={16} color={T.green} />;
    if (ext === "pdf") return <FileType size={16} color={T.rust} />;
    if (["png", "jpg", "jpeg", "webp", "gif", "heic"].includes(ext)) return <ImageIcon size={16} color={T.navy} />;
    return <Paperclip size={16} color={T.walnut} />;
  };

  const lista = porPasta[pastaAtiva];
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {PASTAS.map((p) => (
          <Chip key={p.key} ativo={pastaAtiva === p.key} onClick={() => setAberta(p.key)}>
            {p.label}{porPasta[p.key].length > 0 && <span style={{ opacity: 0.6, marginLeft: 5 }}>{porPasta[p.key].length}</span>}
          </Chip>
        ))}
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setArrastar(true); }}
        onDragLeave={() => setArrastar(false)}
        onDrop={(e) => { e.preventDefault(); setArrastar(false); enviar(e.dataTransfer.files); }}
        style={{
          border: `1.5px dashed ${arrastar ? T.walnut : T.line}`, borderRadius: 14, padding: 12,
          background: arrastar ? mix(T.walnut, 8) : "transparent", transition: "all .15s",
        }}
      >
        {lista.length === 0 && (
          <div style={{ fontSize: 12.5, opacity: 0.55, padding: "10px 4px" }}>
            Pasta "{PASTAS.find((p) => p.key === pastaAtiva).label}" vazia. Larga ficheiros aqui ou usa o botão.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {lista.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 10, fontSize: 13 }}>
              {icone(a)}
              <a href="#" onClick={(e) => { e.preventDefault(); abrirAnexo(a); }} style={{ flex: 1, minWidth: 0, color: T.ink, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nome}</a>
              <span className="hide-sm" style={{ fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>{formatBytes(a.tamanho)} · {fmtDate(a.dataUpload)}</span>
              <select title="Mover para outra pasta" value={pastaDe(a)} onChange={(e) => mover(a, e.target.value)}
                style={{ ...selectStyle, padding: "3px 6px", fontSize: 11.5, width: "auto" }}>
                {PASTAS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <button onClick={() => remover(a)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", color: T.rust }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: lista.length ? 10 : 4, display: "flex", alignItems: "center", gap: 10 }}>
          <input ref={inputRef} type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.dwg,.dxf,.zip,.skp,image/*" style={{ display: "none" }} onChange={(e) => enviar(e.target.files)} />
          <Btn small variant="ghost" icon={Upload} disabled={uploading} onClick={() => inputRef.current && inputRef.current.click()}>
            {uploading ? "A enviar…" : `Adicionar a ${PASTAS.find((p) => p.key === pastaAtiva).label}`}
          </Btn>
          <span style={{ fontSize: 11.5, opacity: 0.5 }}>{total} ficheiro(s) nesta obra</span>
        </div>
        {erro && <div style={{ fontSize: 11.5, color: T.rust, marginTop: 6 }}>{erro}</div>}
      </div>
    </div>
  );
}

/* ---------- Margem do orçamento ---------- */
function margemOrcamento(o) {
  const custo = Number(o.custoEstimado) || 0;
  const valor = valorTotalObra(o);
  const meta = tipoClienteOf(o.tipoCliente)?.margem ?? 25;
  if (!custo || !valor) return { custo, valor, meta, pct: null, nivel: null, precoMeta: custo ? custo / (1 - meta / 100) : null };
  const pct = ((valor - custo) / valor) * 100;
  const nivel = pct < meta * 0.6 ? "baixa" : pct < meta ? "atencao" : "ok";
  return { custo, valor, meta, pct, nivel, precoMeta: custo / (1 - meta / 100) };
}

function MargemOrcamento({ obra, commit }) {
  const [custo, setCusto] = useState(obra.custoEstimado ?? "");
  useEffect(() => { setCusto(obra.custoEstimado ?? ""); }, [obra.custoEstimado]);
  const m = margemOrcamento({ ...obra, custoEstimado: custo });
  const cor = m.nivel === "baixa" ? T.rust : m.nivel === "atencao" ? T.amber : T.green;
  return (
    <div style={{ border: `1px solid ${m.nivel ? mix(cor, 45) : T.line}`, background: m.nivel ? mix(cor, 7) : T.paper2, borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Field label="Custo estimado (ficha interna, ex-IVA)">
          <input type="number" style={{ ...inputStyle, width: 190 }} value={custo} onChange={(e) => setCusto(e.target.value)}
            onBlur={() => commit({ custoEstimado: custo === "" ? null : Number(custo) })} placeholder="material + mão de obra…" />
        </Field>
        {m.pct !== null && (
          <div>
            <div style={{ fontSize: 11.5, opacity: 0.6, fontWeight: 600 }}>Margem prevista</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: cor, display: "flex", alignItems: "center", gap: 6 }}>
              {m.nivel !== "ok" && <AlertTriangle size={18} />}{m.pct.toFixed(1)}%
            </div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 11.5, opacity: 0.6, fontWeight: 600 }}>Meta ({tipoClienteOf(obra.tipoCliente) ? "tipo de cliente" : "padrão"})</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.walnutDark }}>{m.meta}%</div>
        </div>
      </div>
      {m.precoMeta && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
          <span>Preço para atingir {m.meta}%: <b>{fmtEUR(m.precoMeta)}</b> (ex-IVA)</span>
          {m.nivel && m.nivel !== "ok" && (
            <Btn small icon={Check} onClick={() => commit({ valorOrcamento: Math.ceil(m.precoMeta) })}>Usar este preço</Btn>
          )}
        </div>
      )}
      {m.nivel === "baixa" && <div style={{ fontSize: 12.5, color: T.rust, fontWeight: 650 }}>Margem muito abaixo da meta — risco de perder dinheiro nesta obra. Revê o preço antes de enviar.</div>}
      {m.nivel === "atencao" && <div style={{ fontSize: 12.5, color: T.amber, fontWeight: 650 }}>Margem abaixo da meta.</div>}
      {!m.custo && <div style={{ fontSize: 11.5, opacity: 0.55 }}>Preenche o custo estimado para ver a margem prevista e o preço mínimo. A meta vem do tipo de cliente.</div>}
    </div>
  );
}

/* ---------- Revisões do orçamento ---------- */
function RevisoesOrcamento({ obra, commit }) {
  const revs = obra.revisoes || [];
  const [valor, setValor] = useState("");
  const [nota, setNota] = useState("");
  const proxima = revs.length + 1;

  const registar = () => {
    const v = valor === "" ? Number(obra.valorOrcamento) : Number(valor);
    if (!v || isNaN(v)) return;
    const rev = { id: uid(), n: proxima, data: todayISO(), valor: v, nota: nota.trim() };
    commit({ revisoes: [...revs, rev], valorOrcamento: v });
    setValor(""); setNota("");
  };
  const apagar = (id) => commit({ revisoes: revs.filter((r) => r.id !== id) });

  return (
    <div>
      {revs.length === 0 && <div style={{ fontSize: 12.5, opacity: 0.55, marginBottom: 8 }}>Sem revisões registadas. Cada vez que enviares um preço novo, regista-o aqui para ficar o histórico.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        {revs.slice().reverse().map((r, i, arr) => {
          const ant = arr[i + 1];
          const delta = ant && ant.valor ? ((r.valor - ant.valor) / ant.valor) * 100 : null;
          return (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 10, fontSize: 13 }}>
              <Tag color={i === 0 ? T.walnut : T.navy}>Rev.{r.n}</Tag>
              <span style={{ fontWeight: 700 }}>{fmtEUR(r.valor)}</span>
              {delta !== null && <span style={{ fontSize: 11.5, fontWeight: 700, color: delta < 0 ? T.rust : T.green }}>{delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%</span>}
              <span style={{ flex: 1, minWidth: 0, opacity: 0.65, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nota}</span>
              <span style={{ fontSize: 11, opacity: 0.5 }}>{fmtDate(r.data)}</span>
              <button onClick={() => apagar(r.id)} title="Apagar revisão" style={{ background: "none", border: "none", cursor: "pointer", color: T.rust }}><Trash2 size={13} /></button>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label={`Preço da Rev.${proxima} (ex-IVA)`}>
          <input type="number" style={{ ...inputStyle, width: 150 }} value={valor} onChange={(e) => setValor(e.target.value)} placeholder={obra.valorOrcamento ? String(obra.valorOrcamento) : ""} />
        </Field>
        <div style={{ flex: "1 1 180px" }}>
          <Field label="O que mudou">
            <input style={inputStyle} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ex: cliente pediu ilha maior" onKeyDown={(e) => e.key === "Enter" && registar()} />
          </Field>
        </div>
        <Btn small icon={Plus} onClick={registar}>Registar Rev.{proxima}</Btn>
      </div>
      <div style={{ fontSize: 11.5, opacity: 0.5, marginTop: 6 }}>Ao registar, o valor orçamentado da obra passa a ser o da nova revisão.</div>
    </div>
  );
}

/* ---------- Lista de corte (CSV: comprimento, largura, quantidade, material, nome) ---------- */
function ListaCorte({ obra, commit }) {
  const [rows, setRows] = useState(obra.listaCorte || []);
  const rowsRef = useRef(rows); rowsRef.current = rows;
  const [colar, setColar] = useState(false);
  const [texto, setTexto] = useState("");
  const [sep, setSep] = useState(";");
  const [cabecalho, setCabecalho] = useState(false);
  const COLS = [["comprimento", "Comprimento"], ["largura", "Largura"], ["quantidade", "Qtd"], ["material", "Material"], ["nome", "Nome"]];

  const guardar = (next) => { setRows(next); commit({ listaCorte: next }); };
  const edit = (id, patch) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const importar = () => {
    const novas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const p = l.split(l.includes("\t") ? "\t" : l.includes(";") ? ";" : ",").map((c) => c.trim());
      return { id: uid(), comprimento: p[0] || "", largura: p[1] || "", quantidade: p[2] || "1", material: p[3] || "", nome: p[4] || "" };
    }).filter((r) => /\d/.test(r.comprimento) || /\d/.test(r.largura));
    if (novas.length) guardar([...rowsRef.current, ...novas]);
    setTexto(""); setColar(false);
  };
  const exportar = () => {
    const q = (v) => { const s = String(v ?? ""); return s.includes(sep) || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; };
    const linhas = rows.map((r) => [r.comprimento, r.largura, r.quantidade, r.material, r.nome].map(q).join(sep));
    if (cabecalho) linhas.unshift(["comprimento", "largura", "quantidade", "material", "nome"].join(sep));
    const url = URL.createObjectURL(new Blob([linhas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `lista-corte-${(obra.ref || obra.projeto || "obra").replace(/[^a-zA-Z0-9_-]+/g, "_")}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const totalPecas = rows.reduce((s, r) => s + (Number(String(r.quantidade).replace(",", ".")) || 0), 0);

  return (
    <div>
      {rows.length > 0 && (
        <div style={{ overflowX: "auto", marginBottom: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 520 }}>
            <thead><tr style={{ textAlign: "left", fontSize: 11, opacity: 0.55 }}>
              {COLS.map(([k, l]) => <th key={k} style={{ padding: "3px 4px", fontWeight: 600 }}>{l}</th>)}<th />
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {COLS.map(([k]) => (
                    <td key={k} style={{ padding: 2 }}>
                      <input style={{ ...inputStyle, padding: "5px 7px", fontSize: 12.5, width: "100%", minWidth: k === "material" || k === "nome" ? 120 : 64 }}
                        value={r[k] ?? ""} onChange={(e) => edit(r.id, { [k]: e.target.value })} onBlur={() => commit({ listaCorte: rowsRef.current })} />
                    </td>
                  ))}
                  <td style={{ padding: 2 }}><button onClick={() => guardar(rows.filter((x) => x.id !== r.id))} style={{ background: "none", border: "none", cursor: "pointer", color: T.rust }}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length === 0 && !colar && <div style={{ fontSize: 12.5, opacity: 0.55, marginBottom: 8 }}>Sem peças. Adiciona à mão ou cola linhas do Excel.</div>}
      {colar && (
        <div style={{ marginBottom: 10 }}>
          <textarea style={textareaStyle} rows={5} value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder={"Cola aqui linhas do Excel, por esta ordem:\ncomprimento  largura  quantidade  material  nome"} />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <Btn small onClick={importar}>Importar linhas</Btn>
            <Btn small variant="ghost" onClick={() => { setColar(false); setTexto(""); }}>Cancelar</Btn>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Btn small variant="ghost" icon={Plus} onClick={() => guardar([...rows, { id: uid(), comprimento: "", largura: "", quantidade: "1", material: rows[rows.length - 1]?.material || "", nome: "" }])}>Peça</Btn>
        <Btn small variant="ghost" icon={Upload} onClick={() => setColar((v) => !v)}>Colar do Excel</Btn>
        {rows.length > 0 && <>
          <Btn small icon={Download} onClick={exportar}>Exportar CSV ({rows.length} linhas · {totalPecas} peças)</Btn>
          <select style={{ ...selectStyle, width: "auto", padding: "5px 8px", fontSize: 12 }} value={sep} onChange={(e) => setSep(e.target.value)} title="Separador de colunas">
            <option value=";">separador ;</option><option value=",">separador ,</option><option value={"\t"}>separador TAB</option>
          </select>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
            <input type="checkbox" checked={cabecalho} onChange={(e) => setCabecalho(e.target.checked)} /> com cabeçalho
          </label>
        </>}
      </div>
      <div style={{ fontSize: 11.5, opacity: 0.5, marginTop: 6 }}>Colunas do CSV: comprimento, largura, quantidade, material, nome (sem coluna de numeração).</div>
    </div>
  );
}

/* ============================================================
   MODAL — DETALHE DA OBRA
   ============================================================ */
/* Bloco "Seguimento do orçamento" na ficha da obra: ver e alterar follow-ups, lembrete previsto e arquivo. */
function SeguimentoObra({ obra, emails, onPatch, onEstado }) {
  const [dataNovo, setDataNovo] = useState(todayISO());
  const limite = SEGUIMENTO_DIAS[obra.estado];
  const hist = obra.historico || [];
  if ((!limite || !seguimentoAplica(obra)) && obra.estado !== "sem_resposta") return null;
  const arquivavel = SEGUIMENTO_ARQUIVAVEL.includes(obra.estado);

  // índices dos follow-ups feitos desde a última mudança de fase
  let desde = -1;
  hist.forEach((h, i) => { if ((h.texto || "").startsWith("Estado alterado")) desde = i; });
  const followups = [];
  hist.forEach((h, i) => { if (i > desde && (h.texto || "").startsWith("Seguimento: cliente contactado")) followups.push({ i, data: h.data }); });
  const dataFase = desde >= 0 ? hist[desde].data : (obra.dataEntrada || "");

  const hoje = todayISO();
  const lembrete = limite ? lembreteDe(obra, emails.filter((e) => e.obraId === obra.id)) : null;
  const proximo = lembrete ? lembrete.proximo : "";
  const atraso = lembrete && lembrete.pendente && proximo && proximo < hoje ? diasEntre(proximo, hoje) : 0;

  const registar = () => onPatch({ historico: [...hist, { data: dataNovo || hoje, texto: "Seguimento: cliente contactado." }] });
  const adiar = () => onPatch({ historico: [...hist, { data: hoje, texto: "Seguimento: lembrete adiado." }] });
  const mudarData = (i, data) => onPatch({ historico: hist.map((h, k) => (k === i ? { ...h, data } : h)) });
  const remover = (i) => onPatch({ historico: hist.filter((_, k) => k !== i) });

  return (
    <>
      <CutDivider label={arquivavel || obra.estado === "orcamentar" || obra.estado === "sem_resposta" ? "Seguimento do orçamento" : "Seguimento da obra"} />
      <div style={{ background: obra.estado === "sem_resposta" ? mix(T.ink, 8) : mix(T.amber, 8), border: `1px solid ${obra.estado === "sem_resposta" ? "#7A7F87" : T.amber}`, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
        {obra.estado === "sem_resposta" ? (
          <>
            <div>Arquivado como <b>Sem resposta</b> desde <b>{fmtDate(dataFase)}</b>. Não gera lembretes nem conta no valor do pipeline.</div>
            <div><Btn small icon={RotateCcw} onClick={() => onEstado("em_estudo")}>Reativar (voltar a Em Estudo)</Btn></div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 22px" }}>
              <span>Na fase <b>{stageOf(obra.estado).label}</b> desde <b>{fmtDate(dataFase)}</b></span>
              <span>Follow-ups feitos: <b>{followups.length}</b></span>
              {lembrete && lembrete.motivo === "agendada"
                ? <span>Sem lembrete até <b>{fmtDate(lembrete.dataPrevista)}</b> ({obra.estado === "adjudicado" ? "início de obra marcado" : "adjudicação prevista"}).</span>
                : proximo && <span>Próximo lembrete: <b style={{ color: atraso ? T.rust : "inherit" }}>{fmtDate(proximo)}</b>{atraso ? ` (em atraso há ${atraso} dias úteis)` : ""}</span>}
              {obra.proximaAcaoData && <span style={{ opacity: 0.7 }}>Tem uma próxima ação agendada à mão, por isso não há lembrete automático.</span>}
            </div>
            {followups.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {followups.map((f, n) => (
                  <div key={f.i} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ minWidth: 92 }}>{n + 1}.º follow-up</span>
                    <input type="date" style={{ ...inputStyle, width: 150 }} value={f.data || ""} onChange={(e) => mudarData(f.i, e.target.value)} />
                    <Btn small variant="ghost" icon={Trash2} onClick={() => remover(f.i)}>Remover</Btn>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {obra.estado === "orcamentar" ? (
                <Btn small variant="ghost" icon={Clock} onClick={adiar}>Adiar lembrete</Btn>
              ) : (
                <>
                  <input type="date" style={{ ...inputStyle, width: 150 }} value={dataNovo} onChange={(e) => setDataNovo(e.target.value)} />
                  <Btn small icon={Check} onClick={registar}>Registar follow-up</Btn>
                  {arquivavel && <Btn small variant={followups.length >= 1 ? "primary" : "ghost"} onClick={() => onEstado("sem_resposta")}>Enviei email de arquivo → Sem resposta</Btn>}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function ObraModal({ emails = [], onUpdateEmail, obra, onClose, onUpdate, onChangeEstado, onAddHistorico, onDelete, fornecedorNomes, despesas, onAddDespesa, onUpdateDespesa, onDeleteDespesa, onSyncCliente, clientesNomes, equipa }) {
  const [local, setLocal] = useState(obra);
  const [novaNota, setNovaNota] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [novaCotacao, setNovaCotacao] = useState({ fornecedor: "", material: "", quantidade: "", valor: "" });

  useEffect(() => setLocal(obra), [obra]);

  const set = (patch) => setLocal((l) => ({ ...l, ...patch }));
  const commit = (patch) => { set(patch); onUpdate(obra.id, patch); };

  // Sempre que o nome, email, telefone, NIF ou morada do cliente mudam,
  // atualiza (ou cria) a ficha desse cliente automaticamente.
  const commitClienteContacto = (patch) => {
    commit(patch);
    const atual = { ...local, ...patch };
    onSyncCliente(atual.cliente, {
      email: atual.clienteEmail, telefone: atual.clienteTelefone,
      nif: atual.clienteNif, morada: atual.clienteMorada,
    });
  };

  const handleEstadoChange = (novoEstado) => {
    set({ estado: novoEstado });
    onChangeEstado(obra.id, novoEstado);
  };

  const fornecedorNomesList = fornecedorNomes || [];

  const addCotacao = () => {
    if (!novaCotacao.fornecedor.trim()) return;
    const cotacoes = [...(local.cotacoes || []), {
      id: uid(), fornecedor: novaCotacao.fornecedor.trim(), material: novaCotacao.material.trim(),
      quantidade: novaCotacao.quantidade.trim(),
      valor: novaCotacao.valor === "" ? null : Number(novaCotacao.valor),
      estado: "pedido", dataPedido: todayISO(), notas: "",
    }];
    commit({ cotacoes });
    setNovaCotacao({ fornecedor: "", material: "", quantidade: "", valor: "" });
  };
  const updateCotacao = (idx, patch) => {
    const cotacoes = local.cotacoes.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    commit({ cotacoes });
  };
  const removeCotacao = (idx) => {
    const cotacoes = local.cotacoes.filter((_, i) => i !== idx);
    commit({ cotacoes });
  };

  const totalCotacoes = useMemo(() => (local.cotacoes || []).reduce((s, c) => s + (Number(c.valor) || 0), 0), [local.cotacoes]);
  const cotacoesPorFornecedor = useMemo(() => {
    const map = {};
    (local.cotacoes || []).forEach((c) => {
      const nome = c.fornecedor || "(sem fornecedor)";
      map[nome] = (map[nome] || 0) + (Number(c.valor) || 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [local.cotacoes]);



  const [novoCusto, setNovoCusto] = useState({ descricao: "", categoria: CATEGORIAS_DESPESA[0], valor: "", ivaPct: 23, fornecedor: "", numeroFatura: "", dataVencimento: "" });
  const custosObra = useMemo(() => (despesas || []).filter((d) => d.obraId === obra.id), [despesas, obra.id]);
  const totalCustos = useMemo(() => custosObra.reduce((s, d) => s + despesaBase(d), 0), [custosObra]);
  const valorRefObra = valorTotalObra(local);
  const margemReal = valorRefObra !== null ? valorRefObra - totalCustos : null;
  const margemRealPct = valorRefObra !== null && valorRefObra > 0
    ? (margemReal / valorRefObra) * 100 : null;

  const addCusto = () => {
    if (!novoCusto.descricao.trim()) return;
    onAddDespesa({
      obraId: obra.id, descricao: novoCusto.descricao.trim(), categoria: novoCusto.categoria,
      valor: novoCusto.valor === "" ? null : Number(novoCusto.valor), ivaPct: Number(novoCusto.ivaPct) || 0, data: todayISO(),
      fornecedor: novoCusto.fornecedor.trim(), numeroFatura: novoCusto.numeroFatura.trim(),
      dataVencimento: novoCusto.dataVencimento || "", pago: false, anexo: null,
    });
    setNovoCusto({ descricao: "", categoria: CATEGORIAS_DESPESA[0], valor: "", ivaPct: 23, fornecedor: "", numeroFatura: "", dataVencimento: "" });
  };

  // Mão de obra: mesmo mecanismo dos custos (categoria "Mão de obra"),
  // só que aqui lanças horas em vez de escreveres o € à mão — o custo
  // calcula-se sozinho a partir do custo/hora da pessoa.
  const [novaHora, setNovaHora] = useState({ funcionarioId: "", horas: "", data: todayISO() });
  const horasObra = useMemo(() => custosObra.filter((d) => d.categoria === "Mão de obra" && d.funcionarioId), [custosObra]);
  const totalHoras = useMemo(() => horasObra.reduce((s, d) => s + (Number(d.horas) || 0), 0), [horasObra]);
  const addHoras = () => {
    const membro = (equipa || []).find((m) => m.id === novaHora.funcionarioId);
    const horas = Number(novaHora.horas);
    if (!membro || !horas) return;
    const custoHora = Number(membro.custoHora) || 0;
    onAddDespesa({
      obraId: obra.id, descricao: `${membro.nome} — ${horas}h`, categoria: "Mão de obra",
      valor: +(horas * custoHora).toFixed(2), data: novaHora.data,
      funcionarioId: membro.id, horas, custoHoraAplicado: custoHora,
      fornecedor: "", numeroFatura: "", dataVencimento: "", pago: false, anexo: null,
    });
    setNovaHora({ funcionarioId: "", horas: "", data: todayISO() });
  };

  // Assistências / garantia pós-obra
  const [novaAssistencia, setNovaAssistencia] = useState("");
  const addAssistencia = () => {
    if (!novaAssistencia.trim()) return;
    const assistencias = [...(local.assistencias || []), {
      id: uid(), descricao: novaAssistencia.trim(), dataReportada: todayISO(), estado: "aberta", dataResolucao: "",
    }];
    commit({ assistencias });
    setNovaAssistencia("");
  };
  const toggleAssistencia = (id) => {
    const assistencias = local.assistencias.map((a) => a.id === id
      ? { ...a, estado: a.estado === "aberta" ? "resolvida" : "aberta", dataResolucao: a.estado === "aberta" ? todayISO() : "" }
      : a);
    commit({ assistencias });
  };
  const removeAssistencia = (id) => {
    commit({ assistencias: local.assistencias.filter((a) => a.id !== id) });
  };

  const [uploadingFaturaId, setUploadingFaturaId] = useState(null);
  const uploadAnexoFatura = async (despesaId, file) => {
    if (!file) return;
    setUploadingFaturaId(despesaId);
    const path = `faturas/${despesaId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("anexos").upload(path, file);
    if (error) {
      console.error("Erro a enviar fatura:", error);
    } else {
      onUpdateDespesa(despesaId, { anexo: { nome: file.name, path } });
    }
    setUploadingFaturaId(null);
  };
  const removeAnexoFatura = async (despesa) => {
    if (!despesa.anexo) return;
    onUpdateDespesa(despesa.id, { anexo: null });
    const { error } = await supabase.storage.from("anexos").remove([despesa.anexo.path]);
    if (error) console.error("Erro a remover fatura do storage:", error);
  };

  const gerarPagamentos = (esquema) => {
    if ((local.pagamentos || []).some((p) => p.pago)) return;
    const pagamentos = planoPagamentos(local, esquema);
    if (!pagamentos) return;
    if ((local.pagamentos || []).length > 0 && !window.confirm(`Substituir o plano de pagamentos atual por ${esquema.label}? As datas e métodos já preenchidos perdem-se.`)) return;
    commit({ pagamentos });
  };

  const togglePagamento = (idx) => {
    const pagamentos = local.pagamentos.map((p, i) => {
      if (i !== idx) return p;
      const pago = !p.pago;
      return { ...p, pago, data: pago && !p.data ? todayISO() : p.data };
    });
    commit({ pagamentos });
    // Regra de negócio: só é "Adjudicado" quando entra o 1º pagamento (adjudicação).
    if (idx === 0 && pagamentos[0].pago && (local.estado === "aceite" || local.estado === "aguarda_adjudicacao")) {
      set({ estado: "adjudicado" });
      onChangeEstado(obra.id, "adjudicado");
    }
  };

  const updatePagamento = (idx, patch) => {
    const pagamentos = local.pagamentos.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    commit({ pagamentos });
  };

  const removePagamento = (idx) => {
    const pagamentos = local.pagamentos.filter((_, i) => i !== idx);
    commit({ pagamentos });
  };

  const [novoPagamento, setNovoPagamento] = useState({ label: "", valor: "", data: "" });
  const addPagamentoManual = () => {
    if (!novoPagamento.label.trim()) return;
    const pagamentos = [...(local.pagamentos || []), {
      label: novoPagamento.label.trim(),
      valor: novoPagamento.valor === "" ? null : Number(novoPagamento.valor),
      data: novoPagamento.data || "", pago: false, metodo: "", faturaEmitida: false,
    }];
    commit({ pagamentos });
    setNovoPagamento({ label: "", valor: "", data: "" });
  };

  const stage = stageOf(local.estado);

  return (
    <div className="ui-overlay" style={{
      position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 100,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 16px", overflowY: "auto",
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.paper, borderRadius: 18, width: "100%", maxWidth: 760,
          border: `1px solid ${T.line}`, boxShadow: "var(--shadow-lg)", overflowX: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "18px 24px", borderBottom: `1px solid ${T.line}`, display: "flex",
          justifyContent: "space-between", alignItems: "flex-start", gap: 12,
        }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: T.walnutDark, fontWeight: 700 }}>
                {local.ref || "SEM REFERÊNCIA"}
              </span>
              <Tag color={stage.color}>{stage.label}</Tag>
            </div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, color: T.ink }}>
              {local.projeto}
            </div>
            <div style={{ fontSize: 13, color: T.ink, opacity: 0.7, marginTop: 2 }}>{local.cliente}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.ink, opacity: 0.6 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Dados principais */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Cliente">
              <input style={inputStyle} list="clientes-datalist" value={local.cliente} onChange={(e) => set({ cliente: e.target.value })} onBlur={() => commitClienteContacto({ cliente: local.cliente })} />
              <datalist id="clientes-datalist">
                {(clientesNomes || []).map((n) => <option key={n} value={n} />)}
              </datalist>
            </Field>
            <Field label="Projeto / Obra">
              <input style={inputStyle} value={local.projeto} onChange={(e) => set({ projeto: e.target.value })} onBlur={() => commit({ projeto: local.projeto })} />
            </Field>
            <Field label="Referência interna">
              <input style={inputStyle} value={local.ref || ""} placeholder="CARP-ORC-2026-XXX" onChange={(e) => set({ ref: e.target.value })} onBlur={() => commit({ ref: local.ref })} />
            </Field>
            <Field label="Canal de entrada">
              <input style={inputStyle} value={local.canal || ""} onChange={(e) => set({ canal: e.target.value })} onBlur={() => commit({ canal: local.canal })} />
            </Field>
            <Field label="Descrição" >
              <textarea style={{ ...textareaStyle, gridColumn: "span 2" }} rows={2} value={local.descricao || ""} onChange={(e) => set({ descricao: e.target.value })} onBlur={() => commit({ descricao: local.descricao })} />
            </Field>
          </div>

          <CutDivider label="Cliente & Dono de Obra" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Tipo de cliente (margem sugerida)">
              <select style={selectStyle} value={local.tipoCliente || ""} onChange={(e) => commit({ tipoCliente: e.target.value })}>
                <option value="">— não definido —</option>
                {CLIENTE_TIPOS.map((c) => <option key={c.key} value={c.key}>{c.label} · {c.margem}%</option>)}
              </select>
            </Field>
            <Field label="Email do cliente">
              <input style={inputStyle} value={local.clienteEmail || ""} onChange={(e) => set({ clienteEmail: e.target.value })} onBlur={() => commitClienteContacto({ clienteEmail: local.clienteEmail })} />
            </Field>
            <Field label="Telefone do cliente">
              <input style={inputStyle} value={local.clienteTelefone || ""} onChange={(e) => set({ clienteTelefone: e.target.value })} onBlur={() => commitClienteContacto({ clienteTelefone: local.clienteTelefone })} />
            </Field>
            <Field label="NIF do cliente">
              <input style={inputStyle} value={local.clienteNif || ""} onChange={(e) => set({ clienteNif: e.target.value })} onBlur={() => commitClienteContacto({ clienteNif: local.clienteNif })} />
            </Field>
            <Field label="Morada do cliente">
              <input style={inputStyle} value={local.clienteMorada || ""} onChange={(e) => set({ clienteMorada: e.target.value })} onBlur={() => commitClienteContacto({ clienteMorada: local.clienteMorada })} />
            </Field>
            <Field label="Dono de obra (se diferente do cliente)">
              <input style={inputStyle} placeholder="ex: dono final, quando cliente é arquiteto/empreiteiro" value={local.donoObra || ""} onChange={(e) => set({ donoObra: e.target.value })} onBlur={() => commit({ donoObra: local.donoObra })} />
            </Field>
            <Field label="Contacto do dono de obra">
              <input style={inputStyle} value={local.donoObraContacto || ""} onChange={(e) => set({ donoObraContacto: e.target.value })} onBlur={() => commit({ donoObraContacto: local.donoObraContacto })} />
            </Field>
            <Field label="Morada da obra (só desta obra)">
              <input style={inputStyle} placeholder="ex: morada do estaleiro/local de entrega, se diferente" value={local.moradaObra || ""} onChange={(e) => set({ moradaObra: e.target.value })} onBlur={() => commit({ moradaObra: local.moradaObra })} />
            </Field>
          </div>

          <CutDivider label="Estado & Datas" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="Estado">
              <select style={selectStyle} value={local.estado} onChange={(e) => handleEstadoChange(e.target.value)}>
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Data de entrada">
              <input type="date" style={inputStyle} value={local.dataEntrada || ""} onChange={(e) => commit({ dataEntrada: e.target.value })} />
            </Field>
            <Field label="Data de entrega do orçamento">
              <input type="date" style={inputStyle} value={local.dataEntrega || ""} onChange={(e) => commit({ dataEntrega: e.target.value })} />
            </Field>
            <Field label="Data de adjudicação (prevista ou real)">
              <input type="date" style={inputStyle} value={local.dataAdjudicacao || ""} onChange={(e) => commit({ dataAdjudicacao: e.target.value })} />
            </Field>
            <Field label="Início de obra (previsto ou real)">
              <input type="date" style={inputStyle} value={local.dataInicioObra || ""} onChange={(e) => commit({ dataInicioObra: e.target.value })} />
            </Field>
            <Field label="Conclusão">
              <input type="date" style={inputStyle} value={local.dataConclusao || ""} onChange={(e) => commit({ dataConclusao: e.target.value })} />
            </Field>
          </div>

          {REJECTED_KEYS.includes(local.estado) && (
            <Field label="Motivo da rejeição">
              <textarea style={textareaStyle} rows={2} value={local.motivoRejeicao || ""} onChange={(e) => set({ motivoRejeicao: e.target.value })} onBlur={() => commit({ motivoRejeicao: local.motivoRejeicao })} />
            </Field>
          )}

          <CutDivider label="Valores" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            <Field label="Valor orçamentado (ex-IVA)">
              <input type="number" style={inputStyle} value={local.valorOrcamento ?? ""} onChange={(e) => set({ valorOrcamento: e.target.value === "" ? null : e.target.value })} onBlur={() => commit({ valorOrcamento: local.valorOrcamento })} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
              <Field label="IVA desta obra">
                <select style={selectStyle} value={ivaTipoOf(local).key} onChange={(e) => commit({ ivaTipo: e.target.value })}>
                  {IVA_TIPOS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Total a cobrar (com IVA)">
                <div style={{ ...inputStyle, background: T.paper3, fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>
                  {valorRefObra !== null ? fmtEUR(valorRefObra * fatorIva(local)) : "—"}
                </div>
              </Field>
            </div>
          </div>

          <div style={{ marginTop: 14 }}><MargemOrcamento obra={local} commit={commit} /></div>

          <CutDivider label="Revisões do orçamento" />
          <RevisoesOrcamento obra={local} commit={commit} />

          <CutDivider label="Custos da Obra & Margem Real" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {custosObra.length === 0 && <div style={{ fontSize: 12, opacity: 0.55 }}>Sem custos registados para esta obra.</div>}
            {custosObra.map((c) => {
              const atrasada = c.dataVencimento && !c.pago && c.dataVencimento < todayISO();
              return (
                <div key={c.id} style={{
                  padding: "8px 10px", background: T.paper2, border: `1px solid ${atrasada ? T.rust : T.line}`, borderRadius: 8, fontSize: 13,
                  display: "flex", flexDirection: "column", gap: 6,
                }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) minmax(0,0.8fr) auto", gap: 8, alignItems: "center" }}>
                    <input style={{ ...inputStyle, fontSize: 12, minWidth: 0 }} value={c.descricao} onChange={(e) => onUpdateDespesa(c.id, { descricao: e.target.value })} />
                    <select style={{ ...selectStyle, fontSize: 12, minWidth: 0 }} value={c.categoria} onChange={(e) => onUpdateDespesa(c.id, { categoria: e.target.value })}>
                      {CATEGORIAS_DESPESA.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    <input type="number" style={{ ...inputStyle, fontSize: 12, minWidth: 0 }} value={c.valor ?? ""} onChange={(e) => onUpdateDespesa(c.id, { valor: e.target.value === "" ? null : Number(e.target.value) })} placeholder="€" />
                    <button onClick={() => onDeleteDespesa(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.rust }}><Trash2 size={13} /></button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,0.9fr) minmax(0,0.9fr) auto auto", gap: 8, alignItems: "center" }}>
                    <input style={{ ...inputStyle, fontSize: 11.5, minWidth: 0 }} list="fornecedores-datalist" placeholder="Fornecedor" value={c.fornecedor || ""} onChange={(e) => onUpdateDespesa(c.id, { fornecedor: e.target.value })} />
                    <input style={{ ...inputStyle, fontSize: 11.5, minWidth: 0 }} placeholder="Nº fatura" value={c.numeroFatura || ""} onChange={(e) => onUpdateDespesa(c.id, { numeroFatura: e.target.value })} />
                    <input type="date" style={{ ...inputStyle, fontSize: 11.5, minWidth: 0 }} value={c.dataVencimento || ""} onChange={(e) => onUpdateDespesa(c.id, { dataVencimento: e.target.value })} title="Data de vencimento" />
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, whiteSpace: "nowrap", color: c.pago ? T.green : (atrasada ? T.rust : T.ink), fontWeight: 600 }}>
                      <input type="checkbox" checked={!!c.pago} onChange={(e) => onUpdateDespesa(c.id, { pago: e.target.checked })} />
                      {c.pago ? "Paga" : atrasada ? "Atrasada" : "Pendente"}
                    </label>
                    {c.anexo ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <a href="#" onClick={(e) => { e.preventDefault(); abrirAnexo(c.anexo); }} title={c.anexo.nome} style={{ color: T.navy }}><FileType size={15} /></a>
                        <button onClick={() => removeAnexoFatura(c)} style={{ background: "none", border: "none", cursor: "pointer", color: T.rust }}><Trash2 size={12} /></button>
                      </div>
                    ) : (
                      <label style={{ cursor: "pointer", color: T.walnut, display: "flex", alignItems: "center" }} title="Anexar PDF da fatura">
                        <input type="file" accept=".pdf,image/*" style={{ display: "none" }} onChange={(e) => uploadAnexoFatura(c.id, e.target.files[0])} />
                        {uploadingFaturaId === c.id ? <Clock size={15} /> : <Upload size={15} />}
                      </label>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
                    <span style={{ opacity: 0.6 }}>IVA da fatura</span>
                    <select style={{ ...selectStyle, fontSize: 11.5, width: 120 }} value={despesaPct(c)} onChange={(e) => onUpdateDespesa(c.id, { ivaPct: Number(e.target.value) })}>
                      <option value={0}>Sem IVA</option>
                      <option value={23}>23%</option>
                    </select>
                    {despesaPct(c) > 0 && <span style={{ opacity: 0.6, fontFamily: "'Inter', sans-serif" }}>Base {fmtEUR(despesaBase(c))} + IVA {fmtEUR(despesaIvaValor(c))}</span>}
                  </div>
                </div>
              );
            })}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) minmax(0,0.8fr) minmax(0,0.7fr) auto", gap: 8 }}>
              <input style={inputStyle} placeholder="Descrição do custo" value={novoCusto.descricao} onChange={(e) => setNovoCusto((s) => ({ ...s, descricao: e.target.value }))} />
              <select style={selectStyle} value={novoCusto.categoria} onChange={(e) => setNovoCusto((s) => ({ ...s, categoria: e.target.value }))}>
                {CATEGORIAS_DESPESA.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <input type="number" style={inputStyle} placeholder="€ c/ IVA" value={novoCusto.valor} onChange={(e) => setNovoCusto((s) => ({ ...s, valor: e.target.value }))} />
              <select style={selectStyle} value={novoCusto.ivaPct} onChange={(e) => setNovoCusto((s) => ({ ...s, ivaPct: Number(e.target.value) }))} title="IVA da fatura">
                <option value={23}>IVA 23%</option>
                <option value={0}>Sem IVA</option>
              </select>
              <Btn small icon={Plus} onClick={addCusto}>Add</Btn>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,0.9fr) minmax(0,0.9fr)", gap: 8 }}>
              <input style={{ ...inputStyle, fontSize: 12 }} list="fornecedores-datalist" placeholder="Fornecedor (opcional)" value={novoCusto.fornecedor} onChange={(e) => setNovoCusto((s) => ({ ...s, fornecedor: e.target.value }))} />
              <input style={{ ...inputStyle, fontSize: 12 }} placeholder="Nº fatura (opcional)" value={novoCusto.numeroFatura} onChange={(e) => setNovoCusto((s) => ({ ...s, numeroFatura: e.target.value }))} />
              <input type="date" style={{ ...inputStyle, fontSize: 12 }} value={novoCusto.dataVencimento} onChange={(e) => setNovoCusto((s) => ({ ...s, dataVencimento: e.target.value }))} title="Data de vencimento (opcional)" />
            </div>
            {(custosObra.length > 0 || valorRefObra !== null) && (
              <div style={{ display: "flex", gap: 16, marginTop: 8, padding: "10px 12px", background: T.paper3, borderRadius: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", opacity: 0.6, fontWeight: 600 }}>Total de custos (sem IVA)</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 15, color: T.walnutDark }}>{fmtEUR(totalCustos)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", opacity: 0.6, fontWeight: 600 }}>Margem real</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 15, color: margemReal >= 0 ? T.green : T.rust }}>
                    {margemReal !== null ? fmtEUR(margemReal) : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", opacity: 0.6, fontWeight: 600 }}>Margem real %</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 15, color: margemReal >= 0 ? T.green : T.rust }}>
                    {margemRealPct !== null ? `${margemRealPct.toFixed(1)}%` : "—"}
                  </div>
                </div>
                {local.tipoCliente && (
                  <div>
                    <div style={{ fontSize: 10.5, textTransform: "uppercase", opacity: 0.6, fontWeight: 600 }}>Margem sugerida</div>
                    <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 15, opacity: 0.7 }}>
                      {tipoClienteOf(local.tipoCliente)?.margem}%
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <CutDivider label="Mão de Obra" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {horasObra.length === 0 && <div style={{ fontSize: 12, opacity: 0.55 }}>Sem horas registadas para esta obra.</div>}
            {horasObra.map((h) => (
              <div key={h.id} style={{
                display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,0.6fr) minmax(0,0.8fr) minmax(0,0.8fr) auto",
                gap: 8, alignItems: "center", padding: "7px 10px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 8, fontSize: 13,
              }}>
                <span>{(equipa || []).find((m) => m.id === h.funcionarioId)?.nome || "(removido)"}</span>
                <span style={{ fontFamily: "'Inter', sans-serif" }}>{h.horas}h</span>
                <span style={{ fontSize: 11.5, opacity: 0.6 }}>{fmtDate(h.data)}</span>
                <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, color: T.walnutDark }}>{fmtEUR(h.valor)}</span>
                <button onClick={() => onDeleteDespesa(h.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.rust }}><Trash2 size={13} /></button>
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,0.6fr) minmax(0,0.8fr) auto", gap: 8 }}>
              <select style={selectStyle} value={novaHora.funcionarioId} onChange={(e) => setNovaHora((s) => ({ ...s, funcionarioId: e.target.value }))}>
                <option value="">— Funcionário —</option>
                {(equipa || []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
              <input type="number" style={inputStyle} placeholder="Horas" value={novaHora.horas} onChange={(e) => setNovaHora((s) => ({ ...s, horas: e.target.value }))} />
              <input type="date" style={inputStyle} value={novaHora.data} onChange={(e) => setNovaHora((s) => ({ ...s, data: e.target.value }))} />
              <Btn small icon={Plus} onClick={addHoras}>Add</Btn>
            </div>
            {horasObra.length > 0 && (
              <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 2 }}>
                Total: {totalHoras}h — {fmtEUR(horasObra.reduce((s, h) => s + (Number(h.valor) || 0), 0))} (já incluído no Total de custos acima)
              </div>
            )}
            {(equipa || []).length === 0 && (
              <div style={{ fontSize: 11.5, opacity: 0.55 }}>Ainda não há ninguém na equipa — adiciona em Financeiro → Equipa.</div>
            )}
          </div>

          <CutDivider label="Assistências / Garantia" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(local.assistencias || []).length === 0 && <div style={{ fontSize: 12, opacity: 0.55 }}>Sem assistências registadas.</div>}
            {(local.assistencias || []).map((a) => (
              <div key={a.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
                background: a.estado === "aberta" ? mix(T.rust, 9) : T.paper2,
                border: `1px solid ${a.estado === "aberta" ? T.rust : T.line}`, borderRadius: 8, fontSize: 13,
              }}>
                <input type="checkbox" checked={a.estado === "resolvida"} onChange={() => toggleAssistencia(a.id)} title="Marcar como resolvida" />
                <span style={{ flex: 1, textDecoration: a.estado === "resolvida" ? "line-through" : "none", opacity: a.estado === "resolvida" ? 0.6 : 1 }}>{a.descricao}</span>
                <span style={{ fontSize: 11, opacity: 0.55, whiteSpace: "nowrap" }}>
                  {a.estado === "resolvida" ? `Resolvida ${fmtDate(a.dataResolucao)}` : `Reportada ${fmtDate(a.dataReportada)}`}
                </span>
                <button onClick={() => removeAssistencia(a.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.rust }}><Trash2 size={13} /></button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} placeholder="ex: Porta empenada, precisa de ajuste"
                value={novaAssistencia} onChange={(e) => setNovaAssistencia(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addAssistencia(); }} />
              <Btn small icon={Plus} onClick={addAssistencia}>Reportar</Btn>
            </div>
          </div>

          {PLANO_VISIVEL_KEYS.includes(local.estado) && (() => {
            const previsao = PLANO_PREVISAO_KEYS.includes(local.estado);
            const somaPlano = (local.pagamentos || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
            const esperado = valorRefObra !== null ? valorRefObra * fatorIva(local) : null;
            const desatualizado = esperado !== null && (local.pagamentos || []).length > 0 && Math.abs(somaPlano - esperado) > 0.05;
            return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.walnutDark, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Plano de pagamentos (com IVA){previsao ? " — previsão" : ""}
                </span>
                {valorRefObra !== null && !(local.pagamentos || []).some((p) => p.pago) && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 11.5, opacity: 0.6 }}>{(local.pagamentos || []).length ? "Refazer plano:" : "Gerar:"}</span>
                    {ESQUEMAS_PAGAMENTO.map((e) => <Btn key={e.key} small variant="ghost" onClick={() => gerarPagamentos(e)}>{e.label}</Btn>)}
                  </div>
                )}
              </div>
              {previsao && (
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                  Ainda é só uma previsão: não conta para receitas nem para o "por receber" até o orçamento ser aceite.
                </div>
              )}
              {desatualizado && (
                <div style={{ fontSize: 12, color: T.rust, marginBottom: 8 }}>
                  A soma do plano ({fmtEUR(somaPlano)}) não bate com o valor da obra com IVA ({fmtEUR(esperado)}). Se mudaste o valor do orçamento, refaz o plano com um dos botões.
                </div>
              )}
              {local.pagamentos && local.pagamentos.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {local.pagamentos.map((p, i) => (
                    <div key={i} style={{
                      padding: "7px 10px",
                      background: p.pago ? mix(T.green, 13) : T.paper2, borderRadius: 8,
                      border: `1px solid ${T.line}`, fontSize: 13,
                      display: "flex", flexDirection: "column", gap: 6,
                    }}>
                      <div style={{
                        display: "grid", gridTemplateColumns: "auto minmax(0,1.4fr) minmax(0,0.8fr) minmax(0,0.9fr) auto",
                        gap: 8, alignItems: "center",
                      }}>
                        {previsao ? <span style={{ width: 13 }} /> : <input type="checkbox" checked={!!p.pago} onChange={() => togglePagamento(i)} title="Pago" />}
                        <input style={{ ...inputStyle, fontSize: 12 }} value={p.label} onChange={(e) => updatePagamento(i, { label: e.target.value })} />
                        <input type="number" style={{ ...inputStyle, fontSize: 12 }} value={p.valor ?? ""} placeholder="€"
                          onChange={(e) => updatePagamento(i, { valor: e.target.value === "" ? null : Number(e.target.value) })} />
                        <input type="date" style={{ ...inputStyle, fontSize: 12 }} value={p.data || ""} onChange={(e) => updatePagamento(i, { data: e.target.value })} />
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {p.pago && <CheckCircle2 size={15} color={T.green} />}
                          <button onClick={() => removePagamento(i)} style={{ background: "none", border: "none", cursor: "pointer", color: T.rust, padding: 2 }}><Trash2 size={13} /></button>
                        </div>
                      </div>
                      {fatorIva(local) > 1 && Number(p.valor) > 0 && (
                        <div style={{ fontSize: 11, opacity: 0.6, fontFamily: "'Inter', sans-serif" }}>
                          Base {fmtEUR(semIva(local, p.valor))} + IVA {fmtEUR(Number(p.valor) - semIva(local, p.valor))}
                        </div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: p.pago ? "minmax(0,1fr) auto" : "auto", gap: 8, alignItems: "center" }}>
                        {p.pago && (
                          <select style={{ ...selectStyle, fontSize: 11.5 }} value={p.metodo || ""} onChange={(e) => updatePagamento(i, { metodo: e.target.value })}>
                            <option value="">— Como foi recebido? —</option>
                            {METODOS_PAGAMENTO.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        )}
                        <label style={{
                          display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, whiteSpace: "nowrap", opacity: 0.75,
                        }}>
                          <input type="checkbox" checked={!!p.faturaEmitida} onChange={(e) => updatePagamento(i, { faturaEmitida: e.target.checked })} />
                          Faturado
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>Sem valor adjudicado definido ou plano ainda não gerado.</div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,0.8fr) minmax(0,0.9fr) auto", gap: 8, marginTop: 6 }}>
                <input style={inputStyle} placeholder="ex: 2ª prestação" value={novoPagamento.label} onChange={(e) => setNovoPagamento((s) => ({ ...s, label: e.target.value }))} />
                <input type="number" style={inputStyle} placeholder="€" value={novoPagamento.valor} onChange={(e) => setNovoPagamento((s) => ({ ...s, valor: e.target.value }))} />
                <input type="date" style={inputStyle} value={novoPagamento.data} onChange={(e) => setNovoPagamento((s) => ({ ...s, data: e.target.value }))} />
                <Btn small icon={Plus} onClick={addPagamentoManual}>Add</Btn>
              </div>
              <div style={{ fontSize: 11.5, opacity: 0.55, marginTop: 4 }}>
                A data pode ser a prevista (ainda não pago) ou a data em que recebeste — fica preenchida automaticamente com hoje quando marcas como pago, mas podes sempre corrigir.
              </div>
            </div>
            );
          })()}

          {emails.some((e) => e.obraId === obra.id) && (
            <>
              <CutDivider label="Emails ligados" />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                {emails.filter((e) => e.obraId === obra.id).sort((a, b) => (b.data || "").localeCompare(a.data || "")).map((e) => (
                  <EmailItem key={e.id} email={e} obras={[]} onUpdate={onUpdateEmail} mostrarObra={false} />
                ))}
              </div>
            </>
          )}

          <CutDivider label="Fornecedores / Pedidos de Cotação" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            {(local.cotacoes || []).length === 0 && (
              <div style={{ fontSize: 12, opacity: 0.55 }}>Sem pedidos de cotação registados para esta obra.</div>
            )}
            {(local.cotacoes || []).map((c, i) => (
              <div key={c.id || i} style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1.1fr) minmax(0,0.55fr) minmax(0,0.8fr) minmax(0,0.9fr) auto",
                gap: 6, alignItems: "center", minWidth: 0,
                padding: "8px 10px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 8,
              }}>
                <input style={{ ...inputStyle, fontSize: 12, minWidth: 0 }} value={c.fornecedor} list="fornecedores-datalist"
                  onChange={(e) => updateCotacao(i, { fornecedor: e.target.value })} placeholder="Fornecedor" />
                <input style={{ ...inputStyle, fontSize: 12, minWidth: 0 }} value={c.material}
                  onChange={(e) => updateCotacao(i, { material: e.target.value })} placeholder="Material / serviço" />
                <input style={{ ...inputStyle, fontSize: 12, minWidth: 0 }} value={c.quantidade || ""} placeholder="Qtd."
                  onChange={(e) => updateCotacao(i, { quantidade: e.target.value })} />
                <input type="number" style={{ ...inputStyle, fontSize: 12, minWidth: 0 }} value={c.valor ?? ""} placeholder="Valor €"
                  onChange={(e) => updateCotacao(i, { valor: e.target.value === "" ? null : Number(e.target.value) })} />
                <select style={{ ...selectStyle, fontSize: 12, minWidth: 0 }} value={c.estado} onChange={(e) => updateCotacao(i, { estado: e.target.value })}>
                  {COTACAO_ESTADOS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <button onClick={() => removeCotacao(i)} title="Remover" style={{ background: "none", border: "none", cursor: "pointer", color: T.rust, padding: 4 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div style={{
              display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1.1fr) minmax(0,0.55fr) minmax(0,0.8fr) auto",
              gap: 6, marginTop: 4, minWidth: 0,
            }}>
              <input style={{ ...inputStyle, minWidth: 0 }} list="fornecedores-datalist" placeholder="Novo fornecedor…" value={novaCotacao.fornecedor} onChange={(e) => setNovaCotacao((s) => ({ ...s, fornecedor: e.target.value }))} />
              <input style={{ ...inputStyle, minWidth: 0 }} placeholder="Material / serviço" value={novaCotacao.material} onChange={(e) => setNovaCotacao((s) => ({ ...s, material: e.target.value }))} />
              <input style={{ ...inputStyle, minWidth: 0 }} placeholder="Qtd." value={novaCotacao.quantidade} onChange={(e) => setNovaCotacao((s) => ({ ...s, quantidade: e.target.value }))} />
              <input type="number" style={{ ...inputStyle, minWidth: 0 }} placeholder="Valor €" value={novaCotacao.valor} onChange={(e) => setNovaCotacao((s) => ({ ...s, valor: e.target.value }))} />
              <Btn small icon={Plus} onClick={addCotacao}>Pedir</Btn>
            </div>
            <datalist id="fornecedores-datalist">
              {fornecedorNomesList.map((n) => <option key={n} value={n} />)}
            </datalist>

            {(local.cotacoes || []).length > 0 && (
              <div style={{ display: "flex", gap: 16, marginTop: 8, padding: "10px 12px", background: T.paper3, borderRadius: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", opacity: 0.6, fontWeight: 600 }}>Total pedido nesta obra</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 15, color: T.walnutDark }}>{fmtEUR(totalCotacoes)}</div>
                </div>
                {cotacoesPorFornecedor.map(([nome, total]) => (
                  <div key={nome}>
                    <div style={{ fontSize: 10.5, textTransform: "uppercase", opacity: 0.6, fontWeight: 600 }}>{nome}</div>
                    <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 15 }}>{fmtEUR(total)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <CutDivider label="Ficheiros da obra" />
          <FicheirosObra obra={local} commit={commit} />

          <CutDivider label="Lista de corte" />
          <ListaCorte key={obra.id} obra={local} commit={commit} />

          <CutDivider label="Próxima ação" />
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <Field label="O que falta fazer">
              <input style={inputStyle} value={local.proximaAcaoTexto || ""} onChange={(e) => set({ proximaAcaoTexto: e.target.value })} onBlur={() => commit({ proximaAcaoTexto: local.proximaAcaoTexto })} />
            </Field>
            <Field label="Para quando">
              <input type="date" style={inputStyle} value={local.proximaAcaoData || ""} onChange={(e) => commit({ proximaAcaoData: e.target.value })} />
            </Field>
          </div>

          <SeguimentoObra obra={local} emails={emails} onPatch={commit} onEstado={handleEstadoChange} />

          <CutDivider label="Histórico de contactos" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 180, overflowY: "auto" }}>
            {(local.historico || []).slice().reverse().map((h, i) => (
              <div key={i} style={{ fontSize: 13, borderLeft: `3px solid ${T.walnut}`, paddingLeft: 10 }}>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, opacity: 0.6, marginRight: 6 }}>{fmtDate(h.data)}</span>
                {h.texto}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, opacity: 0.6 }}>Registar contacto:</span>
            {[["chamada", Phone, "Chamada"], ["WhatsApp", MessageCircle, "WhatsApp"], ["email", Mail, "Email"]].map(([canal, Ico, nome]) => (
              <Btn key={canal} small variant="ghost" icon={Ico} onClick={() => { onAddHistorico(obra.id, `Seguimento: contacto por ${canal}${novaNota.trim() ? " — " + novaNota.trim() : ""}.`); setNovaNota(""); }}>{nome}</Btn>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...inputStyle, flex: 1 }} placeholder="Nota opcional (junta-se ao contacto) ou atualização livre…" value={novaNota} onChange={(e) => setNovaNota(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && novaNota.trim()) { onAddHistorico(obra.id, novaNota.trim()); setNovaNota(""); } }} />
            <Btn small onClick={() => { if (novaNota.trim()) { onAddHistorico(obra.id, novaNota.trim()); setNovaNota(""); } }}>Adicionar</Btn>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, borderTop: `1px solid ${T.line}` }}>
            {confirmDelete ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.rust }}>Eliminar esta obra definitivamente?</span>
                <Btn small variant="danger" onClick={() => { onDelete(obra.id); onClose(); }}>Sim, eliminar</Btn>
                <Btn small variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Btn>
              </div>
            ) : (
              <Btn small variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>Eliminar obra</Btn>
            )}
            <Btn onClick={onClose}>Fechar</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   MODAL — NOVA OBRA
   ============================================================ */
function NovaObraModal({ onClose, onCreate, suggestedRef, clientesNomes, refsExistentes = [], prefill = {} }) {
  const [editRef, setEditRef] = useState(false);
  const [f, setF] = useState({
    ref: suggestedRef, cliente: "", projeto: "", descricao: "", canal: "", dataEntrada: todayISO(), estado: "orcamentar",
    ...prefill,
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const refDuplicada = !!f.ref && refsExistentes.some((r) => (r || "").trim().toLowerCase() === f.ref.trim().toLowerCase());
  const submit = () => {
    if (!f.cliente.trim() || !f.projeto.trim() || refDuplicada) return;
    onCreate(f);
    onClose();
  };
  return (
    <div className="ui-overlay" style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.paper, borderRadius: 18, width: "100%", maxWidth: 480, border: `1px solid ${T.line}`, padding: 24, boxShadow: "var(--shadow-lg)" }}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 16, color: T.ink }}>Novo pedido / orçamento</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Nº de orçamento (sugerido)">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input style={{ ...inputStyle, fontFamily: "'Inter', sans-serif", fontWeight: 600, background: editRef ? T.paper2 : T.paper3 }}
                value={f.ref} readOnly={!editRef} onChange={(e) => set("ref", e.target.value)} />
              <Btn variant="ghost" onClick={() => setEditRef((v) => !v)}>{editRef ? "Confirmar" : "Alterar"}</Btn>
            </div>
            {refDuplicada && <div style={{ color: T.rust, fontSize: 11.5, marginTop: 4 }}>Já existe uma obra com este número.</div>}
          </Field>
          <Field label="Cliente *">
            <input style={inputStyle} list="clientes-datalist-novo" value={f.cliente} onChange={(e) => set("cliente", e.target.value)} autoFocus />
            <datalist id="clientes-datalist-novo">
              {(clientesNomes || []).map((n) => <option key={n} value={n} />)}
            </datalist>
          </Field>
          <Field label="Projeto / Obra *">
            <input style={inputStyle} value={f.projeto} onChange={(e) => set("projeto", e.target.value)} />
          </Field>
          <Field label="Descrição">
            <textarea style={textareaStyle} rows={2} value={f.descricao} onChange={(e) => set("descricao", e.target.value)} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Canal de entrada">
              <input style={inputStyle} placeholder="email, whatsapp, telefone…" value={f.canal} onChange={(e) => set("canal", e.target.value)} />
            </Field>
            <Field label="Data de entrada">
              <input type="date" style={inputStyle} value={f.dataEntrada} onChange={(e) => set("dataEntrada", e.target.value)} />
            </Field>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn icon={Plus} onClick={submit}>Criar obra</Btn>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PAINEL (DASHBOARD)
   ============================================================ */
function Painel({ obras, onOpen, emails = [], onAddHistorico, onChangeEstado }) {
  const seguimentos = useMemo(() => seguimentosPendentes(obras, emails), [obras, emails]);
  const kpis = useMemo(() => {
    const emPipeline = obras.filter((o) => ACTIVE_KEYS.includes(o.estado));
    const valorPipeline = emPipeline.reduce((s, o) => s + (Number(o.valorOrcamento) || 0), 0);
    const adjudicadas = obras.filter((o) => WON_KEYS.includes(o.estado));
    const rejeitadas = obras.filter((o) => LOST_KEYS.includes(o.estado));
    const taxaConversao = (adjudicadas.length + rejeitadas.length) > 0
      ? Math.round((adjudicadas.length / (adjudicadas.length + rejeitadas.length)) * 100) : 0;
    const emProducao = obras.filter((o) => o.estado === "producao").length;
    const valorAdjudicadoTotal = adjudicadas.reduce((s, o) => s + (valorTotalObra(o) || 0), 0);
    return { emPipelineCount: emPipeline.length, valorPipeline, taxaConversao, emProducao, valorAdjudicadoTotal, adjudicadasCount: adjudicadas.length, rejeitadasCount: rejeitadas.length };
  }, [obras]);

  const acoesPendentes = useMemo(() => {
    return obras
      .filter((o) => o.proximaAcaoData && !["concluido", "sem_resposta", ...REJECTED_KEYS].includes(o.estado))
      .sort((a, b) => (a.proximaAcaoData || "").localeCompare(b.proximaAcaoData || ""))
      .slice(0, 8);
  }, [obras]);

  const porEstado = useMemo(() => {
    return STAGES.map((s) => ({ name: s.label, valor: obras.filter((o) => o.estado === s.key).length, color: s.color }));
  }, [obras]);

  const assistenciasAbertas = useMemo(() => {
    const list = [];
    obras.forEach((o) => (o.assistencias || []).forEach((a) => {
      if (a.estado === "aberta") list.push({ obraId: o.id, projeto: o.projeto, cliente: o.cliente, ...a });
    }));
    return list.sort((a, b) => (a.dataReportada || "").localeCompare(b.dataReportada || ""));
  }, [obras]);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 8 }}>
        <KpiCard icon={Package} label="Em pipeline" value={kpis.emPipelineCount} sub={`${fmtEUR(kpis.valorPipeline)} orçamentados`} />
        <KpiCard icon={TrendingUp} label="Taxa de conversão" value={`${kpis.taxaConversao}%`} sub={`${kpis.adjudicadasCount} ganhas / ${kpis.rejeitadasCount} perdidas`} accent={T.green} />
        <KpiCard icon={Wrench} label="Em produção" value={kpis.emProducao} sub="Obras a decorrer" accent={T.walnut} />
        <KpiCard icon={Euro} label="Valor adjudicado" value={fmtEUR(kpis.valorAdjudicadoTotal)} sub="Acumulado (ex-IVA)" accent={T.navy} />
      </div>

      <CutDivider label="Obras por estado" />
      <div style={{ background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 10, padding: "16px 20px", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={porEstado} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.line} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "Inter" }} interval={0} angle={-20} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11, fontFamily: "Inter" }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontFamily: "Inter", fontSize: 12, borderRadius: 8, border: `1px solid ${T.line}` }} />
            <Bar dataKey="valor" radius={[3, 3, 0, 0]}>
              {porEstado.map((s, i) => <Cell key={i} fill={s.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {seguimentos.length > 0 && (
        <>
          <CutDivider label={`Para dar seguimento (${seguimentos.length})`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
            {seguimentos.slice(0, 12).map(({ obra: o, dias, motivo }) => (
              <div key={o.id} onClick={() => onOpen(o.id)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", flexWrap: "wrap",
                background: mix(T.amber, 9), border: `1px solid ${mix(T.amber, 38)}`, borderRadius: 10, cursor: "pointer", fontSize: 13,
              }}>
                <Clock size={15} color={T.amber} />
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, opacity: 0.75, minWidth: 64 }}>{dias} dias úteis</span>
                <span style={{ fontWeight: 600 }}>{o.projeto}</span>
                <span style={{ opacity: 0.6 }}>— {o.cliente}</span>
                <Tag color={stageOf(o.estado).color}>{stageOf(o.estado).label}</Tag>
                {SEGUIMENTO_TEXTO[o.estado] && <span style={{ fontSize: 12, opacity: 0.7 }}>{SEGUIMENTO_TEXTO[o.estado]}</span>}
                {motivo === "ultrapassada" && <span style={{ fontSize: 12, color: T.rust }}>a data prevista já passou ({dias} dias úteis)</span>}
                {SEGUIMENTO_ARQUIVAVEL.includes(o.estado) && followupsFeitos(o) >= 1 && <span style={{ fontSize: 12, opacity: 0.7 }}>1.º follow-up feito, falta o email de arquivo</span>}
                <span style={{ marginLeft: "auto" }} onClick={(e) => e.stopPropagation()}>
                  {o.estado === "orcamentar"
                    ? (onAddHistorico && <Btn small variant="ghost" icon={Clock} onClick={() => onAddHistorico(o.id, "Seguimento: lembrete adiado (orçamento ainda em preparação).")}>Adiar</Btn>)
                    : SEGUIMENTO_ARQUIVAVEL.includes(o.estado) && followupsFeitos(o) >= 1
                      ? (onChangeEstado && <Btn small icon={Check} onClick={() => onChangeEstado(o.id, "sem_resposta")}>Enviei email de arquivo</Btn>)
                      : (onAddHistorico && <Btn small icon={Check} onClick={() => onAddHistorico(o.id, "Seguimento: cliente contactado.")}>{SEGUIMENTO_ARQUIVAVEL.includes(o.estado) ? "Já contactei (1.º follow-up)" : "Já contactei"}</Btn>)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <CutDivider label="Próximas ações" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {acoesPendentes.length === 0 && <div style={{ fontSize: 13, opacity: 0.6 }}>Sem ações agendadas.</div>}
        {acoesPendentes.map((o) => {
          const late = isOverdue(o.proximaAcaoData, o.estado);
          return (
            <div key={o.id} onClick={() => onOpen(o.id)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
              background: late ? mix(T.rust, 10) : T.paper2, border: `1px solid ${late ? mix(T.rust, 40) : T.line}`,
              borderRadius: 10, cursor: "pointer", fontSize: 13,
            }}>
              {late ? <AlertTriangle size={15} color={T.rust} /> : <Clock size={15} color={T.walnut} />}
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, opacity: 0.7, minWidth: 78 }}>{fmtDate(o.proximaAcaoData)}</span>
              <span style={{ fontWeight: 600 }}>{o.projeto}</span>
              <span style={{ opacity: 0.6 }}>— {o.proximaAcaoTexto || "seguimento"}</span>
              <span style={{ marginLeft: "auto" }}><Tag color={stageOf(o.estado).color}>{stageOf(o.estado).label}</Tag></span>
            </div>
          );
        })}
      </div>

      {assistenciasAbertas.length > 0 && (
        <>
          <CutDivider label="Assistências em aberto" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {assistenciasAbertas.map((a) => (
              <div key={a.id} onClick={() => onOpen(a.obraId)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                background: mix(T.rust, 9), border: `1px solid ${mix(T.rust, 40)}`, borderRadius: 10, cursor: "pointer", fontSize: 13,
              }}>
                <AlertTriangle size={15} color={T.rust} />
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, opacity: 0.7, minWidth: 78 }}>{fmtDate(a.dataReportada)}</span>
                <span style={{ fontWeight: 600 }}>{a.projeto}</span>
                <span style={{ opacity: 0.6 }}>— {a.descricao}</span>
                <span style={{ marginLeft: "auto", opacity: 0.6, fontSize: 11.5 }}>{a.cliente}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   PIPELINE (KANBAN)
   ============================================================ */
const STAGES_ARQUIVO = ["rejeitado_nos", "rejeitado_cliente", "sem_resposta"];

function Pipeline({ obras, onOpen, onChangeEstado }) {
  const [draggingId, setDraggingId] = useState(null);
  const [overStage, setOverStage] = useState(null);
  const [q, setQ] = useState("");
  const [verArquivo, setVerArquivo] = useState(false);
  const scrollerRef = useRef(null);
  const pan = useRef(null);
  const [panning, setPanning] = useState(false);

  // Agarrar e deslizar: arrastar numa zona vazia (não num cartão) desloca o quadro
  const onPanDown = (e) => {
    if (e.button !== 0 || e.target.closest("[draggable='true'], button, input, a")) return;
    const el = scrollerRef.current;
    pan.current = { x: e.clientX, left: el.scrollLeft };
    setPanning(true);
    const mover = (ev) => { if (pan.current) el.scrollLeft = pan.current.left - (ev.clientX - pan.current.x); };
    const largar = () => { pan.current = null; setPanning(false); window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", largar); };
    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", largar);
  };
  const deslizar = (dir) => scrollerRef.current?.scrollBy({ left: dir * 600, behavior: "smooth" });
  // Ao arrastar um cartão para a beira, o quadro desloca-se sozinho
  const autoScroll = (e) => {
    const el = scrollerRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    if (e.clientX < r.left + 90) el.scrollLeft -= 22;
    else if (e.clientX > r.right - 90) el.scrollLeft += 22;
  };

  const handleDrop = (e, stageKey) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || draggingId;
    if (id) onChangeEstado(id, stageKey);
    setDraggingId(null);
    setOverStage(null);
  };

  const nq = q.trim().toLowerCase();
  const filtradas = nq
    ? obras.filter((o) => `${o.ref} ${o.projeto} ${o.cliente} ${o.donoObra || ""}`.toLowerCase().includes(nq))
    : obras;
  const nArquivadas = obras.filter((o) => STAGES_ARQUIVO.includes(o.estado)).length;
  const colunas = STAGES.filter((st) => !STAGES_ARQUIVO.includes(st.key) || verArquivo || draggingId);
  const valorAtivo = obras.filter((o) => !STAGES_ARQUIVO.includes(o.estado) && !["concluido"].includes(o.estado))
    .reduce((acc, o) => acc + (valorTotalObra(o) || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ position: "relative", flex: "0 1 320px" }}>
          <Search size={15} style={{ position: "absolute", left: 11, top: 10, opacity: 0.45 }} />
          <input style={{ ...inputStyle, width: "100%", paddingLeft: 33 }} placeholder="Filtrar por cliente, obra ou referência…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span style={{ fontSize: 12.5, opacity: 0.6 }}>Em aberto: <b style={{ color: T.walnutDark, opacity: 1 }}>{fmtEUR(valorAtivo)}</b> (ex-IVA)</span>
        <div style={{ flex: 1 }} />
        <Btn small variant="ghost" onClick={() => setVerArquivo((v) => !v)}>
          {verArquivo ? "Esconder arquivadas" : `Mostrar arquivadas (${nArquivadas})`}
        </Btn>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="round-btn" style={{ width: 32, height: 32 }} onClick={() => deslizar(-1)} title="Deslizar para a esquerda"><ChevronLeft size={16} /></button>
          <button className="round-btn" style={{ width: 32, height: 32 }} onClick={() => deslizar(1)} title="Deslizar para a direita"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div ref={scrollerRef} className="kanban-scroll" onMouseDown={onPanDown} onDragOver={autoScroll} style={{ display: "flex", gap: 14, alignItems: "flex-start", overflowX: "auto", paddingBottom: 16, margin: "0 -4px", padding: "0 4px 16px", minHeight: "calc(100vh - 230px)", cursor: panning ? "grabbing" : "grab", userSelect: panning ? "none" : undefined }}>
        {colunas.map((stage) => {
          const items = filtradas.filter((o) => o.estado === stage.key);
          const total = items.reduce((acc, o) => acc + (valorTotalObra(o) || 0), 0);
          const isOver = overStage === stage.key;
          return (
            <div key={stage.key} style={{ flex: "0 0 280px", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px 10px" }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: stage.color, flex: "none" }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: T.walnutDark, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stage.label}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, background: T.paper3, color: T.ink, borderRadius: 999, padding: "1px 8px" }}>{items.length}</span>
              </div>
              {total > 0 && <div style={{ fontSize: 12, opacity: 0.55, padding: "0 4px 8px", marginTop: -4 }}>{fmtEUR(total)}</div>}
              <div
                onDragOver={(e) => { e.preventDefault(); if (overStage !== stage.key) setOverStage(stage.key); }}
                onDragLeave={(e) => { if (e.currentTarget === e.target) setOverStage(null); }}
                onDrop={(e) => handleDrop(e, stage.key)}
                style={{
                  background: isOver ? mix(stage.color, 12) : mix(T.ink, 4),
                  border: `1.5px ${isOver ? "solid" : "dashed"} ${isOver ? stage.color : "transparent"}`,
                  borderTop: `3px solid ${stage.color}`, borderRadius: 12, padding: 8, minHeight: 120,
                  display: "flex", flexDirection: "column", gap: 8, transition: "background .15s, border-color .15s",
                }}
              >
                {items.map((o) => {
                  const late = isOverdue(o.proximaAcaoData, o.estado);
                  const cotacoesPendentes = (o.cotacoes || []).filter((c) => c.estado === "pedido").length;
                  const assistenciasAbertas = (o.assistencias || []).filter((a) => a.estado === "aberta").length;
                  const isDragging = draggingId === o.id;
                  return (
                    <div
                      key={o.id}
                      className="ui-card hoverable"
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.id); e.dataTransfer.effectAllowed = "move"; setDraggingId(o.id); }}
                      onDragEnd={() => { setDraggingId(null); setOverStage(null); }}
                      onClick={() => onOpen(o.id)}
                      style={{
                        background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 10, padding: "11px 12px",
                        cursor: "grab", minWidth: 0, opacity: isDragging ? 0.4 : 1, boxShadow: "var(--shadow-sm)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: T.ink, opacity: 0.5 }}>{o.ref || "sem ref."}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {(() => { const mo = margemOrcamento(o); return mo.nivel && mo.nivel !== "ok" && ACTIVE_KEYS.includes(o.estado)
                            ? <span title={`Margem prevista ${mo.pct.toFixed(0)}% (meta ${mo.meta}%)`} style={{ fontSize: 10.5, fontWeight: 700, color: mo.nivel === "baixa" ? T.rust : T.amber }}>margem {mo.pct.toFixed(0)}%</span> : null; })()}
                          {late && <AlertTriangle size={14} color={T.rust} />}
                        </span>
                      </div>
                      <div style={{ fontWeight: 650, fontSize: 13.5, color: T.ink, marginTop: 3, lineHeight: 1.3, wordBreak: "break-word" }}>{o.projeto}</div>
                      <div style={{ fontSize: 12.5, opacity: 0.6, marginTop: 2, wordBreak: "break-word" }}>{o.cliente}</div>
                      {o.donoObra && o.donoObra !== o.cliente && (
                        <div style={{ fontSize: 11.5, opacity: 0.5, marginTop: 1, wordBreak: "break-word" }}>Dono: {o.donoObra}</div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.walnutDark }}>{valorTotalObra(o) !== null ? fmtEUR(valorTotalObra(o)) : <span style={{ opacity: 0.35, fontWeight: 500 }}>sem valor</span>}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {(o.anexos || []).length > 0 && (
                            <span title="Anexos" style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, opacity: 0.65 }}><Paperclip size={12} /> {o.anexos.length}</span>
                          )}
                          {cotacoesPendentes > 0 && (
                            <span title="Cotações por receber" style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, color: T.navy }}><FileText size={12} /> {cotacoesPendentes}</span>
                          )}
                          {assistenciasAbertas > 0 && (
                            <span title="Assistências em aberto" style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, color: T.rust }}><AlertTriangle size={12} /> {assistenciasAbertas}</span>
                          )}
                          <span style={{ fontSize: 11, opacity: 0.45 }}>{fmtDate(o.dataEntrada)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <div style={{ fontSize: 12, opacity: 0.4, textAlign: "center", padding: "22px 0" }}>
                    {draggingId ? "Larga aqui" : "Sem obras"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   TABELA DE OBRAS
   ============================================================ */
function ObrasTab({ obras, onOpen, onNew }) {
  const [q, setQ] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("todos");
  const [sortDesc, setSortDesc] = useState(true);

  const filtradas = useMemo(() => {
    let list = obras.filter((o) => {
      const matchQ = !q || `${o.cliente} ${o.projeto} ${o.descricao} ${o.ref || ""}`.toLowerCase().includes(q.toLowerCase());
      const matchEstado = estadoFiltro === "todos" || o.estado === estadoFiltro;
      return matchQ && matchEstado;
    });
    list = list.slice().sort((a, b) => {
      const da = a.dataEntrada || "";
      const db = b.dataEntrada || "";
      return sortDesc ? db.localeCompare(da) : da.localeCompare(db);
    });
    return list;
  }, [obras, q, estadoFiltro, sortDesc]);

  const exportCSV = () => {
    const headers = ["Referência", "Cliente", "Projeto", "Estado", "Data Entrada", "Valor Orçamento", "Valor Adjudicado", "Próxima Ação", "Data Próxima Ação"];
    const rows = filtradas.map((o) => [
      o.ref || "", o.cliente, o.projeto, stageOf(o.estado).label, o.dataEntrada || "",
      o.valorOrcamento || "", o.valorAdjudicado || "", o.proximaAcaoTexto || "", o.proximaAcaoData || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `carpinova-obras-${todayISO()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 240px" }}>
          <Search size={14} style={{ position: "absolute", left: 9, top: 9, opacity: 0.5 }} />
          <input style={{ ...inputStyle, width: "100%", paddingLeft: 28 }} placeholder="Pesquisar cliente, projeto, referência…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select style={selectStyle} value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
          <option value="todos">Todos os estados</option>
          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <Btn variant="ghost" small onClick={() => setSortDesc((s) => !s)}>Data {sortDesc ? "↓" : "↑"}</Btn>
        <Btn variant="ghost" small icon={Download} onClick={exportCSV}>Exportar CSV</Btn>
        <Btn small icon={Plus} onClick={onNew}>Nova obra</Btn>
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${T.line}`, borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: T.paper3, textAlign: "left" }}>
              {["Ref.", "Cliente", "Projeto", "Estado", "Entrada", "Valor", "Próxima Ação"].map((h) => (
                <th key={h} style={{ padding: "9px 12px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: T.walnutDark, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((o, i) => {
              const late = isOverdue(o.proximaAcaoData, o.estado);
              return (
                <tr key={o.id} onClick={() => onOpen(o.id)} style={{
                  cursor: "pointer", background: i % 2 ? T.paper2 : T.paper,
                  borderTop: `1px solid ${T.line}`,
                }}>
                  <td style={{ padding: "9px 12px", fontFamily: "'Inter', sans-serif", fontSize: 11, whiteSpace: "nowrap" }}>{o.ref || "—"}</td>
                  <td style={{ padding: "9px 12px" }}>{o.cliente}</td>
                  <td style={{ padding: "9px 12px", fontWeight: 600 }}>{o.projeto}</td>
                  <td style={{ padding: "9px 12px" }}><Tag color={stageOf(o.estado).color}>{stageOf(o.estado).label}</Tag></td>
                  <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>{fmtDate(o.dataEntrada)}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap" }}>{fmtEUR(valorTotalObra(o))}</td>
                  <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                    {o.proximaAcaoData ? (
                      <span style={{ color: late ? T.rust : T.ink, fontWeight: late ? 700 : 400 }}>
                        {late && <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: -2 }} />}
                        {fmtDate(o.proximaAcaoData)}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
            {filtradas.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", opacity: 0.5 }}>Sem resultados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   FINANCEIRO
   ============================================================ */
function Financeiro({ obras, despesas, onAddDespesa, onUpdateDespesa, onDeleteDespesa, equipa, onAddMembro, onUpdateMembro, onDeleteMembro }) {
  const anos = useMemo(() => {
    const set = new Set();
    obras.forEach((o) => {
      const d = o.dataAdjudicacao || o.dataInicioObra || o.dataEntrada;
      if (d) set.add(d.slice(0, 4));
    });
    despesas.forEach((d) => { if (d.data) set.add(d.data.slice(0, 4)); });
    set.add(String(new Date().getFullYear()));
    return Array.from(set).sort().reverse();
  }, [obras, despesas]);
  const [ano, setAno] = useState(anos[0]);
  const [periodoTipo, setPeriodoTipo] = useState("ano"); // "ano" | "trimestre" | "mes"
  const [periodoValor, setPeriodoValor] = useState(1); // nº do trimestre (1-4) ou do mês (1-12)
  const [novaDespesa, setNovaDespesa] = useState({ descricao: "", categoria: CATEGORIAS_DESPESA[0], valor: "", data: todayISO(), recorrente: false });

  const MESES_NOMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  const despesasGerais = useMemo(() => despesas.filter((d) => !d.obraId), [despesas]);

  // Se uma obra foi rejeitada (por nós ou pelo cliente), esse gasto nunca
  // vai acontecer de verdade — não deve contar nas despesas da empresa.
  // Fica registado na ficha da obra para referência, mas sai daqui.
  const despesasObraValidas = useMemo(() => {
    const rejeitadasIds = new Set(obras.filter((o) => REJECTED_KEYS.includes(o.estado)).map((o) => o.id));
    return despesas.filter((d) => d.obraId && !rejeitadasIds.has(d.obraId));
  }, [despesas, obras]);

  // Uma despesa "Mensal" aplica-se a partir do mês em que foi lançada e
  // continua todos os meses seguintes — não é preciso lançá-la todo mês
  // à mão. Uma despesa não-mensal só conta no seu próprio mês.
  // Por defeito devolve o valor SEM IVA (custo real). Para tesouraria
  // (dinheiro que sai da conta) usa-se comIva = true.
  const despesaValorNoMes = (d, mesKey, comIva = false) => {
    if (!d.data || d.valor == null) return 0;
    const v = comIva ? (Number(d.valor) || 0) : despesaBase(d);
    const mesInicio = d.data.slice(0, 7);
    if (d.recorrente) return mesKey >= mesInicio ? v : 0;
    return mesInicio === mesKey ? v : 0;
  };

  const custosPorObra = useMemo(() => {
    const map = {};
    despesasObraValidas.forEach((d) => { map[d.obraId] = (map[d.obraId] || 0) + despesaBase(d); });
    return map;
  }, [despesasObraValidas]);

  const mesesDoAno = useMemo(() => Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`), [ano]);

  // Meses realmente incluídos consoante o período escolhido (ano inteiro,
  // um trimestre de 3 meses, ou um único mês).
  const mesesSelecionados = useMemo(() => {
    if (periodoTipo === "mes") return [mesesDoAno[periodoValor - 1]];
    if (periodoTipo === "trimestre") {
      const inicio = (periodoValor - 1) * 3;
      return mesesDoAno.slice(inicio, inicio + 3);
    }
    return mesesDoAno;
  }, [mesesDoAno, periodoTipo, periodoValor]);
  const mesesSelecionadosSet = useMemo(() => new Set(mesesSelecionados), [mesesSelecionados]);

  const periodoLabel = periodoTipo === "mes" ? `${MESES_NOMES[periodoValor - 1]} ${ano}`
    : periodoTipo === "trimestre" ? `T${periodoValor} ${ano}`
    : `${ano}`;

  const dadosMensais = useMemo(() => {
    return mesesSelecionados.map((mesKey) => {
      const receita = obras.filter((o) => WON_KEYS.includes(o.estado)).reduce((s, o) => {
        const d = o.dataAdjudicacao || o.dataInicioObra || o.dataEntrada;
        return d && d.slice(0, 7) === mesKey ? s + (valorTotalObra(o) || 0) : s;
      }, 0);
      const despesaGeral = despesasGerais.reduce((s, d) => s + despesaValorNoMes(d, mesKey), 0);
      const despesaObra = despesasObraValidas.reduce((s, d) => s + despesaValorNoMes(d, mesKey), 0);
      return { mes: monthLabel(mesKey), receita, despesa: despesaGeral + despesaObra, despesaGeral, despesaObra };
    });
  }, [obras, despesasGerais, despesasObraValidas, mesesSelecionados]);

  const despesasPorCategoria = useMemo(() => {
    const map = {};
    [...despesasGerais, ...despesasObraValidas].forEach((d) => {
      const total = mesesSelecionados.reduce((s, mesKey) => s + despesaValorNoMes(d, mesKey), 0);
      if (total > 0) map[d.categoria] = (map[d.categoria] || 0) + total;
    });
    return Object.entries(map).map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor);
  }, [despesasGerais, despesasObraValidas, mesesSelecionados]);

  const CATEGORIA_CORES = [T.walnut, T.amber, T.navy, T.green, T.rust, "#8A6A1E", "#5C6B8A", "#6B7F3E", "#3D4F44"];

  const custosFixosMensais = useMemo(
    () => despesasGerais.filter((d) => d.recorrente).reduce((s, d) => s + despesaBase(d), 0),
    [despesasGerais]
  );

  const totais = useMemo(() => {
    const won = obras.filter((o) => WON_KEYS.includes(o.estado));
    const valorPeriodo = dadosMensais.reduce((s, m) => s + m.receita, 0);
    const pipeline = obras.filter((o) => ACTIVE_KEYS.includes(o.estado)).reduce((s, o) => s + (Number(o.valorOrcamento) || 0), 0);
    const noPeriodo = (o) => mesesSelecionadosSet.has((o.dataEntrada || "").slice(0, 7));
    const rejeitadoValor = obras.filter((o) => LOST_KEYS.includes(o.estado) && noPeriodo(o)).reduce((s, o) => s + (Number(o.valorOrcamento) || 0), 0);
    const recusadoPorNosValor = obras.filter((o) => o.estado === "rejeitado_nos" && noPeriodo(o)).reduce((s, o) => s + (Number(o.valorOrcamento) || 0), 0);

    // "Por receber" reconcilia sempre com o Valor Orçamentado da obra —
    // não depende de teres criado uma linha de pagamento para cada
    // parcela nem de teres preenchido o Valor Adjudicado (que é só o
    // montante de arranque, não o valor total). Se só lançaste 1 de 3
    // prestações, o resto continua a contar como pendente.
    let pendente = 0, recebido = 0;
    const obrasSemValor = [];
    obras.filter((o) => COM_PAGAMENTOS_KEYS.includes(o.estado)).forEach((o) => {
      const recebidoObra = (o.pagamentos || []).reduce((s, p) => s + (p.pago ? (Number(p.valor) || 0) : 0), 0);
      recebido += recebidoObra;
      const valorRef = valorTotalComIva(o); // o cliente paga com IVA
      if (valorRef !== null && !isNaN(valorRef)) {
        pendente += Math.max(0, valorRef - recebidoObra);
      } else {
        // Sem nenhum valor definido — só temos as linhas itemizadas (se existirem).
        const somaItemizada = (o.pagamentos || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
        pendente += (o.pagamentos || []).reduce((s, p) => s + (!p.pago ? (Number(p.valor) || 0) : 0), 0);
        if (somaItemizada === 0) obrasSemValor.push(o);
      }
    });

    const totalDespesasGeraisAno = dadosMensais.reduce((s, m) => s + m.despesaGeral, 0);
    const totalCustosObrasAno = dadosMensais.reduce((s, m) => s + m.despesaObra, 0);
    const custosTotaisAno = totalDespesasGeraisAno + totalCustosObrasAno;
    const lucroLiquido = valorPeriodo - custosTotaisAno;
    const margemLiquidaPct = valorPeriodo > 0 ? (lucroLiquido / valorPeriodo) * 100 : null;

    return { valorAno: valorPeriodo, pipeline, rejeitadoValor, recusadoPorNosValor, pendente, recebido, totalCustosObrasAno, totalDespesasGeraisAno, custosTotaisAno, lucroLiquido, margemLiquidaPct, obrasSemValor };
  }, [obras, dadosMensais, mesesSelecionadosSet]);

  // Mesmo número de meses, imediatamente antes do período escolhido —
  // para comparar "este mês/trimestre/ano" com o anterior equivalente.
  const mesesAnteriores = useMemo(() => {
    const n = mesesSelecionados.length;
    return Array.from({ length: n }, (_, i) => addMonths(mesesSelecionados[0], -n + i));
  }, [mesesSelecionados]);

  const totaisAnteriores = useMemo(() => {
    let receita = 0, despesaGeral = 0, despesaObra = 0;
    mesesAnteriores.forEach((mesKey) => {
      receita += obras.filter((o) => WON_KEYS.includes(o.estado)).reduce((s, o) => {
        const d = o.dataAdjudicacao || o.dataInicioObra || o.dataEntrada;
        return d && d.slice(0, 7) === mesKey ? s + (valorTotalObra(o) || 0) : s;
      }, 0);
      despesaGeral += despesasGerais.reduce((s, d) => s + despesaValorNoMes(d, mesKey), 0);
      despesaObra += despesasObraValidas.reduce((s, d) => s + despesaValorNoMes(d, mesKey), 0);
    });
    const despesaTotal = despesaGeral + despesaObra;
    const lucro = receita - despesaTotal;
    return { receita, despesaTotal, lucro, margemPct: receita > 0 ? (lucro / receita) * 100 : null };
  }, [obras, despesasGerais, despesasObraValidas, mesesAnteriores]);

  // Concentração de clientes: quanto da receita do período vem de cada
  // cliente. Se um só cliente domina, é um risco a vigiar.
  const concentracaoClientes = useMemo(() => {
    const map = {};
    obras.filter((o) => WON_KEYS.includes(o.estado)).forEach((o) => {
      const d = o.dataAdjudicacao || o.dataInicioObra || o.dataEntrada;
      if (!d || !mesesSelecionadosSet.has(d.slice(0, 7))) return;
      map[o.cliente] = (map[o.cliente] || 0) + (valorTotalObra(o) || 0);
    });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    const lista = Object.entries(map)
      .map(([cliente, valor]) => ({ cliente, valor, pct: total > 0 ? (valor / total) * 100 : 0 }))
      .sort((a, b) => b.valor - a.valor);
    return { lista, total };
  }, [obras, mesesSelecionadosSet]);

  // Prazo médio de recebimento: dias entre a adjudicação e cada pagamento
  // efetivamente marcado como pago — histórico completo, não só o período
  // escolhido, para não dar valores instáveis com poucos dados.
  const prazoMedioRecebimento = useMemo(() => {
    const dias = [];
    obras.forEach((o) => {
      const inicio = o.dataAdjudicacao || o.dataEntrada;
      if (!inicio) return;
      (o.pagamentos || []).forEach((p) => {
        if (p.pago && p.data) {
          const diff = Math.round((new Date(p.data + "T00:00:00") - new Date(inicio + "T00:00:00")) / 86400000);
          if (!isNaN(diff) && diff >= 0) dias.push(diff);
        }
      });
    });
    if (!dias.length) return null;
    return Math.round(dias.reduce((s, d) => s + d, 0) / dias.length);
  }, [obras]);

  // Previsão de tesouraria: sempre os próximos 6 meses a partir de hoje,
  // independente do período escolhido acima (é sobre o que vem a seguir).
  const previsaoTesouraria = useMemo(() => {
    const hoje = new Date();
    const mesesFuturos = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    let acumulado = 0;
    return mesesFuturos.map((mk) => {
      let entradas = 0;
      obras.filter((o) => COM_PAGAMENTOS_KEYS.includes(o.estado)).forEach((o) => (o.pagamentos || []).forEach((p) => {
        if (!p.pago && p.data && p.data.slice(0, 7) === mk) entradas += Number(p.valor) || 0;
      }));
      const saidas = despesasGerais.reduce((s, d) => s + despesaValorNoMes(d, mk, true), 0);
      acumulado += entradas - saidas;
      return { mes: monthLabel(mk), entradas, saidas, saldo: entradas - saidas, acumulado };
    });
  }, [obras, despesasGerais]);

  const pagamentosPendentes = useMemo(() => {
    const list = [];
    obras.filter((o) => COM_PAGAMENTOS_KEYS.includes(o.estado)).forEach((o) => {
      let somaItemizada = 0;
      (o.pagamentos || []).forEach((p, idx) => {
        const v = Number(p.valor) || 0;
        somaItemizada += v;
        if (!p.pago) list.push({ obraId: o.id, projeto: o.projeto, cliente: o.cliente, ...p, idx, valor: v });
      });
      const valorRef = valorTotalComIva(o);
      if (valorRef !== null && !isNaN(valorRef)) {
        const restante = valorRef - somaItemizada;
        if (restante > 0.01) {
          list.push({ obraId: o.id, projeto: o.projeto, cliente: o.cliente, label: "Restante (sem prestação definida)", valor: restante, data: null, idx: "restante" });
        }
      }
    });
    return list;
  }, [obras]);

  // Alertas automáticos — sinais simples de saúde financeira, calculados
  // a partir de tudo o resto.
  const alertas = useMemo(() => {
    const list = [];
    if (totais.lucroLiquido < 0) {
      list.push({ tipo: "rust", texto: `Lucro líquido negativo em ${periodoLabel} (${fmtEUR(totais.lucroLiquido)}).` });
    }
    if (custosFixosMensais > 0 && totais.valorAno > 0) {
      const receitaMediaMensal = totais.valorAno / mesesSelecionados.length;
      if (custosFixosMensais > receitaMediaMensal) {
        list.push({ tipo: "rust", texto: `Os custos fixos mensais (${fmtEUR(custosFixosMensais)}) já ultrapassam a receita média mensal de ${periodoLabel} (${fmtEUR(receitaMediaMensal)}).` });
      }
    }
    if (concentracaoClientes.lista[0] && concentracaoClientes.lista[0].pct >= 40) {
      list.push({ tipo: "amber", texto: `${concentracaoClientes.lista[0].cliente} representa ${concentracaoClientes.lista[0].pct.toFixed(0)}% da receita de ${periodoLabel} — risco de concentração num só cliente.` });
    }
    const atrasados = pagamentosPendentes.filter((p) => p.data && p.data < todayISO());
    if (atrasados.length > 0) {
      const valorAtrasado = atrasados.reduce((s, p) => s + (Number(p.valor) || 0), 0);
      list.push({ tipo: "amber", texto: `${atrasados.length} pagamento(s) com data prevista já passada, ainda por receber (${fmtEUR(valorAtrasado)}).` });
    }
    if (totais.valorAno === 0 && mesesSelecionados.length <= 3) {
      list.push({ tipo: "navy", texto: `Sem receita adjudicada registada em ${periodoLabel}.` });
    }
    if (totais.obrasSemValor && totais.obrasSemValor.length > 0) {
      const nomes = totais.obrasSemValor.slice(0, 3).map((o) => o.projeto).join(", ");
      list.push({ tipo: "amber", texto: `${totais.obrasSemValor.length} obra(s) ganha(s) sem Valor Orçamentado nem Valor Adjudicado definido — não estão a contar em "Por receber" (${nomes}${totais.obrasSemValor.length > 3 ? "…" : ""}).` });
    }
    return list;
  }, [totais, custosFixosMensais, concentracaoClientes, pagamentosPendentes, mesesSelecionados, periodoLabel]);

  // IVA do período (estimativa): IVA das prestações com fatura emitida
  // (datadas no período) menos o IVA das faturas de fornecedores/despesas
  // com IVA lançadas no período. Confirmar sempre com o contabilista.
  const ivaPeriodo = useMemo(() => {
    let liquidado = 0, dedutivel = 0;
    obras.filter((o) => COM_PAGAMENTOS_KEYS.includes(o.estado)).forEach((o) => {
      const f = fatorIva(o);
      (o.pagamentos || []).forEach((p) => {
        if (!p.faturaEmitida || !p.data || !mesesSelecionadosSet.has(p.data.slice(0, 7))) return;
        const v = Number(p.valor) || 0;
        liquidado += v - v / f;
      });
    });
    despesas.forEach((d) => {
      if (d.obraId && !despesasObraValidas.some((x) => x.id === d.id)) return;
      if (!d.data || d.valor == null || despesaPct(d) === 0) return;
      mesesSelecionados.forEach((mk) => {
        const mesInicio = d.data.slice(0, 7);
        const conta = d.recorrente ? mk >= mesInicio : mesInicio === mk;
        if (conta) dedutivel += despesaIvaValor(d);
      });
    });
    return { liquidado, dedutivel, aEntregar: liquidado - dedutivel };
  }, [obras, despesas, despesasObraValidas, mesesSelecionados, mesesSelecionadosSet]);

  const lucroPorObra = useMemo(() => {
    // Só obras aceites ou mais avançadas — orçamentos entregues ainda não são certos
    return obras
      .filter((o) => COM_PAGAMENTOS_KEYS.includes(o.estado) && valorTotalObra(o) !== null)
      .map((o) => {
        const custos = custosPorObra[o.id] || 0;
        const valor = valorTotalObra(o);
        const margem = valor - custos;
        return { id: o.id, projeto: o.projeto, cliente: o.cliente, valor, custos, margem, margemPct: valor > 0 ? (margem / valor) * 100 : 0 };
      })
      .sort((a, b) => b.margem - a.margem);
  }, [obras, custosPorObra]);

  const addDespesaGeral = () => {
    if (!novaDespesa.descricao.trim()) return;
    onAddDespesa({
      descricao: novaDespesa.descricao.trim(), categoria: novaDespesa.categoria,
      valor: novaDespesa.valor === "" ? null : Number(novaDespesa.valor),
      data: novaDespesa.data, recorrente: novaDespesa.recorrente, obraId: null,
    });
    setNovaDespesa({ descricao: "", categoria: CATEGORIAS_DESPESA[0], valor: "", data: todayISO(), recorrente: false });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Calendar size={15} color={T.walnut} />
          <select style={selectStyle} value={ano} onChange={(e) => setAno(e.target.value)}>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select style={selectStyle} value={periodoTipo} onChange={(e) => { setPeriodoTipo(e.target.value); setPeriodoValor(1); }}>
            <option value="ano">Anual</option>
            <option value="trimestre">Trimestral</option>
            <option value="mes">Mensal</option>
          </select>
          {periodoTipo === "trimestre" && (
            <select style={selectStyle} value={periodoValor} onChange={(e) => setPeriodoValor(Number(e.target.value))}>
              {[1, 2, 3, 4].map((q) => <option key={q} value={q}>T{q} ({MESES_NOMES[(q - 1) * 3].slice(0, 3)}–{MESES_NOMES[(q - 1) * 3 + 2].slice(0, 3)})</option>)}
            </select>
          )}
          {periodoTipo === "mes" && (
            <select style={selectStyle} value={periodoValor} onChange={(e) => setPeriodoValor(Number(e.target.value))}>
              {MESES_NOMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          )}
        </div>
      </div>

      {alertas.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {alertas.map((a, i) => {
            const cor = a.tipo === "rust" ? T.rust : a.tipo === "amber" ? T.amber : T.navy;
            const Icon = a.tipo === "rust" ? AlertTriangle : a.tipo === "amber" ? Clock : FileText;
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                background: `${cor}18`, border: `1px solid ${cor}`, borderRadius: 8, fontSize: 13, color: T.ink,
              }}>
                <Icon size={14} color={cor} />
                {a.texto}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <KpiCard icon={Euro} label={`Adjudicado s/ IVA — ${periodoLabel}`} value={fmtEUR(totais.valorAno)} accent={T.green}
          delta={<DeltaBadge atual={totais.valorAno} anterior={totaisAnteriores.receita} />} />
        <KpiCard icon={Wallet} label={`Despesas — ${periodoLabel}`} value={fmtEUR(totais.custosTotaisAno)} sub="Custos de obra + gerais" accent={T.rust}
          delta={<DeltaBadge atual={totais.custosTotaisAno} anterior={totaisAnteriores.despesaTotal} invertido />} />
        <KpiCard icon={TrendingUp} label={`Lucro líquido — ${periodoLabel}`} value={fmtEUR(totais.lucroLiquido)} sub={totais.lucroLiquido >= 0 ? "Positivo" : "Negativo"} accent={totais.lucroLiquido >= 0 ? T.green : T.rust}
          delta={<DeltaBadge atual={totais.lucroLiquido} anterior={totaisAnteriores.lucro} />} />
        <KpiCard icon={TrendingUp} label="Margem líquida" value={totais.margemLiquidaPct !== null ? `${totais.margemLiquidaPct.toFixed(1)}%` : "—"} sub="Lucro ÷ receita" accent={totais.margemLiquidaPct >= 0 ? T.green : T.rust}
          delta={totais.margemLiquidaPct !== null && <DeltaBadge atual={totais.margemLiquidaPct} anterior={totaisAnteriores.margemPct} />} />
        <KpiCard icon={Wallet} label="Custos fixos / mês" value={fmtEUR(custosFixosMensais)} sub="Despesas gerais marcadas 'Mensal'" accent={T.amber} />
        <KpiCard icon={Clock} label="Prazo médio de recebimento" value={prazoMedioRecebimento !== null ? `${prazoMedioRecebimento} dias` : "—"} sub="Da adjudicação ao pagamento" />
        <KpiCard icon={Package} label="Valor em pipeline" value={fmtEUR(totais.pipeline)} sub="Ainda por decidir" />
        <KpiCard icon={CheckCircle2} label="Recebido (c/ IVA)" value={fmtEUR(totais.recebido)} sub="Pagamentos já marcados como pagos" accent={T.green} />
        <KpiCard icon={Clock} label="Por receber (c/ IVA)" value={fmtEUR(totais.pendente)} sub="Pagamentos pendentes" accent={T.amber} />
        <KpiCard icon={Landmark} label={`IVA a entregar — ${periodoLabel}`} value={fmtEUR(ivaPeriodo.aEntregar)}
          sub={`Cobrado ${fmtEUR(ivaPeriodo.liquidado)} − dedutível ${fmtEUR(ivaPeriodo.dedutivel)} (estimativa)`} accent={ivaPeriodo.aEntregar > 0 ? T.rust : T.green} />
        <KpiCard icon={XCircle} label="Perdido (rejeitado pelo cliente)" value={fmtEUR(totais.rejeitadoValor)} sub="Conta para a taxa de conversão" accent={T.rust} />
        <KpiCard icon={XCircle} label="Recusado por nós" value={fmtEUR(totais.recusadoPorNosValor)} sub="Não é venda perdida" />
      </div>

      <div style={{ fontSize: 11.5, opacity: 0.55, marginTop: 10, fontStyle: "italic" }}>
        "Custos fixos / mês" soma as despesas gerais marcadas como "Mensal" — não precisas de as lançar todos os meses; contam automaticamente a partir do mês em que as puseste, mês após mês. É o valor mínimo que precisas de faturar só para cobrir os custos fixos, antes de dar lucro.
      </div>

      <CutDivider label={`Receita vs. Despesas por mês — ${periodoLabel}`} />
      <div style={{ background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 10, padding: "16px 20px", height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dadosMensais} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.line} vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fontFamily: "Inter" }} />
            <YAxis tick={{ fontSize: 11, fontFamily: "Inter" }} />
            <Tooltip formatter={(v) => fmtEUR(v)} contentStyle={{ fontFamily: "Inter", fontSize: 12, borderRadius: 8, border: `1px solid ${T.line}` }} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Inter" }} />
            <Bar dataKey="receita" name="Receita adjudicada" fill={T.green} radius={[3, 3, 0, 0]} />
            <Bar dataKey="despesa" name="Despesas" fill={T.rust} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <CutDivider label="Previsão de Tesouraria — próximos 6 meses" />
      <div style={{ background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 10, padding: "16px 20px", height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={previsaoTesouraria} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.line} vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fontFamily: "Inter" }} />
            <YAxis tick={{ fontSize: 11, fontFamily: "Inter" }} />
            <Tooltip formatter={(v) => fmtEUR(v)} contentStyle={{ fontFamily: "Inter", fontSize: 12, borderRadius: 8, border: `1px solid ${T.line}` }} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Inter" }} />
            <Bar dataKey="entradas" name="Entradas previstas" fill={T.green} radius={[3, 3, 0, 0]} />
            <Bar dataKey="saidas" name="Saídas previstas" fill={T.rust} radius={[3, 3, 0, 0]} />
            <Line type="monotone" dataKey="acumulado" name="Saldo acumulado" stroke={T.navy} strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div style={{ fontSize: 11.5, opacity: 0.55, marginTop: 6, fontStyle: "italic" }}>
        "Entradas" vêm dos pagamentos ainda por receber que já têm data prevista na ficha da obra. "Saídas" são as despesas gerais marcadas como "Mensal" (aplicadas todos os meses) mais qualquer despesa pontual já agendada para esse mês. Não inclui receita de obras que ainda vais fechar.
      </div>

      <CutDivider label={`Concentração de Clientes — ${periodoLabel}`} />
      {concentracaoClientes.lista.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {concentracaoClientes.lista.slice(0, 6).map((c) => (
            <div key={c.cliente} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <span style={{ minWidth: 160, flexShrink: 0 }}>{c.cliente}</span>
              <div style={{ flex: 1, background: T.paper3, borderRadius: 10, height: 16, position: "relative", overflow: "hidden" }}>
                <div style={{ width: `${Math.min(c.pct, 100)}%`, height: "100%", background: c.pct >= 40 ? T.rust : T.walnut, borderRadius: 10 }} />
              </div>
              <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, minWidth: 44, textAlign: "right" }}>{c.pct.toFixed(0)}%</span>
              <span style={{ fontFamily: "'Inter', sans-serif", opacity: 0.6, minWidth: 90, textAlign: "right" }}>{fmtEUR(c.valor)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, opacity: 0.55 }}>Sem receita adjudicada em {periodoLabel} para calcular concentração.</div>
      )}

      <CutDivider label={`Despesas por categoria — ${periodoLabel}`} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)", gap: 16, alignItems: "center" }}>
        <div style={{ background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px", height: 240 }}>
          {despesasPorCategoria.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={despesasPorCategoria} dataKey="valor" nameKey="categoria" cx="50%" cy="50%" outerRadius={85} label={(e) => `${e.categoria}`}>
                  {despesasPorCategoria.map((entry, i) => <Cell key={entry.categoria} fill={CATEGORIA_CORES[i % CATEGORIA_CORES.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtEUR(v)} contentStyle={{ fontFamily: "Inter", fontSize: 12, borderRadius: 8, border: `1px solid ${T.line}` }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 13, opacity: 0.5 }}>Sem despesas registadas para {ano}.</div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {despesasPorCategoria.map((c, i) => (
            <div key={c.categoria} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: CATEGORIA_CORES[i % CATEGORIA_CORES.length], flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{c.categoria}</span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, color: T.walnutDark }}>{fmtEUR(c.valor)}</span>
              <span style={{ fontSize: 11, opacity: 0.5, minWidth: 40, textAlign: "right" }}>
                {totais.custosTotaisAno > 0 ? `${((c.valor / totais.custosTotaisAno) * 100).toFixed(0)}%` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      <CutDivider label="Lucro por obra" />
      <div style={{ overflowX: "auto", border: `1px solid ${T.line}`, borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: T.paper3, textAlign: "left" }}>
              {["Projeto", "Cliente", "Adjudicado", "Custos", "Margem €", "Margem %"].map((h) => (
                <th key={h} style={{ padding: "8px 12px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: T.walnutDark, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lucroPorObra.map((o, i) => (
              <tr key={o.id} style={{ background: i % 2 ? T.paper2 : T.paper, borderTop: `1px solid ${T.line}` }}>
                <td style={{ padding: "8px 12px", fontWeight: 600 }}>{o.projeto}</td>
                <td style={{ padding: "8px 12px" }}>{o.cliente}</td>
                <td style={{ padding: "8px 12px", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap" }}>{fmtEUR(o.valor)}</td>
                <td style={{ padding: "8px 12px", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap" }}>{fmtEUR(o.custos)}</td>
                <td style={{ padding: "8px 12px", fontFamily: "'Inter', sans-serif", fontWeight: 700, whiteSpace: "nowrap", color: o.margem >= 0 ? T.green : T.rust }}>{fmtEUR(o.margem)}</td>
                <td style={{ padding: "8px 12px", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap", color: o.margem >= 0 ? T.green : T.rust }}>{o.margemPct.toFixed(1)}%</td>
              </tr>
            ))}
            {lucroPorObra.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", opacity: 0.5 }}>Sem obras aceites ou adjudicadas com valor ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <CutDivider label="Equipa (custo/hora)" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(equipa || []).length === 0 && <div style={{ fontSize: 13, opacity: 0.6 }}>Sem equipa registada — adiciona aqui para poderes lançar horas nas obras.</div>}
        {(equipa || []).map((m) => (
          <div key={m.id} style={{
            display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,0.7fr) minmax(0,1.4fr) auto", gap: 8, alignItems: "center",
            padding: "7px 10px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 8, fontSize: 13,
          }}>
            <input style={{ ...inputStyle, fontSize: 12 }} value={m.nome} onChange={(e) => onUpdateMembro(m.id, { nome: e.target.value })} />
            <input type="number" style={{ ...inputStyle, fontSize: 12 }} placeholder="€/hora" value={m.custoHora ?? ""} onChange={(e) => onUpdateMembro(m.id, { custoHora: e.target.value === "" ? null : Number(e.target.value) })} />
            <input style={{ ...inputStyle, fontSize: 12 }} placeholder="Notas" value={m.notas || ""} onChange={(e) => onUpdateMembro(m.id, { notas: e.target.value })} />
            <button onClick={() => onDeleteMembro(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.rust }}><Trash2 size={13} /></button>
          </div>
        ))}
        <div>
          <Btn small icon={Plus} onClick={() => onAddMembro({ nome: "Novo membro", custoHora: null, notas: "" })}>Adicionar à equipa</Btn>
        </div>
        <div style={{ fontSize: 11.5, opacity: 0.55, marginTop: 2 }}>
          O custo/hora aqui é o que usas para calcular o custo de mão-de-obra em cada obra. Já lançaste os salários mensais em "Despesas gerais" abaixo? Não precisas de os duplicar aqui — são coisas diferentes: isto é o valor por hora para orçamentar obras, aquilo é a despesa fixa mensal real.
        </div>
      </div>

      <CutDivider label="Despesas gerais da empresa" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {despesasGerais.length === 0 && <div style={{ fontSize: 13, opacity: 0.6 }}>Sem despesas gerais registadas.</div>}
        {despesasGerais.map((d) => (
          <div key={d.id} style={{
            display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr) minmax(0,0.8fr) minmax(0,0.9fr) auto auto", gap: 8, alignItems: "center",
            padding: "7px 10px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 8, fontSize: 13,
          }}>
            <input style={{ ...inputStyle, fontSize: 12 }} value={d.descricao} onChange={(e) => onUpdateDespesa(d.id, { descricao: e.target.value })} />
            <select style={{ ...selectStyle, fontSize: 12 }} value={d.categoria} onChange={(e) => onUpdateDespesa(d.id, { categoria: e.target.value })}>
              {CATEGORIAS_DESPESA.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            <input type="number" style={{ ...inputStyle, fontSize: 12 }} value={d.valor ?? ""} onChange={(e) => onUpdateDespesa(d.id, { valor: e.target.value === "" ? null : Number(e.target.value) })} />
            <input type="date" style={{ ...inputStyle, fontSize: 12 }} value={d.data || ""} onChange={(e) => onUpdateDespesa(d.id, { data: e.target.value })} />
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, opacity: 0.75 }}>
              <input type="checkbox" checked={!!d.recorrente} onChange={(e) => onUpdateDespesa(d.id, { recorrente: e.target.checked })} /> Mensal
            </label>
            <button onClick={() => onDeleteDespesa(d.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.rust }}><Trash2 size={13} /></button>
          </div>
        ))}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr) minmax(0,0.8fr) minmax(0,0.9fr) auto auto", gap: 8, marginTop: 4 }}>
          <input style={inputStyle} placeholder="ex: Renda do armazém" value={novaDespesa.descricao} onChange={(e) => setNovaDespesa((s) => ({ ...s, descricao: e.target.value }))} />
          <select style={selectStyle} value={novaDespesa.categoria} onChange={(e) => setNovaDespesa((s) => ({ ...s, categoria: e.target.value }))}>
            {CATEGORIAS_DESPESA.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <input type="number" style={inputStyle} placeholder="€" value={novaDespesa.valor} onChange={(e) => setNovaDespesa((s) => ({ ...s, valor: e.target.value }))} />
          <input type="date" style={inputStyle} value={novaDespesa.data} onChange={(e) => setNovaDespesa((s) => ({ ...s, data: e.target.value }))} />
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, opacity: 0.75 }}>
            <input type="checkbox" checked={novaDespesa.recorrente} onChange={(e) => setNovaDespesa((s) => ({ ...s, recorrente: e.target.checked }))} /> Mensal
          </label>
          <Btn small icon={Plus} onClick={addDespesaGeral}>Add</Btn>
        </div>
        <div style={{ fontSize: 11.5, opacity: 0.55, marginTop: 4 }}>
          Marca "Mensal" só como lembrete visual para despesas recorrentes (renda, salários…) — ainda tens de lançar cada mês à mão.
        </div>
      </div>

      <CutDivider label="Pagamentos pendentes" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {pagamentosPendentes.length === 0 && <div style={{ fontSize: 13, opacity: 0.6 }}>Sem pagamentos pendentes registados.</div>}
        {pagamentosPendentes.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 8, fontSize: 13 }}>
            <Clock size={14} color={T.amber} />
            <span style={{ fontWeight: 600 }}>{p.projeto}</span>
            <span style={{ opacity: 0.6 }}>— {p.cliente}</span>
            {p.data && <span style={{ fontSize: 11.5, opacity: 0.6 }}>{fmtDate(p.data)}</span>}
            <span style={{ marginLeft: "auto", fontFamily: "'Inter', sans-serif" }}>{p.label}</span>
            <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, color: T.walnutDark }}>{fmtEUR(p.valor)}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, opacity: 0.55, marginTop: 18, fontStyle: "italic" }}>
        Nota: os valores só aparecem aqui depois de preenchidos na ficha de cada obra (Valor orçamentado / Valor adjudicado / Custos).
      </div>
    </div>
  );
}

/* ============================================================
   CLIENTES
   ============================================================ */
/* ============================================================
   PESSOAS — componentes partilhados por Clientes e Fornecedores
   ============================================================ */
const iniciais = (nome) => (nome || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";

function Avatar({ nome, size = 40, cor }) {
  const c = cor || T.walnut;
  return (
    <span style={{
      width: size, height: size, borderRadius: size * 0.3, flex: "none", display: "grid", placeItems: "center",
      background: `linear-gradient(135deg, ${mix(c, 22)}, ${mix(c, 8)})`, border: `1px solid ${mix(c, 30)}`,
      color: c, fontWeight: 800, fontSize: size * 0.36, letterSpacing: 0.5,
    }}>{iniciais(nome)}</span>
  );
}

const waLink = (tel) => {
  const d = String(tel || "").replace(/\D/g, "");
  if (!d) return null;
  return `https://wa.me/${d.length === 9 ? "351" + d : d}`;
};

function ContactBtns({ telefone, email, site, size = 30 }) {
  const itens = [
    telefone && { href: `tel:${telefone}`, icon: Phone, t: "Ligar" },
    waLink(telefone) && { href: waLink(telefone), icon: MessageCircle, t: "WhatsApp", ext: true },
    email && { href: `mailto:${email}`, icon: Mail, t: "Enviar email" },
    site && { href: /^https?:/.test(site) ? site : `https://${site}`, icon: Globe, t: "Abrir site", ext: true },
  ].filter(Boolean);
  if (itens.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {itens.map(({ href, icon: Icon, t, ext }) => (
        <a key={t} href={href} title={t} className="round-btn" style={{ width: size, height: size }}
          target={ext ? "_blank" : undefined} rel={ext ? "noreferrer" : undefined} onClick={(e) => e.stopPropagation()}>
          <Icon size={size * 0.47} />
        </a>
      ))}
    </div>
  );
}

function MiniStat({ label, value, cor, sub }) {
  return (
    <div style={{ background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 12, padding: "11px 13px", minWidth: 0 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.55 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 750, color: cor || T.walnutDark, marginTop: 3, letterSpacing: -0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, opacity: 0.5, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function Chip({ ativo, onClick, children }) {
  return (
    <button onClick={onClick} className={`chip ${ativo ? "on" : ""}`}>{children}</button>
  );
}

function Drawer({ onClose, children, largura = 560 }) {
  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);
  return (
    <div className="ui-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 100, display: "flex", justifyContent: "flex-end" }}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} style={{ width: `min(${largura}px, 100vw)` }}>
        {children}
      </aside>
    </div>
  );
}

function DrawerHeader({ avatar, titulo, sub, onClose, children }) {
  return (
    <div style={{ padding: "20px 22px 16px", borderBottom: `1px solid ${T.line}`, background: `linear-gradient(180deg, ${mix(T.walnut, 7)}, transparent)` }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        {avatar}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 780, letterSpacing: -0.3, color: T.walnutDark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</div>
          {sub && <div style={{ fontSize: 12.5, opacity: 0.6, marginTop: 2 }}>{sub}</div>}
        </div>
        <button onClick={onClose} className="round-btn" style={{ width: 32, height: 32 }} title="Fechar (Esc)"><X size={16} /></button>
      </div>
      {children && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
}

function ListaLinha({ onClick, children, title }) {
  return (
    <div onClick={onClick} title={title} className="ui-card hoverable" style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: T.paper2,
      border: `1px solid ${T.line}`, borderRadius: 11, cursor: onClick ? "pointer" : "default", fontSize: 13,
    }}>{children}</div>
  );
}

const obrasDoCliente = (obras, nome, ficha) => {
  const k = normalizaNome(nome);
  const em = (ficha?.email || "").trim().toLowerCase();
  const nif = (ficha?.nif || "").trim();
  return obras.filter((o) =>
    normalizaNome(o.cliente) === k ||
    (em && (o.clienteEmail || "").trim().toLowerCase() === em) ||
    (nif && (o.clienteNif || "").trim() === nif)
  );
};

const porReceberObra = (o) => (o.pagamentos || []).filter((p) => !p.pago).reduce((s, p) => s + (Number(p.valor) || 0), 0);

function statsObras(lista) {
  const s = { total: lista.length, ganhas: 0, rejeitadas: 0, negociacao: 0, valorNegociacao: 0, adjudicado: 0, porReceber: 0, ultimo: null };
  lista.forEach((o) => {
    if (WON_KEYS.includes(o.estado)) { s.ganhas += 1; s.adjudicado += valorTotalObra(o) || 0; s.porReceber += porReceberObra(o); }
    if (REJECTED_KEYS.includes(o.estado)) s.rejeitadas += 1;
    if (ACTIVE_KEYS.includes(o.estado)) { s.negociacao += 1; s.valorNegociacao += valorTotalObra(o) || 0; }
    if (!s.ultimo || (o.dataEntrada || "") > s.ultimo) s.ultimo = o.dataEntrada;
  });
  const decididas = s.ganhas + s.rejeitadas;
  s.taxa = decididas > 0 ? Math.round((s.ganhas / decididas) * 100) : null;
  return s;
}

/* ============================================================
   CLIENTES
   ============================================================ */
function ClienteDrawer({ cliente, onClose, onAdd, onUpdate, onDelete, obras, obrasDono, onOpenObra }) {
  const [id, setId] = useState(cliente.id || null);
  const [local, setLocal] = useState(cliente);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Cria a ficha logo ao abrir (se o cliente só existia nas obras), para duas
  // edições seguidas não criarem duplicados.
  useEffect(() => {
    if (!id && cliente.nome) setId(onAdd({ nome: cliente.nome }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch) => setLocal((l) => ({ ...l, ...patch }));
  const commit = (patch) => {
    set(patch);
    if (id) onUpdate(id, patch);
    else setId(onAdd({ nome: local.nome, ...patch }));
  };
  const campo = (k, label, extra = {}) => (
    <Field label={label}>
      <input style={inputStyle} value={local[k] || ""} onChange={(e) => set({ [k]: e.target.value })} onBlur={() => commit({ [k]: local[k] })} {...extra} />
    </Field>
  );

  const st = statsObras(obras);
  const ordenadas = [...obras].sort((a, b) => (b.dataEntrada || "").localeCompare(a.dataEntrada || ""));

  return (
    <Drawer onClose={onClose}>
      <DrawerHeader onClose={onClose} avatar={<Avatar nome={local.nome} size={52} />} titulo={local.nome || "Novo cliente"}
        sub={[local.telefone, local.email].filter(Boolean).join(" · ") || "Sem contactos — preenche abaixo"}>
        <ContactBtns telefone={local.telefone} email={local.email} size={34} />
      </DrawerHeader>

      <div style={{ padding: "18px 22px 28px", display: "flex", flexDirection: "column", gap: 18, overflowY: "auto", flex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          <MiniStat label="Adjudicado" value={fmtEUR(st.adjudicado)} sub={`${st.ganhas} obra(s) ganha(s)`} />
          <MiniStat label="Por receber" value={fmtEUR(st.porReceber)} cor={st.porReceber > 0 ? T.rust : T.green} sub="pagamentos em aberto" />
          <MiniStat label="Em negociação" value={fmtEUR(st.valorNegociacao)} cor={T.amber} sub={`${st.negociacao} orçamento(s)`} />
          <MiniStat label="Taxa de conversão" value={st.taxa === null ? "—" : `${st.taxa}%`} sub={`${st.ganhas} ganhas / ${st.rejeitadas} perdidas`} />
        </div>

        <div>
          <CutDivider label={`Obras (${obras.length})`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ordenadas.length === 0 && <div style={{ fontSize: 12.5, opacity: 0.55 }}>Ainda sem obras registadas para este cliente.</div>}
            {ordenadas.map((o) => {
              const stage = stageOf(o.estado);
              const pr = WON_KEYS.includes(o.estado) ? porReceberObra(o) : 0;
              return (
                <ListaLinha key={o.id} onClick={() => { onOpenObra(o.id); onClose(); }} title="Abrir ficha da obra">
                  <span style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: stage.color, flex: "none" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: T.walnutDark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.projeto}</div>
                    <div style={{ fontSize: 11.5, opacity: 0.55 }}>{o.ref || "s/ ref"} · {fmtDate(o.dataEntrada)}{pr > 0 && <span style={{ color: T.rust, fontWeight: 600 }}> · falta receber {fmtEUR(pr)}</span>}</div>
                  </div>
                  <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                    {valorTotalObra(o) !== null && <span style={{ fontWeight: 700, color: T.walnutDark, whiteSpace: "nowrap" }}>{fmtEUR(valorTotalObra(o))}</span>}
                    <Tag color={stage.color}>{stage.label}</Tag>
                  </div>
                </ListaLinha>
              );
            })}
          </div>
        </div>

        {obrasDono.length > 0 && (
          <div>
            <CutDivider label={`Como dono de obra (${obrasDono.length})`} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {obrasDono.map((o) => (
                <ListaLinha key={o.id} onClick={() => { onOpenObra(o.id); onClose(); }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.projeto}</div>
                    <div style={{ fontSize: 11.5, opacity: 0.55 }}>Via {o.cliente} · {o.ref || "s/ ref"}</div>
                  </div>
                  <Tag color={stageOf(o.estado).color}>{stageOf(o.estado).label}</Tag>
                </ListaLinha>
              ))}
            </div>
          </div>
        )}

        <div>
          <CutDivider label="Dados do cliente" />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {campo("nome", "Nome")}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {campo("telefone", "Telefone")}
              {campo("email", "Email", { type: "email" })}
              {campo("nif", "NIF")}
              {campo("morada", "Morada")}
            </div>
            <Field label="Notas">
              <textarea style={textareaStyle} rows={3} value={local.notas || ""} onChange={(e) => set({ notas: e.target.value })} onBlur={() => commit({ notas: local.notas })} />
            </Field>
            <div style={{ fontSize: 11.5, opacity: 0.55 }}>
              As obras ligam-se a este cliente pelo nome (ou pelo mesmo email / NIF). Os contactos também se atualizam sozinhos quando os preenches numa obra.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: `1px solid ${T.line}` }}>
          {id && (confirmDelete ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: T.rust }}>Eliminar esta ficha? (as obras mantêm-se)</span>
              <Btn small variant="danger" onClick={() => { onDelete(id); onClose(); }}>Sim, eliminar</Btn>
              <Btn small variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Btn>
            </div>
          ) : (
            <Btn small variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>Eliminar ficha</Btn>
          ))}
          {!id && <span />}
          <Btn onClick={onClose}>Fechar</Btn>
        </div>
      </div>
    </Drawer>
  );
}

function Clientes({ obras, clientes, onAddCliente, onUpdateCliente, onDeleteCliente, onOpenObra }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [ordem, setOrdem] = useState("valor");
  const [selectedKey, setSelectedKey] = useState(null);

  const todos = useMemo(() => {
    const nomes = {};
    obras.forEach((o) => { const n = (o.cliente || "").trim(); if (n) nomes[normalizaNome(n)] = nomes[normalizaNome(n)] || n; });
    clientes.forEach((c) => { if (c.nome) nomes[normalizaNome(c.nome)] = c.nome; });
    return Object.entries(nomes).map(([chave, nome]) => {
      const ficha = clientes.find((c) => normalizaNome(c.nome) === chave);
      const obrasC = obrasDoCliente(obras, ficha?.nome || nome, ficha);
      return { chave, nome: ficha?.nome || nome, ficha, obras: obrasC, st: statsObras(obrasC) };
    });
  }, [obras, clientes]);

  const lista = useMemo(() => {
    const term = q.trim().toLowerCase();
    let l = todos.filter((c) => !term || `${c.nome} ${c.ficha?.email || ""} ${c.ficha?.telefone || ""} ${c.ficha?.nif || ""}`.toLowerCase().includes(term));
    if (filtro === "negociacao") l = l.filter((c) => c.st.negociacao > 0);
    if (filtro === "clientes") l = l.filter((c) => c.st.ganhas > 0);
    if (filtro === "receber") l = l.filter((c) => c.st.porReceber > 0);
    if (filtro === "incompletos") l = l.filter((c) => !c.ficha?.telefone && !c.ficha?.email);
    const cmp = {
      valor: (a, b) => b.st.adjudicado - a.st.adjudicado || b.st.total - a.st.total,
      recente: (a, b) => (b.st.ultimo || "").localeCompare(a.st.ultimo || ""),
      nome: (a, b) => a.nome.localeCompare(b.nome, "pt"),
      obras: (a, b) => b.st.total - a.st.total,
    }[ordem];
    return l.sort(cmp);
  }, [todos, q, filtro, ordem]);

  const resumo = useMemo(() => ({
    n: todos.length,
    clientes: todos.filter((c) => c.st.ganhas > 0).length,
    adjudicado: todos.reduce((s, c) => s + c.st.adjudicado, 0),
    porReceber: todos.reduce((s, c) => s + c.st.porReceber, 0),
  }), [todos]);

  const selected = todos.find((c) => c.chave === selectedKey);
  const donoObras = selected
    ? obras.filter((o) => normalizaNome(o.donoObra) === selected.chave && !selected.obras.some((x) => x.id === o.id))
    : [];

  const criarNovo = () => {
    onAddCliente({ nome: "Novo cliente" });
    setSelectedKey(normalizaNome("Novo cliente"));
  };

  return (
    <div>
      <div className="stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginBottom: 20 }}>
        <KpiCard icon={Building2} label="Clientes" value={resumo.n} sub={`${resumo.clientes} com obra ganha`} />
        <KpiCard icon={Banknote} label="Valor adjudicado" value={fmtEUR(resumo.adjudicado)} sub="acumulado, ex-IVA" accent={T.green} />
        <KpiCard icon={Receipt} label="Por receber" value={fmtEUR(resumo.porReceber)} sub="pagamentos em aberto" accent={resumo.porReceber > 0 ? T.rust : T.green} />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 380 }}>
          <Search size={15} style={{ position: "absolute", left: 11, top: 10, opacity: 0.45 }} />
          <input style={{ ...inputStyle, width: "100%", paddingLeft: 33 }} placeholder="Pesquisar nome, email, telefone ou NIF…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Chip ativo={filtro === "todos"} onClick={() => setFiltro("todos")}>Todos</Chip>
          <Chip ativo={filtro === "negociacao"} onClick={() => setFiltro("negociacao")}>Em negociação</Chip>
          <Chip ativo={filtro === "clientes"} onClick={() => setFiltro("clientes")}>Clientes</Chip>
          <Chip ativo={filtro === "receber"} onClick={() => setFiltro("receber")}>Com valores a receber</Chip>
          <Chip ativo={filtro === "incompletos"} onClick={() => setFiltro("incompletos")}>Sem contacto</Chip>
        </div>
        <div style={{ flex: 1 }} />
        <select style={{ ...selectStyle, width: "auto" }} value={ordem} onChange={(e) => setOrdem(e.target.value)}>
          <option value="valor">Ordenar: maior valor</option>
          <option value="recente">Ordenar: mais recente</option>
          <option value="obras">Ordenar: mais obras</option>
          <option value="nome">Ordenar: A–Z</option>
        </select>
        <Btn icon={Plus} onClick={criarNovo}>Novo cliente</Btn>
      </div>

      <div className="stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
        {lista.map((c) => (
          <div key={c.chave} className="ui-card hoverable" onClick={() => setSelectedKey(c.chave)} style={{
            background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 16, padding: 16, cursor: "pointer", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <Avatar nome={c.nome} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 750, fontSize: 14.5, color: T.walnutDark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</div>
                <div style={{ fontSize: 12, opacity: 0.55, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.ficha?.email || c.ficha?.telefone || <i>sem contacto</i>}
                </div>
              </div>
              {c.st.negociacao > 0 && <Tag color={T.amber}>{c.st.negociacao} em negociação</Tag>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div><div style={{ fontSize: 11, opacity: 0.5 }}>Obras</div><div style={{ fontWeight: 700, fontSize: 15 }}>{c.st.total}</div></div>
              <div><div style={{ fontSize: 11, opacity: 0.5 }}>Adjudicado</div><div style={{ fontWeight: 700, fontSize: 15, color: c.st.adjudicado ? T.green : undefined }}>{c.st.adjudicado ? fmtEUR(c.st.adjudicado) : "—"}</div></div>
              <div><div style={{ fontSize: 11, opacity: 0.5 }}>A receber</div><div style={{ fontWeight: 700, fontSize: 15, color: c.st.porReceber ? T.rust : undefined }}>{c.st.porReceber ? fmtEUR(c.st.porReceber) : "—"}</div></div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <ContactBtns telefone={c.ficha?.telefone} email={c.ficha?.email} />
              <span style={{ fontSize: 11, opacity: 0.45 }}>{c.st.ultimo ? `Último pedido ${fmtDate(c.st.ultimo)}` : ""}</span>
            </div>
          </div>
        ))}
      </div>
      {lista.length === 0 && <div style={{ opacity: 0.5, fontSize: 13, padding: "24px 0" }}>Sem resultados.</div>}

      {selected && (
        <ClienteDrawer
          key={selectedKey}
          cliente={selected.ficha || { nome: selected.nome }}
          obras={selected.obras}
          obrasDono={donoObras}
          onOpenObra={onOpenObra}
          onClose={() => setSelectedKey(null)}
          onAdd={onAddCliente}
          onUpdate={onUpdateCliente}
          onDelete={onDeleteCliente}
        />
      )}
    </div>
  );
}

/* ============================================================
   FORNECEDORES
   ============================================================ */
const fornEmAtraso = (d) => !d.pago && d.dataVencimento && d.dataVencimento < todayISO();

function statsFornecedor(nome, despesas, obras) {
  const chave = normalizaNome(nome);
  const compras = (despesas || []).filter((d) => normalizaNome(d.fornecedor) === chave)
    .sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const cotacoes = [];
  obras.forEach((o) => (o.cotacoes || []).forEach((c) => { if (normalizaNome(c.fornecedor) === chave) cotacoes.push({ ...c, obra: o }); }));
  const obraIds = [...new Set(compras.map((d) => d.obraId).filter(Boolean))];
  return {
    compras, cotacoes,
    obras: obraIds.map((id) => obras.find((o) => o.id === id)).filter(Boolean),
    gasto: compras.reduce((s, d) => s + (Number(d.valor) || 0), 0),
    porPagar: compras.filter((d) => !d.pago).reduce((s, d) => s + (Number(d.valor) || 0), 0),
    atraso: compras.filter(fornEmAtraso).length,
    cotPendentes: cotacoes.filter((c) => c.estado === "pedido").length,
  };
}

function FornecedorDrawer({ fornecedor, onClose, onUpdate, onDelete, despesas, obras, onOpenObra }) {
  const [local, setLocal] = useState(fornecedor);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [categoriasTexto, setCategoriasTexto] = useState((fornecedor.categorias || []).join(", "));
  useEffect(() => { setLocal(fornecedor); setCategoriasTexto((fornecedor.categorias || []).join(", ")); }, [fornecedor]);

  const set = (patch) => setLocal((l) => ({ ...l, ...patch }));
  const commit = (patch) => { set(patch); onUpdate(fornecedor.id, patch); };
  const campo = (k, label, extra = {}) => (
    <Field label={label}>
      <input style={inputStyle} value={local[k] || ""} onChange={(e) => set({ [k]: e.target.value })} onBlur={() => commit({ [k]: local[k] })} {...extra} />
    </Field>
  );
  const st = useMemo(() => statsFornecedor(fornecedor.nome, despesas, obras), [fornecedor.nome, despesas, obras]);
  const obraNome = (id) => obras.find((o) => o.id === id);

  return (
    <Drawer onClose={onClose}>
      <DrawerHeader onClose={onClose} avatar={<Avatar nome={local.nome} size={52} cor={T.navy} />} titulo={local.nome || "Novo fornecedor"}
        sub={(local.categorias || []).join(" · ") || "Sem categorias"}>
        <ContactBtns telefone={local.telefone} email={local.email} site={local.site} size={34} />
      </DrawerHeader>

      <div style={{ padding: "18px 22px 28px", display: "flex", flexDirection: "column", gap: 18, overflowY: "auto", flex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          <MiniStat label="Total comprado" value={fmtEUR(st.gasto)} sub={`${st.compras.length} fatura(s)/custo(s)`} />
          <MiniStat label="Por pagar" value={fmtEUR(st.porPagar)} cor={st.porPagar > 0 ? T.rust : T.green} sub={st.atraso > 0 ? `${st.atraso} em atraso` : "sem atrasos"} />
          <MiniStat label="Obras ligadas" value={st.obras.length} sub="onde há compras" />
          <MiniStat label="Cotações pedidas" value={st.cotPendentes} cor={st.cotPendentes ? T.navy : undefined} sub={`${st.cotacoes.length} no total`} />
        </div>

        <div>
          <CutDivider label={`Faturas e compras (${st.compras.length})`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {st.compras.length === 0 && <div style={{ fontSize: 12.5, opacity: 0.55 }}>Sem compras registadas. Aparecem aqui sozinhas quando lanças uma fatura ou custo com este nome de fornecedor.</div>}
            {st.compras.slice(0, 25).map((c) => {
              const ob = c.obraId ? obraNome(c.obraId) : null;
              const atraso = fornEmAtraso(c);
              return (
                <ListaLinha key={c.id} onClick={ob ? () => { onOpenObra(ob.id); onClose(); } : undefined} title={ob ? "Abrir a obra" : undefined}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.descricao || c.numeroFatura || "Compra"}</div>
                    <div style={{ fontSize: 11.5, opacity: 0.55 }}>
                      {fmtDate(c.data)}{c.numeroFatura && ` · Fatura ${c.numeroFatura}`}{ob && <span style={{ color: T.navy, fontWeight: 600 }}> · {ob.projeto}</span>}
                      {!c.pago && c.dataVencimento && ` · vence ${fmtDate(c.dataVencimento)}`}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                    <span style={{ fontWeight: 700, color: T.walnutDark, whiteSpace: "nowrap" }}>{fmtEUR(c.valor)}</span>
                    <Tag color={c.pago ? T.green : atraso ? T.rust : T.amber}>{c.pago ? "Paga" : atraso ? "Em atraso" : "Por pagar"}</Tag>
                  </div>
                </ListaLinha>
              );
            })}
          </div>
        </div>

        {st.cotacoes.length > 0 && (
          <div>
            <CutDivider label={`Cotações (${st.cotacoes.length})`} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {st.cotacoes.map((c) => (
                <ListaLinha key={c.id || `${c.obra.id}-${c.material}`} onClick={() => { onOpenObra(c.obra.id); onClose(); }} title="Abrir a obra">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.material || "Cotação"}{c.quantidade && ` · ${c.quantidade}`}</div>
                    <div style={{ fontSize: 11.5, opacity: 0.55 }}>{c.obra.projeto}</div>
                  </div>
                  <span style={{ fontWeight: 700 }}>{c.valor != null ? fmtEUR(c.valor) : "—"}</span>
                  <Tag color={c.estado === "pedido" ? T.navy : T.green}>{c.estado === "pedido" ? "Pedida" : "Recebida"}</Tag>
                </ListaLinha>
              ))}
            </div>
          </div>
        )}

        <div>
          <CutDivider label="Dados do fornecedor" />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {campo("nome", "Nome do fornecedor")}
            <Field label="O que fornece (separado por vírgulas)">
              <input style={inputStyle} placeholder="ex: Placas, Ferragens, Vidros…" value={categoriasTexto} onChange={(e) => setCategoriasTexto(e.target.value)}
                onBlur={() => commit({ categorias: categoriasTexto.split(",").map((c) => c.trim()).filter(Boolean) })} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {campo("pessoaContacto", "Pessoa de contacto")}
              {campo("telefone", "Telefone")}
              {campo("email", "Email", { type: "email" })}
              {campo("site", "Site / link", { placeholder: "https://…" })}
            </div>
            <Field label="Notas (descontos, condições de pagamento, morada…)">
              <textarea style={textareaStyle} rows={3} value={local.notas || ""} onChange={(e) => set({ notas: e.target.value })} onBlur={() => commit({ notas: local.notas })} />
            </Field>
            <div style={{ fontSize: 11.5, opacity: 0.55 }}>
              As faturas e cotações ligam-se a este fornecedor pelo nome. Se mudares o nome aqui, usa o mesmo nome nas faturas novas.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: `1px solid ${T.line}` }}>
          {confirmDelete ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: T.rust }}>Eliminar esta ficha? (as faturas mantêm-se)</span>
              <Btn small variant="danger" onClick={() => { onDelete(fornecedor.id); onClose(); }}>Sim, eliminar</Btn>
              <Btn small variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Btn>
            </div>
          ) : (
            <Btn small variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>Eliminar ficha</Btn>
          )}
          <Btn onClick={onClose}>Fechar</Btn>
        </div>
      </div>
    </Drawer>
  );
}

function Fornecedores({ fornecedores, onAdd, onUpdate, onDelete, despesas, obras = [], onOpenObra }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [ordem, setOrdem] = useState("gasto");
  const [selectedId, setSelectedId] = useState(null);

  const todos = useMemo(() => {
    const fichas = fornecedores.map((f) => ({ f, st: statsFornecedor(f.nome, despesas, obras) }));
    const conhecidos = new Set(fornecedores.map((f) => normalizaNome(f.nome)));
    const semFicha = {};
    (despesas || []).forEach((d) => {
      const n = (d.fornecedor || "").trim();
      if (n && !conhecidos.has(normalizaNome(n))) semFicha[normalizaNome(n)] = n;
    });
    return {
      fichas,
      semFicha: Object.values(semFicha).map((nome) => ({ nome, st: statsFornecedor(nome, despesas, obras) })).sort((a, b) => b.st.gasto - a.st.gasto),
    };
  }, [fornecedores, despesas, obras]);

  const lista = useMemo(() => {
    const term = q.trim().toLowerCase();
    let l = todos.fichas.filter(({ f }) => !term || `${f.nome} ${(f.categorias || []).join(" ")} ${f.pessoaContacto || ""} ${f.email || ""}`.toLowerCase().includes(term));
    if (filtro === "pagar") l = l.filter(({ st }) => st.porPagar > 0);
    if (filtro === "atraso") l = l.filter(({ st }) => st.atraso > 0);
    if (filtro === "cotacoes") l = l.filter(({ st }) => st.cotPendentes > 0);
    const cmp = {
      gasto: (a, b) => b.st.gasto - a.st.gasto,
      pagar: (a, b) => b.st.porPagar - a.st.porPagar,
      nome: (a, b) => (a.f.nome || "").localeCompare(b.f.nome || "", "pt"),
    }[ordem];
    return l.sort(cmp);
  }, [todos, q, filtro, ordem]);

  const resumo = useMemo(() => {
    const todosSt = [...todos.fichas.map((x) => x.st), ...todos.semFicha.map((x) => x.st)];
    return {
      gasto: todosSt.reduce((s, x) => s + x.gasto, 0),
      porPagar: todosSt.reduce((s, x) => s + x.porPagar, 0),
      atraso: todosSt.reduce((s, x) => s + x.atraso, 0),
    };
  }, [todos]);

  const selected = fornecedores.find((f) => f.id === selectedId);
  const criarNovo = () => setSelectedId(onAdd({ nome: "Novo fornecedor" }));
  const criarDeNome = (nome) => setSelectedId(onAdd({ nome }));

  return (
    <div>
      <div className="stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginBottom: 20 }}>
        <KpiCard icon={Building2} label="Fornecedores" value={fornecedores.length} sub={todos.semFicha.length ? `+ ${todos.semFicha.length} sem ficha` : "todos com ficha"} accent={T.navy} />
        <KpiCard icon={Banknote} label="Total comprado" value={fmtEUR(resumo.gasto)} sub="faturas e custos registados" />
        <KpiCard icon={Receipt} label="Por pagar" value={fmtEUR(resumo.porPagar)} sub={resumo.atraso ? `${resumo.atraso} em atraso` : "sem atrasos"} accent={resumo.atraso ? T.rust : T.green} />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 380 }}>
          <Search size={15} style={{ position: "absolute", left: 11, top: 10, opacity: 0.45 }} />
          <input style={{ ...inputStyle, width: "100%", paddingLeft: 33 }} placeholder="Pesquisar fornecedor, categoria ou contacto…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Chip ativo={filtro === "todos"} onClick={() => setFiltro("todos")}>Todos</Chip>
          <Chip ativo={filtro === "pagar"} onClick={() => setFiltro("pagar")}>Com faturas por pagar</Chip>
          <Chip ativo={filtro === "atraso"} onClick={() => setFiltro("atraso")}>Em atraso</Chip>
          <Chip ativo={filtro === "cotacoes"} onClick={() => setFiltro("cotacoes")}>Cotações pendentes</Chip>
        </div>
        <div style={{ flex: 1 }} />
        <select style={{ ...selectStyle, width: "auto" }} value={ordem} onChange={(e) => setOrdem(e.target.value)}>
          <option value="gasto">Ordenar: mais comprado</option>
          <option value="pagar">Ordenar: mais por pagar</option>
          <option value="nome">Ordenar: A–Z</option>
        </select>
        <Btn icon={Plus} onClick={criarNovo}>Novo fornecedor</Btn>
      </div>

      <div className="stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
        {lista.map(({ f, st }) => (
          <div key={f.id} className="ui-card hoverable" onClick={() => setSelectedId(f.id)} style={{
            background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 16, padding: 16, cursor: "pointer", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <Avatar nome={f.nome} size={44} cor={T.navy} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 750, fontSize: 14.5, color: T.walnutDark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nome || "(sem nome)"}</div>
                <div style={{ fontSize: 12, opacity: 0.55, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.pessoaContacto || f.telefone || f.email || <i>sem contacto</i>}</div>
              </div>
              {st.atraso > 0 && <Tag color={T.rust}>{st.atraso} em atraso</Tag>}
            </div>
            {(f.categorias || []).length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {f.categorias.slice(0, 3).map((c) => <span key={c} className="pill-soft">{c}</span>)}
                {f.categorias.length > 3 && <span className="pill-soft">+{f.categorias.length - 3}</span>}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div><div style={{ fontSize: 11, opacity: 0.5 }}>Comprado</div><div style={{ fontWeight: 700, fontSize: 15 }}>{st.gasto ? fmtEUR(st.gasto) : "—"}</div></div>
              <div><div style={{ fontSize: 11, opacity: 0.5 }}>Por pagar</div><div style={{ fontWeight: 700, fontSize: 15, color: st.porPagar ? T.rust : undefined }}>{st.porPagar ? fmtEUR(st.porPagar) : "—"}</div></div>
              <div><div style={{ fontSize: 11, opacity: 0.5 }}>Obras</div><div style={{ fontWeight: 700, fontSize: 15 }}>{st.obras.length || "—"}</div></div>
            </div>
            <ContactBtns telefone={f.telefone} email={f.email} site={f.site} />
          </div>
        ))}
      </div>
      {lista.length === 0 && <div style={{ opacity: 0.5, fontSize: 13, padding: "24px 0" }}>Sem resultados.</div>}

      {todos.semFicha.length > 0 && filtro === "todos" && !q && (
        <>
          <CutDivider label={`Aparecem nas faturas mas ainda sem ficha (${todos.semFicha.length})`} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 12 }}>
            {todos.semFicha.map(({ nome, st }) => (
              <div key={nome} style={{ border: `1.5px dashed ${T.line}`, borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar nome={nome} size={38} cor={T.navy} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nome}</div>
                  <div style={{ fontSize: 11.5, opacity: 0.55 }}>{st.compras.length} compra(s) · {fmtEUR(st.gasto)}</div>
                </div>
                <Btn small variant="ghost" icon={Plus} onClick={() => criarDeNome(nome)}>Criar ficha</Btn>
              </div>
            ))}
          </div>
        </>
      )}

      {selected && <FornecedorDrawer key={selected.id} fornecedor={selected} onClose={() => setSelectedId(null)} onUpdate={onUpdate} onDelete={onDelete} despesas={despesas} obras={obras} onOpenObra={onOpenObra} />}
    </div>
  );
}

/* ============================================================
   RELATÓRIOS — resumo de gestão por mês / trimestre / ano, dentro do
   próprio CRM (sem emails). Imprime-se ou guarda-se em PDF pelo
   navegador, e as tabelas exportam-se para CSV.
   ============================================================ */
const MESES_LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const mesKeyDe = (idx) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;

function periodoDe(tipo, ano, valor) {
  const a = Number(ano);
  let ini, n;
  if (tipo === "mes") { ini = a * 12 + (valor - 1); n = 1; }
  else if (tipo === "trimestre") { ini = a * 12 + (valor - 1) * 3; n = 3; }
  else { ini = a * 12; n = 12; }
  const meses = Array.from({ length: n }, (_, i) => mesKeyDe(ini + i));
  const anteriores = Array.from({ length: n }, (_, i) => mesKeyDe(ini - n + i));
  const label = tipo === "mes" ? `${MESES_LONGOS[valor - 1]} ${a}` : tipo === "trimestre" ? `${valor}.º trimestre de ${a}` : `Ano ${a}`;
  return { meses, anteriores, label };
}

const csvEscape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
function baixarCSV(nome, linhas) {
  const csv = "﻿" + linhas.map((l) => l.map(csvEscape).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Relatorios({ obras, despesas, onOpenObra }) {
  const hoje = new Date();
  const [tipo, setTipo] = useState("mes");
  const [ano, setAno] = useState(String(hoje.getFullYear()));
  const [valor, setValor] = useState(hoje.getMonth() + 1);

  const anos = useMemo(() => {
    const s = new Set([String(hoje.getFullYear())]);
    obras.forEach((o) => [o.dataEntrada, o.dataAdjudicacao].forEach((d) => d && s.add(d.slice(0, 4))));
    despesas.forEach((d) => d.data && s.add(d.data.slice(0, 4)));
    return [...s].sort().reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obras, despesas]);

  const mudarTipo = (t) => {
    setTipo(t);
    setValor(t === "mes" ? hoje.getMonth() + 1 : t === "trimestre" ? Math.floor(hoje.getMonth() / 3) + 1 : 1);
  };

  const per = useMemo(() => periodoDe(tipo, ano, valor), [tipo, ano, valor]);

  const r = useMemo(() => {
    const idObrasRejeitadas = new Set(obras.filter((o) => REJECTED_KEYS.includes(o.estado)).map((o) => o.id));
    const despValidas = despesas.filter((d) => !d.obraId || !idObrasRejeitadas.has(d.obraId));
    const dataReceita = (o) => o.dataAdjudicacao || o.dataInicioObra || o.dataEntrada;

    const calc = (meses) => {
      const set = new Set(meses);
      const noPeriodo = (d) => d && set.has(String(d).slice(0, 7));
      // custo (ex-IVA) com a regra das despesas mensais recorrentes
      const custoMes = (d, mk) => {
        if (!d.data || d.valor == null) return 0;
        const v = despesaBase(d), ini = d.data.slice(0, 7);
        return d.recorrente ? (mk >= ini ? v : 0) : (ini === mk ? v : 0);
      };
      const despCat = {}; const despForn = {};
      let custos = 0;
      despValidas.forEach((d) => {
        const v = meses.reduce((s, mk) => s + custoMes(d, mk), 0);
        if (!v) return;
        custos += v;
        despCat[d.categoria || "Outro"] = (despCat[d.categoria || "Outro"] || 0) + v;
        if (d.fornecedor) despForn[d.fornecedor] = (despForn[d.fornecedor] || 0) + v;
      });

      const adjudicadas = obras.filter((o) => WON_KEYS.includes(o.estado) && noPeriodo(dataReceita(o)));
      const adjudicado = adjudicadas.reduce((s, o) => s + (valorTotalObra(o) || 0), 0);
      const pedidos = obras.filter((o) => noPeriodo(o.dataEntrada));
      const ganhos = pedidos.filter((o) => WON_KEYS.includes(o.estado)).length;
      const perdidos = pedidos.filter((o) => REJECTED_KEYS.includes(o.estado)).length;

      let recebido = 0, faturado = 0, pagoForn = 0;
      obras.forEach((o) => (o.pagamentos || []).forEach((p) => {
        if (p.pago && noPeriodo(p.data)) recebido += Number(p.valor) || 0;
        if (p.faturaEmitida && noPeriodo(p.data)) faturado += Number(p.valor) || 0;
      }));
      despesas.forEach((d) => { if (d.pago && noPeriodo(d.data)) pagoForn += Number(d.valor) || 0; });

      return {
        adjudicadas, adjudicado, custos, resultado: adjudicado - custos,
        margem: adjudicado > 0 ? ((adjudicado - custos) / adjudicado) * 100 : null,
        pedidos, valorPedidos: pedidos.reduce((s, o) => s + (valorTotalObra(o) || 0), 0),
        ganhos, perdidos, taxa: ganhos + perdidos > 0 ? Math.round((ganhos / (ganhos + perdidos)) * 100) : null,
        recebido, faturado, pagoForn, despCat, despForn,
      };
    };

    const atual = calc(per.meses);
    const anterior = calc(per.anteriores);

    // Custos reais por obra (todas as despesas ligadas, ex-IVA)
    const custoObra = {};
    despValidas.forEach((d) => { if (d.obraId) custoObra[d.obraId] = (custoObra[d.obraId] || 0) + despesaBase(d); });
    const rentab = atual.adjudicadas.map((o) => {
      const v = valorTotalObra(o) || 0, c = custoObra[o.id] || 0;
      return { o, valor: v, custo: c, lucro: v - c, margem: v > 0 ? ((v - c) / v) * 100 : null, semCustos: c === 0 };
    }).sort((a, b) => b.valor - a.valor);

    // Clientes do período
    const cli = {};
    atual.adjudicadas.forEach((o) => { const n = (o.cliente || "—").trim(); cli[n] = (cli[n] || 0) + (valorTotalObra(o) || 0); });

    // Situação de hoje (independente do período)
    const hojeISO = todayISO();
    let porReceber = 0, receberAtraso = 0, nAtrasoRec = 0;
    obras.filter((o) => COM_PAGAMENTOS_KEYS.includes(o.estado)).forEach((o) => (o.pagamentos || []).forEach((p) => {
      if (p.pago) return;
      const v = Number(p.valor) || 0; porReceber += v;
      if (p.data && p.data < hojeISO) { receberAtraso += v; nAtrasoRec += 1; }
    }));
    let porPagar = 0, pagarAtraso = 0, nAtrasoPag = 0;
    despesas.forEach((d) => {
      if (d.pago || !d.valor || !(d.numeroFatura || d.dataVencimento)) return;
      const v = Number(d.valor) || 0; porPagar += v;
      if (d.dataVencimento && d.dataVencimento < hojeISO) { pagarAtraso += v; nAtrasoPag += 1; }
    });

    const porMes = per.meses.map((mk) => {
      const m = calc([mk]);
      return { mes: monthLabel(mk), Adjudicado: Math.round(m.adjudicado), Custos: Math.round(m.custos) };
    });

    return { atual, anterior, rentab, cli: Object.entries(cli).sort((a, b) => b[1] - a[1]).slice(0, 8),
      porReceber, receberAtraso, nAtrasoRec, porPagar, pagarAtraso, nAtrasoPag, porMes };
  }, [obras, despesas, per]);

  const { atual: a, anterior: b } = r;
  const cats = Object.entries(a.despCat).sort((x, y) => y[1] - x[1]);
  const forns = Object.entries(a.despForn).sort((x, y) => y[1] - x[1]).slice(0, 8);
  const maxCat = cats[0]?.[1] || 1, maxForn = forns[0]?.[1] || 1, maxCli = r.cli[0]?.[1] || 1;

  const exportar = () => {
    const linhas = [
      [`Relatório Carpinova — ${per.label}`], [],
      ["Resumo"], ["Adjudicado (ex-IVA)", a.adjudicado], ["Custos (ex-IVA)", a.custos], ["Resultado", a.resultado], ["Margem %", a.margem == null ? "" : a.margem.toFixed(1)],
      ["Recebido de clientes (c/ IVA)", a.recebido], ["Pago a fornecedores (c/ IVA)", a.pagoForn], [],
      ["Obras adjudicadas no período"], ["Ref", "Projeto", "Cliente", "Valor ex-IVA", "Custos ex-IVA", "Lucro", "Margem %"],
      ...r.rentab.map((x) => [x.o.ref || "", x.o.projeto, x.o.cliente, x.valor.toFixed(2), x.custo.toFixed(2), x.lucro.toFixed(2), x.margem == null ? "" : x.margem.toFixed(1)]), [],
      ["Despesas por categoria"], ...cats.map(([k, v]) => [k, v.toFixed(2)]),
    ];
    baixarCSV(`relatorio-carpinova-${per.meses[0]}.csv`, linhas);
  };

  const Bloco = ({ titulo, children, extra }) => (
    <section className="rel-bloco">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 750, color: T.walnutDark }}>{titulo}</h3>{extra}
      </div>
      {children}
    </section>
  );
  const Barra = ({ nome, valor, max, cor = T.walnut }) => (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(90px, 160px) 1fr auto", alignItems: "center", gap: 10, fontSize: 12.5, marginBottom: 7 }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nome}</span>
      <span style={{ height: 8, borderRadius: 99, background: T.paper3, overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${Math.max(3, (valor / max) * 100)}%`, background: cor, borderRadius: 99 }} />
      </span>
      <b style={{ color: T.walnutDark }}>{fmtEUR(valor)}</b>
    </div>
  );
  const corMargem = (m) => (m == null ? T.ink : m < 0 ? T.rust : m < 20 ? T.amber : T.green);

  return (
    <div className="relatorio">
      <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <Chip ativo={tipo === "mes"} onClick={() => mudarTipo("mes")}>Mês</Chip>
          <Chip ativo={tipo === "trimestre"} onClick={() => mudarTipo("trimestre")}>Trimestre</Chip>
          <Chip ativo={tipo === "ano"} onClick={() => mudarTipo("ano")}>Ano</Chip>
        </div>
        {tipo === "mes" && (
          <select style={{ ...selectStyle, width: "auto" }} value={valor} onChange={(e) => setValor(Number(e.target.value))}>
            {MESES_LONGOS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        )}
        {tipo === "trimestre" && (
          <select style={{ ...selectStyle, width: "auto" }} value={valor} onChange={(e) => setValor(Number(e.target.value))}>
            {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{q}.º trimestre</option>)}
          </select>
        )}
        <select style={{ ...selectStyle, width: "auto" }} value={ano} onChange={(e) => setAno(e.target.value)}>
          {anos.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <Btn small variant="ghost" icon={Download} onClick={exportar}>Exportar CSV</Btn>
        <Btn small icon={FileText} onClick={() => window.print()}>Guardar PDF / Imprimir</Btn>
      </div>

      <div className="print-only" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>Carpinova — Relatório de gestão</div>
        <div style={{ fontSize: 14, opacity: 0.7 }}>{per.label} · emitido a {fmtDate(todayISO())}</div>
      </div>
      <div className="no-print" style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, color: T.walnutDark, marginBottom: 14 }}>{per.label}</div>

      <div className="stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 20 }}>
        <KpiCard icon={Banknote} label="Adjudicado" value={fmtEUR(a.adjudicado)} sub={`${a.adjudicadas.length} obra(s), ex-IVA`} accent={T.green} delta={<DeltaBadge atual={a.adjudicado} anterior={b.adjudicado} />} />
        <KpiCard icon={Wallet} label="Custos" value={fmtEUR(a.custos)} sub="material, mão de obra, gerais" accent={T.rust} delta={<DeltaBadge atual={a.custos} anterior={b.custos} invertido />} />
        <KpiCard icon={TrendingUp} label="Resultado" value={fmtEUR(a.resultado)} accent={a.resultado < 0 ? T.rust : T.walnut}
          sub={a.margem == null ? "sem adjudicações" : `margem ${a.margem.toFixed(0)}%`} delta={<DeltaBadge atual={a.resultado} anterior={b.resultado} />} />
        <KpiCard icon={CheckCircle2} label="Conversão" value={a.taxa == null ? "—" : `${a.taxa}%`} accent={T.navy}
          sub={`${a.pedidos.length} pedidos · ${a.ganhos} ganhos · ${a.perdidos} perdidos`} />
      </div>

      <div className="rel-grid">
        <Bloco titulo="Adjudicado vs custos">
          <div style={{ height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.porMes} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="mes" interval={0} tick={{ fontSize: 11, fill: "var(--ink)", opacity: 0.6 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--ink)", opacity: 0.6 }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                <Tooltip formatter={(v) => fmtEUR(v)} contentStyle={{ background: "var(--paper2)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="Adjudicado" fill="var(--walnut)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Custos" fill="var(--rust)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Bloco>

        <Bloco titulo="Dinheiro (com IVA)">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <MiniStat label="Recebido no período" value={fmtEUR(a.recebido)} cor={T.green} />
            <MiniStat label="Pago a fornecedores" value={fmtEUR(a.pagoForn)} />
            <MiniStat label="Por receber (hoje)" value={fmtEUR(r.porReceber)} cor={T.amber} sub={r.nAtrasoRec ? `${fmtEUR(r.receberAtraso)} em atraso (${r.nAtrasoRec})` : "sem atrasos"} />
            <MiniStat label="Por pagar (hoje)" value={fmtEUR(r.porPagar)} cor={T.rust} sub={r.nAtrasoPag ? `${fmtEUR(r.pagarAtraso)} em atraso (${r.nAtrasoPag})` : "sem atrasos"} />
          </div>
          <div style={{ fontSize: 11.5, opacity: 0.55, marginTop: 10 }}>"Por receber" e "Por pagar" são a situação de hoje; o resto refere-se ao período escolhido.</div>
        </Bloco>
      </div>

      <Bloco titulo={`Rentabilidade das obras adjudicadas (${r.rentab.length})`}>
        {r.rentab.length === 0 ? <div style={{ fontSize: 13, opacity: 0.55 }}>Sem obras adjudicadas neste período.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ textAlign: "left", fontSize: 11.5, opacity: 0.55 }}>
                <th style={{ padding: "6px 8px" }}>Obra</th><th>Cliente</th><th style={{ textAlign: "right" }}>Valor</th><th style={{ textAlign: "right" }}>Custos</th><th style={{ textAlign: "right" }}>Lucro</th><th style={{ textAlign: "right", paddingRight: 8 }}>Margem</th>
              </tr></thead>
              <tbody>
                {r.rentab.map((x) => (
                  <tr key={x.o.id} onClick={() => onOpenObra(x.o.id)} style={{ borderTop: `1px solid ${T.line}`, cursor: "pointer" }}>
                    <td style={{ padding: "8px", fontWeight: 650 }}>{x.o.projeto}<div style={{ fontSize: 11, opacity: 0.5, fontWeight: 400 }}>{x.o.ref || "s/ ref"}</div></td>
                    <td>{x.o.cliente}</td>
                    <td style={{ textAlign: "right" }}>{fmtEUR(x.valor)}</td>
                    <td style={{ textAlign: "right" }}>{x.semCustos ? <span style={{ opacity: 0.4 }}>sem custos</span> : fmtEUR(x.custo)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{x.semCustos ? "—" : fmtEUR(x.lucro)}</td>
                    <td style={{ textAlign: "right", paddingRight: 8, fontWeight: 750, color: x.semCustos ? undefined : corMargem(x.margem) }}>{x.semCustos || x.margem == null ? "—" : `${x.margem.toFixed(0)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 11.5, opacity: 0.55, marginTop: 8 }}>Custos = tudo o que foi lançado nessa obra (ex-IVA). Obras sem custos lançados não têm margem calculável. Verde ≥ 20%, âmbar abaixo disso, vermelho negativo.</div>
          </div>
        )}
      </Bloco>

      <div className="rel-grid" style={{ marginTop: 16 }}>
        <Bloco titulo="Despesas por categoria">
          {cats.length === 0 ? <div style={{ fontSize: 13, opacity: 0.55 }}>Sem despesas neste período.</div> : cats.map(([k, v]) => <Barra key={k} nome={k} valor={v} max={maxCat} cor={T.rust} />)}
        </Bloco>
        <Bloco titulo="Maiores fornecedores">
          {forns.length === 0 ? <div style={{ fontSize: 13, opacity: 0.55 }}>Sem compras neste período.</div> : forns.map(([k, v]) => <Barra key={k} nome={k} valor={v} max={maxForn} cor={T.navy} />)}
        </Bloco>
      </div>

      <div className="rel-grid" style={{ marginTop: 16 }}>
        <Bloco titulo="Maiores clientes (adjudicado)">
          {r.cli.length === 0 ? <div style={{ fontSize: 13, opacity: 0.55 }}>Sem adjudicações neste período.</div> : r.cli.map(([k, v]) => <Barra key={k} nome={k} valor={v} max={maxCli} cor={T.green} />)}
        </Bloco>
        <Bloco titulo="Pedidos recebidos no período">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <MiniStat label="Pedidos" value={a.pedidos.length} sub={`${b.pedidos.length} no período anterior`} />
            <MiniStat label="Valor orçamentado" value={fmtEUR(a.valorPedidos)} />
            <MiniStat label="Ganhos" value={a.ganhos} cor={T.green} />
            <MiniStat label="Perdidos" value={a.perdidos} cor={T.rust} />
          </div>
        </Bloco>
      </div>
    </div>
  );
}

/* ============================================================
   FATURAS — contas a pagar a fornecedores. É a mesma informação dos
   "Custos da Obra" (para não haver lançamento duplicado), só que aqui
   vista como contas a pagar: por fornecedor, com vencimento e estado.
   ============================================================ */
function NovaFaturaModal({ onClose, onCreate, onUpdateDespesa, onDeleteDespesa, obras, fornecedorNomes, fatura }) {
  const editando = !!fatura;
  const [f, setF] = useState({
    fornecedor: fatura?.fornecedor || "", numeroFatura: fatura?.numeroFatura || "",
    categoria: fatura?.categoria || CATEGORIAS_DESPESA[0], valor: fatura?.valor ?? "", ivaPct: fatura ? despesaPct(fatura) : 23,
    data: fatura?.data || todayISO(), dataVencimento: fatura?.dataVencimento || "",
    obraId: fatura?.obraId || "", notas: fatura?.notas || "",
  });
  const [ficheiro, setFicheiro] = useState(null);
  const [aEnviar, setAEnviar] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const enviarAnexo = async (id, file) => {
    const path = `faturas/${id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("anexos").upload(path, file);
    if (error) { console.error("Erro a enviar fatura:", error); return; }
    onUpdateDespesa(id, { anexo: { nome: file.name, path } });
  };

  const submit = async () => {
    if (!f.fornecedor.trim() && !f.numeroFatura.trim()) return;
    setAEnviar(true);
    const patch = {
      fornecedor: f.fornecedor.trim(), numeroFatura: f.numeroFatura.trim(), categoria: f.categoria,
      valor: f.valor === "" ? null : Number(f.valor), ivaPct: Number(f.ivaPct) || 0, data: f.data, dataVencimento: f.dataVencimento,
      obraId: f.obraId || null, notas: f.notas.trim(),
    };
    if (editando) {
      onUpdateDespesa(fatura.id, patch);
      if (ficheiro) await enviarAnexo(fatura.id, ficheiro);
    } else {
      const novoId = onCreate({ ...patch, pago: false, anexo: null });
      if (ficheiro && novoId) await enviarAnexo(novoId, ficheiro);
    }
    setAEnviar(false);
    onClose();
  };

  return (
    <div className="ui-overlay" style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.paper, borderRadius: 18, width: "100%", maxWidth: 480, border: `1px solid ${T.line}`, padding: 24, boxShadow: "var(--shadow-lg)", overflowX: "hidden" }}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 16, color: T.ink }}>{editando ? "Editar fatura" : "Nova fatura"}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <Field label="Fornecedor">
            <input style={inputStyle} list="fornecedores-datalist-fatura" value={f.fornecedor} onChange={(e) => set("fornecedor", e.target.value)} autoFocus />
            <datalist id="fornecedores-datalist-fatura">
              {(fornecedorNomes || []).map((n) => <option key={n} value={n} />)}
            </datalist>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12, minWidth: 0 }}>
            <Field label="Nº da fatura">
              <input style={inputStyle} value={f.numeroFatura} onChange={(e) => set("numeroFatura", e.target.value)} />
            </Field>
            <Field label="Valor total € (com IVA)">
              <input type="number" style={inputStyle} value={f.valor} onChange={(e) => set("valor", e.target.value)} />
            </Field>
            <Field label="IVA da fatura">
              <select style={selectStyle} value={f.ivaPct} onChange={(e) => set("ivaPct", Number(e.target.value))}>
                <option value={23}>23%</option>
                <option value={0}>Sem IVA</option>
              </select>
            </Field>
            <div style={{ fontSize: 11.5, opacity: 0.65, alignSelf: "end", paddingBottom: 8, fontFamily: "'Inter', sans-serif" }}>
              {f.valor !== "" && Number(f.ivaPct) > 0 ? `Base ${fmtEUR(Number(f.valor) / (1 + Number(f.ivaPct) / 100))} + IVA ${fmtEUR(Number(f.valor) - Number(f.valor) / (1 + Number(f.ivaPct) / 100))}` : ""}
            </div>
            <Field label="Categoria">
              <select style={selectStyle} value={f.categoria} onChange={(e) => set("categoria", e.target.value)}>
                {CATEGORIAS_DESPESA.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </Field>
            <Field label="Obra (opcional)">
              <select style={selectStyle} value={f.obraId} onChange={(e) => set("obraId", e.target.value)}>
                <option value="">— Compra geral (fábrica) —</option>
                {obras.map((o) => <option key={o.id} value={o.id}>{o.projeto} — {o.cliente}</option>)}
              </select>
            </Field>
            <Field label="Data de emissão">
              <input type="date" style={inputStyle} value={f.data} onChange={(e) => set("data", e.target.value)} />
            </Field>
            <Field label="Data de vencimento">
              <input type="date" style={inputStyle} value={f.dataVencimento} onChange={(e) => set("dataVencimento", e.target.value)} />
            </Field>
          </div>
          <Field label={editando && fatura.anexo ? `PDF da fatura (substituir "${fatura.anexo.nome}")` : "PDF da fatura (opcional)"}>
            <input type="file" accept=".pdf,image/*" style={{ ...inputStyle, padding: "6px 9px" }} onChange={(e) => setFicheiro(e.target.files[0] || null)} />
          </Field>
          <Field label="Notas">
            <textarea style={textareaStyle} rows={2} value={f.notas} onChange={(e) => set("notas", e.target.value)} />
          </Field>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
          {editando ? (
            confirmDelete ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.rust }}>Eliminar esta fatura?</span>
                <Btn small variant="danger" onClick={() => { onDeleteDespesa(fatura.id); onClose(); }}>Sim, eliminar</Btn>
                <Btn small variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Btn>
              </div>
            ) : (
              <Btn small variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>Eliminar</Btn>
            )
          ) : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" onClick={onClose} disabled={aEnviar}>Cancelar</Btn>
            <Btn icon={editando ? Save : Plus} onClick={submit} disabled={aEnviar}>{aEnviar ? "A guardar…" : editando ? "Guardar" : "Criar fatura"}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PRODUÇÃO — vista de calendário/linha do tempo das obras em
   produção (e adjudicadas com data de início marcada), para
   planeares a carga da oficina.
   ============================================================ */
const WINDOW_MONTHS_PRODUCAO = 5;

function Producao({ obras, onOpenObra }) {
  const hoje = new Date();
  const hojeKey = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const [windowStart, setWindowStart] = useState(hojeKey);

  const toDate = (s) => (s ? new Date(s + "T00:00:00") : null);

  const monthKeys = useMemo(
    () => Array.from({ length: WINDOW_MONTHS_PRODUCAO }, (_, i) => addMonths(windowStart, i)),
    [windowStart]
  );
  const windowStartDate = useMemo(() => new Date(`${windowStart}-01T00:00:00`), [windowStart]);
  const windowEndDate = useMemo(() => {
    const [y, m] = addMonths(windowStart, WINDOW_MONTHS_PRODUCAO - 1).split("-").map(Number);
    return new Date(y, m, 0); // último dia do último mês da janela
  }, [windowStart]);
  const totalDays = useMemo(() => Math.round((windowEndDate - windowStartDate) / 86400000) + 1, [windowStartDate, windowEndDate]);

  const monthSegments = useMemo(() => monthKeys.map((mk) => {
    const [y, m] = mk.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    const start = first < windowStartDate ? windowStartDate : first;
    const end = last > windowEndDate ? windowEndDate : last;
    const dias = Math.round((end - start) / 86400000) + 1;
    return { key: mk, label: monthLabel(mk), widthPct: (dias / totalDays) * 100 };
  }), [monthKeys, windowStartDate, windowEndDate, totalDays]);

  const todayPct = (hoje >= windowStartDate && hoje <= windowEndDate)
    ? (Math.round((hoje - windowStartDate) / 86400000) / totalDays) * 100 : null;

  const linhas = useMemo(() => {
    const candidatas = obras.filter((o) => o.estado === "producao" || (o.estado === "adjudicado" && o.dataInicioObra));
    return candidatas
      .filter((o) => o.dataInicioObra)
      .map((o) => {
        const s = toDate(o.dataInicioObra);
        const eRaw = o.dataConclusao ? toDate(o.dataConclusao) : null;
        return { obra: o, s, e: eRaw || windowEndDate, openEnded: !eRaw };
      })
      .filter((l) => l.e >= windowStartDate && l.s <= windowEndDate)
      .sort((a, b) => a.s - b.s);
  }, [obras, windowStartDate, windowEndDate]);

  const semData = useMemo(
    () => obras.filter((o) => o.estado === "producao" && !o.dataInicioObra),
    [obras]
  );

  const posBarra = (l) => {
    const clipStart = l.s < windowStartDate ? windowStartDate : l.s;
    const clipEnd = l.e > windowEndDate ? windowEndDate : l.e;
    const left = (Math.round((clipStart - windowStartDate) / 86400000) / totalDays) * 100;
    const width = Math.max(1.5, (Math.round((clipEnd - clipStart) / 86400000) + 1) / totalDays * 100);
    return { left: `${left}%`, width: `${width}%` };
  };

  const LABEL_WIDTH = 210;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn small variant="ghost" onClick={() => setWindowStart(addMonths(windowStart, -1))}>← Anterior</Btn>
          <Btn small variant="ghost" onClick={() => setWindowStart(hojeKey)}>Hoje</Btn>
          <Btn small variant="ghost" onClick={() => setWindowStart(addMonths(windowStart, 1))}>Seguinte →</Btn>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 11.5, opacity: 0.7, alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, background: T.walnut, borderRadius: 2, display: "inline-block" }} /> Em produção</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, background: T.green, borderRadius: 2, display: "inline-block", opacity: 0.6 }} /> Adjudicada (agendada)</span>
        </div>
      </div>

      <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden", background: T.paper2 }}>
        {/* Cabeçalho dos meses */}
        <div style={{ display: "flex" }}>
          <div style={{ width: LABEL_WIDTH, flexShrink: 0, borderRight: `1px solid ${T.line}`, background: T.paper3 }} />
          <div style={{ flex: 1, display: "flex" }}>
            {monthSegments.map((m) => (
              <div key={m.key} style={{
                width: `${m.widthPct}%`, padding: "8px 6px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: 0.4, color: T.walnutDark, background: T.paper3, borderRight: `1px solid ${T.line}`, textAlign: "center",
              }}>
                {m.label}
              </div>
            ))}
          </div>
        </div>

        {/* Linhas */}
        {linhas.map((l, i) => {
          const late = l.openEnded && l.e < hoje;
          return (
            <div key={l.obra.id} style={{ display: "flex", borderTop: `1px solid ${T.line}`, background: i % 2 ? T.paper2 : T.paper }}>
              <div
                onClick={() => onOpenObra(l.obra.id)}
                style={{
                  width: LABEL_WIDTH, flexShrink: 0, padding: "8px 10px", borderRight: `1px solid ${T.line}`,
                  cursor: "pointer", overflow: "hidden",
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700, color: T.navy, textDecoration: "underline", textDecorationStyle: "dotted", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {l.obra.projeto}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.obra.cliente}</div>
              </div>
              <div style={{ flex: 1, position: "relative", minHeight: 40 }}>
                {monthSegments.reduce((acc, m) => {
                  const prevLeft = acc.left;
                  acc.lines.push(<div key={m.key} style={{ position: "absolute", left: `${prevLeft + m.widthPct}%`, top: 0, bottom: 0, borderLeft: `1px solid ${T.line}` }} />);
                  acc.left += m.widthPct;
                  return acc;
                }, { left: 0, lines: [] }).lines}
                {todayPct !== null && (
                  <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, borderLeft: `2px solid ${T.rust}`, zIndex: 2 }} />
                )}
                <div
                  onClick={() => onOpenObra(l.obra.id)}
                  title={`${fmtDate(l.obra.dataInicioObra)} — ${l.obra.dataConclusao ? fmtDate(l.obra.dataConclusao) : "sem data de fim"}`}
                  style={{
                    position: "absolute", top: 7, bottom: 7, ...posBarra(l),
                    background: l.obra.estado === "producao" ? T.walnut : mix(T.green, 60),
                    border: l.obra.estado === "producao" ? "none" : `1px dashed ${T.green}`,
                    borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center",
                    paddingLeft: 6, overflow: "hidden", zIndex: 3,
                    backgroundImage: l.openEnded ? `linear-gradient(to right, ${l.obra.estado === "producao" ? T.walnut : T.green} 85%, transparent 100%)` : "none",
                  }}
                >
                  <span style={{ fontSize: 10.5, color: "#fff", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {fmtEUR(valorTotalObra(l.obra))}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {linhas.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", opacity: 0.5, fontSize: 13, borderTop: `1px solid ${T.line}` }}>
            Sem obras em produção com data de início nesta janela de tempo.
          </div>
        )}
      </div>

      {semData.length > 0 && (
        <>
          <CutDivider label="Em produção, sem data de início definida" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {semData.map((o) => (
              <div key={o.id} onClick={() => onOpenObra(o.id)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 8, cursor: "pointer", fontSize: 13,
              }}>
                <AlertTriangle size={14} color={T.amber} />
                <span style={{ fontWeight: 600 }}>{o.projeto}</span>
                <span style={{ opacity: 0.6 }}>— {o.cliente}</span>
                <span style={{ marginLeft: "auto", fontSize: 11.5, opacity: 0.55 }}>Preenche a "Início de obra" na ficha para aparecer no calendário</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


/* ============================================================
   FATURAS — contas a pagar a fornecedores. Junta os custos lançados
   dentro de cada obra com compras gerais para a fábrica (sem obra
   associada), sempre que houver um fornecedor identificado.
   ============================================================ */
/* ============================================================
   RECEITAS — todos os pagamentos de todas as obras, num só sítio:
   o que já entrou (como e quando) e o que ainda falta receber.
   Serve também para garantir que tudo o que é recebido acaba
   faturado — não é um registo paralelo, é o mesmo plano de
   pagamentos de cada obra, só visto em conjunto.
   ============================================================ */
function Receitas({ obras, onOpenObra }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todos"); // todos | recebidos | por_receber | atrasados
  const [modoIva, setModoIva] = useState("com"); // "com" = o que entra na conta | "sem" = receita real

  const porObra = useMemo(() => {
    return obras
      .filter((o) => COM_PAGAMENTOS_KEYS.includes(o.estado))
      .map((o) => {
        const pagamentos = o.pagamentos || [];
        const f = fatorIva(o);
        // Os pagamentos estão sempre COM IVA. Em "sem IVA" dividimos pelo fator da obra.
        const div = modoIva === "sem" ? f : 1;
        const recebido = pagamentos.reduce((s, p) => s + (p.pago ? (Number(p.valor) || 0) : 0), 0) / div;
        const faturado = pagamentos.reduce((s, p) => s + (p.faturaEmitida ? (Number(p.valor) || 0) : 0), 0) / div;
        const valorTotal = (valorTotalObra(o) || 0) * (modoIva === "sem" ? 1 : f);
        const porReceber = Math.max(0, valorTotal - recebido);
        const atrasado = pagamentos.some((p) => !p.pago && p.data && p.data < todayISO());
        const ultimaData = pagamentos.reduce((max, p) => (p.data && p.data > max ? p.data : max), "");
        return {
          obraId: o.id, projeto: o.projeto, cliente: o.cliente, estado: o.estado, iva: ivaTipoOf(o),
          valorTotal, faturado, recebido, porReceber, atrasado, ultimaData,
        };
      });
  }, [obras, modoIva]);

  const filtrados = useMemo(() => {
    return porObra
      .filter((o) => {
        if (filtro === "recebidos") return o.porReceber <= 0.01 && o.valorTotal > 0;
        if (filtro === "por_receber") return o.porReceber > 0.01;
        if (filtro === "atrasados") return o.atrasado;
        return true;
      })
      .filter((o) => !q || `${o.projeto} ${o.cliente}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => {
        if (a.atrasado !== b.atrasado) return a.atrasado ? -1 : 1;
        return b.porReceber - a.porReceber;
      });
  }, [porObra, q, filtro]);

  const kpis = useMemo(() => {
    const totalRecebido = porObra.reduce((s, o) => s + o.recebido, 0);
    const totalFaturado = porObra.reduce((s, o) => s + o.faturado, 0);
    const totalPorReceber = porObra.reduce((s, o) => s + o.porReceber, 0);
    const atrasadas = porObra.filter((o) => o.atrasado);
    return {
      totalRecebido, totalFaturado, totalPorReceber,
      nAtrasadas: atrasadas.length,
      totalAtrasado: atrasadas.reduce((s, o) => s + o.porReceber, 0),
    };
  }, [porObra]);

  const porMetodo = useMemo(() => {
    const map = {};
    obras.filter((o) => COM_PAGAMENTOS_KEYS.includes(o.estado)).forEach((o) => {
      (o.pagamentos || []).filter((p) => p.pago).forEach((p) => {
        const m = p.metodo || "(não indicado)";
        map[m] = (map[m] || 0) + (Number(p.valor) || 0) / (modoIva === "sem" ? fatorIva(o) : 1);
      });
    });
    return Object.entries(map).map(([metodo, valor]) => ({ metodo, valor })).sort((a, b) => b.valor - a.valor);
  }, [obras, modoIva]);

  const METODO_CORES = [T.walnut, T.navy, T.green, T.amber, "#8A6A1E", T.rust];

  const comparacao = useMemo(() => ([
    { nome: "Faturado", valor: kpis.totalFaturado, cor: T.navy },
    { nome: "Recebido", valor: kpis.totalRecebido, cor: T.green },
    { nome: "Por Receber", valor: kpis.totalPorReceber, cor: T.amber },
  ]), [kpis]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden" }}>
          {[["com", "Com IVA"], ["sem", "Sem IVA"]].map(([k, l]) => (
            <button key={k} onClick={() => setModoIva(k)} style={{
              padding: "7px 16px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "Inter",
              background: modoIva === k ? T.walnut : T.paper2, color: modoIva === k ? "var(--on-primary)" : T.ink,
            }}>{l}</button>
          ))}
        </div>
        <span style={{ fontSize: 12, opacity: 0.65 }}>
          {modoIva === "com" ? "O que o cliente paga e entra na conta (IVA incluído)." : "A receita real da Carpinova, sem o IVA que é do Estado."}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 8 }}>
        <KpiCard icon={FileText} label="Faturado" value={fmtEUR(kpis.totalFaturado)} accent={T.navy} />
        <KpiCard icon={Banknote} label="Recebido" value={fmtEUR(kpis.totalRecebido)} accent={T.green} />
        <KpiCard icon={Clock} label="Por receber" value={fmtEUR(kpis.totalPorReceber)} accent={T.amber} />
        <KpiCard icon={AlertTriangle} label="Por receber, já atrasado" value={fmtEUR(kpis.totalAtrasado)} sub={`${kpis.nAtrasadas} obra(s)`} accent={kpis.nAtrasadas > 0 ? T.rust : T.green} />
      </div>

      <CutDivider label="Faturado vs. Recebido vs. Por Receber" />
      <div style={{ background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 10, padding: "16px 20px", height: 220, marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={comparacao} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.line} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fontFamily: "Inter" }} tickFormatter={(v) => fmtEUR(v)} />
            <YAxis type="category" dataKey="nome" tick={{ fontSize: 12, fontFamily: "Inter", fontWeight: 600 }} width={100} />
            <Tooltip formatter={(v) => fmtEUR(v)} contentStyle={{ fontFamily: "Inter", fontSize: 12, borderRadius: 8, border: `1px solid ${T.line}` }} />
            <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
              {comparacao.map((c) => <Cell key={c.nome} fill={c.cor} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {kpis.nAtrasadas > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", marginBottom: 16,
          background: mix(T.rust, 10), border: `1px solid ${T.rust}`, borderRadius: 8, fontSize: 13,
        }}>
          <AlertTriangle size={14} color={T.rust} />
          Há {kpis.nAtrasadas} obra(s) com pagamentos por receber já atrasados, totalizando {fmtEUR(kpis.totalAtrasado)}.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 240px" }}>
          <Search size={14} style={{ position: "absolute", left: 9, top: 9, opacity: 0.5 }} />
          <input style={{ ...inputStyle, width: "100%", paddingLeft: 28 }} placeholder="Pesquisar obra, cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select style={selectStyle} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="todos">Todos</option>
          <option value="recebidos">Recebidos</option>
          <option value="por_receber">Por receber</option>
          <option value="atrasados">Atrasados</option>
        </select>
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${T.line}`, borderRadius: 10, marginBottom: 24 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: T.paper3, textAlign: "left" }}>
              {["Obra", "Cliente", "IVA", modoIva === "com" ? "Valor c/ IVA" : "Valor s/ IVA", "Faturado", "Recebido", "Por Receber", "Estado"].map((h) => (
                <th key={h} style={{ padding: "9px 12px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: T.walnutDark, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map((o, i) => {
              const stage = stageOf(o.estado);
              return (
                <tr key={o.obraId} style={{ background: o.atrasado ? mix(T.rust, 9) : (i % 2 ? T.paper2 : T.paper), borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "8px 12px" }}>
                    <button onClick={() => onOpenObra(o.obraId)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: T.navy, textDecoration: "underline", textDecorationStyle: "dotted", fontSize: 13 }}>
                      {o.projeto}
                    </button>
                  </td>
                  <td style={{ padding: "8px 12px" }}>{o.cliente}</td>
                  <td style={{ padding: "8px 12px", fontSize: 12, whiteSpace: "nowrap", opacity: 0.75 }}>{o.iva.label}</td>
                  <td style={{ padding: "8px 12px", fontFamily: "'Inter', sans-serif", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtEUR(o.valorTotal)}</td>
                  <td style={{ padding: "8px 12px", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap", opacity: o.faturado > 0 ? 1 : 0.3 }}>
                    {o.faturado > 0 ? fmtEUR(o.faturado) : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap", opacity: o.recebido > 0 ? 1 : 0.3 }}>
                    {o.recebido > 0 ? fmtEUR(o.recebido) : "—"}
                  </td>
                  <td style={{
                    padding: "8px 12px", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap",
                    opacity: o.porReceber > 0 ? 1 : 0.3, color: o.atrasado ? T.rust : "inherit", fontWeight: o.atrasado ? 700 : 400,
                  }}>
                    {o.atrasado && <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: -2 }} />}
                    {o.porReceber > 0 ? fmtEUR(o.porReceber) : "—"}
                  </td>
                  <td style={{ padding: "8px 12px" }}><Tag color={stage.color}>{stage.label}</Tag></td>
                </tr>
              );
            })}
            {filtrados.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", opacity: 0.5 }}>Sem obras para este filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <CutDivider label="Recebido por método de pagamento" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {porMetodo.length === 0 && <div style={{ fontSize: 13, opacity: 0.6 }}>Sem pagamentos recebidos ainda.</div>}
        {porMetodo.map((m, i) => (
          <div key={m.metodo} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: METODO_CORES[i % METODO_CORES.length], flexShrink: 0 }} />
            <span style={{ minWidth: 170 }}>{m.metodo}</span>
            <div style={{ flex: 1, background: T.paper3, borderRadius: 10, height: 14, position: "relative", overflow: "hidden" }}>
              <div style={{ width: `${kpis.totalRecebido > 0 ? (m.valor / kpis.totalRecebido) * 100 : 0}%`, height: "100%", background: METODO_CORES[i % METODO_CORES.length], borderRadius: 10 }} />
            </div>
            <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, minWidth: 90, textAlign: "right" }}>{fmtEUR(m.valor)}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11.5, opacity: 0.55, marginTop: 18, fontStyle: "italic" }}>
        Cada linha é uma obra. O valor sem IVA é o Valor Orçamentado da ficha; o valor com IVA é esse valor mais o IVA da obra (23%, autoliquidação ou isento). Faturado, Recebido e Por Receber vêm do plano de pagamentos, que está sempre com IVA incluído. Edita as prestações diretamente na ficha da obra (secção "Plano de pagamentos").
      </div>
    </div>
  );
}


/* ============================================================
   FATURAS — contas a pagar a fornecedores. Junta os custos lançados
   dentro de cada obra com compras gerais para a fábrica (sem obra
   associada), sempre que houver um fornecedor identificado.
   ============================================================ */
function Faturas({ obras, despesas, onAddDespesa, onUpdateDespesa, onDeleteDespesa, onOpenObra, fornecedorNomes }) {
  const [q, setQ] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("todas");
  const [novaFaturaOpen, setNovaFaturaOpen] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [uploadingId, setUploadingId] = useState(null);

  const faturas = useMemo(() => {
    return despesas.filter((d) => d.fornecedor && d.fornecedor.trim()).map((d) => {
      const obra = d.obraId ? obras.find((o) => o.id === d.obraId) : null;
      const atrasada = d.dataVencimento && !d.pago && d.dataVencimento < todayISO();
      const estado = d.pago ? "paga" : d.dataVencimento ? (atrasada ? "atrasada" : "pendente") : "sem_prazo";
      return {
        ...d,
        obraProjeto: d.obraId ? (obra?.projeto || "(obra removida)") : "Compra geral (fábrica)",
        obraCliente: obra?.cliente || "",
        estado,
      };
    });
  }, [despesas, obras]);

  const ESTADO_INFO = {
    paga: { label: "Paga", color: T.green },
    atrasada: { label: "Atrasada", color: T.rust },
    pendente: { label: "Pendente", color: T.amber },
    sem_prazo: { label: "Sem prazo definido", color: "#8A7A6B" },
  };

  const filtradas = useMemo(() => {
    return faturas
      .filter((f) => estadoFiltro === "todas" || f.estado === estadoFiltro)
      .filter((f) => !q || `${f.fornecedor || ""} ${f.obraProjeto} ${f.numeroFatura || ""} ${f.descricao}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => {
        if (!!a.pago !== !!b.pago) return a.pago ? 1 : -1;
        return (a.dataVencimento || "9999").localeCompare(b.dataVencimento || "9999");
      });
  }, [faturas, estadoFiltro, q]);

  const kpis = useMemo(() => {
    const hoje = todayISO();
    const em7dias = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const porPagar = faturas.filter((f) => !f.pago);
    const atrasadas = faturas.filter((f) => f.estado === "atrasada");
    const venceEm7 = porPagar.filter((f) => f.dataVencimento && f.dataVencimento >= hoje && f.dataVencimento <= em7dias);
    const pagas = faturas.filter((f) => f.pago);
    return {
      totalPorPagar: porPagar.reduce((s, f) => s + (Number(f.valor) || 0), 0),
      totalAtrasadas: atrasadas.reduce((s, f) => s + (Number(f.valor) || 0), 0), nAtrasadas: atrasadas.length,
      totalVenceEm7: venceEm7.reduce((s, f) => s + (Number(f.valor) || 0), 0), nVenceEm7: venceEm7.length,
      totalPagas: pagas.reduce((s, f) => s + (Number(f.valor) || 0), 0),
    };
  }, [faturas]);

  const porFornecedor = useMemo(() => {
    const map = {};
    faturas.filter((f) => !f.pago).forEach((f) => {
      const nome = f.fornecedor || "(sem fornecedor)";
      map[nome] = (map[nome] || 0) + (Number(f.valor) || 0);
    });
    return Object.entries(map).map(([fornecedor, valor]) => ({ fornecedor, valor })).sort((a, b) => b.valor - a.valor);
  }, [faturas]);

  const uploadAnexo = async (despesaId, file) => {
    if (!file) return;
    setUploadingId(despesaId);
    const path = `faturas/${despesaId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("anexos").upload(path, file);
    if (error) {
      console.error("Erro a enviar fatura:", error);
    } else {
      onUpdateDespesa(despesaId, { anexo: { nome: file.name, path } });
    }
    setUploadingId(null);
  };
  const removeAnexo = async (f) => {
    onUpdateDespesa(f.id, { anexo: null });
    const { error } = await supabase.storage.from("anexos").remove([f.anexo.path]);
    if (error) console.error("Erro a remover fatura do storage:", error);
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 8 }}>
        <KpiCard icon={Wallet} label="Por pagar (c/ IVA)" value={fmtEUR(kpis.totalPorPagar)} sub="Todas as faturas ainda não pagas" accent={T.amber} />
        <KpiCard icon={AlertTriangle} label="Atrasadas" value={fmtEUR(kpis.totalAtrasadas)} sub={`${kpis.nAtrasadas} fatura(s)`} accent={T.rust} />
        <KpiCard icon={Clock} label="Vencem em 7 dias" value={fmtEUR(kpis.totalVenceEm7)} sub={`${kpis.nVenceEm7} fatura(s)`} accent={T.navy} />
        <KpiCard icon={CheckCircle2} label="Pagas (histórico)" value={fmtEUR(kpis.totalPagas)} accent={T.green} />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 240px" }}>
          <Search size={14} style={{ position: "absolute", left: 9, top: 9, opacity: 0.5 }} />
          <input style={{ ...inputStyle, width: "100%", paddingLeft: 28 }} placeholder="Pesquisar fornecedor, obra, nº fatura…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select style={selectStyle} value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
          <option value="todas">Todos os estados</option>
          <option value="pendente">Pendente</option>
          <option value="atrasada">Atrasada</option>
          <option value="paga">Paga</option>
          <option value="sem_prazo">Sem prazo definido</option>
        </select>
        <Btn small icon={Plus} onClick={() => setNovaFaturaOpen(true)}>Nova fatura</Btn>
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${T.line}`, borderRadius: 10, marginBottom: 24 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: T.paper3, textAlign: "left" }}>
              {["Fornecedor", "Nº Fatura", "Obra", "Valor", "Vencimento", "Estado", "Paga", "Anexo"].map((h) => (
                <th key={h} style={{ padding: "9px 12px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: T.walnutDark, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((f, i) => {
              const info = ESTADO_INFO[f.estado];
              return (
                <tr key={f.id} style={{ background: i % 2 ? T.paper2 : T.paper, borderTop: `1px solid ${T.line}` }}>
                  <td onClick={() => setEditandoId(f.id)} style={{ padding: "8px 12px", cursor: "pointer" }} title="Clica para editar">{f.fornecedor || "—"}</td>
                  <td onClick={() => setEditandoId(f.id)} style={{ padding: "8px 12px", fontFamily: "'Inter', sans-serif", fontSize: 12, cursor: "pointer" }} title="Clica para editar">{f.numeroFatura || "—"}</td>
                  <td style={{ padding: "8px 12px" }}>
                    {f.obraId ? (
                      <button onClick={() => onOpenObra(f.obraId)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: T.navy, textDecoration: "underline", textDecorationStyle: "dotted", fontSize: 13 }}>
                        {f.obraProjeto}
                      </button>
                    ) : (
                      <span onClick={() => setEditandoId(f.id)} style={{ opacity: 0.6, fontStyle: "italic", cursor: "pointer" }} title="Clica para editar">{f.obraProjeto}</span>
                    )}
                    {f.obraCliente && <div style={{ fontSize: 11, opacity: 0.55 }}>{f.obraCliente}</div>}
                  </td>
                  <td onClick={() => setEditandoId(f.id)} style={{ padding: "8px 12px", fontFamily: "'Inter', sans-serif", fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" }} title="Clica para editar">{fmtEUR(f.valor)}</td>
                  <td onClick={() => setEditandoId(f.id)} style={{ padding: "8px 12px", whiteSpace: "nowrap", cursor: "pointer" }} title="Clica para editar">{f.dataVencimento ? fmtDate(f.dataVencimento) : "—"}</td>
                  <td onClick={() => setEditandoId(f.id)} style={{ padding: "8px 12px", cursor: "pointer" }} title="Clica para editar"><Tag color={info.color}>{info.label}</Tag></td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    <input type="checkbox" checked={!!f.pago} onChange={(e) => onUpdateDespesa(f.id, { pago: e.target.checked })} />
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    {f.anexo ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
                        <a href="#" onClick={(e) => { e.preventDefault(); abrirAnexo(f.anexo); }} title={f.anexo.nome} style={{ color: T.navy }}><FileType size={16} /></a>
                        <button onClick={() => removeAnexo(f)} style={{ background: "none", border: "none", cursor: "pointer", color: T.rust }}><Trash2 size={12} /></button>
                      </div>
                    ) : (
                      <label style={{ cursor: "pointer", color: T.walnut, display: "flex", justifyContent: "center" }} title="Anexar PDF da fatura">
                        <input type="file" accept=".pdf,image/*" style={{ display: "none" }} onChange={(e) => uploadAnexo(f.id, e.target.files[0])} />
                        {uploadingId === f.id ? <Clock size={15} /> : <Upload size={15} />}
                      </label>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtradas.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", opacity: 0.5 }}>Sem faturas para este filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <CutDivider label="Por pagar, por fornecedor" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {porFornecedor.length === 0 && <div style={{ fontSize: 13, opacity: 0.6 }}>Sem valores em aberto.</div>}
        {porFornecedor.map((f) => (
          <div key={f.fornecedor} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 8, fontSize: 13 }}>
            <span style={{ flex: 1, fontWeight: 600 }}>{f.fornecedor}</span>
            <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, color: T.walnutDark }}>{fmtEUR(f.valor)}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11.5, opacity: 0.55, marginTop: 18, fontStyle: "italic" }}>
        As faturas ligadas a uma obra também aparecem na secção "Custos da Obra & Margem Real" dessa obra — é o mesmo registo, visto daqui como conta a pagar. As compras gerais (sem obra) só aparecem aqui.
      </div>

      {novaFaturaOpen && (
        <NovaFaturaModal
          onClose={() => setNovaFaturaOpen(false)}
          onCreate={onAddDespesa}
          onUpdateDespesa={onUpdateDespesa}
          onDeleteDespesa={onDeleteDespesa}
          obras={obras}
          fornecedorNomes={fornecedorNomes}
        />
      )}
      {editandoId && (
        <NovaFaturaModal
          fatura={faturas.find((f) => f.id === editandoId)}
          onClose={() => setEditandoId(null)}
          onCreate={onAddDespesa}
          onUpdateDespesa={onUpdateDespesa}
          onDeleteDespesa={onDeleteDespesa}
          obras={obras}
          fornecedorNomes={fornecedorNomes}
        />
      )}
    </div>
  );
}

/* ============================================================
   EMAILS — um cartão por email + a aba "Emails" (caixa de triagem)
   ============================================================ */
const fmtDataHora = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

function ObraPicker({ obras, value, onChange }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const atual = obras.find((o) => o.id === value);
  const rotulo = (o) => `${o.ref || "s/ ref"} · ${o.projeto || ""} · ${o.cliente || ""}`;
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return obras.filter((o) => !t || `${o.ref} ${o.projeto} ${o.cliente}`.toLowerCase().includes(t)).slice(0, 40);
  }, [obras, q]);
  const escolher = (id) => { onChange(id); setOpen(false); setQ(""); };
  return (
    <div style={{ position: "relative", minWidth: 260, maxWidth: 340, flex: "1 1 260px" }}>
      <input
        style={{ ...inputStyle, width: "100%", fontSize: 12 }}
        placeholder={atual ? rotulo(atual) : "Ligar a uma obra… (escreve para pesquisar)"}
        value={open ? q : ""}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === "Enter" && lista.length > 0) { e.preventDefault(); escolher(lista[0].id); } if (e.key === "Escape") setOpen(false); }}
      />
      {open && (
        <div style={{
          position: "absolute", zIndex: 30, top: "100%", left: 0, right: 0, marginTop: 2, maxHeight: 260, overflowY: "auto",
          background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 8, boxShadow: "var(--shadow-md)",
        }}>
          {value && <div onMouseDown={() => escolher("")} style={{ padding: "7px 10px", fontSize: 12, cursor: "pointer", color: T.rust, borderBottom: `1px solid ${T.line}` }}>Desligar da obra</div>}
          {lista.map((o) => (
            <div key={o.id} onMouseDown={() => escolher(o.id)} style={{ padding: "7px 10px", fontSize: 12, cursor: "pointer", borderBottom: `1px solid ${T.line}`, background: o.id === value ? "rgba(200,138,26,0.12)" : "transparent" }}>
              {rotulo(o)}
            </div>
          ))}
          {lista.length === 0 && <div style={{ padding: "8px 10px", fontSize: 12, opacity: 0.6 }}>Nenhuma obra encontrada.</div>}
        </div>
      )}
    </div>
  );
}

function EmailItem({ email, obras, onUpdate, onCriarObra, mostrarObra = true }) {
  const [aberto, setAberto] = useState(false);
  const obra = obras.find((o) => o.id === email.obraId);
  const sugerida = email.sugestaoObraId ? obras.find((o) => o.id === email.sugestaoObraId) : null;
  const saida = email.direcao === "saida";
  const opcoes = useMemo(() => [...obras].sort((a, b) => (b.dataEntrada || "").localeCompare(a.dataEntrada || "")), [obras]);
  return (
    <div style={{
      background: emailNaoLido(email) ? mix(T.amber, 9) : T.paper2,
      border: `1px solid ${emailNaoLido(email) ? T.amber : T.line}`, borderRadius: 10, fontSize: 13, minWidth: 0,
      opacity: email.resolvido ? 0.6 : 1,
    }}>
      <button onClick={() => { const abrir = !aberto; setAberto(abrir); if (abrir && !email.lido) onUpdate(email.id, { lido: true }); }} style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "none", border: "none",
        padding: "9px 12px", cursor: "pointer", color: T.ink, fontFamily: "Inter", minWidth: 0,
      }}>
        {aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: emailNaoLido(email) ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {emailNaoLido(email) && <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 8, background: T.amber, marginRight: 7 }} />}
            {email.assunto || "(sem assunto)"}
          </div>
          <div style={{ fontSize: 11.5, opacity: 0.65, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {saida ? `Para ${(email.para || []).join(", ")}` : `De ${email.de || email.deEmail}`} · {fmtDataHora(email.data)}
          </div>
        </div>
        {email.resolvido && <Tag color={T.green}>Resolvido</Tag>}
        <Tag color={saida ? T.navy : T.green}>{saida ? "Enviado" : "Recebido"}</Tag>
        {(email.anexos || []).length > 0 && <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11.5, opacity: 0.7 }}><Paperclip size={12} />{email.anexos.length}</span>}
        {mostrarObra && obra && <Tag color={T.walnut}>{obra.ref || obra.projeto}</Tag>}
      </button>
      {aberto && (
        <div style={{ padding: "0 12px 12px 36px", display: "flex", flexDirection: "column", gap: 10 }}>
          <pre style={{
            margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "Inter", fontSize: 12.5, lineHeight: 1.5,
            maxHeight: 280, overflowY: "auto", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 8, padding: 10,
          }}>{email.texto || "(sem texto)"}</pre>
          {(email.anexos || []).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {email.anexos.map((a, i) => (
                <a key={i} href="#" onClick={(e) => { e.preventDefault(); abrirAnexo(a); }} style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "4px 8px", border: `1px solid ${T.line}`, borderRadius: 8,
                  color: T.navy, textDecoration: "none", fontSize: 12, background: T.paper2,
                }}><Paperclip size={12} />{a.nome}</a>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {mostrarObra && (
              <ObraPicker obras={opcoes} value={email.obraId || ""}
                onChange={(id) => onUpdate(email.id, id ? { obraId: id, estado: "ligado", ligadoPor: "manual" } : { obraId: null, estado: "novo", ligadoPor: null })} />
            )}
            {!email.resolvido
              ? <Btn small icon={Check} onClick={() => onUpdate(email.id, { resolvido: true, lido: true, dataResolvido: new Date().toISOString() })}>Marcar resolvido</Btn>
              : <Btn small variant="ghost" icon={RotateCcw} onClick={() => onUpdate(email.id, { resolvido: false, dataResolvido: null })}>Reabrir</Btn>}
            {email.lido && !saida && <Btn small variant="ghost" icon={Eye} onClick={() => onUpdate(email.id, { lido: false })}>Marcar como não lido</Btn>}
            {!email.obraId && onCriarObra && <Btn small icon={Plus} onClick={() => onCriarObra(email)}>Criar obra com este email</Btn>}
            {email.obraId && !mostrarObra && (
              <Btn small variant="ghost" onClick={() => onUpdate(email.id, { obraId: null, estado: "novo", ligadoPor: null })}>Desligar desta obra</Btn>
            )}
            {email.estado !== "ignorado" && !email.obraId && <Btn small variant="ghost" onClick={() => onUpdate(email.id, { estado: "ignorado" })}>Ignorar</Btn>}
            {email.estado === "ignorado" && <Btn small variant="ghost" onClick={() => onUpdate(email.id, { estado: "novo" })}>Repor</Btn>}
            {!email.obraId && sugerida && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 8px", background: T.paper2, border: `1px dashed ${T.walnut}`, borderRadius: 8 }}>
                Sugestão: <b>{sugerida.ref || sugerida.projeto}</b> ({email.sugestaoMotivo})
                <Btn small onClick={() => onUpdate(email.id, { obraId: sugerida.id, estado: "ligado", ligadoPor: "manual", sugestaoObraId: null })}>Confirmar</Btn>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { key: "painel", label: "Painel", icon: LayoutGrid, grupo: "Comercial" },
  { key: "pipeline", label: "Pipeline", icon: ArrowRight, grupo: "Comercial" },
  { key: "obras", label: "Obras", icon: TableIcon, grupo: "Comercial" },
  { key: "clientes", label: "Clientes", icon: Users, grupo: "Comercial" },
  { key: "producao", label: "Produção", icon: Calendar, grupo: "Oficina" },
  { key: "financeiro", label: "Financeiro", icon: Wallet, grupo: "Finanças" },
  { key: "relatorios", label: "Relatórios", icon: TrendingUp, grupo: "Finanças" },
  { key: "receitas", label: "Receitas", icon: Banknote, grupo: "Finanças" },
  { key: "faturas", label: "Faturas", icon: Receipt, grupo: "Finanças" },
  { key: "fornecedores", label: "Fornecedores", icon: Package, grupo: "Finanças" },
];
const TAB_GRUPOS = ["Comercial", "Oficina", "Finanças"];

/* ============================================================
   PALETA DE COMANDOS (Ctrl/Cmd + K) — pesquisa global
   ============================================================ */
function CommandPalette({ obras, onClose, onOpenObra, onGoTab, onNovaObra, onToggleTema, onBackup }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef(null);
  const norm = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const itens = useMemo(() => {
    const nq = norm(q.trim());
    const acoes = [
      { id: "a-nova", grupo: "Ações", label: "Nova obra / orçamento", icon: Plus, run: onNovaObra },
      ...TABS.map((t) => ({ id: "t-" + t.key, grupo: "Ir para", label: t.label, icon: t.icon, run: () => onGoTab(t.key) })),
      { id: "a-tema", grupo: "Ações", label: "Alternar modo claro / escuro", icon: Moon, run: onToggleTema },
      { id: "a-backup", grupo: "Ações", label: "Descarregar cópia de segurança", icon: Download, run: onBackup },
    ];
    const acoesF = nq ? acoes.filter((x) => norm(x.label).includes(nq)) : acoes.slice(0, 6);
    const obrasF = nq
      ? obras.filter((o) => norm(`${o.ref} ${o.projeto} ${o.cliente} ${o.clienteEmail || ""}`).includes(nq))
          .slice(0, 8)
          .map((o) => ({ id: "o-" + o.id, grupo: "Obras", label: `${o.ref ? o.ref + " · " : ""}${o.projeto || "Sem nome"}`, sub: `${o.cliente || ""} · ${stageOf(o.estado).label}`, icon: FileText, run: () => onOpenObra(o.id) }))
      : [];
    return [...obrasF, ...acoesF];
  }, [q, obras]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    const el = listRef.current && listRef.current.querySelector(".cmdk-item.sel");
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const executar = (it) => { if (!it) return; onClose(); it.run(); };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(i + 1, itens.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); executar(itens[sel]); }
  };

  let ultimoGrupo = null;
  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Pesquisa global">
        <input className="cmdk-input" autoFocus placeholder="Pesquisar obras, clientes, referências ou ações…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
        <div className="cmdk-list" ref={listRef}>
          {itens.length === 0 && <div className="cmdk-empty">Nada encontrado para “{q}”.</div>}
          {itens.map((it, i) => {
            const cab = it.grupo !== ultimoGrupo; ultimoGrupo = it.grupo;
            const Icon = it.icon;
            return (
              <React.Fragment key={it.id}>
                {cab && <div className="cmdk-group">{it.grupo}</div>}
                <button className={"cmdk-item" + (i === sel ? " sel" : "")} onMouseEnter={() => setSel(i)} onClick={() => executar(it)}>
                  <Icon size={16} style={{ opacity: 0.65, flex: "none" }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
                  {it.sub && <small>{it.sub}</small>}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="cmdk-foot">
          <span><kbd>↑</kbd> <kbd>↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> abrir</span>
          <span><kbd>Esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   LOGIN — autenticação real via Supabase Auth. Sem isto, qualquer
   pessoa com o link do site acedia a tudo.
   ============================================================ */
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState("");
  const [aEntrar, setAEntrar] = useState(false);

  const entrar = async (e) => {
    e.preventDefault();
    setErro("");
    setAEntrar(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setErro(error.message === "Invalid login credentials" ? "Email ou palavra-passe incorretos." : error.message);
    }
    setAEntrar(false);
  };

  return (
    <div className="login-wrap">
      <form onSubmit={entrar} className="login-card">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 26 }}>
          <div className="brand-logo"><Wrench size={18} color="var(--brand-fg)" /></div>
          <div>
            <div className="brand-name" style={{ fontSize: 18 }}>Carpinova</div>
            <div className="brand-sub">Controlo de obras & orçamentos</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Email">
            <input type="email" required style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" />
          </Field>
          <Field label="Palavra-passe">
            <input type="password" required style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          {erro && <div style={{ fontSize: 12.5, color: T.rust }}>{erro}</div>}
          <Btn type="submit" disabled={aEntrar}>{aEntrar ? "A entrar…" : "Entrar"}</Btn>
        </div>
      </form>
    </div>
  );
}

function Carpinova({ onSignOut, userEmail }) {
  const { obras, loading, saveState, addObra, updateObra, changeEstado, addHistorico, deleteObra } = useObrasStore();
  const { fornecedores, addFornecedor, updateFornecedor, deleteFornecedor } = useFornecedoresStore();
  const { despesas, addDespesa, updateDespesa, deleteDespesa } = useDespesasStore();
  const { clientes, addCliente, updateCliente, deleteCliente, syncCliente } = useClientesStore();
  const { equipa, addMembro, updateMembro, deleteMembro } = useEquipaStore();
  const { emails, updateEmail } = useEmailsStore(); // emails já importados continuam ligados às obras; a sincronização foi desligada
  useAvisoSeparador(0);
  const nSeguimentos = useMemo(() => seguimentosPendentes(obras, emails).length, [obras, emails]);
  const clientesNomesUnicos = useMemo(() => {
    const set = new Set();
    clientes.forEach((c) => c.nome && set.add(c.nome));
    obras.forEach((o) => o.cliente && set.add(o.cliente));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [clientes, obras]);
  const [tab, setTab] = useState("painel");
  const [selectedId, setSelectedId] = useState(null);
  const [novaObraOpen, setNovaObraOpen] = useState(false);
  const [paletaOpen, setPaletaOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [tema, setTema] = useState(() => { try { return localStorage.getItem("carpinova-tema") || "auto"; } catch { return "auto"; } });
  useEffect(() => {
    const r = document.documentElement;
    if (tema === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", tema);
    try { localStorage.setItem("carpinova-tema", tema); } catch { /* sem armazenamento */ }
  }, [tema]);
  const alternarTema = useCallback(() => {
    setTema((t) => {
      const escuro = t === "dark" || (t === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
      return escuro ? "light" : "dark";
    });
  }, []);
  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletaOpen((v) => !v); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const irPara = (k) => { setTab(k); setNavOpen(false); window.scrollTo({ top: 0 }); };

  const selected = obras.find((o) => o.id === selectedId);

  const exportarBackup = () => {
    const payload = {
      exportadoEm: new Date().toISOString(),
      obras, clientes, fornecedores, despesas, equipa, emails,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `carpinova-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", justifyContent: "center", height: "100vh", background: T.paper, color: T.ink }}>
        <div className="spinner" />
        <div style={{ fontSize: 13, opacity: 0.6 }}>A carregar dados da Carpinova…</div>
      </div>
    );
  }

  const tabAtual = TABS.find((t) => t.key === tab) || TABS[0];
  const inicial = (userEmail || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="app-shell">
      <aside className={"sidebar" + (navOpen ? " open" : "")}>
        <div className="brand">
          <div className="brand-logo"><Wrench size={18} color="var(--brand-fg)" /></div>
          <div>
            <div className="brand-name">Carpinova</div>
            <div className="brand-sub">Obras & orçamentos</div>
          </div>
        </div>
        <nav className="nav-scroll">
          {TAB_GRUPOS.map((g) => (
            <div className="nav-group" key={g}>
              <div className="nav-label">{g}</div>
              {TABS.filter((t) => t.grupo === g).map((t) => {
                const Icon = t.icon;
                return (
                  <button key={t.key} className={"nav-item" + (tab === t.key ? " active" : "")} onClick={() => irPara(t.key)}>
                    <Icon size={17} /> {t.label}
                    {t.key === "painel" && nSeguimentos > 0 && <span className="nav-badge">{nSeguimentos}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className="nav-item" onClick={exportarBackup} title="Descarregar cópia de segurança de todos os dados"><Download size={17} /> Cópia de segurança</button>
          <div className="user-chip">
            <span className="avatar">{inicial}</span>
            <span className="user-mail">{userEmail}</span>
            <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={onSignOut} title="Sair" aria-label="Sair"><LogOut size={14} /></button>
          </div>
        </div>
      </aside>
      {navOpen && <div className="sidebar-scrim" onClick={() => setNavOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setNavOpen(true)} aria-label="Abrir menu"><Menu size={18} /></button>
          <h1 className="topbar-title">{tabAtual.label}</h1>
          <button className="search-trigger" onClick={() => setPaletaOpen(true)}>
            <Search size={15} style={{ opacity: 0.6 }} />
            <span>Pesquisar obras, clientes…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div style={{ flex: 1 }} />
          <span className="save-state hide-sm">
            {saveState === "saving" && <><div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> a guardar…</>}
            {saveState === "saved" && <><CheckCircle2 size={14} color={T.green} /> guardado</>}
            {saveState === "error" && <><AlertTriangle size={14} color={T.rust} /> erro ao guardar</>}
          </span>
          <button className="icon-btn" onClick={alternarTema} title="Alternar modo claro / escuro" aria-label="Alternar tema"><Sun size={16} /></button>
          <Btn icon={Plus} onClick={() => setNovaObraOpen(true)}><span className="btn-label">Nova obra</span></Btn>
        </header>

        <main className={"content page-enter" + (tab === "pipeline" ? " wide" : "")} key={tab}>
          {tab === "painel" && <Painel obras={obras} onOpen={setSelectedId} emails={emails} onAddHistorico={addHistorico} onChangeEstado={changeEstado} />}
          {tab === "pipeline" && <Pipeline obras={obras} onOpen={setSelectedId} onChangeEstado={changeEstado} />}
          {tab === "obras" && <ObrasTab obras={obras} onOpen={setSelectedId} onNew={() => setNovaObraOpen(true)} />}
          {tab === "producao" && <Producao obras={obras} onOpenObra={setSelectedId} />}
          {tab === "financeiro" && <Financeiro obras={obras} despesas={despesas} onAddDespesa={addDespesa} onUpdateDespesa={updateDespesa} onDeleteDespesa={deleteDespesa} equipa={equipa} onAddMembro={addMembro} onUpdateMembro={updateMembro} onDeleteMembro={deleteMembro} />}
          {tab === "receitas" && <Receitas obras={obras} onOpenObra={setSelectedId} />}
          {tab === "relatorios" && <Relatorios obras={obras} despesas={despesas} onOpenObra={setSelectedId} />}
          {tab === "faturas" && <Faturas obras={obras} despesas={despesas} onAddDespesa={addDespesa} onUpdateDespesa={updateDespesa} onDeleteDespesa={deleteDespesa} onOpenObra={setSelectedId} fornecedorNomes={fornecedores.map((f) => f.nome)} />}
          {tab === "clientes" && <Clientes obras={obras} clientes={clientes} onAddCliente={addCliente} onUpdateCliente={updateCliente} onDeleteCliente={deleteCliente} onOpenObra={setSelectedId} />}
          {tab === "fornecedores" && <Fornecedores fornecedores={fornecedores} onAdd={addFornecedor} onUpdate={updateFornecedor} onDelete={deleteFornecedor} despesas={despesas} obras={obras} onOpenObra={setSelectedId} />}
        </main>
      </div>

      {paletaOpen && (
        <CommandPalette obras={obras} onClose={() => setPaletaOpen(false)} onOpenObra={setSelectedId} onGoTab={irPara}
          onNovaObra={() => setNovaObraOpen(true)} onToggleTema={alternarTema} onBackup={exportarBackup} />
      )}

      {selected && (
        <ObraModal key={selected.id} emails={emails} onUpdateEmail={updateEmail} obra={selected} onClose={() => setSelectedId(null)} onUpdate={updateObra} onChangeEstado={changeEstado} onAddHistorico={addHistorico} onDelete={deleteObra} fornecedorNomes={fornecedores.map((f) => f.nome)} despesas={despesas} onAddDespesa={addDespesa} onUpdateDespesa={updateDespesa} onDeleteDespesa={deleteDespesa} onSyncCliente={syncCliente} clientesNomes={clientesNomesUnicos} equipa={equipa} />
      )}
      {novaObraOpen && (
        <NovaObraModal
          suggestedRef={nextRef(obras)} refsExistentes={obras.map((o) => o.ref)} clientesNomes={clientesNomesUnicos}
          onClose={() => setNovaObraOpen(false)}
          onCreate={(f) => addObra({ ...f, id: uid() })} />
      )}
    </div>
  );
}

/* ============================================================
   APP — verifica sessão do Supabase Auth antes de mostrar seja o
   que for. Sem sessão válida, só se vê o ecrã de login.
   ============================================================ */
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = a verificar, null = sem sessão, objeto = autenticado

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, novaSession) => {
      setSession(novaSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Fecha a sessão após 30 min sem atividade (computadores deixados abertos).
  useEffect(() => {
    if (!session) return undefined;
    const LIMITE = 30 * 60 * 1000;
    let t = setTimeout(() => supabase.auth.signOut(), LIMITE);
    const reset = () => { clearTimeout(t); t = setTimeout(() => supabase.auth.signOut(), LIMITE); };
    const evs = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => { clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, reset)); };
  }, [session]);

  if (session === undefined) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", justifyContent: "center", height: "100vh", background: T.paper, color: T.ink }}>
        <div className="spinner" />
        <div style={{ fontSize: 13, opacity: 0.6 }}>A verificar sessão…</div>
      </div>
    );
  }

  if (!session) return <Login />;

  return <Carpinova onSignOut={() => supabase.auth.signOut()} userEmail={session.user?.email} />;
}
