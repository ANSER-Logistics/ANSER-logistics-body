// Postgres thật chạy trong tiến trình (PGlite, WASM) — thay cho `@/server/db/client`
// khi test. Không cần Neon, Docker hay mạng; mỗi file test có một database riêng
// đã chạy đủ migration trong `src/server/db/migrations`.
//
// Cách dùng trong file test:
//
//   vi.mock("@/server/db/client", () => import("@test/db"));
//   import { resetDb } from "@test/db";
//   beforeEach(resetDb);
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import * as schema from "@/server/db/schema";

export const client = new PGlite();
export const db = drizzle(client, { schema });

await migrate(db, {
  migrationsFolder: fileURLToPath(new URL("../src/server/db/migrations", import.meta.url)),
});

/** Xoá sạch dữ liệu mọi bảng (giữ cấu trúc) — gọi trong `beforeEach`. */
export async function resetDb() {
  const { rows } = await client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  if (rows.length === 0) return;
  await client.exec(`truncate ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`);
}
