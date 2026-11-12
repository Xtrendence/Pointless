import { defineConfig, loadEnv } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";

// Served from https://xtrendence.github.io/Pointless/ in production
export default defineConfig(({ command, mode }) => ({
  base: command === "build" ? "/Pointless/" : "/",
  define: {
    // From .env locally, or the build environment (e.g. a GitHub Actions secret).
    // When set, the Linear import is shown, and the key ends up in the public
    // bundle: anyone who can load the site can read it.
    __LINEAR_API_KEY__: JSON.stringify(loadEnv(mode, process.cwd(), "").LINEAR_API_KEY ?? ""),
  },
  plugins: [preact(), tailwindcss()],
}));
