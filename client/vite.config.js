import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API = process.env.VITE_API_TARGET || "http://localhost:4000";

// The spec endpoints live at the API root, so each prefix is proxied by name —
// that keeps the console calling the exact documented paths.
//
// This list must gain an entry for every new top-level path prefix. Missing one
// breaks that panel in `npm run dev` ONLY: the deployed console is served by
// express.static from the API's own origin, so no proxy is involved there and
// the gap stays invisible until someone runs locally. `/recharge` was missed
// when UC2 shipped for exactly that reason.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4200,
    proxy: {
      "/account": API,
      "/recharge": API,
      "/plan": API,
      "/notification": API,
      "/service": API,
      "/sim": API,
      "/ticket": API,
      "/demo": API,
    },
  },
});
