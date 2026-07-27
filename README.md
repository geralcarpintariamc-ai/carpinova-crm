# Carpinova CRM

CRM interno para controlo de obras, orçamentos, pipeline, financeiro e
fornecedores da Carpinova. Feito para correr no GitHub Pages, com os dados
sincronizados em tempo real entre computadores através do Supabase.

## 1. Criar a base de dados (Supabase)

1. Cria uma conta gratuita em https://supabase.com e cria um novo projeto.
2. No projeto, vai a **SQL Editor > New query**, cola o conteúdo de
   `supabase/schema.sql` e corre (**Run**). Isto cria a tabela `obras`,
   ativa o acesso necessário e liga o tempo real.
3. Vai a **Project Settings > API**. Vais precisar de dois valores:
   - **Project URL** (algo como `https://xxxxx.supabase.co`)
   - **anon public key** (uma chave longa) — esta é segura para usar no
     frontend, não é a `service_role`.

## 2. Ligar o site a essa base de dados

Tens duas formas de configurar as variáveis `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY`:

**Para publicar no GitHub Pages (via GitHub Actions, já configurado):**

No repositório GitHub, vai a **Settings > Secrets and variables > Actions**
e cria dois "Repository secrets":
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

O workflow em `.github/workflows/deploy.yml` já está pronto para os usar
automaticamente sempre que fizeres `git push` para `main`.

**Para testar no teu computador antes de publicar:**

Copia `.env.example` para `.env` e preenche os dois valores:

```
cp .env.example .env
```

## 3. Publicar no GitHub Pages

1. `git init` (se ainda não fizeste), `git add .`, `git commit -m "CRM inicial"`.
2. `git remote add origin https://github.com/<o-teu-utilizador>/carpinova-crm.git`
3. `git push -u origin main`
4. No GitHub, vai a **Settings > Pages** e em "Build and deployment" escolhe
   **GitHub Actions** como fonte (não "Deploy from a branch").
5. Espera pelo workflow terminar (separador **Actions** do repo) — o site
   fica disponível em `https://<o-teu-utilizador>.github.io/carpinova-crm/`.

Sempre que fizeres `git push` com alterações ao código, o site é
republicado automaticamente.

## 4. Desenvolvimento local

```
npm install
npm run dev
```

Abre o endereço que aparecer no terminal (normalmente
`http://localhost:5173`).

## Notas importantes

- **Sem autenticação de utilizador.** Quem tiver o URL do site e souber
  onde está a `anon key` (visível no código publicado) consegue ler e
  escrever nos dados. Para duas pessoas de confiança isto é aceitável,
  mas não partilhes o link publicamente. Se um dia quiseres uma password
  de acesso, dá um grito que adicionamos isso a seguir.
- **Sincronização em tempo real.** Cada obra é gravada como uma linha
  independente na base de dados — se um computador editar a obra A e o
  outro a obra B ao mesmo tempo, não há conflito. Se os dois editarem a
  *mesma* obra ao mesmo minuto, ganha a última gravação.
- **Base de dados vazia da primeira vez** é semeada automaticamente com o
  histórico do `Orçamentos_2026.xlsx` (37 registos). Isto só acontece uma
  vez — depois disso, os dados vivem no Supabase.
