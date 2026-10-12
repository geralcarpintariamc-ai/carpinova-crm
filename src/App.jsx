import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  Plus, Search, X, Mail, Phone, Calendar, AlertTriangle, TrendingUp,
  Package, CheckCircle2, XCircle, Clock, Download, Building2, ChevronDown,
  ChevronRight, ChevronUp, MapPin, Euro, FileText, Users, LayoutGrid, Table as TableIcon,
  Wallet, Wrench, ArrowRight, Trash2, Save, RotateCcw, Globe, Upload, Paperclip,
  FileSpreadsheet, Image as ImageIcon, FileType, Receipt, Banknote, Landmark, Check, Eye
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend, ComposedChart, Line
} from "recharts";

/* ============================================================
   DESIGN TOKENS
   Bancada de carpintaria / prancheta técnica: papel serrado,
   nogueira, tinta azul de risco técnico, âmbar de serradura.
   ============================================================ */
const T = {
  ink: "#241F1A",
  paper: "#EDE6D6",
  paper2: "#E3D9C2",
  paper3: "#D9CCAE",
  walnut: "#5E3A22",
  walnutDark: "#3E2515",
  amber: "#BD7F22",
  navy: "#2C3E50",
  green: "#496B3C",
  rust: "#9C3B24",
  line: "#B9A97F",
};

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');`;

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
const SEGUIMENTO_DIAS = { orcamentar: 7, entregue: 10, retificacao: 7, em_estudo: 7 }; // dias ÚTEIS
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
function seguimentosPendentes(obras, emails = []) {
  const hoje = todayISO();
  const out = [];
  obras.forEach((o) => {
    const limite = SEGUIMENTO_DIAS[o.estado];
    if (!limite || o.proximaAcaoData) return;
    const toque = ultimoToque(o, emails);
    if (!toque) return;
    const dias = diasEntre(toque, hoje);
    if (dias >= limite) out.push({ obra: o, dias, desde: toque });
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

/* Aviso do sistema quando chega um email novo com o CRM aberto (só se o utilizador ativar). */
function useAvisoEmailNovo(emails, carregado) {
  const vistos = useRef(null);
  useEffect(() => {
    if (!carregado) return;
    if (vistos.current === null) { vistos.current = new Set(emails.map((e) => e.id)); return; }
    const novos = emails.filter((e) => !vistos.current.has(e.id));
    novos.forEach((e) => vistos.current.add(e.id));
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    novos.filter(emailNaoLido).slice(0, 3).forEach((e) => {
      try { new Notification("Novo email — Carpinova", { body: e.assunto || "(sem assunto)" }); } catch { /* ignora */ }
    });
  }, [emails, carregado]);
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
      fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
      letterSpacing: 0.3, color: "#fff", background: color, padding: "3px 8px",
      borderRadius: 3, whiteSpace: "nowrap", display: "inline-block",
    }}>
      {children}
    </span>
  );
}

