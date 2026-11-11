# Quy chuẩn Git

> Cập nhật 01/11/2026
> Áp dụng cho mọi thành viên, và cho cả code/commit do AI assistant (Claude Code, Copilot…)
> tạo ra — người bấm commit là người chịu trách nhiệm.
>
> Cách tạo branch từng bước: xem `docs/tasks/Backend_Task_Board_1Nov26.md` §2.1.

## 1. Commit nhỏ, commit thường xuyên

Mỗi commit chỉ chứa **một thay đổi nhỏ, có ý nghĩa riêng**. Gom nhiều file vào một commit là được, nếu chúng cùng phục vụ một việc — nhưng khi tách được, hãy tách.

Lý do:

- **Lịch sử dễ đọc.** Sáu tháng sau, `git log` cho biết từng bước đã làm gì và vì sao, thay vì một commit "thêm tính năng X" dài 2000 dòng.
- **Dễ hoàn tác.** Một commit nhỏ sai thì `git revert` đúng commit đó.
- **Ít mất công.** Máy hỏng, ổ đầy, lỡ tay xoá — phần đã commit (và push) vẫn còn.

**Không gom cả một tính năng vào một commit to.** Sẽ bị chửi, bởi ai tự biết.

Ví dụ một tính năng được chia hợp lý:

```text
feat(db): add price_tiers and product_prices tables
feat(pricing): add store function to upsert a tier price
test(pricing): cover price resolution when a tier has no price
feat(sales): let sale lines pick a price tier
docs(pricing): add ERD and sequence diagram
```

## 2. Viết commit message theo Conventional Commits

```text
<loại>(<phạm vi, tuỳ chọn>): <mô tả ngắn>

<phần giải thích, tuỳ chọn — viết khi "vì sao" không hiển nhiên>
```

| Loại | Dùng khi |
|---|---|
| `feat` | Thêm tính năng mới mà **người dùng thấy được** |
| `fix` | Sửa một **lỗi** (hành vi sai so với mong đợi) |
| `docs` | Chỉ sửa/thêm tài liệu |
| `refactor` | Đổi cấu trúc code **mà không đổi hành vi** (đổi tên, tách hàm, dời file). Nếu hành vi đổi thì là `feat` hoặc `fix` |
| `test` | Chỉ thêm/sửa test |
| `chore` | Việc vặt không thuộc loại nào ở trên (dọn file, cập nhật `.gitignore`) |
| `build` | Thư viện, `package.json`, cấu hình build |
| `ci` | Cấu hình CI (`.github/workflows/`) |
| `perf` | Cải thiện hiệu năng |

Quy tắc cho dòng mô tả:

- Viết bằng **tiếng Việt hoặc tiếng Anh** — chọn thứ tiếng giúp bạn nói rõ nhất. Viết tiếng
  Việt thì **có dấu**. Viết tiếng Anh thì dùng thể mệnh lệnh: "add", không phải "added" hay "adds".
- Phần `<loại>(<phạm vi>)` luôn giữ nguyên tiếng Anh (`feat`, `fix`…). Viết thường sau dấu `:`,
  không có dấu chấm cuối câu.
- Tối đa khoảng 72 ký tự, tính cả loại và phạm vi.
- Mô tả **thay đổi làm gì**, không liệt kê tên file.

Tốt:

```text
fix(inventory): store export quantities as negative in the ledger
docs(tasks): assign owners and deadlines on the task board
```

Không tốt:

```text
update
fixed bug
feat: Added a new feature for users to be able to log in.
```

Thay đổi phá vỡ tương thích (ví dụ xoá một cột mà code khác đang đọc): thêm `!` sau loại —
`feat(db)!: drop products.price` — và giải thích trong phần thân.

## 3. Branch và Pull Request

Tự tạo branch và PR khi cần — nhưng **giữ số lượng ở mức dễ theo dõi**: nhóm có thành viên
chưa quen review code và điều hướng nhiều branch.

- **Một branch cho một việc** (một mục trên bảng việc). Mọi commit của việc đó — `feat`,
  `fix`, `docs`, `test` — nằm trên cùng branch, cho tới khi việc xong. Không mở một branch +
  PR cho mỗi thay đổi nhỏ.
- **Tên branch**: `<loại>/<mô-tả-ngắn>`, chữ thường, nối bằng gạch ngang. Ví dụ:
  `feat/supplier-api`, `fix/inventory-ledger-sign`, `docs/task-board-assignments`.
- **Tạo branch từ `master` mới nhất** (`git switch master && git pull` trước).
- **Mở PR khi việc xong.** Trong mô tả PR, đánh dấu từng tiêu chí hoàn thành của việc.
- **Merge bằng "Create a merge commit"**, không dùng "Squash and merge": squash gộp mọi
  commit nhỏ thành một, tức là xoá đúng cái lịch sử mà mục 1 muốn giữ.

## 4. Những điều không làm

- **Không `git push --force`** lên branch người khác đang dùng, và không bao giờ lên `master`.
- **Không commit bí mật**: `.env.local`, mật khẩu, token. Lỡ commit → báo trưởng nhóm để đổi
  khoá ngay; xoá khỏi commit sau là không đủ.
- **Không `git add .` hay "Stage All" mù quáng.** Stage từng file, xem `git diff --staged`
  trước khi commit. Đặc biệt đừng commit đổi line ending của `frontend/src/server/brain.ts`
  (xem `docs/tasks/BLOCKERS.md` K1) — nó cố ý giữ CRLF tới khi Brain PR #3 merge.
- **Không commit lockfile khác `frontend/pnpm-lock.yaml`**.
- **Không sửa migration đã chạy** — tạo migration mới (`docs/onboarding/Onboarding_Playbook.md` §5.1).
