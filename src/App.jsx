import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  Plus, Search, X, Mail, Phone, Calendar, AlertTriangle, TrendingUp,
  Package, CheckCircle2, XCircle, Clock, Download, Building2, ChevronDown,
  ChevronRight, MapPin, Euro, FileText, Users, LayoutGrid, Table as TableIcon,
  Wallet, Wrench, ArrowRight, Trash2, Save, RotateCcw
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend
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
  { key: "adjudicado", label: "Adjudicado", color: T.green },
  { key: "producao", label: "Em Produção", color: T.walnut },
  { key: "concluido", label: "Concluído", color: "#3D4F44" },
  { key: "rejeitado", label: "Rejeitado", color: T.rust },
];
const stageOf = (key) => STAGES.find((s) => s.key === key) || STAGES[0];
const ACTIVE_KEYS = ["orcamentar", "entregue", "retificacao"];
const WON_KEYS = ["adjudicado", "producao", "concluido"];

/* Tabela de margens (Secção 4 do perfil) — liga o tipo de cliente à margem sugerida */
const CLIENTE_TIPOS = [
  { key: "residencial", label: "Residencial direto", margem: 30 },
  { key: "arquiteto", label: "Indicação de arquiteto", margem: 28 },
  { key: "empreiteiro", label: "Empreiteiro / obra grande", margem: 25 },
  { key: "premium", label: "Projeto especial / direto premium", margem: 35 },
  { key: "industrial", label: "Industrial / série", margem: 15 },
];
const tipoClienteOf = (key) => CLIENTE_TIPOS.find((c) => c.key === key);

/* Estados de uma cotação pedida a fornecedor */
const COTACAO_ESTADOS = [
  { key: "pedido", label: "Pedido", color: "#2C3E50" },
  { key: "recebido", label: "Recebido", color: "#BD7F22" },
  { key: "integrado", label: "Integrado no orçamento", color: "#496B3C" },
];
const cotacaoEstadoOf = (key) => COTACAO_ESTADOS.find((c) => c.key === key) || COTACAO_ESTADOS[0];

/* ============================================================
   FORNECEDORES (referência estática — Secção 5 do perfil)
   ============================================================ */
const FORNECEDORES = [
  { categoria: "Painéis / Melaminas", nome: "Balbino & Faustino (Finsa)", ref: "AGL STD EZ 18mm", preco: "5,09 €/m²", contacto: "Desc. FI-01: 25%" },
  { categoria: "Painéis / Melaminas", nome: "B&F (Finsa)", ref: "MDF STD EZ 18mm", preco: "7,50 €/m²", contacto: "" },
  { categoria: "Painéis / Melaminas", nome: "B&F (Finsa)", ref: "MDF HID EZ 18mm", preco: "9,57 €/m²", contacto: "" },
  { categoria: "Painéis / Melaminas", nome: "B&F (Finsa)", ref: "MDF HID EZ 19mm", preco: "10,10 €/m²", contacto: "" },
  { categoria: "Painéis / Melaminas", nome: "B&F (Finsa)", ref: "Superpan STD EZ 18mm", preco: "6,39 €/m²", contacto: "" },
  { categoria: "Painéis / Melaminas", nome: "B&F — Decorativos", ref: "DUO Gr1 AGL STD 18mm", preco: "9,70 €/m²", contacto: "" },
  { categoria: "Painéis / Melaminas", nome: "B&F — Decorativos", ref: "DUO Gr2 AGL STD 18mm", preco: "12,04 €/m²", contacto: "" },
  { categoria: "Painéis / Melaminas", nome: "Innovus", ref: "MDF STD 18mm", preco: "8,87 €/m²", contacto: "" },
  { categoria: "Painéis / Melaminas", nome: "Innovus", ref: "MDF HID 19mm", preco: "12,17 €/m²", contacto: "" },
  { categoria: "Painéis / Melaminas", nome: "Innovus (L166 PROMO)", ref: "PB HID 19mm", preco: "10,93 €/m²", contacto: "Verificar promoção ativa" },
  { categoria: "Lacagem / Acabamentos", nome: "Serlaca", ref: "Frentes mate 2 faces", preco: "47 €/m²", contacto: "" },
  { categoria: "Lacagem / Acabamentos", nome: "Serlaca", ref: "Painéis 1 face", preco: "25 €/m²", contacto: "" },
  { categoria: "Lacagem / Acabamentos", nome: "Serlaca", ref: "Alto brilho 2 faces", preco: "58 €/m²", contacto: "" },
  { categoria: "Lacagem / Acabamentos", nome: "Serlaca", ref: "Ripado", preco: "65 €/m²", contacto: "" },
  { categoria: "Lacagem / Acabamentos", nome: "Serlaca", ref: "Rodapé", preco: "3,25 €/ml", contacto: "" },
  { categoria: "Lacagem / Acabamentos", nome: "Serlaca", ref: "Porta 2m", preco: "110 €", contacto: "" },
  { categoria: "Lacagem / Acabamentos", nome: "Serlaca", ref: "Porta 2,5m", preco: "120 €", contacto: "" },
  { categoria: "Lacagem / Acabamentos", nome: "Lacagem in-house", ref: "Custo interno (default)", preco: "~20 €/m²", contacto: "Só subcontratar se sobrecarga" },
  { categoria: "Ferragens & Sistemas", nome: "Batista Gomes", ref: "Blum, sistemas deslizantes", preco: "—", contacto: "Teófilo Pereira" },
  { categoria: "Ferragens & Sistemas", nome: "Batista Gomes", ref: "SF-RA P140 + STAR XL (biombo)", preco: "—", contacto: "ref. 18998/A" },
  { categoria: "Ferragens & Sistemas", nome: "O Ferrolho / Alberto Santos", ref: "Hardware especializado", preco: "—", contacto: "" },
  { categoria: "Ferragens & Sistemas", nome: "Emuca", ref: "Sistemas roupeiro, LED, PIR", preco: "—", contacto: "" },
  { categoria: "Ferragens & Sistemas", nome: "JNF", ref: "Puxadores, fechaduras", preco: "—", contacto: "" },
  { categoria: "Tampos / Superfícies", nome: "Stodis", ref: "Hi-Macs solid surface", preco: "—", contacto: "Joana Silva" },
  { categoria: "Módulos Cozinha", nome: "Mudecosan", ref: "Villarrobledo, Albacete (ESP)", preco: "—", contacto: "Desc. 25% módulos + 10% portas" },
  { categoria: "Fenólico Compacto", nome: "Covema", ref: "BLOMA 13mm", preco: "53,02 €/m²", contacto: "" },
  { categoria: "Fenólico Compacto", nome: "Covema", ref: "BLOMA 12mm", preco: "53,02 €/m²", contacto: "" },
  { categoria: "Vidros", nome: "Vidraria Luís Morais / Ilda", ref: "Vidro temperado (biombos)", preco: "—", contacto: "" },
];

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
  donoObra: o.donoObra || "",
  donoObraContacto: o.donoObraContacto || "",
  cotacoes: [],
  pagamentos: [],
  historico: [
    { data: o.dataEntrada || new Date().toISOString().slice(0, 10), texto: o.notas || "Importado do histórico de emails." },
  ],
});

