import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` relativo ("./") faz o mesmo build funcionar em localhost, em
// https://usuario.github.io/repositorio/ e num pacote local, sem conhecer o subdiretório.
// Pode ser sobrescrito com VITE_BASE (ex.: "/Geologar-BegeBahia/") se algum target exigir base absoluta.
export default defineConfig({
  base: process.env.VITE_BASE ?? "./",
  plugins: [react()],
  build: {
    target: "es2022",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
  server: { host: true },
  preview: { host: true },
});
