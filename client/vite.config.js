import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API = process.env.VITE_API_TARGET || "http://localhost:4000";

// The spec endpoints live at the API root, so each one is proxied by name —
// that keeps the console calling the exact documented paths.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4200,
    proxy: {
      "/account": API,
      "/ticket": API,
      "/demo": API,
    },
  },
});
