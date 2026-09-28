import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@/": fileURLToPath(new URL("./src/", import.meta.url)),
      "@engine/": fileURLToPath(new URL("./supabase/functions/_shared/engine/", import.meta.url)),
    },
  },
  test: { environment: "node" },
});
