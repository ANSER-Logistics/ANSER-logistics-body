<!-- Tiêu đề PR theo Conventional Commits: feat|fix|docs|refactor|test|chore|build|ci|perf(scope): tóm tắt -->

## Thay đổi gì, vì sao

<!-- 1–3 câu. Vì sao quan trọng hơn là sửa file nào. -->

Closes #

## Cách kiểm tra

<!-- Lệnh đã chạy, trang đã bấm thử, hoặc test nào chứng minh. -->

## Trước khi xin review

- [ ] `pnpm lint && pnpm format:check && npx tsc --noEmit && pnpm test` đều qua
- [ ] Có test trong `frontend/test/` cho logic mới. Lỗi thấy mà chưa sửa thì ghi `it.todo("BUG: …")`
- [ ] Route mới có kiểm đăng nhập (`getSessionUser()` → 401) và quyền (→ 403)
- [ ] Không commit bí mật (`.env.local`, token). `git add <file>`, không `git add .`
- [ ] Không kèm file chỉ khác line ending, không đụng file trong `frontend/.prettierignore`
- [ ] Sửa hành vi hoặc cấu trúc thì đã cập nhật tài liệu trong `docs/` (và `AGENTS.md` nếu đổi quy tắc)

**Nếu đụng tồn kho, tiền, hoá đơn hoặc dữ liệu nhập từ Excel** — đối chiếu "Data invariants" trong `AGENTS.md`: `quantity` có dấu, `NULL` ≠ 0, `unit_cost` luôn là giá vốn, không ép `numeric` về số nguyên, ghi nhiều bảng trong `db.transaction`, AI không tự tính tiền.

**Nếu có migration mới** (`pnpm db:generate`):

- [ ] Đã báo cả nhóm trước khi sinh (hai nhánh cùng sinh `00NN_*.sql` sẽ làm hỏng `_journal.json`)
- [ ] Đã đọc file SQL từng dòng và so với `schema.ts` (drizzle-kit từng bỏ sót ràng buộc `CHECK`)
- [ ] Không sửa migration đã áp dụng, không chạy lên Neon `production`
