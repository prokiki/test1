import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ⚠️ base 要写成你的仓库名，比如 /math-worksheet/
export default defineConfig({
  plugins: [react()],
  base: "/test1/"
});
