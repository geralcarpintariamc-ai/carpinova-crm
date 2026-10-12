// Lê a caixa de correio (IMAP) e guarda no CRM só os emails de cotação/orçamento.
// Corre sozinho a cada ~10 min via GitHub Actions. Nunca apaga nem move emails.
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { relevante, ligarObra } from "./emailLogic.mjs";

const need = (k) => { if (!process.env[k]) { console.error(`Falta o segredo ${k}`); process.exit(1); } return process.env[k]; };
const supabase = createClient(need("SUPABASE_URL"), need("SUPABASE_SECRET_KEY"), { auth: { persistSession: false } });
const DIAS = parseInt(process.env.EMAIL_DIAS || "10", 10);       // janela de pesquisa em cada execução
const MAX_ANEXO = 10 * 1024 * 1024;                              // anexos até 10 MB
const EXT_OK = /\.(pdf|png|jpe?g|xlsx?|docx?|dwg|dxf|zip|skp)$/i;

const { data: obrasRows, error: eObras } = await supabase.from("obras").select("id, payload");
if (eObras) { console.error("Erro a ler obras:", eObras); process.exit(1); }
const obras = obrasRows.map((r) => ({ id: r.id, ...r.payload }));

// Uma ou duas contas de email (o mesmo servidor). A 2.ª é opcional.
const contas = [
  { user: need("IMAP_USER"), pass: need("IMAP_PASS") },
  ...(process.env.IMAP_USER_2 && process.env.IMAP_PASS_2 ? [{ user: process.env.IMAP_USER_2, pass: process.env.IMAP_PASS_2 }] : []),
];
const minhasContas = contas.map((c) => c.user.toLowerCase());
const desde = new Date(Date.now() - DIAS * 86400000);
let novos = 0, vistos = 0;

for (const conta of contas) {
  const client = new ImapFlow({
    host: need("IMAP_HOST"), port: parseInt(process.env.IMAP_PORT || "993", 10), secure: process.env.IMAP_SECURE !== "false",
    auth: { user: conta.user, pass: conta.pass }, logger: false,
  });
  try {
    await client.connect();
  } catch (e) {
    console.error(`Não consegui entrar numa das contas (verifica utilizador e palavra-passe): ${e.responseText || e.message}`);
    process.exitCode = 1;
    continue;
  }

  const pastas = async () => {
    const lista = await client.list();
    const sel = [];
    const inbox = lista.find((l) => l.path.toUpperCase() === "INBOX");
    if (inbox) sel.push({ path: inbox.path, direcao: "entrada" });
    const sent = lista.find((l) => l.specialUse === "\\Sent") || lista.find((l) => /(^|\.|\/)sent( items| messages)?$|enviad/i.test(l.path));
    if (sent) sel.push({ path: sent.path, direcao: "saida" });
    return sel;
  };

  for (const { path, direcao } of await pastas()) {
    const lock = await client.getMailboxLock(path);
    try {
      const uids = await client.search({ since: desde }, { uid: true });
      for (const uid of uids || []) {
        vistos++;
        const msg = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const mail = await simpleParser(msg.source);
        const assunto = mail.subject || "";
        const texto = (mail.text || "").trim();
        if (!relevante({ assunto, texto })) continue;

        const msgId = mail.messageId || `${conta.user}:${path}:${uid}`;
        const id = "em_" + crypto.createHash("sha1").update(msgId).digest("hex").slice(0, 24);

        const { data: existe } = await supabase.from("emails").select("id").eq("id", id).maybeSingle();
        if (existe) continue; // já importado — nunca sobrepor o que o utilizador classificou

        const de = mail.from?.value?.[0] || {};
        const para = (mail.to?.value || []).concat(mail.cc?.value || []);
        const enderecos = [de.address, ...para.map((p) => p.address)].filter(Boolean).filter((a) => !minhasContas.includes(a.toLowerCase()));
        const lig = ligarObra({ assunto, texto, enderecos }, obras);

        const anexos = [];
        for (const a of mail.attachments || []) {
          if (a.contentDisposition === "inline" && !a.filename) continue;
          const nome = a.filename || "anexo";
          if (!EXT_OK.test(nome) || a.size > MAX_ANEXO) continue;
          const caminho = `emails/${id}/${Date.now()}_${nome.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          const { error: eUp } = await supabase.storage.from("anexos").upload(caminho, a.content, { contentType: a.contentType });
          if (!eUp) anexos.push({ nome, path: caminho, tamanho: a.size });
        }

        const payload = {
          direcao, conta: conta.user, assunto, de: de.name || de.address || "", deEmail: de.address || "",
          para: para.map((p) => p.address).filter(Boolean),
          data: (mail.date || new Date()).toISOString(), texto: texto.slice(0, 20000),
          anexos, obraId: null, ligadoPor: null,
          sugestaoObraId: lig.obraId, sugestaoMotivo: lig.motivo, // só sugestão: a ligação é sempre confirmada por uma pessoa
          estado: "novo",
        };
        const { error } = await supabase.from("emails").insert({ id, payload, updated_at: new Date().toISOString() });
        if (error) { console.error("Erro a guardar email:", error.message); continue; }
        novos++; // não escrever assuntos nem remetentes nos registos: o repositório é público e os registos também
      }
    } finally {
      lock.release();
    }
  }
  await client.logout();
}
console.log(`Concluído. Contas: ${contas.length}. Emails analisados: ${vistos}. Novos no CRM: ${novos}.`);
