import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

/** WKWebView often skips CSS HMR; full reload makes token edits in global.css show up reliably. */
function reloadOnCssChange(): Plugin {
  return {
    name: "reload-on-css-change",
    handleHotUpdate({ file, server }) {
      if (file.endsWith(".css")) {
        server.ws.send({ type: "full-reload" });
        return [];
      }
    },
  };
}

export default defineConfig(async () => ({
  plugins: [react(), reloadOnCssChange()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
