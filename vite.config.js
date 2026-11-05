import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// VITE_BASE permite mudar de alojamento sem tocar no código (GitHub Pages usa /carpinova-crm/).
export default defineConfig({ plugins: [react()], base: process.env.VITE_BASE || "/carpinova-crm/" });