function CutDivider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "28px 0 16px" }}>
      {label && (
        <span style={{
          fontFamily: "'Roboto Slab', serif", fontWeight: 600, fontSize: 13,
          letterSpacing: 1, textTransform: "uppercase", color: T.walnutDark, whiteSpace: "nowrap",
        }}>{label}</span>
      )}
      <div style={{
        flex: 1, height: 0, borderTop: `2px dashed ${T.line}`,
      }} />
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
  return (
    <div style={{
      background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 6,
      padding: "16px 18px", position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: -10, right: -10, width: 60, height: 60, borderRadius: "50%", background: T.paper, border: `1px solid ${T.line}` }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, position: "relative" }}>
        <Icon size={16} color={accent || T.walnut} />
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: T.ink, opacity: 0.65 }}>{label}</span>
      </div>
      <div style={{ fontFamily: "'Roboto Slab', serif", fontSize: 26, fontWeight: 700, color: T.walnutDark, position: "relative" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: T.ink, opacity: 0.6, marginTop: 4, position: "relative" }}>{sub}</div>}
      {delta && <div style={{ marginTop: 4, position: "relative" }}>{delta}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
      <span style={{ fontWeight: 600, color: T.ink, opacity: 0.65, textTransform: "uppercase", letterSpacing: 0.4, fontSize: 11 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, padding: "7px 9px",
  border: `1px solid ${T.line}`, borderRadius: 4, background: "#fff", color: T.ink,
  outline: "none",
};
const selectStyle = { ...inputStyle };
const textareaStyle = { ...inputStyle, resize: "vertical", fontFamily: "'Inter', sans-serif" };

function Btn({ children, onClick, variant = "primary", icon: Icon, small, type = "button", disabled }) {
  const styles = {
    primary: { background: T.walnut, color: "#fff", border: `1px solid ${T.walnutDark}` },
    ghost: { background: "transparent", color: T.walnutDark, border: `1px solid ${T.line}` },
    danger: { background: "transparent", color: T.rust, border: `1px solid ${T.rust}` },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles[variant], fontFamily: "'Inter', sans-serif", fontWeight: 600,
        fontSize: small ? 12 : 13, padding: small ? "5px 10px" : "8px 14px",
        borderRadius: 4, cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex", alignItems: "center", gap: 6, opacity: disabled ? 0.5 : 1,
        transition: "opacity .15s",
      }}
    >
      {Icon && <Icon size={small ? 13 : 14} />}
      {children}
    </button>
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
  if (!limite && obra.estado !== "sem_resposta") return null;

  // índices dos follow-ups feitos desde a última mudança de fase
  let desde = -1;
  hist.forEach((h, i) => { if ((h.texto || "").startsWith("Estado alterado")) desde = i; });
  const followups = [];
  hist.forEach((h, i) => { if (i > desde && (h.texto || "").startsWith("Seguimento: cliente contactado")) followups.push({ i, data: h.data }); });
  const dataFase = desde >= 0 ? hist[desde].data : (obra.dataEntrada || "");

  const hoje = todayISO();
  const toque = limite ? ultimoToque(obra, emails.filter((e) => e.obraId === obra.id)) : "";
  const proximo = limite && !obra.proximaAcaoData && toque ? addDiasUteis(toque, limite) : "";
  const atraso = proximo && proximo < hoje ? diasEntre(proximo, hoje) : 0;

  const registar = () => onPatch({ historico: [...hist, { data: dataNovo || hoje, texto: "Seguimento: cliente contactado." }] });
  const adiar = () => onPatch({ historico: [...hist, { data: hoje, texto: "Seguimento: lembrete adiado." }] });
  const mudarData = (i, data) => onPatch({ historico: hist.map((h, k) => (k === i ? { ...h, data } : h)) });
  const remover = (i) => onPatch({ historico: hist.filter((_, k) => k !== i) });

  return (
    <>
      <CutDivider label="Seguimento do orçamento" />
      <div style={{ background: obra.estado === "sem_resposta" ? "rgba(122,127,135,0.12)" : "rgba(200,138,26,0.07)", border: `1px solid ${obra.estado === "sem_resposta" ? "#7A7F87" : T.amber}`, borderRadius: 6, padding: 14, display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
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
              {proximo && <span>Próximo lembrete: <b style={{ color: atraso ? T.rust : "inherit" }}>{fmtDate(proximo)}</b>{atraso ? ` (em atraso há ${atraso} dias úteis)` : ""}</span>}
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
                  <Btn small variant={followups.length >= 1 ? "primary" : "ghost"} onClick={() => onEstado("sem_resposta")}>Enviei email de arquivo → Sem resposta</Btn>
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

  const [uploading, setUploading] = useState(false);
  const [uploadErro, setUploadErro] = useState("");
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setUploadErro("");
    const novosAnexos = [];
    for (const file of files) {
      const path = `${obra.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage.from("anexos").upload(path, file);
      if (error) {
        console.error("Erro a enviar ficheiro:", error);
        setUploadErro(`Falhou "${file.name}": ${error.message}`);
        continue;
      }
      novosAnexos.push({
        id: uid(), nome: file.name, path,
        tipo: file.type || "", tamanho: file.size, dataUpload: todayISO(),
      });
    }
    if (novosAnexos.length) commit({ anexos: [...(local.anexos || []), ...novosAnexos] });
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAnexo = async (anexo) => {
    const anexos = (local.anexos || []).filter((a) => a.id !== anexo.id);
    commit({ anexos });
    const { error } = await supabase.storage.from("anexos").remove([anexo.path]);
    if (error) console.error("Erro a remover ficheiro do storage:", error);
  };

  const iconeAnexo = (a) => {
    const ext = (a.nome.split(".").pop() || "").toLowerCase();
    if (["xlsx", "xls", "csv"].includes(ext)) return <FileSpreadsheet size={16} color={T.green} />;
    if (ext === "pdf") return <FileType size={16} color={T.rust} />;
    if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return <ImageIcon size={16} color={T.navy} />;
    return <Paperclip size={16} color={T.walnut} />;
  };

  const formatBytes = (n) => {
    if (!n) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

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

  // Esquemas de pagamento disponíveis. A última prestação absorve os cêntimos de arredondamento.
  const ESQUEMAS_PAGAMENTO = [
    { key: "40-40-20", label: "40/40/20", partes: [["Adjudicação", 40], ["Início de obra", 40], ["Conclusão", 20]] },
    { key: "40-20-20-20", label: "40/20/20/20", partes: [["Adjudicação", 40], ["Início de obra", 20], ["A meio da obra", 20], ["Conclusão", 20]] },
    { key: "50-50", label: "50/50", partes: [["Adjudicação", 50], ["Conclusão", 50]] },
  ];
  const gerarPagamentos = (esquema) => {
    if (valorRefObra === null) return;
    const temPagos = (local.pagamentos || []).some((p) => p.pago);
    if (temPagos) return;
    if ((local.pagamentos || []).length > 0 && !window.confirm(`Substituir o plano de pagamentos atual por ${esquema.label}? As datas e métodos já preenchidos perdem-se.`)) return;
    const v = valorRefObra * fatorIva(local); // plano com IVA incluído
    let acumulado = 0;
    const pagamentos = esquema.partes.map(([nome, pct], i) => {
      const ultimo = i === esquema.partes.length - 1;
      const valor = ultimo ? +(v - acumulado).toFixed(2) : +(v * pct / 100).toFixed(2);
      acumulado += valor;
      return { label: `${nome} (${pct}%)`, valor, data: "", pago: false, metodo: "", faturaEmitida: false };
    });
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
    <div style={{
      position: "fixed", inset: 0, background: "rgba(36,31,26,0.55)", zIndex: 100,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 16px", overflowY: "auto",
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.paper, borderRadius: 8, width: "100%", maxWidth: 760,
          border: `1px solid ${T.line}`, boxShadow: "0 20px 50px rgba(0,0,0,0.3)", overflowX: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "18px 24px", borderBottom: `2px dashed ${T.line}`, display: "flex",
          justifyContent: "space-between", alignItems: "flex-start", gap: 12,
        }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: T.walnutDark, fontWeight: 700 }}>
                {local.ref || "SEM REFERÊNCIA"}
              </span>
              <Tag color={stage.color}>{stage.label}</Tag>
            </div>
            <div style={{ fontFamily: "'Roboto Slab', serif", fontSize: 20, fontWeight: 700, color: T.ink }}>
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
            <Field label="Data de adjudicação">
              <input type="date" style={inputStyle} value={local.dataAdjudicacao || ""} onChange={(e) => commit({ dataAdjudicacao: e.target.value })} />
            </Field>
            <Field label="Início de obra">
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
                <div style={{ ...inputStyle, background: T.paper3, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                  {valorRefObra !== null ? fmtEUR(valorRefObra * fatorIva(local)) : "—"}
                </div>
              </Field>
            </div>
          </div>

          <CutDivider label="Custos da Obra & Margem Real" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {custosObra.length === 0 && <div style={{ fontSize: 12, opacity: 0.55 }}>Sem custos registados para esta obra.</div>}
            {custosObra.map((c) => {
              const atrasada = c.dataVencimento && !c.pago && c.dataVencimento < todayISO();
              return (
                <div key={c.id} style={{
                  padding: "8px 10px", background: T.paper2, border: `1px solid ${atrasada ? T.rust : T.line}`, borderRadius: 4, fontSize: 13,
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
                    {despesaPct(c) > 0 && <span style={{ opacity: 0.6, fontFamily: "'JetBrains Mono', monospace" }}>Base {fmtEUR(despesaBase(c))} + IVA {fmtEUR(despesaIvaValor(c))}</span>}
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
              <div style={{ display: "flex", gap: 16, marginTop: 8, padding: "10px 12px", background: T.paper3, borderRadius: 4, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", opacity: 0.6, fontWeight: 600 }}>Total de custos (sem IVA)</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 15, color: T.walnutDark }}>{fmtEUR(totalCustos)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", opacity: 0.6, fontWeight: 600 }}>Margem real</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 15, color: margemReal >= 0 ? T.green : T.rust }}>
                    {margemReal !== null ? fmtEUR(margemReal) : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", opacity: 0.6, fontWeight: 600 }}>Margem real %</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 15, color: margemReal >= 0 ? T.green : T.rust }}>
                    {margemRealPct !== null ? `${margemRealPct.toFixed(1)}%` : "—"}
                  </div>
                </div>
                {local.tipoCliente && (
                  <div>
                    <div style={{ fontSize: 10.5, textTransform: "uppercase", opacity: 0.6, fontWeight: 600 }}>Margem sugerida</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 15, opacity: 0.7 }}>
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
                gap: 8, alignItems: "center", padding: "7px 10px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 4, fontSize: 13,
              }}>
                <span>{(equipa || []).find((m) => m.id === h.funcionarioId)?.nome || "(removido)"}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{h.horas}h</span>
                <span style={{ fontSize: 11.5, opacity: 0.6 }}>{fmtDate(h.data)}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: T.walnutDark }}>{fmtEUR(h.valor)}</span>
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
                background: a.estado === "aberta" ? "rgba(156,59,36,0.08)" : T.paper2,
                border: `1px solid ${a.estado === "aberta" ? T.rust : T.line}`, borderRadius: 4, fontSize: 13,
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

          {COM_PAGAMENTOS_KEYS.includes(local.estado) && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.walnutDark, textTransform: "uppercase", letterSpacing: 0.4 }}>Plano de pagamentos (com IVA)</span>
                {valorRefObra !== null && !(local.pagamentos || []).some((p) => p.pago) && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 11.5, opacity: 0.6 }}>{(local.pagamentos || []).length ? "Refazer plano:" : "Gerar:"}</span>
                    {ESQUEMAS_PAGAMENTO.map((e) => <Btn key={e.key} small variant="ghost" onClick={() => gerarPagamentos(e)}>{e.label}</Btn>)}
                  </div>
                )}
              </div>
              {local.pagamentos && local.pagamentos.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {local.pagamentos.map((p, i) => (
                    <div key={i} style={{
                      padding: "7px 10px",
                      background: p.pago ? "rgba(73,107,60,0.12)" : T.paper2, borderRadius: 4,
                      border: `1px solid ${T.line}`, fontSize: 13,
                      display: "flex", flexDirection: "column", gap: 6,
                    }}>
                      <div style={{
                        display: "grid", gridTemplateColumns: "auto minmax(0,1.4fr) minmax(0,0.8fr) minmax(0,0.9fr) auto",
                        gap: 8, alignItems: "center",
                      }}>
                        <input type="checkbox" checked={!!p.pago} onChange={() => togglePagamento(i)} title="Pago" />
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
                        <div style={{ fontSize: 11, opacity: 0.6, fontFamily: "'JetBrains Mono', monospace" }}>
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
          )}

          <CutDivider label="Emails de cotação e orçamento" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            {emails.filter((e) => e.obraId === obra.id).sort((a, b) => (b.data || "").localeCompare(a.data || "")).map((e) => (
              <EmailItem key={e.id} email={e} obras={[]} onUpdate={onUpdateEmail} mostrarObra={false} />
            ))}
            {emails.filter((e) => e.obraId === obra.id).length === 0 && (
              <div style={{ fontSize: 12, opacity: 0.55 }}>
                Sem emails ligados. Liga-os a partir da aba Emails.
              </div>
            )}
          </div>

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
                padding: "8px 10px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 4,
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
              <div style={{ display: "flex", gap: 16, marginTop: 8, padding: "10px 12px", background: T.paper3, borderRadius: 4, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", opacity: 0.6, fontWeight: 600 }}>Total pedido nesta obra</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 15, color: T.walnutDark }}>{fmtEUR(totalCotacoes)}</div>
                </div>
                {cotacoesPorFornecedor.map(([nome, total]) => (
                  <div key={nome}>
                    <div style={{ fontSize: 10.5, textTransform: "uppercase", opacity: 0.6, fontWeight: 600 }}>{nome}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 15 }}>{fmtEUR(total)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <CutDivider label="Anexos (faturas, PDFs, Excel, fotos…)" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(local.anexos || []).length === 0 && (
              <div style={{ fontSize: 12, opacity: 0.55 }}>Sem ficheiros anexados a esta obra.</div>
            )}
            {(local.anexos || []).map((a) => (
              <div key={a.id} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 4, fontSize: 13,
              }}>
                {iconeAnexo(a)}
                <a href="#" onClick={(e) => { e.preventDefault(); abrirAnexo(a); }} style={{ flex: 1, color: T.ink, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.nome}
                </a>
                <span style={{ fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>{formatBytes(a.tamanho)}</span>
                <span style={{ fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>{fmtDate(a.dataUpload)}</span>
                <button onClick={() => removeAnexo(a)} style={{ background: "none", border: "none", cursor: "pointer", color: T.rust }}><Trash2 size={13} /></button>
              </div>
            ))}
            <div>
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,image/*" style={{ display: "none" }} onChange={handleFileUpload} />
              <Btn small variant="ghost" icon={Upload} disabled={uploading} onClick={() => fileInputRef.current && fileInputRef.current.click()}>
                {uploading ? "A enviar…" : "Anexar ficheiro"}
              </Btn>
              {uploadErro && <div style={{ fontSize: 11.5, color: T.rust, marginTop: 6 }}>{uploadErro}</div>}
            </div>
          </div>

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
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, opacity: 0.6, marginRight: 6 }}>{fmtDate(h.data)}</span>
                {h.texto}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...inputStyle, flex: 1 }} placeholder="Registar novo contacto / atualização…" value={novaNota} onChange={(e) => setNovaNota(e.target.value)}
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(36,31,26,0.55)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.paper, borderRadius: 8, width: "100%", maxWidth: 480, border: `1px solid ${T.line}`, padding: 24 }}>
        <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 18, marginBottom: 16, color: T.ink }}>Novo pedido / orçamento</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Nº de orçamento (sugerido)">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, background: editRef ? "#fff" : "#f3ede3" }}
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
      <div style={{ background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 6, padding: "16px 20px", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={porEstado} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.line} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "Inter" }} interval={0} angle={-20} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11, fontFamily: "Inter" }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontFamily: "Inter", fontSize: 12, borderRadius: 4, border: `1px solid ${T.line}` }} />
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
            {seguimentos.slice(0, 12).map(({ obra: o, dias }) => (
              <div key={o.id} onClick={() => onOpen(o.id)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", flexWrap: "wrap",
                background: "rgba(200,138,26,0.08)", border: `1px solid ${T.amber}`, borderRadius: 4, cursor: "pointer", fontSize: 13,
              }}>
                <Clock size={15} color={T.amber} />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, opacity: 0.75, minWidth: 64 }}>{dias} dias úteis</span>
                <span style={{ fontWeight: 600 }}>{o.projeto}</span>
                <span style={{ opacity: 0.6 }}>— {o.cliente}</span>
                <Tag color={stageOf(o.estado).color}>{stageOf(o.estado).label}</Tag>
                {o.estado === "orcamentar" && <span style={{ fontSize: 12, opacity: 0.7 }}>orçamento por fazer</span>}
                {o.estado !== "orcamentar" && followupsFeitos(o) >= 1 && <span style={{ fontSize: 12, opacity: 0.7 }}>1.º follow-up feito, falta o email de arquivo</span>}
                <span style={{ marginLeft: "auto" }} onClick={(e) => e.stopPropagation()}>
                  {o.estado === "orcamentar"
                    ? (onAddHistorico && <Btn small variant="ghost" icon={Clock} onClick={() => onAddHistorico(o.id, "Seguimento: lembrete adiado (orçamento ainda em preparação).")}>Adiar</Btn>)
                    : followupsFeitos(o) >= 1
                      ? (onChangeEstado && <Btn small icon={Check} onClick={() => onChangeEstado(o.id, "sem_resposta")}>Enviei email de arquivo</Btn>)
                      : (onAddHistorico && <Btn small icon={Check} onClick={() => onAddHistorico(o.id, "Seguimento: cliente contactado.")}>Já contactei (1.º follow-up)</Btn>)}
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
              background: late ? "rgba(156,59,36,0.1)" : T.paper2, border: `1px solid ${late ? T.rust : T.line}`,
              borderRadius: 4, cursor: "pointer", fontSize: 13,
            }}>
              {late ? <AlertTriangle size={15} color={T.rust} /> : <Clock size={15} color={T.walnut} />}
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, opacity: 0.7, minWidth: 78 }}>{fmtDate(o.proximaAcaoData)}</span>
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
                background: "rgba(156,59,36,0.08)", border: `1px solid ${T.rust}`, borderRadius: 4, cursor: "pointer", fontSize: 13,
              }}>
                <AlertTriangle size={15} color={T.rust} />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, opacity: 0.7, minWidth: 78 }}>{fmtDate(a.dataReportada)}</span>
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
function Pipeline({ obras, onOpen, onChangeEstado }) {
  const [draggingId, setDraggingId] = useState(null);
  const [overStage, setOverStage] = useState(null);

  const handleDrop = (e, stageKey) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || draggingId;
    if (id) onChangeEstado(id, stageKey);
    setDraggingId(null);
    setOverStage(null);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, minmax(0, 1fr))`, gap: 6, paddingBottom: 14 }}>
      {STAGES.map((stage) => {
        const items = obras.filter((o) => o.estado === stage.key);
        const isOver = overStage === stage.key;
        return (
          <div key={stage.key} style={{ minWidth: 0 }}>
            <div style={{
              display: "flex", flexDirection: "column", gap: 2,
              padding: "7px 8px", background: stage.color, borderRadius: "5px 5px 0 0",
            }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.2, lineHeight: 1.25, wordBreak: "break-word" }}>{stage.label}</span>
              <span style={{ color: "rgba(255,255,255,0.85)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{items.length}</span>
            </div>
            <div
              onDragOver={(e) => { e.preventDefault(); if (overStage !== stage.key) setOverStage(stage.key); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setOverStage(null); }}
              onDrop={(e) => handleDrop(e, stage.key)}
              style={{
                background: isOver ? "rgba(94,58,34,0.10)" : T.paper2,
                border: `1px solid ${isOver ? T.walnut : T.line}`,
                borderTop: "none", borderRadius: "0 0 5px 5px", padding: 6, minHeight: 240,
                display: "flex", flexDirection: "column", gap: 6,
                transition: "background .12s, border-color .12s",
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
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.id); e.dataTransfer.effectAllowed = "move"; setDraggingId(o.id); }}
                    onDragEnd={() => { setDraggingId(null); setOverStage(null); }}
                    onClick={() => onOpen(o.id)}
                    style={{
                      background: "#fff", border: `1px solid ${T.line}`, borderRadius: 5, padding: "8px 9px",
                      cursor: "grab", position: "relative", minWidth: 0,
                      opacity: isDragging ? 0.35 : 1,
                      transform: isDragging ? "scale(0.97)" : "scale(1)",
                      boxShadow: isDragging ? "none" : "0 1px 2px rgba(0,0,0,0.04)",
                      transition: "opacity .12s, transform .12s, box-shadow .12s",
                    }}
                  >
                    <div style={{ position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: "50%", background: T.paper2, border: `1px solid ${T.line}` }} />
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, opacity: 0.55 }}>{o.ref || "s/ ref"}</div>
                    <div style={{ fontWeight: 700, fontSize: 12.5, color: T.ink, marginTop: 2, wordBreak: "break-word" }}>{o.projeto}</div>
                    <div style={{ fontSize: 11.5, opacity: 0.65, marginTop: 1, wordBreak: "break-word" }}>{o.cliente}</div>
                    {o.donoObra && o.donoObra !== o.cliente && (
                      <div style={{ fontSize: 10.5, opacity: 0.55, marginTop: 1, fontStyle: "italic", wordBreak: "break-word" }}>Dono: {o.donoObra}</div>
                    )}
                    {valorTotalObra(o) !== null && (
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, fontWeight: 600, marginTop: 6, color: T.walnutDark }}>
                        {fmtEUR(valorTotalObra(o))}
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 6 }}>
                      <span style={{ fontSize: 11, opacity: 0.55 }}>{fmtDate(o.dataEntrada)}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {(o.anexos || []).length > 0 && (
                          <span title="Anexos" style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, color: T.walnut }}>
                            <Paperclip size={12} /> {o.anexos.length}
                          </span>
                        )}
                        {cotacoesPendentes > 0 && (
                          <span title="Cotações por receber" style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, color: T.navy }}>
                            <FileText size={12} /> {cotacoesPendentes}
                          </span>
                        )}
                        {assistenciasAbertas > 0 && (
                          <span title="Assistências em aberto" style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, color: T.rust }}>
                            <AlertTriangle size={12} /> {assistenciasAbertas}
                          </span>
                        )}
                        {late && <AlertTriangle size={13} color={T.rust} />}
                      </div>
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && (
                <div style={{ fontSize: 12, opacity: 0.4, textAlign: "center", padding: "20px 0", border: `1px dashed ${T.line}`, borderRadius: 4 }}>
                  Larga aqui
                </div>
              )}
            </div>
          </div>
        );
      })}
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

      <div style={{ overflowX: "auto", border: `1px solid ${T.line}`, borderRadius: 6 }}>
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
                  cursor: "pointer", background: i % 2 ? "#fff" : T.paper,
                  borderTop: `1px solid ${T.line}`,
                }}>
                  <td style={{ padding: "9px 12px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, whiteSpace: "nowrap" }}>{o.ref || "—"}</td>
                  <td style={{ padding: "9px 12px" }}>{o.cliente}</td>
                  <td style={{ padding: "9px 12px", fontWeight: 600 }}>{o.projeto}</td>
                  <td style={{ padding: "9px 12px" }}><Tag color={stageOf(o.estado).color}>{stageOf(o.estado).label}</Tag></td>
                  <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>{fmtDate(o.dataEntrada)}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>{fmtEUR(valorTotalObra(o))}</td>
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
      obras.forEach((o) => (o.pagamentos || []).forEach((p) => {
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
    return obras
      .filter((o) => valorTotalObra(o) !== null)
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
                background: `${cor}18`, border: `1px solid ${cor}`, borderRadius: 4, fontSize: 13, color: T.ink,
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
      <div style={{ background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 6, padding: "16px 20px", height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dadosMensais} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.line} vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fontFamily: "Inter" }} />
            <YAxis tick={{ fontSize: 11, fontFamily: "Inter" }} />
            <Tooltip formatter={(v) => fmtEUR(v)} contentStyle={{ fontFamily: "Inter", fontSize: 12, borderRadius: 4, border: `1px solid ${T.line}` }} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Inter" }} />
            <Bar dataKey="receita" name="Receita adjudicada" fill={T.green} radius={[3, 3, 0, 0]} />
            <Bar dataKey="despesa" name="Despesas" fill={T.rust} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <CutDivider label="Previsão de Tesouraria — próximos 6 meses" />
      <div style={{ background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 6, padding: "16px 20px", height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={previsaoTesouraria} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.line} vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fontFamily: "Inter" }} />
            <YAxis tick={{ fontSize: 11, fontFamily: "Inter" }} />
            <Tooltip formatter={(v) => fmtEUR(v)} contentStyle={{ fontFamily: "Inter", fontSize: 12, borderRadius: 4, border: `1px solid ${T.line}` }} />
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
              <div style={{ flex: 1, background: T.paper3, borderRadius: 3, height: 16, position: "relative", overflow: "hidden" }}>
                <div style={{ width: `${Math.min(c.pct, 100)}%`, height: "100%", background: c.pct >= 40 ? T.rust : T.walnut, borderRadius: 3 }} />
              </div>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, minWidth: 44, textAlign: "right" }}>{c.pct.toFixed(0)}%</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", opacity: 0.6, minWidth: 90, textAlign: "right" }}>{fmtEUR(c.valor)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, opacity: 0.55 }}>Sem receita adjudicada em {periodoLabel} para calcular concentração.</div>
      )}

      <CutDivider label={`Despesas por categoria — ${periodoLabel}`} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)", gap: 16, alignItems: "center" }}>
        <div style={{ background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 6, padding: "12px", height: 240 }}>
          {despesasPorCategoria.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={despesasPorCategoria} dataKey="valor" nameKey="categoria" cx="50%" cy="50%" outerRadius={85} label={(e) => `${e.categoria}`}>
                  {despesasPorCategoria.map((entry, i) => <Cell key={entry.categoria} fill={CATEGORIA_CORES[i % CATEGORIA_CORES.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtEUR(v)} contentStyle={{ fontFamily: "Inter", fontSize: 12, borderRadius: 4, border: `1px solid ${T.line}` }} />
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
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: T.walnutDark }}>{fmtEUR(c.valor)}</span>
              <span style={{ fontSize: 11, opacity: 0.5, minWidth: 40, textAlign: "right" }}>
                {totais.custosTotaisAno > 0 ? `${((c.valor / totais.custosTotaisAno) * 100).toFixed(0)}%` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      <CutDivider label="Lucro por obra" />
      <div style={{ overflowX: "auto", border: `1px solid ${T.line}`, borderRadius: 6 }}>
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
              <tr key={o.id} style={{ background: i % 2 ? "#fff" : T.paper, borderTop: `1px solid ${T.line}` }}>
                <td style={{ padding: "8px 12px", fontWeight: 600 }}>{o.projeto}</td>
                <td style={{ padding: "8px 12px" }}>{o.cliente}</td>
                <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>{fmtEUR(o.valor)}</td>
                <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>{fmtEUR(o.custos)}</td>
                <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, whiteSpace: "nowrap", color: o.margem >= 0 ? T.green : T.rust }}>{fmtEUR(o.margem)}</td>
                <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", color: o.margem >= 0 ? T.green : T.rust }}>{o.margemPct.toFixed(1)}%</td>
              </tr>
            ))}
            {lucroPorObra.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", opacity: 0.5 }}>Sem obras com valor adjudicado ainda.</td></tr>
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
            padding: "7px 10px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 4, fontSize: 13,
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
            padding: "7px 10px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 4, fontSize: 13,
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
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 4, fontSize: 13 }}>
            <Clock size={14} color={T.amber} />
            <span style={{ fontWeight: 600 }}>{p.projeto}</span>
            <span style={{ opacity: 0.6 }}>— {p.cliente}</span>
            {p.data && <span style={{ fontSize: 11.5, opacity: 0.6 }}>{fmtDate(p.data)}</span>}
            <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace" }}>{p.label}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: T.walnutDark }}>{fmtEUR(p.valor)}</span>
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
   MODAL — FICHA DE CLIENTE
   ============================================================ */
