import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  Plus, Search, X, Mail, Phone, Calendar, AlertTriangle, TrendingUp,
  Package, CheckCircle2, XCircle, Clock, Download, Building2, ChevronDown,
  ChevronRight, ChevronUp, MapPin, Euro, FileText, Users, LayoutGrid, Table as TableIcon,
  Wallet, Wrench, ArrowRight, Trash2, Save, RotateCcw, Globe, Upload, Paperclip,
  FileSpreadsheet, Image as ImageIcon, FileType
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
  { key: "adjudicado", label: "Adjudicado", color: T.green },
  { key: "producao", label: "Em Produção", color: T.walnut },
  { key: "concluido", label: "Concluído", color: "#3D4F44" },
  { key: "rejeitado_nos", label: "Rejeitado por Nós", color: "#8A7A6B" },
  { key: "rejeitado_cliente", label: "Rejeitado pelo Cliente", color: T.rust },
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
const COM_PAGAMENTOS_KEYS = ["aceite", "adjudicado", "producao", "concluido"];

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
const FORNECEDORES_ITENS = [
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
  cotacoes: [],
  anexos: [],
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
  { cliente: "Samuel Bezerra", projeto: "Pizarro", descricao: "Módulos de cozinha e bandas", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-06-11", estado: "aceite", notas: "Pedido Ferreira Martins módulos de cozinha e bandas. Atraso para depois do meio de julho.", dataInicioObra: "2026-07-27", proximaAcaoTexto: "Obra" },
  { cliente: "Dr.ª Inês", projeto: "Casa Oliveira, São Mateus", descricao: "Cozinha + roupeiros + WC", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-06-23", estado: "aceite", notas: "Aceite o chão; resto só para o final do ano." },
  { cliente: "Nuno", projeto: "Roupeiro", descricao: "", canal: "—", dataEntrada: "2026-07-01", estado: "aceite", notas: "Enviado pedido Ferreira Martins." },
  { cliente: "Ferracuti", projeto: "Móvel de Sala", descricao: "Cliente: Renata — 992 € + IVA", canal: "whatsapp", dataEntrada: "2026-07-07", estado: "aceite" },
  { cliente: "Diana", projeto: "Arranjo de Cozinha", descricao: "", canal: "—", dataEntrada: null, estado: "aceite" },
  { cliente: "Elp Any Trade — Fernanda", projeto: "IMT Bragança", descricao: "", canal: "—", dataEntrada: "2026-07-20", estado: "aceite", proximaAcaoTexto: "Sem início de obra definido" },
  { cliente: "Elp Any Trade — Fernanda", projeto: "Centro Acolhimento Migrantes, Celeirós", descricao: "Portas", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-07-17", estado: "entregue", notas: "Entregue 24/07.", dataEntrega: "2026-07-24" },
  { cliente: "Ana Machado", projeto: "Porta — reaproveitamento aro", descricao: "Não cabe por 2cm", canal: "geral@carpinova", dataEntrada: "2026-07-17", estado: "entregue", notas: "Barcelos." },
  { cliente: "Elp Any Trade — Fernanda Moreira", projeto: "USF de S. Tomé de Negrelos", descricao: "Mobiliário", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-05-21", estado: "entregue", notas: "Entregue 07/07.", dataEntrega: "2026-07-07" },
  { cliente: "Manuel Macedo", projeto: "Manuel Macedo 2026-104", descricao: "Portas interiores", canal: "geral@carpinova.pt", dataEntrada: "2026-06-16", estado: "entregue" },
  { cliente: "ANGroup", projeto: "Rua Cruz de Pedra, Braga", descricao: "Estrutura de telhado e mezaninos", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-06-19", estado: "entregue" },
  { cliente: "Elp Any Trade — Fernanda Moreira", projeto: "Comando Nacional Emergência e Proteção Civil, Braga", descricao: "Obras de ampliação e alteração interior", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-06-30", estado: "entregue" },
  { cliente: "André Azevedo (Kozowood)", projeto: "Murtinheira, Figueira da Foz", descricao: "Carpintaria e montagem", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-07-06", estado: "entregue", notas: "Entregue 22/07.", dataEntrega: "2026-07-22" },
  { cliente: "Miguel Guimarães — Estradas do Douro (CED)", projeto: "Quinta da Gateira, Souselo, Cinfães", descricao: "+ portas de segurança", canal: "mariocarvalho@carpinova.pt", dataEntrada: null, estado: "entregue" },
  { cliente: "Luís Brandão (ERN)", projeto: "Trindade Domus, Porto", descricao: "", canal: "geral@carpinova", dataEntrada: "2026-07-16", estado: "entregue", notas: "Entregue 22/07/2026.", dataEntrega: "2026-07-22" },
  { cliente: "Luís Graça", projeto: "Toldotempo", descricao: "Portas", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-06-16", estado: "rejeitado_cliente", motivoRejeicao: "Não aceitaram." },
  { cliente: "Alca Design Studio", projeto: "Edifício de Apartamentos Turísticos, Rua da Madalena", descricao: "", canal: "geral@carpinova.pt", dataEntrada: "2026-06-17", estado: "rejeitado_cliente" },
  { cliente: "Alca Design Studio", projeto: "Restaurante Senna, Lisboa", descricao: "Carpintarias", canal: "geral@carpinova.pt", dataEntrada: "2026-06-17", estado: "rejeitado_cliente" },
  { cliente: "Tiago Carneiro — Estradas do Douro (CED)", projeto: "Condomínio Salvador Cardoso", descricao: "", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-06-19", estado: "rejeitado_nos", motivoRejeicao: "Rejeitado por nós.", proximaAcaoTexto: "Retomar contacto em 2027" },
  { cliente: "Paula Pinheiro (Omatapalo)", projeto: "Hotel Flag, S. João da Madeira", descricao: "Carpintarias", canal: "geral@carpinova.pt", dataEntrada: "2026-06-22", estado: "rejeitado_cliente" },
  { cliente: "Alca Design Studio", projeto: "Moradia de Luxo, Urb. Arcaya, Vilamoura", descricao: "", canal: "geral@carpinova.pt", dataEntrada: "2026-06-23", estado: "rejeitado_cliente" },
  { cliente: "André Neves", projeto: "Labial Farma", descricao: "Vidro fosco + reparar porta", canal: "geral@carpinova.pt", dataEntrada: "2026-06-25", estado: "rejeitado_nos", motivoRejeicao: "Fora do nosso raio de atuação — informar por email." },
  { cliente: "Alca Design Studio", projeto: "Apartamento Bruno", descricao: "Portas interiores, armários e cozinha", canal: "mariocarvalho@carpinova.pt", dataEntrada: "2026-07-03", estado: "rejeitado_cliente" },
  { cliente: "Alca Design Studio", projeto: "Escritório, Edifício Oficinas Europa", descricao: "Carpintaria", canal: "geral@carpinova.pt", dataEntrada: "2026-07-03", estado: "rejeitado_cliente" },
  { cliente: "Alca Design Studio", projeto: "Moradia Caxias", descricao: "Carpintarias, entrega e montagem", canal: "geral@carpinova.pt", dataEntrada: "2026-07-15", estado: "rejeitado_cliente" },
  { cliente: "P1 Compras", projeto: "Alfredo Abreu — vinílico", descricao: "Vinil Pumice 3200", canal: "geral@carpinova", dataEntrada: "2026-07-16", estado: "rejeitado_nos", motivoRejeicao: "Não fazemos vinil colado — responder com portfólio e dar contacto alternativo." },
  { cliente: "Vicente Gouveia", projeto: "Empreitada", descricao: "", canal: "mariocarvalho", dataEntrada: "2026-07-16", estado: "rejeitado_nos", motivoRejeicao: "Rejeitado por nós." },
  { cliente: "Ricardo Oliveira", projeto: "Aveleda", descricao: "Madeiras", canal: "geral", dataEntrada: "2026-07-20", estado: "rejeitado_cliente" },
  { cliente: "Alca Design Studio", projeto: "Hotel D. Pedro, Lisboa", descricao: "Carpintarias, remodelação WC", canal: "geral", dataEntrada: "2026-07-20", estado: "rejeitado_cliente" },
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
  if (["concluido", ...REJECTED_KEYS].includes(estado)) return false;
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
      tipoCliente: "", clienteEmail: "", clienteTelefone: "", clienteNif: "", clienteMorada: "", donoObra: "", donoObraContacto: "",
      cotacoes: [], anexos: [], pagamentos: [], historico: [{ data: todayISO(), texto: "Obra criada." }],
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
        const seedRows = SEED_FORNECEDORES.map((f) => ({ id: f.id, payload: f }));
        const { error: seedError } = await supabase.from("fornecedores").upsert(seedRows, { onConflict: "id", ignoreDuplicates: true });
        if (seedError) console.error("Erro a semear fornecedores:", seedError);
        setFornecedores(SEED_FORNECEDORES);
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
function ObraModal({ obra, onClose, onUpdate, onChangeEstado, onAddHistorico, onDelete, fornecedorNomes, despesas, onAddDespesa, onUpdateDespesa, onDeleteDespesa, onSyncCliente, clientesNomes }) {
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
      const { data: pub } = supabase.storage.from("anexos").getPublicUrl(path);
      novosAnexos.push({
        id: uid(), nome: file.name, path, url: pub.publicUrl,
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

  const [novoCusto, setNovoCusto] = useState({ descricao: "", categoria: CATEGORIAS_DESPESA[0], valor: "" });
  const custosObra = useMemo(() => (despesas || []).filter((d) => d.obraId === obra.id), [despesas, obra.id]);
  const totalCustos = useMemo(() => custosObra.reduce((s, d) => s + (Number(d.valor) || 0), 0), [custosObra]);
  const margemReal = local.valorAdjudicado ? Number(local.valorAdjudicado) - totalCustos : null;
  const margemRealPct = local.valorAdjudicado && Number(local.valorAdjudicado) > 0
    ? (margemReal / Number(local.valorAdjudicado)) * 100 : null;

  const addCusto = () => {
    if (!novoCusto.descricao.trim()) return;
    onAddDespesa({
      obraId: obra.id, descricao: novoCusto.descricao.trim(), categoria: novoCusto.categoria,
      valor: novoCusto.valor === "" ? null : Number(novoCusto.valor), data: todayISO(),
    });
    setNovoCusto({ descricao: "", categoria: CATEGORIAS_DESPESA[0], valor: "" });
  };

  const gerarPagamentos = () => {
    if (!local.valorAdjudicado) return;
    const v = Number(local.valorAdjudicado);
    const pagamentos = [
      { label: "Adjudicação (40%)", valor: +(v * 0.4).toFixed(2), data: "", pago: false },
      { label: "Início de obra (40%)", valor: +(v * 0.4).toFixed(2), data: "", pago: false },
      { label: "Conclusão (20%)", valor: +(v * 0.2).toFixed(2), data: "", pago: false },
    ];
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
    if (idx === 0 && pagamentos[0].pago && local.estado === "aceite") {
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
      data: novoPagamento.data || "", pago: false,
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Valor orçamentado (ex-IVA)">
              <input type="number" style={inputStyle} value={local.valorOrcamento ?? ""} onChange={(e) => set({ valorOrcamento: e.target.value === "" ? null : e.target.value })} onBlur={() => commit({ valorOrcamento: local.valorOrcamento })} />
            </Field>
            <Field label="Valor adjudicado (ex-IVA)">
              <input type="number" style={inputStyle} value={local.valorAdjudicado ?? ""} onChange={(e) => set({ valorAdjudicado: e.target.value === "" ? null : e.target.value })} onBlur={() => commit({ valorAdjudicado: local.valorAdjudicado })} />
            </Field>
          </div>

          <CutDivider label="Custos da Obra & Margem Real" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {custosObra.length === 0 && <div style={{ fontSize: 12, opacity: 0.55 }}>Sem custos registados para esta obra.</div>}
            {custosObra.map((c) => (
              <div key={c.id} style={{
                display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) minmax(0,0.8fr) auto", gap: 8, alignItems: "center",
                padding: "7px 10px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 4, fontSize: 13,
              }}>
                <input style={{ ...inputStyle, fontSize: 12 }} value={c.descricao} onChange={(e) => onUpdateDespesa(c.id, { descricao: e.target.value })} />
                <select style={{ ...selectStyle, fontSize: 12 }} value={c.categoria} onChange={(e) => onUpdateDespesa(c.id, { categoria: e.target.value })}>
                  {CATEGORIAS_DESPESA.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <input type="number" style={{ ...inputStyle, fontSize: 12 }} value={c.valor ?? ""} onChange={(e) => onUpdateDespesa(c.id, { valor: e.target.value === "" ? null : Number(e.target.value) })} placeholder="€" />
                <button onClick={() => onDeleteDespesa(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.rust }}><Trash2 size={13} /></button>
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) minmax(0,0.8fr) auto", gap: 8 }}>
              <input style={inputStyle} placeholder="Descrição do custo" value={novoCusto.descricao} onChange={(e) => setNovoCusto((s) => ({ ...s, descricao: e.target.value }))} />
              <select style={selectStyle} value={novoCusto.categoria} onChange={(e) => setNovoCusto((s) => ({ ...s, categoria: e.target.value }))}>
                {CATEGORIAS_DESPESA.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <input type="number" style={inputStyle} placeholder="€" value={novoCusto.valor} onChange={(e) => setNovoCusto((s) => ({ ...s, valor: e.target.value }))} />
              <Btn small icon={Plus} onClick={addCusto}>Add</Btn>
            </div>
            {(custosObra.length > 0 || local.valorAdjudicado) && (
              <div style={{ display: "flex", gap: 16, marginTop: 8, padding: "10px 12px", background: T.paper3, borderRadius: 4, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", opacity: 0.6, fontWeight: 600 }}>Total de custos</div>
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

          {COM_PAGAMENTOS_KEYS.includes(local.estado) && (
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
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "auto minmax(0,1.4fr) minmax(0,0.8fr) minmax(0,0.9fr) auto",
                      gap: 8, alignItems: "center", padding: "7px 10px",
                      background: p.pago ? "rgba(73,107,60,0.12)" : T.paper2, borderRadius: 4,
                      border: `1px solid ${T.line}`, fontSize: 13,
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
                <a href={a.url} target="_blank" rel="noreferrer" style={{ flex: 1, color: T.ink, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
function NovaObraModal({ onClose, onCreate, suggestedRef, clientesNomes }) {
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
function Painel({ obras, onOpen }) {
  const kpis = useMemo(() => {
    const emPipeline = obras.filter((o) => ACTIVE_KEYS.includes(o.estado));
    const valorPipeline = emPipeline.reduce((s, o) => s + (Number(o.valorOrcamento) || 0), 0);
    const adjudicadas = obras.filter((o) => WON_KEYS.includes(o.estado));
    const rejeitadas = obras.filter((o) => LOST_KEYS.includes(o.estado));
    const taxaConversao = (adjudicadas.length + rejeitadas.length) > 0
      ? Math.round((adjudicadas.length / (adjudicadas.length + rejeitadas.length)) * 100) : 0;
    const emProducao = obras.filter((o) => o.estado === "producao").length;
    const valorAdjudicadoTotal = adjudicadas.reduce((s, o) => s + (Number(o.valorAdjudicado) || 0), 0);
    return { emPipelineCount: emPipeline.length, valorPipeline, taxaConversao, emProducao, valorAdjudicadoTotal, adjudicadasCount: adjudicadas.length, rejeitadasCount: rejeitadas.length };
  }, [obras]);

  const acoesPendentes = useMemo(() => {
    return obras
      .filter((o) => o.proximaAcaoData && !["concluido", ...REJECTED_KEYS].includes(o.estado))
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
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, minmax(0, 1fr))`, gap: 8, paddingBottom: 14 }}>
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
                    {(o.valorOrcamento || o.valorAdjudicado) && (
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, fontWeight: 600, marginTop: 6, color: T.walnutDark }}>
                        {fmtEUR(o.valorAdjudicado || o.valorOrcamento)}
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
function Financeiro({ obras, despesas, onAddDespesa, onUpdateDespesa, onDeleteDespesa }) {
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

  // Uma despesa "Mensal" aplica-se a partir do mês em que foi lançada e
  // continua todos os meses seguintes — não é preciso lançá-la todo mês
  // à mão. Uma despesa não-mensal só conta no seu próprio mês.
  const despesaValorNoMes = (d, mesKey) => {
    if (!d.data || d.valor == null) return 0;
    const mesInicio = d.data.slice(0, 7);
    if (d.recorrente) return mesKey >= mesInicio ? Number(d.valor) || 0 : 0;
    return mesInicio === mesKey ? Number(d.valor) || 0 : 0;
  };

  const custosPorObra = useMemo(() => {
    const map = {};
    despesas.filter((d) => d.obraId).forEach((d) => { map[d.obraId] = (map[d.obraId] || 0) + (Number(d.valor) || 0); });
    return map;
  }, [despesas]);

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
    const despesasObra = despesas.filter((d) => d.obraId);
    return mesesSelecionados.map((mesKey) => {
      const receita = obras.filter((o) => WON_KEYS.includes(o.estado)).reduce((s, o) => {
        const d = o.dataAdjudicacao || o.dataInicioObra || o.dataEntrada;
        return d && d.slice(0, 7) === mesKey ? s + (Number(o.valorAdjudicado) || 0) : s;
      }, 0);
      const despesaGeral = despesasGerais.reduce((s, d) => s + despesaValorNoMes(d, mesKey), 0);
      const despesaObra = despesasObra.reduce((s, d) => s + despesaValorNoMes(d, mesKey), 0);
      return { mes: monthLabel(mesKey), receita, despesa: despesaGeral + despesaObra, despesaGeral, despesaObra };
    });
  }, [obras, despesas, despesasGerais, mesesSelecionados]);

  const despesasPorCategoria = useMemo(() => {
    const map = {};
    despesas.forEach((d) => {
      const total = mesesSelecionados.reduce((s, mesKey) => s + despesaValorNoMes(d, mesKey), 0);
      if (total > 0) map[d.categoria] = (map[d.categoria] || 0) + total;
    });
    return Object.entries(map).map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor);
  }, [despesas, mesesSelecionados]);

  const CATEGORIA_CORES = [T.walnut, T.amber, T.navy, T.green, T.rust, "#8A6A1E", "#5C6B8A", "#6B7F3E", "#3D4F44"];

  const custosFixosMensais = useMemo(
    () => despesasGerais.filter((d) => d.recorrente).reduce((s, d) => s + (Number(d.valor) || 0), 0),
    [despesasGerais]
  );

  const totais = useMemo(() => {
    const won = obras.filter((o) => WON_KEYS.includes(o.estado));
    const valorPeriodo = dadosMensais.reduce((s, m) => s + m.receita, 0);
    const pipeline = obras.filter((o) => ACTIVE_KEYS.includes(o.estado)).reduce((s, o) => s + (Number(o.valorOrcamento) || 0), 0);
    const noPeriodo = (o) => mesesSelecionadosSet.has((o.dataEntrada || "").slice(0, 7));
    const rejeitadoValor = obras.filter((o) => LOST_KEYS.includes(o.estado) && noPeriodo(o)).reduce((s, o) => s + (Number(o.valorOrcamento) || 0), 0);
    const recusadoPorNosValor = obras.filter((o) => o.estado === "rejeitado_nos" && noPeriodo(o)).reduce((s, o) => s + (Number(o.valorOrcamento) || 0), 0);

    let pendente = 0, recebido = 0;
    won.forEach((o) => (o.pagamentos || []).forEach((p) => { if (p.pago) recebido += p.valor; else pendente += p.valor; }));

    const totalDespesasGeraisAno = dadosMensais.reduce((s, m) => s + m.despesaGeral, 0);
    const totalCustosObrasAno = dadosMensais.reduce((s, m) => s + m.despesaObra, 0);
    const custosTotaisAno = totalDespesasGeraisAno + totalCustosObrasAno;
    const lucroLiquido = valorPeriodo - custosTotaisAno;
    const margemLiquidaPct = valorPeriodo > 0 ? (lucroLiquido / valorPeriodo) * 100 : null;

    return { valorAno: valorPeriodo, pipeline, rejeitadoValor, recusadoPorNosValor, pendente, recebido, totalCustosObrasAno, totalDespesasGeraisAno, custosTotaisAno, lucroLiquido, margemLiquidaPct };
  }, [obras, dadosMensais, mesesSelecionadosSet]);

  // Mesmo número de meses, imediatamente antes do período escolhido —
  // para comparar "este mês/trimestre/ano" com o anterior equivalente.
  const mesesAnteriores = useMemo(() => {
    const n = mesesSelecionados.length;
    return Array.from({ length: n }, (_, i) => addMonths(mesesSelecionados[0], -n + i));
  }, [mesesSelecionados]);

  const totaisAnteriores = useMemo(() => {
    const despesasObra = despesas.filter((d) => d.obraId);
    let receita = 0, despesaGeral = 0, despesaObra = 0;
    mesesAnteriores.forEach((mesKey) => {
      receita += obras.filter((o) => WON_KEYS.includes(o.estado)).reduce((s, o) => {
        const d = o.dataAdjudicacao || o.dataInicioObra || o.dataEntrada;
        return d && d.slice(0, 7) === mesKey ? s + (Number(o.valorAdjudicado) || 0) : s;
      }, 0);
      despesaGeral += despesasGerais.reduce((s, d) => s + despesaValorNoMes(d, mesKey), 0);
      despesaObra += despesasObra.reduce((s, d) => s + despesaValorNoMes(d, mesKey), 0);
    });
    const despesaTotal = despesaGeral + despesaObra;
    const lucro = receita - despesaTotal;
    return { receita, despesaTotal, lucro, margemPct: receita > 0 ? (lucro / receita) * 100 : null };
  }, [obras, despesas, despesasGerais, mesesAnteriores]);

  // Concentração de clientes: quanto da receita do período vem de cada
  // cliente. Se um só cliente domina, é um risco a vigiar.
  const concentracaoClientes = useMemo(() => {
    const map = {};
    obras.filter((o) => WON_KEYS.includes(o.estado)).forEach((o) => {
      const d = o.dataAdjudicacao || o.dataInicioObra || o.dataEntrada;
      if (!d || !mesesSelecionadosSet.has(d.slice(0, 7))) return;
      map[o.cliente] = (map[o.cliente] || 0) + (Number(o.valorAdjudicado) || 0);
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
      const saidas = despesasGerais.reduce((s, d) => s + despesaValorNoMes(d, mk), 0);
      acumulado += entradas - saidas;
      return { mes: monthLabel(mk), entradas, saidas, saldo: entradas - saidas, acumulado };
    });
  }, [obras, despesasGerais]);

  const pagamentosPendentes = useMemo(() => {
    const list = [];
    obras.filter((o) => WON_KEYS.includes(o.estado)).forEach((o) => {
      (o.pagamentos || []).forEach((p, idx) => {
        if (!p.pago) list.push({ obraId: o.id, projeto: o.projeto, cliente: o.cliente, ...p, idx });
      });
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
    return list;
  }, [totais, custosFixosMensais, concentracaoClientes, pagamentosPendentes, mesesSelecionados, periodoLabel]);

  const lucroPorObra = useMemo(() => {
    return obras
      .filter((o) => o.valorAdjudicado)
      .map((o) => {
        const custos = custosPorObra[o.id] || 0;
        const valor = Number(o.valorAdjudicado);
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
        <KpiCard icon={Euro} label={`Adjudicado — ${periodoLabel}`} value={fmtEUR(totais.valorAno)} accent={T.green}
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
        <KpiCard icon={Clock} label="Por receber" value={fmtEUR(totais.pendente)} sub="Pagamentos pendentes" accent={T.amber} />
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
                  {(o.valorAdjudicado || o.valorOrcamento) && (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: T.walnutDark, whiteSpace: "nowrap" }}>
                      {fmtEUR(o.valorAdjudicado || o.valorOrcamento)}
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
      if (WON_KEYS.includes(o.estado)) { e.ganhas += 1; e.valorAdjudicado += Number(o.valorAdjudicado) || 0; }
      if (LOST_KEYS.includes(o.estado)) e.rejeitadas += 1;
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
function FornecedorModal({ fornecedor, onClose, onUpdate, onDelete }) {
  const [local, setLocal] = useState(fornecedor);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [categoriasTexto, setCategoriasTexto] = useState((fornecedor.categorias || []).join(", "));
  const [novoMaterial, setNovoMaterial] = useState({ ref: "", preco: "" });

  useEffect(() => { setLocal(fornecedor); setCategoriasTexto((fornecedor.categorias || []).join(", ")); }, [fornecedor]);

  const set = (patch) => setLocal((l) => ({ ...l, ...patch }));
  const commit = (patch) => { set(patch); onUpdate(fornecedor.id, patch); };

  const commitCategorias = () => {
    const categorias = categoriasTexto.split(",").map((c) => c.trim()).filter(Boolean);
    commit({ categorias });
  };

  const addMaterial = () => {
    if (!novoMaterial.ref.trim()) return;
    const materiais = [...(local.materiais || []), { ...novoMaterial }];
    commit({ materiais });
    setNovoMaterial({ ref: "", preco: "" });
  };
  const removeMaterial = (idx) => {
    const materiais = local.materiais.filter((_, i) => i !== idx);
    commit({ materiais });
  };

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

          <CutDivider label="Referências de preço (opcional)" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(local.materiais || []).length === 0 && <div style={{ fontSize: 12, opacity: 0.55 }}>Sem referências de preço registadas.</div>}
            {(local.materiais || []).map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 4, fontSize: 13 }}>
                <span style={{ flex: 1 }}>{m.ref}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: T.walnutDark }}>{m.preco}</span>
                <button onClick={() => removeMaterial(i)} style={{ background: "none", border: "none", cursor: "pointer", color: T.rust }}><Trash2 size={13} /></button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} placeholder="Material / referência" value={novoMaterial.ref} onChange={(e) => setNovoMaterial((s) => ({ ...s, ref: e.target.value }))} />
              <input style={{ ...inputStyle, width: 120 }} placeholder="Preço" value={novoMaterial.preco} onChange={(e) => setNovoMaterial((s) => ({ ...s, preco: e.target.value }))} />
              <Btn small icon={Plus} onClick={addMaterial}>Adicionar</Btn>
            </div>
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
function Fornecedores({ fornecedores, onAdd, onUpdate, onDelete }) {
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

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
          const temPrecos = (f.materiais || []).length > 0;
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
              {temPrecos && (
                <div style={{ marginTop: 10, borderTop: `1px dashed ${T.line}`, paddingTop: 8 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpandedId(expanded ? null : f.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: T.walnutDark, fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, padding: 0 }}
                  >
                    {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {expanded ? "Ocultar" : "Ver"} referências de preço ({f.materiais.length})
                  </button>
                  {expanded && (
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                      {f.materiais.map((m, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                          <span style={{ opacity: 0.75 }}>{m.ref}</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: T.walnutDark }}>{m.preco}</span>
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

      {selected && <FornecedorModal key={selected.id} fornecedor={selected} onClose={() => setSelectedId(null)} onUpdate={onUpdate} onDelete={onDelete} />}
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
  const { fornecedores, addFornecedor, updateFornecedor, deleteFornecedor } = useFornecedoresStore();
  const { despesas, addDespesa, updateDespesa, deleteDespesa } = useDespesasStore();
  const { clientes, addCliente, updateCliente, deleteCliente, syncCliente } = useClientesStore();
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
      <div style={{ padding: "24px", maxWidth: tab === "pipeline" ? "none" : 1200, margin: "0 auto" }}>
        {tab === "painel" && <Painel obras={obras} onOpen={setSelectedId} />}
        {tab === "pipeline" && <Pipeline obras={obras} onOpen={setSelectedId} onChangeEstado={changeEstado} />}
        {tab === "obras" && <ObrasTab obras={obras} onOpen={setSelectedId} onNew={() => setNovaObraOpen(true)} />}
        {tab === "financeiro" && <Financeiro obras={obras} despesas={despesas} onAddDespesa={addDespesa} onUpdateDespesa={updateDespesa} onDeleteDespesa={deleteDespesa} />}
        {tab === "clientes" && <Clientes obras={obras} clientes={clientes} onAddCliente={addCliente} onUpdateCliente={updateCliente} onDeleteCliente={deleteCliente} onOpenObra={setSelectedId} />}
        {tab === "fornecedores" && <Fornecedores fornecedores={fornecedores} onAdd={addFornecedor} onUpdate={updateFornecedor} onDelete={deleteFornecedor} />}
      </div>

      {selected && (
        <ObraModal key={selected.id} obra={selected} onClose={() => setSelectedId(null)} onUpdate={updateObra} onChangeEstado={changeEstado} onAddHistorico={addHistorico} onDelete={deleteObra} fornecedorNomes={fornecedores.map((f) => f.nome)} despesas={despesas} onAddDespesa={addDespesa} onUpdateDespesa={updateDespesa} onDeleteDespesa={deleteDespesa} onSyncCliente={syncCliente} clientesNomes={clientesNomesUnicos} />
      )}
      {novaObraOpen && (
        <NovaObraModal suggestedRef={nextRef(obras)} onClose={() => setNovaObraOpen(false)} onCreate={addObra} clientesNomes={clientesNomesUnicos} />
      )}
    </div>
  );
}
