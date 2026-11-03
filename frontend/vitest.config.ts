import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Mỗi file test dựng một Postgres PGlite riêng và chạy đủ migration — lần đầu
    // nạp WASM có thể quá 5s mặc định trên máy chậm.
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/server/**/*.ts"],
      exclude: ["src/server/db/migrations/**", "src/**/*.test.ts"],
      reporter: ["text-summary", "text", "html"],
    },
  },
});