function ClienteModal({ cliente, onClose, onAdd, onUpdate, onDelete, obras, onOpenObra }) {
  const [id, setId] = useState(cliente.id || null);
  const [local, setLocal] = useState(cliente);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Se esta ficha ainda não existe na base de dados (cliente derivado só
  // das obras, sem registo próprio), cria-a já ao abrir o modal — assim
  // não há hipótese de duas edições seguidas (antes do primeiro "onAdd"
  // terminar) criarem cada uma o seu próprio cliente duplicado.
  useEffect(() => {
    if (!id && cliente.nome) {
      const novoId = onAdd({ nome: cliente.nome });
      setId(novoId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch) => setLocal((l) => ({ ...l, ...patch }));
  const commit = (patch) => {
    set(patch);
    if (id) {
      onUpdate(id, patch);
    } else {
      // Salvaguarda: só devia acontecer numa fração de segundo antes do
      // useEffect acima terminar.
      const novoId = onAdd({ nome: local.nome, ...patch });
      setId(novoId);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(36,31,26,0.55)", zIndex: 100,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 16px", overflowY: "auto",
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: T.paper, borderRadius: 8, width: "100%", maxWidth: 520,
        border: `1px solid ${T.line}`, boxShadow: "0 20px 50px rgba(0,0,0,0.3)", overflowX: "hidden",
      }}>
        <div style={{ padding: "18px 24px", borderBottom: `2px dashed ${T.line}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ fontFamily: "'Roboto Slab', serif", fontSize: 20, fontWeight: 700, color: T.ink }}>{local.nome || "Novo cliente"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.ink, opacity: 0.6 }}><X size={20} /></button>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Nome">
            <input style={inputStyle} value={local.nome} onChange={(e) => set({ nome: e.target.value })} onBlur={() => commit({ nome: local.nome })} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Email">
              <input type="email" style={inputStyle} value={local.email || ""} onChange={(e) => set({ email: e.target.value })} onBlur={() => commit({ email: local.email })} />
            </Field>
            <Field label="Telefone">
              <input style={inputStyle} value={local.telefone || ""} onChange={(e) => set({ telefone: e.target.value })} onBlur={() => commit({ telefone: local.telefone })} />
            </Field>
            <Field label="NIF">
              <input style={inputStyle} value={local.nif || ""} onChange={(e) => set({ nif: e.target.value })} onBlur={() => commit({ nif: local.nif })} />
            </Field>
            <Field label="Morada">
              <input style={inputStyle} value={local.morada || ""} onChange={(e) => set({ morada: e.target.value })} onBlur={() => commit({ morada: local.morada })} />
            </Field>
          </div>
          <Field label="Notas">
            <textarea style={textareaStyle} rows={2} value={local.notas || ""} onChange={(e) => set({ notas: e.target.value })} onBlur={() => commit({ notas: local.notas })} />
          </Field>
          <div style={{ fontSize: 11.5, opacity: 0.55 }}>
            Email, telefone, NIF e morada também se atualizam sozinhos quando os preenches na ficha de uma obra deste cliente.
          </div>

          <CutDivider label={`Obras (${(obras || []).length})`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
            {(obras || []).length === 0 && <div style={{ fontSize: 12, opacity: 0.55 }}>Ainda sem obras registadas para este cliente.</div>}
            {(obras || []).map((o) => {
              const stage = stageOf(o.estado);
              return (
                <div
                  key={o.id}
                  onClick={() => { onOpenObra(o.id); onClose(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                    background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 4,
                    cursor: "pointer", fontSize: 13,
                  }}
                  title="Abrir ficha da obra"
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: T.navy, textDecoration: "underline", textDecorationStyle: "dotted", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {o.projeto}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6, fontFamily: "'JetBrains Mono', monospace" }}>{o.ref || "s/ ref"} · {fmtDate(o.dataEntrada)}</div>
                  </div>
                  {valorTotalObra(o) !== null && (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: T.walnutDark, whiteSpace: "nowrap" }}>
                      {fmtEUR(valorTotalObra(o))}
                    </span>
                  )}
                  <Tag color={stage.color}>{stage.label}</Tag>
                  <ChevronRight size={14} style={{ opacity: 0.4, flexShrink: 0 }} />
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
            {id && (confirmDelete ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.rust }}>Eliminar esta ficha?</span>
                <Btn small variant="danger" onClick={() => { onDelete(id); onClose(); }}>Sim, eliminar</Btn>
                <Btn small variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Btn>
              </div>
            ) : (
              <Btn small variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>Eliminar</Btn>
            ))}
            {!id && <span />}
            <Btn onClick={onClose}>Fechar</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   CLIENTES — fichas reais (nome, NIF, morada, contacto), cruzadas
   com estatísticas calculadas a partir das obras
   ============================================================ */
function Clientes({ obras, clientes, onAddCliente, onUpdateCliente, onDeleteCliente, onOpenObra }) {
  const [q, setQ] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);

  const lista = useMemo(() => {
    const map = {};
    obras.forEach((o) => {
      const nome = (o.cliente || "—").trim();
      const chave = normalizaNome(nome);
      if (!map[chave]) map[chave] = { chave, nome, total: 0, ganhas: 0, rejeitadas: 0, emCurso: 0, valorAdjudicado: 0, ultimo: null };
      const e = map[chave];
      e.total += 1;
      if (WON_KEYS.includes(o.estado)) { e.ganhas += 1; e.valorAdjudicado += valorTotalObra(o) || 0; }
      if (REJECTED_KEYS.includes(o.estado)) e.rejeitadas += 1;
      if (ACTIVE_KEYS.includes(o.estado)) e.emCurso += 1;
      if (!e.ultimo || (o.dataEntrada || "") > e.ultimo) e.ultimo = o.dataEntrada;
    });
    // Junta as fichas de cliente que ainda não têm nenhuma obra associada
    clientes.forEach((c) => {
      const chave = normalizaNome(c.nome);
      if (!map[chave]) map[chave] = { chave, nome: c.nome, total: 0, ganhas: 0, rejeitadas: 0, emCurso: 0, valorAdjudicado: 0, ultimo: null };
    });
    return Object.values(map).map((e) => {
      const ficha = clientes.find((c) => normalizaNome(c.nome) === e.chave);
      return { ...e, nome: ficha?.nome || e.nome, ficha };
    })
      .filter((c) => !q || c.nome.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.total - a.total);
  }, [obras, clientes, q]);

  const selected = lista.find((c) => c.chave === selectedKey);
  const obrasDoCliente = useMemo(
    () => (selected ? obras.filter((o) => normalizaNome(o.cliente) === selected.chave)
      .sort((a, b) => (b.dataEntrada || "").localeCompare(a.dataEntrada || "")) : []),
    [obras, selected]
  );

  const criarNovo = () => {
    const id = onAddCliente({ nome: "Novo cliente" });
    setSelectedKey(normalizaNome("Novo cliente"));
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px" }}>
          <Search size={14} style={{ position: "absolute", left: 9, top: 9, opacity: 0.5 }} />
          <input style={{ ...inputStyle, width: "100%", paddingLeft: 28 }} placeholder="Pesquisar cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Btn small icon={Plus} onClick={criarNovo}>Novo cliente</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {lista.map((c) => (
          <div key={c.chave} onClick={() => setSelectedKey(c.chave)} style={{
            background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 6, padding: "14px 16px", cursor: "pointer",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Building2 size={15} color={T.walnut} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>{c.nome}</span>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
              <span>{c.total} pedido(s)</span>
              <span style={{ color: T.green }}>{c.ganhas} ganho(s)</span>
              <span style={{ color: T.rust }}>{c.rejeitadas} rejeitado(s)</span>
            </div>
            {c.valorAdjudicado > 0 && (
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: T.walnutDark }}>{fmtEUR(c.valorAdjudicado)}</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11.5, opacity: 0.7, marginTop: 6 }}>
              {c.ficha?.telefone && <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Phone size={11} /> {c.ficha.telefone}</div>}
              {c.ficha?.email && <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Mail size={11} /> {c.ficha.email}</div>}
              {c.ficha?.nif && <div>NIF: {c.ficha.nif}</div>}
              {!c.ficha && <div style={{ fontStyle: "italic", opacity: 0.6 }}>Sem ficha — clica para preencher</div>}
            </div>
            <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>Último contacto: {fmtDate(c.ultimo)}</div>
          </div>
        ))}
      </div>
      {lista.length === 0 && <div style={{ opacity: 0.5, fontSize: 13 }}>Sem resultados.</div>}

      {selected && (
        <ClienteModal
          key={selectedKey}
          cliente={selected.ficha || { nome: selected.nome }}
          obras={obrasDoCliente}
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
   MODAL — FICHA DE FORNECEDOR
   ============================================================ */
function FornecedorModal({ fornecedor, onClose, onUpdate, onDelete, despesas }) {
  const [local, setLocal] = useState(fornecedor);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [categoriasTexto, setCategoriasTexto] = useState((fornecedor.categorias || []).join(", "));

  useEffect(() => { setLocal(fornecedor); setCategoriasTexto((fornecedor.categorias || []).join(", ")); }, [fornecedor]);

  const set = (patch) => setLocal((l) => ({ ...l, ...patch }));
  const commit = (patch) => { set(patch); onUpdate(fornecedor.id, patch); };

  const commitCategorias = () => {
    const categorias = categoriasTexto.split(",").map((c) => c.trim()).filter(Boolean);
    commit({ categorias });
  };

  const ultimasCompras = useMemo(() => {
    const chave = normalizaNome(fornecedor.nome);
    return (despesas || [])
      .filter((d) => normalizaNome(d.fornecedor) === chave)
      .sort((a, b) => (b.data || "").localeCompare(a.data || ""))
      .slice(0, 10);
  }, [despesas, fornecedor.nome]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(36,31,26,0.55)", zIndex: 100,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 16px", overflowY: "auto",
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: T.paper, borderRadius: 8, width: "100%", maxWidth: 560,
        border: `1px solid ${T.line}`, boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
      }}>
        <div style={{ padding: "18px 24px", borderBottom: `2px dashed ${T.line}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ fontFamily: "'Roboto Slab', serif", fontSize: 20, fontWeight: 700, color: T.ink }}>
            {local.nome || "Novo fornecedor"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.ink, opacity: 0.6 }}><X size={20} /></button>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Nome do fornecedor">
            <input style={inputStyle} value={local.nome} onChange={(e) => set({ nome: e.target.value })} onBlur={() => commit({ nome: local.nome })} />
          </Field>
          <Field label="O que fornece (categorias, separadas por vírgula)">
            <input style={inputStyle} placeholder="ex: Madeiras, Ferragens, Vidros…" value={categoriasTexto} onChange={(e) => setCategoriasTexto(e.target.value)} onBlur={commitCategorias} />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Pessoa de contacto">
              <input style={inputStyle} value={local.pessoaContacto || ""} onChange={(e) => set({ pessoaContacto: e.target.value })} onBlur={() => commit({ pessoaContacto: local.pessoaContacto })} />
            </Field>
            <Field label="Telefone">
              <input style={inputStyle} value={local.telefone || ""} onChange={(e) => set({ telefone: e.target.value })} onBlur={() => commit({ telefone: local.telefone })} />
            </Field>
            <Field label="Email">
              <input type="email" style={inputStyle} value={local.email || ""} onChange={(e) => set({ email: e.target.value })} onBlur={() => commit({ email: local.email })} />
            </Field>
            <Field label="Site / link">
              <input style={inputStyle} placeholder="https://…" value={local.site || ""} onChange={(e) => set({ site: e.target.value })} onBlur={() => commit({ site: local.site })} />
            </Field>
          </div>

          <Field label="Notas (descontos, condições, morada…)">
            <textarea style={textareaStyle} rows={2} value={local.notas || ""} onChange={(e) => set({ notas: e.target.value })} onBlur={() => commit({ notas: local.notas })} />
          </Field>

          <CutDivider label="Últimas compras" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ultimasCompras.length === 0 && (
              <div style={{ fontSize: 12, opacity: 0.55 }}>Ainda sem compras registadas a este fornecedor (aparecem aqui sozinhas assim que lançares um custo ou fatura com este nome).</div>
            )}
            {ultimasCompras.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 4, fontSize: 13 }}>
                <span style={{ fontSize: 11, opacity: 0.55, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>{fmtDate(c.data)}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.descricao}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: T.walnutDark, whiteSpace: "nowrap" }}>{fmtEUR(c.valor)}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
            {confirmDelete ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.rust }}>Eliminar este fornecedor?</span>
                <Btn small variant="danger" onClick={() => { onDelete(fornecedor.id); onClose(); }}>Sim, eliminar</Btn>
                <Btn small variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Btn>
              </div>
            ) : (
              <Btn small variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>Eliminar</Btn>
            )}
            <Btn onClick={onClose}>Fechar</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   FORNECEDORES — diretório de contactos (não lista de preços)
   ============================================================ */
