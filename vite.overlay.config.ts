import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
  root: "overlay",
  plugins: [react()],
  base: "/overlay/",
  build: {
    outDir: "../dist/overlay",
    emptyOutDir: true,
  },
});
