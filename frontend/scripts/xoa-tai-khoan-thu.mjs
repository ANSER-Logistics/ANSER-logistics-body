/**
 * Xoá tài khoản thử do phiên test nội bộ tạo ra.
 *
 * Route DELETE /api/users/[id] đòi quyền admin (đúng), nên tài khoản vừa đăng ký
 * không tự xoá được. Script này đi thẳng vào DB bằng đúng driver ứng dụng dùng.
 *
 *     node scripts/xoa-tai-khoan-thu.mjs "anser-test-...@example.invalid"
 *
 * CHỈ xoá được email khớp khuôn tài khoản thử. Không cho xoá tài khoản thật —
 * một script xoá người dùng mà nhận email tuỳ ý là thứ không nên tồn tại.
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

// Khuôn email của tài khoản thử. Ràng buộc này là toàn bộ lớp an toàn của
// script: một script xoá người dùng mà nhận email tuỳ ý thì không nên tồn tại.
const KHUON_SQL = "anser-test-%@example.invalid";
const KHUON = /^anser-test-\d+@example\.invalid$/;

const email = process.argv[2];
if (email && !KHUON.test(email)) {
  console.error(`Từ chối: '${email}' không đúng khuôn tài khoản thử (anser-test-<số>@example.invalid).`);
  process.exit(2);
}

// Đọc .env.local trực tiếp — script chạy ngoài Next nên không có sẵn env.
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((d) => d.trim() && !d.trim().startsWith("#") && d.includes("="))
    .map((d) => {
      const i = d.indexOf("=");
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
    }),
);

const sql = neon(env.DATABASE_URL);

// Không truyền email thì quét theo khuôn — dọn được cả tài khoản của phiên
// trước mà không cần nhớ email đã sinh ra.
const truoc = email
  ? await sql`SELECT id, email FROM users WHERE email = ${email}`
  : await sql`SELECT id, email FROM users WHERE email LIKE ${KHUON_SQL}`;

if (truoc.length === 0) {
  console.log("Không có tài khoản thử nào — không cần xoá.");
  process.exit(0);
}
console.log("Sẽ xoá:");
for (const u of truoc) console.log("   ", u.email, u.id);

if (email) {
  await sql`DELETE FROM users WHERE email = ${email}`;
} else {
  await sql`DELETE FROM users WHERE email LIKE ${KHUON_SQL}`;
}

const sau = await sql`SELECT id FROM users WHERE email LIKE ${KHUON_SQL}`;
console.log(sau.length === 0 ? "ĐÃ XOÁ SẠCH." : `VẪN CÒN ${sau.length} — kiểm bằng tay.`);
process.exit(sau.length === 0 ? 0 : 1);
