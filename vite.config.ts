import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";

// Served from https://xtrendence.github.io/Pointless/ in production
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/Pointless/" : "/",
  plugins: [preact(), tailwindcss()],
}));
