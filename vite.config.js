import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// O "base" tem de corresponder ao nome do repositório no GitHub
// (https://<utilizador>.github.io/carpinova-crm/). Se mudares o nome do
// repo, atualiza aqui também.
export default defineConfig({
  plugins: [react()],
  base: "/carpinova-crm/",
});