function uid() {
  return "o_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const SEED_DATA = [
  { cliente: "Horácio Araújo", projeto: "Vivendas Cabeçudos", descricao: "2 T4, 3 T2", canal: "geral", dataEntrada: "2026-07-20", estado: "orcamentar" },
  { cliente: "Enark", projeto: "2519 Barcelos", descricao: "Mesa, nicho, garrafeira, móvel TV e aparador", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-07-14", estado: "orcamentar", notas: "Mandei cotação Olivia para as pedras." },
  { cliente: "Kozowood", projeto: "Santo Tirso — Cláudia Rodrigues", descricao: "", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-07-17", estado: "orcamentar", notas: "Mandei cotação Desirk portas." },
  { cliente: "Horácio Costa", projeto: "2 Armários MDF", descricao: "", canal: "geral", dataEntrada: "2026-07-21", estado: "producao", notas: "Só fabrico e entrega." },
  { cliente: "Samuel Bezerra", projeto: "Pizarro", descricao: "Módulos de cozinha e bandas", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-06-11", estado: "adjudicado", notas: "Pedido Ferreira Martins módulos de cozinha e bandas. Atraso para depois do meio de julho.", dataInicioObra: "2026-07-27", proximaAcaoTexto: "Obra" },
  { cliente: "Dr.ª Inês", projeto: "Casa Oliveira, São Mateus", descricao: "Cozinha + roupeiros + WC", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-06-23", estado: "adjudicado", notas: "Aceite o chão; resto só para o final do ano." },
  { cliente: "Nuno", projeto: "Roupeiro", descricao: "", canal: "—", dataEntrada: "2026-07-01", estado: "adjudicado", notas: "Enviado pedido Ferreira Martins." },
  { cliente: "Ferracuti", projeto: "Móvel de Sala", descricao: "Cliente: Renata — 992 € + IVA", canal: "whatsapp", dataEntrada: "2026-07-07", estado: "adjudicado" },
  { cliente: "Diana", projeto: "Arranjo de Cozinha", descricao: "", canal: "—", dataEntrada: null, estado: "adjudicado" },
  { cliente: "Elp Any Trade — Fernanda", projeto: "IMT Bragança", descricao: "", canal: "—", dataEntrada: "2026-07-20", estado: "adjudicado", proximaAcaoTexto: "Sem início de obra definido" },
  { cliente: "Elp Any Trade — Fernanda", projeto: "Centro Acolhimento Migrantes, Celeirós", descricao: "Portas", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-07-17", estado: "entregue", notas: "Entregue 24/07.", dataEntrega: "2026-07-24" },
  { cliente: "Ana Machado", projeto: "Porta — reaproveitamento aro", descricao: "Não cabe por 2cm", canal: "geral@carpinova", dataEntrada: "2026-07-17", estado: "entregue", notas: "Barcelos." },
  { cliente: "Elp Any Trade — Fernanda Moreira", projeto: "USF de S. Tomé de Negrelos", descricao: "Mobiliário", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-05-21", estado: "entregue", notas: "Entregue 07/07.", dataEntrega: "2026-07-07" },
  { cliente: "Manuel Macedo", projeto: "Manuel Macedo 2026-104", descricao: "Portas interiores", canal: "geral@carpinova.pt", dataEntrada: "2026-06-16", estado: "entregue" },
  { cliente: "ANGroup", projeto: "Rua Cruz de Pedra, Braga", descricao: "Estrutura de telhado e mezaninos", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-06-19", estado: "entregue" },
  { cliente: "Elp Any Trade — Fernanda Moreira", projeto: "Comando Nacional Emergência e Proteção Civil, Braga", descricao: "Obras de ampliação e alteração interior", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-06-30", estado: "entregue" },
  { cliente: "André Azevedo (Kozowood)", projeto: "Murtinheira, Figueira da Foz", descricao: "Carpintaria e montagem", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-07-06", estado: "entregue", notas: "Entregue 22/07.", dataEntrega: "2026-07-22" },
  { cliente: "Miguel Guimarães — Estradas do Douro (CED)", projeto: "Quinta da Gateira, Souselo, Cinfães", descricao: "+ portas de segurança", canal: "mariocarvalho@carpinova.pt", dataEntrada: null, estado: "entregue" },
  { cliente: "Luís Brandão (ERN)", projeto: "Trindade Domus, Porto", descricao: "", canal: "geral@carpinova", dataEntrada: "2026-07-16", estado: "entregue", notas: "Entregue 22/07/2026.", dataEntrega: "2026-07-22" },
  { cliente: "Luís Graça", projeto: "Toldotempo", descricao: "Portas", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-06-16", estado: "rejeitado", motivoRejeicao: "Não aceitaram." },
  { cliente: "Alca Design Studio", projeto: "Edifício de Apartamentos Turísticos, Rua da Madalena", descricao: "", canal: "geral@carpinova.pt", dataEntrada: "2026-06-17", estado: "rejeitado" },
  { cliente: "Alca Design Studio", projeto: "Restaurante Senna, Lisboa", descricao: "Carpintarias", canal: "geral@carpinova.pt", dataEntrada: "2026-06-17", estado: "rejeitado" },
  { cliente: "Tiago Carneiro — Estradas do Douro (CED)", projeto: "Condomínio Salvador Cardoso", descricao: "", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-06-19", estado: "rejeitado", motivoRejeicao: "Rejeitado por nós.", proximaAcaoTexto: "Retomar contacto em 2027" },
  { cliente: "Paula Pinheiro (Omatapalo)", projeto: "Hotel Flag, S. João da Madeira", descricao: "Carpintarias", canal: "geral@carpinova.pt", dataEntrada: "2026-06-22", estado: "rejeitado" },
  { cliente: "Alca Design Studio", projeto: "Moradia de Luxo, Urb. Arcaya, Vilamoura", descricao: "", canal: "geral@carpinova.pt", dataEntrada: "2026-06-23", estado: "rejeitado" },
  { cliente: "André Neves", projeto: "Labial Farma", descricao: "Vidro fosco + reparar porta", canal: "geral@carpinova.pt", dataEntrada: "2026-06-25", estado: "rejeitado", motivoRejeicao: "Fora do nosso raio de atuação — informar por email." },
  { cliente: "Alca Design Studio", projeto: "Apartamento Bruno", descricao: "Portas interiores, armários e cozinha", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-07-03", estado: "rejeitado" },
  { cliente: "Alca Design Studio", projeto: "Escritório, Edifício Oficinas Europa", descricao: "Carpintaria", canal: "geral@carpinova.pt", dataEntrada: "2026-07-03", estado: "rejeitado" },
  { cliente: "Alca Design Studio", projeto: "Moradia Caxias", descricao: "Carpintarias, entrega e montagem", canal: "geral@carpinova.pt", dataEntrada: "2026-07-15", estado: "rejeitado" },
  { cliente: "P1 Compras", projeto: "Alfredo Abreu — vinílico", descricao: "Vinil Pumice 3200", canal: "geral@carpinova", dataEntrada: "2026-07-16", estado: "rejeitado", motivoRejeicao: "Não fazemos vinil colado — responder com portfólio e dar contacto alternativo." },
  { cliente: "Vicente Gouveia", projeto: "Empreitada", descricao: "", canal: "mariocarvalho", dataEntrada: "2026-07-16", estado: "rejeitado", motivoRejeicao: "Rejeitado por nós." },
  { cliente: "Ricardo Oliveira", projeto: "Aveleda", descricao: "Madeiras", canal: "geral", dataEntrada: "2026-07-20", estado: "rejeitado" },
  { cliente: "Alca Design Studio", projeto: "Hotel D. Pedro, Lisboa", descricao: "Carpintarias, remodelação WC", canal: "geral", dataEntrada: "2026-07-20", estado: "rejeitado" },
  { cliente: "Ferracuti", projeto: "T5 Matosinhos", descricao: "Carpintaria", canal: "geral@carpinova.pt", dataEntrada: "2026-07-07", estado: "retificacao" },
  { cliente: "Pedro Ferreira", projeto: "Baltor — Editora Barcelos", descricao: "", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-06-08", estado: "retificacao", notas: "Enviei cotação Gosimat 24/07.", proximaAcaoTexto: "Retomar em setembro" },
  { cliente: "—", projeto: "3 Portas", descricao: "Favo de abelha — Desirk", canal: "—", dataEntrada: "2026-07-14", estado: "retificacao" },
  { cliente: "Sr. Filipe", projeto: "Portas Interiores", descricao: "", canal: "email", dataEntrada: "2026-07-17", estado: "retificacao", notas: "Já temos orçamento das portas." },
].map((o, idx) => seedRow(o, idx));

/* ============================================================
   HELPERS
   ============================================================ */
const fmtEUR = (v) => (v === null || v === undefined || v === "" || isNaN(v)) ? "—" :
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(v));
const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const isOverdue = (dateStr, estado) => {
  if (!dateStr) return false;
  if (["concluido", "rejeitado"].includes(estado)) return false;
  return dateStr < todayISO();
};
const monthLabel = (isoMonth) => {
  const [y, m] = isoMonth.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return names[parseInt(m, 10) - 1] + "/" + y.slice(2);
};
const nextRef = (obras) => {
  const year = new Date().getFullYear();
  const nums = obras
    .map((o) => o.ref)
    .filter((r) => r && r.startsWith(`CARP-${year}-`))
    .map((r) => parseInt(r.split("-")[2], 10))
    .filter((n) => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `CARP-${year}-${String(next).padStart(3, "0")}`;
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
        setObras(data.map((r) => ({ ...r.payload, id: r.id })));
      } else {
        // Base de dados vazia — semear com o histórico do Excel.
        // IDs determinísticos + upsert: se os dois computadores arrancarem
        // ao mesmo tempo pela primeira vez, não duplicam registos.
        const seedRows = SEED_DATA.map((o) => ({ id: o.id, payload: o }));
        const { error: seedError } = await supabase
          .from("obras")
          .upsert(seedRows, { onConflict: "id", ignoreDuplicates: true });
        if (seedError) console.error("Erro a semear obras:", seedError);
        setObras(SEED_DATA);
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
      tipoCliente: "", clienteEmail: "", clienteTelefone: "", donoObra: "", donoObraContacto: "",
      cotacoes: [], pagamentos: [], historico: [{ data: todayISO(), texto: "Obra criada." }],
      ...partial,
    };
    setObras((cur) => [novaObra, ...cur]);
    persistRow(novaObra.id, novaObra);
  }, [persistRow]);

  const updateObra = useCallback((id, patch) => {
    const next = obrasRef.current.map((o) => (o.id === id ? { ...o, ...patch } : o));
    setObras(next);
    const atualizado = next.find((o) => o.id === id);
    if (atualizado) persistRow(id, atualizado);
  }, [persistRow]);

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

function KpiCard({ icon: Icon, label, value, sub, accent }) {
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
function ObraModal({ obra, onClose, onUpdate, onChangeEstado, onAddHistorico, onDelete }) {
  const [local, setLocal] = useState(obra);
  const [novaNota, setNovaNota] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [novaCotacao, setNovaCotacao] = useState({ fornecedor: "", material: "", valor: "" });

  useEffect(() => setLocal(obra), [obra]);

  const set = (patch) => setLocal((l) => ({ ...l, ...patch }));
  const commit = (patch) => { set(patch); onUpdate(obra.id, patch); };

  const handleEstadoChange = (novoEstado) => {
    set({ estado: novoEstado });
    onChangeEstado(obra.id, novoEstado);
  };

  const fornecedorNomes = useMemo(() => [...new Set(FORNECEDORES.map((f) => f.nome))], []);

  const addCotacao = () => {
    if (!novaCotacao.fornecedor.trim()) return;
    const cotacoes = [...(local.cotacoes || []), {
      id: uid(), fornecedor: novaCotacao.fornecedor.trim(), material: novaCotacao.material.trim(),
      valor: novaCotacao.valor === "" ? null : Number(novaCotacao.valor),
      estado: "pedido", dataPedido: todayISO(), notas: "",
    }];
    commit({ cotacoes });
    setNovaCotacao({ fornecedor: "", material: "", valor: "" });
  };
  const updateCotacao = (idx, patch) => {
    const cotacoes = local.cotacoes.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    commit({ cotacoes });
  };
  const removeCotacao = (idx) => {
    const cotacoes = local.cotacoes.filter((_, i) => i !== idx);
    commit({ cotacoes });
  };

  const gerarPagamentos = () => {
    if (!local.valorAdjudicado) return;
    const v = Number(local.valorAdjudicado);
    const pagamentos = [
      { label: "Adjudicação (40%)", valor: +(v * 0.4).toFixed(2), pago: false },
      { label: "Início de obra (40%)", valor: +(v * 0.4).toFixed(2), pago: false },
      { label: "Conclusão (20%)", valor: +(v * 0.2).toFixed(2), pago: false },
    ];
    commit({ pagamentos });
  };

  const togglePagamento = (idx) => {
    const pagamentos = local.pagamentos.map((p, i) => i === idx ? { ...p, pago: !p.pago } : p);
    commit({ pagamentos });
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
          border: `1px solid ${T.line}`, boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
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
              <input style={inputStyle} value={local.cliente} onChange={(e) => set({ cliente: e.target.value })} onBlur={() => commit({ cliente: local.cliente })} />
            </Field>
            <Field label="Projeto / Obra">
              <input style={inputStyle} value={local.projeto} onChange={(e) => set({ projeto: e.target.value })} onBlur={() => commit({ projeto: local.projeto })} />
            </Field>
            <Field label="Referência interna">
              <input style={inputStyle} value={local.ref || ""} placeholder="CARP-2026-XXX" onChange={(e) => set({ ref: e.target.value })} onBlur={() => commit({ ref: local.ref })} />
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
              <input style={inputStyle} value={local.clienteEmail || ""} onChange={(e) => set({ clienteEmail: e.target.value })} onBlur={() => commit({ clienteEmail: local.clienteEmail })} />
            </Field>
            <Field label="Telefone do cliente">
              <input style={inputStyle} value={local.clienteTelefone || ""} onChange={(e) => set({ clienteTelefone: e.target.value })} onBlur={() => commit({ clienteTelefone: local.clienteTelefone })} />
            </Field>
            <Field label="Dono de obra (se diferente do cliente)">
              <input style={inputStyle} placeholder="ex: dono final, quando cliente é arquiteto/empreiteiro" value={local.donoObra || ""} onChange={(e) => set({ donoObra: e.target.value })} onBlur={() => commit({ donoObra: local.donoObra })} />
            </Field>
            <Field label="Contacto do dono de obra">
              <input style={inputStyle} value={local.donoObraContacto || ""} onChange={(e) => set({ donoObraContacto: e.target.value })} onBlur={() => commit({ donoObraContacto: local.donoObraContacto })} />
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

          {local.estado === "rejeitado" && (
            <Field label="Motivo da rejeição">
              <textarea style={textareaStyle} rows={2} value={local.motivoRejeicao || ""} onChange={(e) => set({ motivoRejeicao: e.target.value })} onBlur={() => commit({ motivoRejeicao: local.motivoRejeicao })} />
            </Field>
          )}

          <CutDivider label="Valores" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="Valor orçamentado (ex-IVA)">
              <input type="number" style={inputStyle} value={local.valorOrcamento ?? ""} onChange={(e) => set({ valorOrcamento: e.target.value === "" ? null : e.target.value })} onBlur={() => commit({ valorOrcamento: local.valorOrcamento })} />
            </Field>
            <Field label="Valor adjudicado (ex-IVA)">
              <input type="number" style={inputStyle} value={local.valorAdjudicado ?? ""} onChange={(e) => set({ valorAdjudicado: e.target.value === "" ? null : e.target.value })} onBlur={() => commit({ valorAdjudicado: local.valorAdjudicado })} />
            </Field>
            <Field label="Margem aplicada (%)">
              <input type="number" style={inputStyle} value={local.margem ?? ""} onChange={(e) => set({ margem: e.target.value === "" ? null : e.target.value })} onBlur={() => commit({ margem: local.margem })} />
            </Field>
          </div>

          {WON_KEYS.includes(local.estado) && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.walnutDark, textTransform: "uppercase", letterSpacing: 0.4 }}>Plano de pagamentos</span>
                {(!local.pagamentos || !local.pagamentos.length) && local.valorAdjudicado && (
                  <Btn small variant="ghost" onClick={gerarPagamentos}>Gerar 40/40/20</Btn>
                )}
              </div>
              {local.pagamentos && local.pagamentos.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {local.pagamentos.map((p, i) => (
                    <label key={i} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                      background: p.pago ? "rgba(73,107,60,0.12)" : T.paper2, borderRadius: 4,
                      border: `1px solid ${T.line}`, cursor: "pointer", fontSize: 13,
                    }}>
                      <input type="checkbox" checked={!!p.pago} onChange={() => togglePagamento(i)} />
                      <span style={{ flex: 1 }}>{p.label}</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtEUR(p.valor)}</span>
                      {p.pago && <CheckCircle2 size={15} color={T.green} />}
                    </label>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, opacity: 0.6 }}>Sem valor adjudicado definido ou plano ainda não gerado.</div>
              )}
            </div>
          )}

          <CutDivider label="Fornecedores / Pedidos de Cotação" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(local.cotacoes || []).length === 0 && (
              <div style={{ fontSize: 12, opacity: 0.55 }}>Sem pedidos de cotação registados para esta obra.</div>
            )}
            {(local.cotacoes || []).map((c, i) => {
              const est = cotacaoEstadoOf(c.estado);
              return (
                <div key={c.id || i} style={{
                  display: "grid", gridTemplateColumns: "1.3fr 1.3fr 0.9fr 1fr auto", gap: 8, alignItems: "center",
                  padding: "8px 10px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 4,
                }}>
                  <input style={{ ...inputStyle, fontSize: 12 }} value={c.fornecedor} list="fornecedores-datalist"
                    onChange={(e) => updateCotacao(i, { fornecedor: e.target.value })} placeholder="Fornecedor" />
                  <input style={{ ...inputStyle, fontSize: 12 }} value={c.material}
                    onChange={(e) => updateCotacao(i, { material: e.target.value })} placeholder="Material / serviço" />
                  <input type="number" style={{ ...inputStyle, fontSize: 12 }} value={c.valor ?? ""} placeholder="Valor €"
                    onChange={(e) => updateCotacao(i, { valor: e.target.value === "" ? null : Number(e.target.value) })} />
                  <select style={{ ...selectStyle, fontSize: 12 }} value={c.estado} onChange={(e) => updateCotacao(i, { estado: e.target.value })}>
                    {COTACAO_ESTADOS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  <button onClick={() => removeCotacao(i)} title="Remover" style={{ background: "none", border: "none", cursor: "pointer", color: T.rust, padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1.3fr 0.9fr auto", gap: 8, marginTop: 4 }}>
              <input style={inputStyle} list="fornecedores-datalist" placeholder="Novo fornecedor…" value={novaCotacao.fornecedor} onChange={(e) => setNovaCotacao((s) => ({ ...s, fornecedor: e.target.value }))} />
              <input style={inputStyle} placeholder="Material / serviço" value={novaCotacao.material} onChange={(e) => setNovaCotacao((s) => ({ ...s, material: e.target.value }))} />
              <input type="number" style={inputStyle} placeholder="Valor €" value={novaCotacao.valor} onChange={(e) => setNovaCotacao((s) => ({ ...s, valor: e.target.value }))} />
              <Btn small icon={Plus} onClick={addCotacao}>Pedir</Btn>
            </div>
            <datalist id="fornecedores-datalist">
              {fornecedorNomes.map((n) => <option key={n} value={n} />)}
            </datalist>
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
function NovaObraModal({ onClose, onCreate, suggestedRef }) {
  const [f, setF] = useState({
    ref: suggestedRef, cliente: "", projeto: "", descricao: "", canal: "", dataEntrada: todayISO(), estado: "orcamentar",
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const submit = () => {
    if (!f.cliente.trim() || !f.projeto.trim()) return;
    onCreate(f);
    onClose();
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(36,31,26,0.55)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.paper, borderRadius: 8, width: "100%", maxWidth: 480, border: `1px solid ${T.line}`, padding: 24 }}>
        <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 18, marginBottom: 16, color: T.ink }}>Novo pedido / orçamento</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Referência">
            <input style={inputStyle} value={f.ref} onChange={(e) => set("ref", e.target.value)} />
          </Field>
          <Field label="Cliente *">
            <input style={inputStyle} value={f.cliente} onChange={(e) => set("cliente", e.target.value)} autoFocus />
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
function Painel({ obras, onOpen }) {
  const kpis = useMemo(() => {
    const emPipeline = obras.filter((o) => ACTIVE_KEYS.includes(o.estado));
    const valorPipeline = emPipeline.reduce((s, o) => s + (Number(o.valorOrcamento) || 0), 0);
    const adjudicadas = obras.filter((o) => WON_KEYS.includes(o.estado));
    const rejeitadas = obras.filter((o) => o.estado === "rejeitado");
    const taxaConversao = (adjudicadas.length + rejeitadas.length) > 0
      ? Math.round((adjudicadas.length / (adjudicadas.length + rejeitadas.length)) * 100) : 0;
    const emProducao = obras.filter((o) => o.estado === "producao").length;
    const valorAdjudicadoTotal = adjudicadas.reduce((s, o) => s + (Number(o.valorAdjudicado) || 0), 0);
    return { emPipelineCount: emPipeline.length, valorPipeline, taxaConversao, emProducao, valorAdjudicadoTotal, adjudicadasCount: adjudicadas.length, rejeitadasCount: rejeitadas.length };
  }, [obras]);

  const acoesPendentes = useMemo(() => {
    return obras
      .filter((o) => o.proximaAcaoData && !["concluido", "rejeitado"].includes(o.estado))
      .sort((a, b) => (a.proximaAcaoData || "").localeCompare(b.proximaAcaoData || ""))
      .slice(0, 8);
  }, [obras]);

  const porEstado = useMemo(() => {
    return STAGES.map((s) => ({ name: s.label, valor: obras.filter((o) => o.estado === s.key).length, color: s.color }));
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
    <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12 }}>
      {STAGES.map((stage) => {
        const items = obras.filter((o) => o.estado === stage.key);
        const isOver = overStage === stage.key;
        return (
          <div key={stage.key} style={{ minWidth: 250, flex: "0 0 250px" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 10px", background: stage.color, borderRadius: "5px 5px 0 0",
            }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 }}>{stage.label}</span>
              <span style={{ color: "#fff", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{items.length}</span>
            </div>
            <div
              onDragOver={(e) => { e.preventDefault(); if (overStage !== stage.key) setOverStage(stage.key); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setOverStage(null); }}
              onDrop={(e) => handleDrop(e, stage.key)}
              style={{
                background: isOver ? "rgba(94,58,34,0.10)" : T.paper2,
                border: `1px solid ${isOver ? T.walnut : T.line}`,
                borderTop: "none", borderRadius: "0 0 5px 5px", padding: 8, minHeight: 240,
                display: "flex", flexDirection: "column", gap: 8,
                transition: "background .12s, border-color .12s",
              }}
            >
              {items.map((o) => {
                const late = isOverdue(o.proximaAcaoData, o.estado);
                const cotacoesPendentes = (o.cotacoes || []).filter((c) => c.estado === "pedido").length;
                const isDragging = draggingId === o.id;
                return (
                  <div
                    key={o.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.id); e.dataTransfer.effectAllowed = "move"; setDraggingId(o.id); }}
                    onDragEnd={() => { setDraggingId(null); setOverStage(null); }}
                    onClick={() => onOpen(o.id)}
                    style={{
                      background: "#fff", border: `1px solid ${T.line}`, borderRadius: 5, padding: "9px 10px",
                      cursor: "grab", position: "relative",
                      opacity: isDragging ? 0.35 : 1,
                      transform: isDragging ? "scale(0.97)" : "scale(1)",
                      boxShadow: isDragging ? "none" : "0 1px 2px rgba(0,0,0,0.04)",
                      transition: "opacity .12s, transform .12s, box-shadow .12s",
                    }}
                  >
                    <div style={{ position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: "50%", background: T.paper2, border: `1px solid ${T.line}` }} />
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, opacity: 0.55 }}>{o.ref || "s/ ref"}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: T.ink, marginTop: 2 }}>{o.projeto}</div>
                    <div style={{ fontSize: 12, opacity: 0.65, marginTop: 1 }}>{o.cliente}</div>
                    {o.donoObra && o.donoObra !== o.cliente && (
                      <div style={{ fontSize: 11, opacity: 0.55, marginTop: 1, fontStyle: "italic" }}>Dono de obra: {o.donoObra}</div>
                    )}
                    {(o.valorOrcamento || o.valorAdjudicado) && (
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600, marginTop: 6, color: T.walnutDark }}>
                        {fmtEUR(o.valorAdjudicado || o.valorOrcamento)}
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 6 }}>
                      <span style={{ fontSize: 11, opacity: 0.55 }}>{fmtDate(o.dataEntrada)}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {cotacoesPendentes > 0 && (
                          <span title="Cotações por receber" style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, color: T.navy }}>
                            <FileText size={12} /> {cotacoesPendentes}
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
                  <td style={{ padding: "9px 12px", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>{fmtEUR(o.valorAdjudicado || o.valorOrcamento)}</td>
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
function Financeiro({ obras }) {
  const anos = useMemo(() => {
    const set = new Set();
    obras.forEach((o) => {
      const d = o.dataAdjudicacao || o.dataInicioObra || o.dataEntrada;
      if (d) set.add(d.slice(0, 4));
    });
    set.add(String(new Date().getFullYear()));
    return Array.from(set).sort().reverse();
  }, [obras]);
  const [ano, setAno] = useState(anos[0]);

  const dadosMensais = useMemo(() => {
    const meses = {};
    for (let m = 1; m <= 12; m++) meses[`${ano}-${String(m).padStart(2, "0")}`] = 0;
    obras.filter((o) => WON_KEYS.includes(o.estado)).forEach((o) => {
      const d = o.dataAdjudicacao || o.dataInicioObra || o.dataEntrada;
      if (!d || !d.startsWith(ano)) return;
      const key = d.slice(0, 7);
      if (meses[key] !== undefined) meses[key] += Number(o.valorAdjudicado) || 0;
    });
    return Object.entries(meses).map(([k, v]) => ({ mes: monthLabel(k), valor: v }));
  }, [obras, ano]);

  const totais = useMemo(() => {
    const won = obras.filter((o) => WON_KEYS.includes(o.estado));
    const wonAno = won.filter((o) => (o.dataAdjudicacao || o.dataInicioObra || o.dataEntrada || "").startsWith(ano));
    const valorAno = wonAno.reduce((s, o) => s + (Number(o.valorAdjudicado) || 0), 0);
    const pipeline = obras.filter((o) => ACTIVE_KEYS.includes(o.estado)).reduce((s, o) => s + (Number(o.valorOrcamento) || 0), 0);
    const rejeitadoValor = obras.filter((o) => o.estado === "rejeitado").reduce((s, o) => s + (Number(o.valorOrcamento) || 0), 0);

    let pendente = 0, recebido = 0;
    won.forEach((o) => (o.pagamentos || []).forEach((p) => { if (p.pago) recebido += p.valor; else pendente += p.valor; }));

    return { valorAno, pipeline, rejeitadoValor, pendente, recebido };
  }, [obras, ano]);

  const pagamentosPendentes = useMemo(() => {
    const list = [];
    obras.filter((o) => WON_KEYS.includes(o.estado)).forEach((o) => {
      (o.pagamentos || []).forEach((p, idx) => {
        if (!p.pago) list.push({ obraId: o.id, projeto: o.projeto, cliente: o.cliente, ...p, idx });
      });
    });
    return list;
  }, [obras]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Calendar size={15} color={T.walnut} />
          <select style={selectStyle} value={ano} onChange={(e) => setAno(e.target.value)}>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <KpiCard icon={Euro} label={`Adjudicado ${ano}`} value={fmtEUR(totais.valorAno)} accent={T.green} />
        <KpiCard icon={Package} label="Valor em pipeline" value={fmtEUR(totais.pipeline)} sub="Ainda por decidir" />
        <KpiCard icon={Wallet} label="Por receber" value={fmtEUR(totais.pendente)} sub="Tranches pendentes" accent={T.amber} />
        <KpiCard icon={XCircle} label="Perdido (orçamentado)" value={fmtEUR(totais.rejeitadoValor)} sub="Obras rejeitadas" accent={T.rust} />
      </div>

      <CutDivider label={`Faturação adjudicada por mês — ${ano}`} />
      <div style={{ background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 6, padding: "16px 20px", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dadosMensais} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.line} vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fontFamily: "Inter" }} />
            <YAxis tick={{ fontSize: 11, fontFamily: "Inter" }} />
            <Tooltip formatter={(v) => fmtEUR(v)} contentStyle={{ fontFamily: "Inter", fontSize: 12, borderRadius: 4, border: `1px solid ${T.line}` }} />
            <Bar dataKey="valor" fill={T.walnut} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <CutDivider label="Pagamentos pendentes" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {pagamentosPendentes.length === 0 && <div style={{ fontSize: 13, opacity: 0.6 }}>Sem tranches pendentes registadas.</div>}
        {pagamentosPendentes.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 4, fontSize: 13 }}>
            <Clock size={14} color={T.amber} />
            <span style={{ fontWeight: 600 }}>{p.projeto}</span>
            <span style={{ opacity: 0.6 }}>— {p.cliente}</span>
            <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace" }}>{p.label}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: T.walnutDark }}>{fmtEUR(p.valor)}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, opacity: 0.55, marginTop: 18, fontStyle: "italic" }}>
        Nota: os valores só aparecem aqui depois de preenchidos na ficha de cada obra (Valor orçamentado / Valor adjudicado). O histórico de emails importado não continha valores monetários.
      </div>
    </div>
  );
}

/* ============================================================
   CLIENTES
   ============================================================ */
function Clientes({ obras, onFilterClient }) {
  const [q, setQ] = useState("");
  const lista = useMemo(() => {
    const map = {};
    obras.forEach((o) => {
      const nome = (o.cliente || "—").trim();
      if (!map[nome]) map[nome] = { nome, total: 0, ganhas: 0, rejeitadas: 0, emCurso: 0, valorAdjudicado: 0, ultimo: null };
      const e = map[nome];
      e.total += 1;
      if (WON_KEYS.includes(o.estado)) { e.ganhas += 1; e.valorAdjudicado += Number(o.valorAdjudicado) || 0; }
      if (o.estado === "rejeitado") e.rejeitadas += 1;
      if (ACTIVE_KEYS.includes(o.estado)) e.emCurso += 1;
      if (!e.ultimo || (o.dataEntrada || "") > e.ultimo) e.ultimo = o.dataEntrada;
    });
    return Object.values(map)
      .filter((c) => !q || c.nome.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.total - a.total);
  }, [obras, q]);

  return (
    <div>
      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={14} style={{ position: "absolute", left: 9, top: 9, opacity: 0.5 }} />
        <input style={{ ...inputStyle, width: "100%", paddingLeft: 28 }} placeholder="Pesquisar cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {lista.map((c) => (
          <div key={c.nome} onClick={() => onFilterClient(c.nome)} style={{
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
            <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>Último contacto: {fmtDate(c.ultimo)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   FORNECEDORES
   ============================================================ */
function Fornecedores() {
  const [q, setQ] = useState("");
  const categorias = useMemo(() => {
    const groups = {};
    FORNECEDORES.filter((f) => !q || `${f.nome} ${f.ref} ${f.categoria}`.toLowerCase().includes(q.toLowerCase()))
      .forEach((f) => { (groups[f.categoria] = groups[f.categoria] || []).push(f); });
    return groups;
  }, [q]);

  return (
    <div>
      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={14} style={{ position: "absolute", left: 9, top: 9, opacity: 0.5 }} />
        <input style={{ ...inputStyle, width: "100%", paddingLeft: 28 }} placeholder="Pesquisar fornecedor ou material…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {Object.entries(categorias).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 20 }}>
          <CutDivider label={cat} />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {items.map((f, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${T.line}`, background: i % 2 ? "#fff" : T.paper }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600, width: "26%" }}>{f.nome}</td>
                    <td style={{ padding: "8px 12px", opacity: 0.8 }}>{f.ref}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: T.walnutDark, whiteSpace: "nowrap" }}>{f.preco}</td>
                    <td style={{ padding: "8px 12px", opacity: 0.6, fontSize: 12 }}>{f.contacto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {Object.keys(categorias).length === 0 && <div style={{ opacity: 0.5, fontSize: 13 }}>Sem resultados.</div>}
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
  { key: "financeiro", label: "Financeiro", icon: Wallet },
  { key: "clientes", label: "Clientes", icon: Users },
  { key: "fornecedores", label: "Fornecedores", icon: Package },
];

export default function App() {
  const { obras, loading, saveState, addObra, updateObra, changeEstado, addHistorico, deleteObra } = useObrasStore();
  const [tab, setTab] = useState("painel");
  const [selectedId, setSelectedId] = useState(null);
  const [novaObraOpen, setNovaObraOpen] = useState(false);
  const [clienteFiltroInicial, setClienteFiltroInicial] = useState(null);

  const selected = obras.find((o) => o.id === selectedId);

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
        <div style={{ fontSize: 11, color: T.paper3, display: "flex", alignItems: "center", gap: 6 }}>
          {saveState === "saving" && <><Save size={12} /> a guardar…</>}
          {saveState === "saved" && <><CheckCircle2 size={12} color="#8FBF7A" /> guardado</>}
          {saveState === "error" && <><AlertTriangle size={12} color="#E08B7A" /> erro ao guardar</>}
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
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
        {tab === "painel" && <Painel obras={obras} onOpen={setSelectedId} />}
        {tab === "pipeline" && <Pipeline obras={obras} onOpen={setSelectedId} onChangeEstado={changeEstado} />}
        {tab === "obras" && <ObrasTab obras={obras} onOpen={setSelectedId} onNew={() => setNovaObraOpen(true)} />}
        {tab === "financeiro" && <Financeiro obras={obras} />}
        {tab === "clientes" && <Clientes obras={obras} onFilterClient={() => setTab("obras")} />}
        {tab === "fornecedores" && <Fornecedores />}
      </div>

      {selected && (
        <ObraModal obra={selected} onClose={() => setSelectedId(null)} onUpdate={updateObra} onChangeEstado={changeEstado} onAddHistorico={addHistorico} onDelete={deleteObra} />
      )}
      {novaObraOpen && (
        <NovaObraModal suggestedRef={nextRef(obras)} onClose={() => setNovaObraOpen(false)} onCreate={addObra} />
      )}
    </div>
  );
}
