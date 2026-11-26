import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@test": fileURLToPath(new URL("./test", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // test/ phản chiếu cấu trúc src/: src/server/auth.ts → test/server/auth.test.ts.
    include: ["test/**/*.test.ts"],
    // Mỗi file test dựng một Postgres PGlite riêng và chạy đủ migration — lần đầu
    // nạp WASM có thể quá 5s mặc định trên máy chậm.
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/server/**/*.ts"],
      exclude: [
        "src/server/db/migrations/**",
        // Khai báo bảng, không có logic để test.
        "src/server/db/schema.ts",
        // Test thay file này bằng PGlite (test/db.ts) — đo nó chỉ ra 0% vô nghĩa.
        "src/server/db/client.ts",
      ],
      reporter: ["text-summary", "text", "html"],
      thresholds: {
        // Sàn toàn cục, không phải mục tiêu: hiện có ~79% dòng, 83% nhánh, 76% hàm. Để thấp hơn
        // vài điểm vì sales/products/inventory/reports đang được viết lại và chưa có test —
        // code mới ở đó không nên làm đỏ ngay. Khi các file đó có test: nâng lên ~85–90.
        lines: 72,
        statements: 72,
        functions: 70,
        branches: 78,
        // Phần ĐÃ có test thì giữ ở mức gần 100%: code mới ở đây phải kèm test.
        "src/server/import/**": { lines: 95, statements: 95, functions: 95, branches: 90 },
        "src/server/{auth,session,brain,brainReport,n8n,n8nApi,uploadGuard}.ts": {
          lines: 95,
          statements: 95,
          functions: 95,
          branches: 90,
        },
        "src/server/store/{customers,users,employees,warehouses,settings,categories,automation,seed,inventoryCost,inventoryCostMatch,inventoryCostImport}.ts":
          { lines: 95, statements: 95, functions: 95, branches: 90 },
      },
    },
  },
});