function Fornecedores({ fornecedores, onAdd, onUpdate, onDelete, despesas }) {
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const comprasPorFornecedor = useMemo(() => {
    const map = {};
    (despesas || []).filter((d) => d.fornecedor).forEach((d) => {
      const chave = normalizaNome(d.fornecedor);
      (map[chave] = map[chave] || []).push(d);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => (b.data || "").localeCompare(a.data || "")));
    return map;
  }, [despesas]);

  const filtrados = useMemo(() => {
    if (!q) return fornecedores;
    const term = q.toLowerCase();
    return fornecedores.filter((f) =>
      `${f.nome} ${(f.categorias || []).join(" ")} ${f.pessoaContacto || ""}`.toLowerCase().includes(term)
    );
  }, [fornecedores, q]);

  const selected = fornecedores.find((f) => f.id === selectedId);

  const criarNovo = () => {
    const id = onAdd({ nome: "Novo fornecedor" });
    setSelectedId(id);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px" }}>
          <Search size={14} style={{ position: "absolute", left: 9, top: 9, opacity: 0.5 }} />
          <input style={{ ...inputStyle, width: "100%", paddingLeft: 28 }} placeholder="Pesquisar fornecedor, categoria ou contacto…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Btn small icon={Plus} onClick={criarNovo}>Novo fornecedor</Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {filtrados.map((f) => {
          const compras = comprasPorFornecedor[normalizaNome(f.nome)] || [];
          const expanded = expandedId === f.id;
          return (
            <div key={f.id} style={{ background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 6, padding: "14px 16px" }}>
              <div onClick={() => setSelectedId(f.id)} style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Building2 size={15} color={T.walnut} />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{f.nome || "(sem nome)"}</span>
                </div>
                {(f.categorias || []).length > 0 && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                    {f.categorias.map((c) => <Tag key={c} color={T.navy}>{c}</Tag>)}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12.5, opacity: 0.85 }}>
                  {f.pessoaContacto && <div>{f.pessoaContacto}</div>}
                  {f.telefone && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Phone size={12} /> {f.telefone}</div>}
                  {f.email && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Mail size={12} /> {f.email}</div>}
                  {f.site && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Globe size={12} /> {f.site.replace(/^https?:\/\//, "")}</div>}
                  {!f.pessoaContacto && !f.telefone && !f.email && !f.site && (
                    <div style={{ opacity: 0.5, fontStyle: "italic" }}>Sem contacto registado — clica para preencher</div>
                  )}
                </div>
                {f.notas && <div style={{ fontSize: 11.5, opacity: 0.55, marginTop: 6 }}>{f.notas}</div>}
              </div>
              {compras.length > 0 && (
                <div style={{ marginTop: 10, borderTop: `1px dashed ${T.line}`, paddingTop: 8 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpandedId(expanded ? null : f.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: T.walnutDark, fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, padding: 0 }}
                  >
                    {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {expanded ? "Ocultar" : "Ver"} últimas compras ({compras.length})
                  </button>
                  {expanded && (
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                      {compras.slice(0, 5).map((c) => (
                        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                          <span style={{ opacity: 0.55, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>{fmtDate(c.data)}</span>
                          <span style={{ opacity: 0.75, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.descricao}</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: T.walnutDark, whiteSpace: "nowrap" }}>{fmtEUR(c.valor)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {filtrados.length === 0 && <div style={{ opacity: 0.5, fontSize: 13 }}>Sem resultados.</div>}

      {selected && <FornecedorModal key={selected.id} fornecedor={selected} onClose={() => setSelectedId(null)} onUpdate={onUpdate} onDelete={onDelete} despesas={despesas} />}
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(36,31,26,0.55)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.paper, borderRadius: 8, width: "100%", maxWidth: 480, border: `1px solid ${T.line}`, padding: 24, overflowX: "hidden" }}>
        <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 18, marginBottom: 16, color: T.ink }}>{editando ? "Editar fatura" : "Nova fatura"}</div>
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
            <div style={{ fontSize: 11.5, opacity: 0.65, alignSelf: "end", paddingBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>
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

      <div style={{ border: `1px solid ${T.line}`, borderRadius: 6, overflow: "hidden", background: T.paper2 }}>
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
            <div key={l.obra.id} style={{ display: "flex", borderTop: `1px solid ${T.line}`, background: i % 2 ? "#fff" : T.paper }}>
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
                  acc.lines.push(<div key={m.key} style={{ position: "absolute", left: `${prevLeft + m.widthPct}%`, top: 0, bottom: 0, borderLeft: `1px dashed ${T.line}` }} />);
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
                    background: l.obra.estado === "producao" ? T.walnut : `${T.green}99`,
                    border: l.obra.estado === "producao" ? "none" : `1px dashed ${T.green}`,
                    borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center",
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
                background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 4, cursor: "pointer", fontSize: 13,
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
        <div style={{ display: "inline-flex", border: `1px solid ${T.line}`, borderRadius: 6, overflow: "hidden" }}>
          {[["com", "Com IVA"], ["sem", "Sem IVA"]].map(([k, l]) => (
            <button key={k} onClick={() => setModoIva(k)} style={{
              padding: "7px 16px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "Inter",
              background: modoIva === k ? T.walnut : T.paper2, color: modoIva === k ? "#fff" : T.ink,
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
      <div style={{ background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 6, padding: "16px 20px", height: 220, marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={comparacao} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.line} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fontFamily: "Inter" }} tickFormatter={(v) => fmtEUR(v)} />
            <YAxis type="category" dataKey="nome" tick={{ fontSize: 12, fontFamily: "Inter", fontWeight: 600 }} width={100} />
            <Tooltip formatter={(v) => fmtEUR(v)} contentStyle={{ fontFamily: "Inter", fontSize: 12, borderRadius: 4, border: `1px solid ${T.line}` }} />
            <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
              {comparacao.map((c) => <Cell key={c.nome} fill={c.cor} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {kpis.nAtrasadas > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", marginBottom: 16,
          background: `${T.rust}18`, border: `1px solid ${T.rust}`, borderRadius: 4, fontSize: 13,
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

      <div style={{ overflowX: "auto", border: `1px solid ${T.line}`, borderRadius: 6, marginBottom: 24 }}>
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
                <tr key={o.obraId} style={{ background: o.atrasado ? "rgba(156,59,36,0.08)" : (i % 2 ? "#fff" : T.paper), borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "8px 12px" }}>
                    <button onClick={() => onOpenObra(o.obraId)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: T.navy, textDecoration: "underline", textDecorationStyle: "dotted", fontSize: 13 }}>
                      {o.projeto}
                    </button>
                  </td>
                  <td style={{ padding: "8px 12px" }}>{o.cliente}</td>
                  <td style={{ padding: "8px 12px", fontSize: 12, whiteSpace: "nowrap", opacity: 0.75 }}>{o.iva.label}</td>
                  <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtEUR(o.valorTotal)}</td>
                  <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", opacity: o.faturado > 0 ? 1 : 0.3 }}>
                    {o.faturado > 0 ? fmtEUR(o.faturado) : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", opacity: o.recebido > 0 ? 1 : 0.3 }}>
                    {o.recebido > 0 ? fmtEUR(o.recebido) : "—"}
                  </td>
                  <td style={{
                    padding: "8px 12px", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap",
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
            <div style={{ flex: 1, background: T.paper3, borderRadius: 3, height: 14, position: "relative", overflow: "hidden" }}>
              <div style={{ width: `${kpis.totalRecebido > 0 ? (m.valor / kpis.totalRecebido) * 100 : 0}%`, height: "100%", background: METODO_CORES[i % METODO_CORES.length], borderRadius: 3 }} />
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, minWidth: 90, textAlign: "right" }}>{fmtEUR(m.valor)}</span>
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

      <div style={{ overflowX: "auto", border: `1px solid ${T.line}`, borderRadius: 6, marginBottom: 24 }}>
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
                <tr key={f.id} style={{ background: i % 2 ? "#fff" : T.paper, borderTop: `1px solid ${T.line}` }}>
                  <td onClick={() => setEditandoId(f.id)} style={{ padding: "8px 12px", cursor: "pointer" }} title="Clica para editar">{f.fornecedor || "—"}</td>
                  <td onClick={() => setEditandoId(f.id)} style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, cursor: "pointer" }} title="Clica para editar">{f.numeroFatura || "—"}</td>
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
                  <td onClick={() => setEditandoId(f.id)} style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" }} title="Clica para editar">{fmtEUR(f.valor)}</td>
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
          <div key={f.fornecedor} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 4, fontSize: 13 }}>
            <span style={{ flex: 1, fontWeight: 600 }}>{f.fornecedor}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: T.walnutDark }}>{fmtEUR(f.valor)}</span>
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
          background: "#fff", border: `1px solid ${T.line}`, borderRadius: 4, boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
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
      background: emailNaoLido(email) ? "rgba(200,138,26,0.08)" : T.paper2,
      border: `1px solid ${emailNaoLido(email) ? T.amber : T.line}`, borderRadius: 6, fontSize: 13, minWidth: 0,
      opacity: email.resolvido ? 0.6 : 1,
    }}>
      <button onClick={() => { const abrir = !aberto; setAberto(abrir); if (abrir && !email.lido) onUpdate(email.id, { lido: true }); }} style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "none", border: "none",
        padding: "9px 12px", cursor: "pointer", color: T.ink, fontFamily: "Inter", minWidth: 0,
      }}>
        {aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: emailNaoLido(email) ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {emailNaoLido(email) && <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: T.amber, marginRight: 7 }} />}
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
            maxHeight: 280, overflowY: "auto", background: "#fff", border: `1px solid ${T.line}`, borderRadius: 4, padding: 10,
          }}>{email.texto || "(sem texto)"}</pre>
          {(email.anexos || []).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {email.anexos.map((a, i) => (
                <a key={i} href="#" onClick={(e) => { e.preventDefault(); abrirAnexo(a); }} style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "4px 8px", border: `1px solid ${T.line}`, borderRadius: 4,
                  color: T.navy, textDecoration: "none", fontSize: 12, background: "#fff",
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
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 8px", background: "#fff", border: `1px dashed ${T.walnut}`, borderRadius: 4 }}>
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

function EmailsTab({ emails, obras, onUpdate, onUpdateMany, onCriarObra }) {
  const [filtro, setFiltro] = useState("tratar"); // tratar | naolidos | resolvidos | ligados | ignorados | todos
  const [q, setQ] = useState("");
  const lista = useMemo(() => {
    return [...emails]
      .filter((e) => {
        if (filtro === "tratar") return emailPorTratar(e);
        if (filtro === "naolidos") return emailNaoLido(e);
        if (filtro === "resolvidos") return !!e.resolvido;
        if (filtro === "ligados") return e.estado === "ligado";
        if (filtro === "ignorados") return e.estado === "ignorado";
        return true;
      })
      .filter((e) => !q || `${e.assunto} ${e.de} ${e.deEmail} ${e.texto}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  }, [emails, filtro, q]);
  const [permAviso, setPermAviso] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const nNaoLidos = emails.filter(emailNaoLido).length;
  const nPorTratar = emails.filter(emailPorTratar).length;
  const idsNaoLidos = lista.filter(emailNaoLido).map((e) => e.id);
  return (
    <div>
      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 14 }}>
        Só entram aqui os emails de cotação e orçamento (recebidos e enviados). Abrir um email marca-o como lido; quando o pedido estiver tratado, marca-o como resolvido e ele sai da lista "Por tratar". Nada se liga sozinho: quando o assunto tem o número de uma obra, ou o email é o de um cliente, aparece uma sugestão que confirmas com um clique.
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 240px" }}>
          <Search size={14} style={{ position: "absolute", left: 9, top: 9, opacity: 0.5 }} />
          <input style={{ ...inputStyle, width: "100%", paddingLeft: 28 }} placeholder="Pesquisar assunto, remetente, texto…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select style={selectStyle} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="tratar">Por tratar ({nPorTratar})</option>
          <option value="naolidos">Não lidos ({nNaoLidos})</option>
          <option value="resolvidos">Resolvidos</option>
          <option value="ligados">Ligados a obras</option>
          <option value="ignorados">Ignorados</option>
          <option value="todos">Todos</option>
        </select>
        {permAviso === "default" && (
          <Btn small variant="ghost" onClick={() => Notification.requestPermission().then(setPermAviso)}>Ativar avisos de emails novos</Btn>
        )}
        {idsNaoLidos.length > 0 && onUpdateMany && (
          <Btn small variant="ghost" icon={Eye} onClick={() => onUpdateMany(idsNaoLidos, { lido: true })}>Marcar estes como lidos</Btn>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {lista.map((e) => <EmailItem key={e.id} email={e} obras={obras} onUpdate={onUpdate} onCriarObra={onCriarObra} />)}
        {lista.length === 0 && (
          <div style={{ padding: 28, textAlign: "center", opacity: 0.55, fontSize: 13 }}>
            {emails.length === 0 ? "Ainda não chegou nenhum email. A sincronização corre sozinha a cada 15 minutos." : "Nada neste filtro."}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   APP PRINCIPAL
   ============================================================ */
const TABS = [
  { key: "painel", label: "Painel", icon: LayoutGrid },
  { key: "pipeline", label: "Pipeline", icon: ArrowRight },
  { key: "obras", label: "Obras", icon: TableIcon },
  { key: "emails", label: "Emails", icon: Mail },
  { key: "producao", label: "Produção", icon: Calendar },
  { key: "financeiro", label: "Financeiro", icon: Wallet },
  { key: "receitas", label: "Receitas", icon: Banknote },
  { key: "faturas", label: "Faturas", icon: Receipt },
  { key: "clientes", label: "Clientes", icon: Users },
  { key: "fornecedores", label: "Fornecedores", icon: Package },
];

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
    <div style={{
      fontFamily: "'Inter', sans-serif", background: T.paper, minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <style>{FONT_IMPORT}</style>
      <style>{`* { box-sizing: border-box; } input { min-width: 0; }`}</style>
      <form onSubmit={entrar} style={{
        background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 8, padding: 32,
        width: "100%", maxWidth: 360, boxShadow: "0 20px 50px rgba(0,0,0,0.15)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: T.amber, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Wrench size={16} color="#fff" />
          </div>
          <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 18, color: T.ink }}>Carpinova CRM</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Email">
            <input type="email" required style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Field label="Palavra-passe">
            <input type="password" required style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} />
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
  const { emails, carregado: emailsCarregados, updateEmail, updateEmails } = useEmailsStore();
  const [emailParaObra, setEmailParaObra] = useState(null);
  const emailsNovos = emails.filter(emailNaoLido).length;
  useAvisoSeparador(emailsNovos);
  useAvisoEmailNovo(emails, emailsCarregados);
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
  const [clienteFiltroInicial, setClienteFiltroInicial] = useState(null);

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: T.paper, fontFamily: "Inter" }}>
        <style>{FONT_IMPORT}</style>
        A carregar dados da Carpinova…
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: T.paper, minHeight: "100vh", color: T.ink }}>
      <style>{FONT_IMPORT}</style>
      <style>{`
        * { box-sizing: border-box; }
        input, select, textarea { min-width: 0; }
        ::-webkit-scrollbar { height: 8px; width: 8px; }
        ::-webkit-scrollbar-thumb { background: ${T.line}; border-radius: 4px; }
        input:focus, select:focus, textarea:focus { border-color: ${T.walnut} !important; }
      `}</style>

      {/* Header */}
      <div style={{ background: T.walnutDark, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%", background: T.amber, display: "flex",
            alignItems: "center", justifyContent: "center", border: "2px solid #fff",
          }}>
            <Wrench size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 18, color: "#fff", lineHeight: 1 }}>Carpinova</div>
            <div style={{ fontSize: 11, color: T.paper3, letterSpacing: 0.5 }}>Controlo de Obras & Orçamentos</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: T.paper3, display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {saveState === "saving" && <><Save size={12} /> a guardar…</>}
            {saveState === "saved" && <><CheckCircle2 size={12} color="#8FBF7A" /> guardado</>}
            {saveState === "error" && <><AlertTriangle size={12} color="#E08B7A" /> erro ao guardar</>}
          </span>
          <button onClick={exportarBackup} title="Descarregar cópia de segurança de todos os dados" style={{
            display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px solid ${T.paper3}`,
            color: T.paper3, borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 11,
          }}>
            <Download size={12} /> Backup
          </button>
          {userEmail && (
            <span style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.8 }}>
              {userEmail}
              <button onClick={onSignOut} title="Sair" style={{ background: "none", border: "none", color: T.paper3, cursor: "pointer", textDecoration: "underline" }}>
                Sair
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, padding: "0 24px", background: T.paper2, borderBottom: `2px dashed ${T.line}`, overflowX: "auto" }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "12px 16px", background: "none", border: "none",
              borderBottom: active ? `3px solid ${T.walnut}` : "3px solid transparent",
              color: active ? T.walnutDark : T.ink, opacity: active ? 1 : 0.6,
              fontWeight: active ? 700 : 500, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
            }}>
              <Icon size={15} /> {t.label}
              {t.key === "painel" && nSeguimentos > 0 && (
                <span style={{ background: T.amber, color: "#fff", borderRadius: 10, fontSize: 10.5, fontWeight: 700, padding: "1px 6px" }}>{nSeguimentos}</span>
              )}
              {t.key === "emails" && emailsNovos > 0 && (
                <span style={{ background: T.rust, color: "#fff", borderRadius: 10, fontSize: 10.5, fontWeight: 700, padding: "1px 6px" }}>{emailsNovos}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ padding: "24px", maxWidth: tab === "pipeline" ? "none" : 1200, margin: "0 auto" }}>
        {tab === "painel" && <Painel obras={obras} onOpen={setSelectedId} emails={emails} onAddHistorico={addHistorico} onChangeEstado={changeEstado} />}
        {tab === "pipeline" && <Pipeline obras={obras} onOpen={setSelectedId} onChangeEstado={changeEstado} />}
        {tab === "obras" && <ObrasTab obras={obras} onOpen={setSelectedId} onNew={() => setNovaObraOpen(true)} />}
        {tab === "emails" && <EmailsTab emails={emails} obras={obras} onUpdate={updateEmail} onUpdateMany={updateEmails} onCriarObra={(em) => { setEmailParaObra(em); setNovaObraOpen(true); }} />}
        {tab === "producao" && <Producao obras={obras} onOpenObra={setSelectedId} />}
        {tab === "financeiro" && <Financeiro obras={obras} despesas={despesas} onAddDespesa={addDespesa} onUpdateDespesa={updateDespesa} onDeleteDespesa={deleteDespesa} equipa={equipa} onAddMembro={addMembro} onUpdateMembro={updateMembro} onDeleteMembro={deleteMembro} />}
        {tab === "receitas" && <Receitas obras={obras} onOpenObra={setSelectedId} />}
        {tab === "faturas" && <Faturas obras={obras} despesas={despesas} onAddDespesa={addDespesa} onUpdateDespesa={updateDespesa} onDeleteDespesa={deleteDespesa} onOpenObra={setSelectedId} fornecedorNomes={fornecedores.map((f) => f.nome)} />}
        {tab === "clientes" && <Clientes obras={obras} clientes={clientes} onAddCliente={addCliente} onUpdateCliente={updateCliente} onDeleteCliente={deleteCliente} onOpenObra={setSelectedId} />}
        {tab === "fornecedores" && <Fornecedores fornecedores={fornecedores} onAdd={addFornecedor} onUpdate={updateFornecedor} onDelete={deleteFornecedor} despesas={despesas} />}
      </div>

      {selected && (
        <ObraModal key={selected.id} emails={emails} onUpdateEmail={updateEmail} obra={selected} onClose={() => setSelectedId(null)} onUpdate={updateObra} onChangeEstado={changeEstado} onAddHistorico={addHistorico} onDelete={deleteObra} fornecedorNomes={fornecedores.map((f) => f.nome)} despesas={despesas} onAddDespesa={addDespesa} onUpdateDespesa={updateDespesa} onDeleteDespesa={deleteDespesa} onSyncCliente={syncCliente} clientesNomes={clientesNomesUnicos} equipa={equipa} />
      )}
      {novaObraOpen && (
        <NovaObraModal
          suggestedRef={nextRef(obras)} refsExistentes={obras.map((o) => o.ref)} clientesNomes={clientesNomesUnicos}
          prefill={emailParaObra ? {
            cliente: emailParaObra.direcao === "saida" ? "" : (emailParaObra.de || ""),
            clienteEmail: emailParaObra.direcao === "saida" ? ((emailParaObra.para || [])[0] || "") : (emailParaObra.deEmail || ""),
            projeto: (emailParaObra.assunto || "").replace(/^((re|fw|fwd|enc|res)\s*:\s*)+/i, "").trim(),
            descricao: (emailParaObra.texto || "").slice(0, 400),
            canal: "email", dataEntrada: (emailParaObra.data || todayISO()).slice(0, 10),
          } : {}}
          onClose={() => { setNovaObraOpen(false); setEmailParaObra(null); }}
          onCreate={(f) => {
            const id = uid();
            addObra({ ...f, id });
            if (emailParaObra) { updateEmail(emailParaObra.id, { obraId: id, estado: "ligado", ligadoPor: "manual" }); setEmailParaObra(null); }
          }} />
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: T.paper, fontFamily: "Inter" }}>
        <style>{FONT_IMPORT}</style>
        A verificar sessão…
      </div>
    );
  }

  if (!session) return <Login />;

  return <Carpinova onSignOut={() => supabase.auth.signOut()} userEmail={session.user?.email} />;
}
