# ANSER-v2 - Bảng việc Backend có thể giao

> Cập nhật 31/10/2026
> Danh sách việc **backend** giao được cho thành viên khác **trong lúc** tính năng giá nhiều
> mức ("Giá áp dụng", nhánh `feat/multi_tier-pricing`) đang được làm. Frontend không nằm trong
> phạm vi tài liệu này.
>
> Mới vào dự án? Đọc `docs/onboarding/Onboarding_Playbook.md` trước. Việc nào đang chờ khách/đội khác xác
> nhận thì nằm ở `docs/tasks/BLOCKERS.md`, không nằm ở đây.

## Mục lục

1. [Cách làm việc](#1-cách-làm-việc)
2. [Quy tắc làm việc](#2-quy-tắc-làm-việc)
3. [Bảng tổng hợp](#3-bảng-tổng-hợp)
4. [Chi tiết từng việc](#4-chi-tiết-từng-việc)
5. [Việc phải chờ tính năng giá nhiều mức merge xong](#5-việc-phải-chờ-tính-năng-giá-nhiều-mức-merge-xong)

---

## 1. Cách làm việc

1. Tạo nhánh (branch) theo hướng dẫn ở [2.1](#21-tạo-branch-từ-đâu).
2. Đọc công việc được giao và chi tiết công việc.
3. Mở Pull Request (PR). Trong mô tả PR, đánh dấu từng tiêu chí hoàn thành đã đạt.

---

## 2. Quy tắc làm việc

### 2.1 Tạo branch từ đâu

Khi làm việc, thành viên tạo nhánh từ `master`. Có 2 cách để làm việc này:

##### Dùng Command Line

1. Nếu chưa có code trên máy, hãy đọc Onboarding Playbook mục 2.2 (Lấy Code).

2. Vào thư mục của dự án và tạo branch như sau:

```bash
git switch master
git pull
git switch -c <ten-cua-branch>
```

##### Dùng Github Web
 
1. Lên Github trên trình duyệt.

2. Bấm vào ô có chữ `master`.

3. Gõ tên branch mới.

![Tạo branch mới từ master trên Github Web](../figures/image.png)

### 2.2 Lưu ý về database migration

Nếu hai nhánh khác nhau tạo migration, ta sẽ có hai file `.sql` với số `0015` và thay đổi `meta/_journal.json` xung đột. Vì vậy:

- Bất cứ công việc nào cần chạy `pnpm db:generate`, thành viên phải thông báo lên nhóm. Tránh trường hợp khi tạo PR và merge xảy ra xung đột.

### 2.3 Quy tắc chung

Tuân theo `docs/onboarding/Onboarding_Playbook.md` §5.4 (Git) và §8 (những điều không bao giờ làm).

---

## 3. Bảng tổng hợp

| # | Việc | Ưu tiên | Người nhận | Hạn |
|---|---|---|---|---|
| 1 | [Giá nhiều mức/Giá áp dụng đối với sản phẩm](#việc-1---giá-nhiều-mứcgiá-áp-dụng-đối-với-sản-phẩm) | **Cao** - tính năng đang được yêu cầu | Sĩ | Chủ Nhật 06/11 |
| 2 | [Sửa lỗi sổ kho trong `createTransaction()`](#việc-2---sửa-lỗi-sổ-kho-trong-createtransaction) | **Cao** - lỗi dữ liệu | Dương Sơn | Chủ Nhật 06/11 |
| 3 | [Siết xác thực & phân quyền](#việc-3---siết-xác-thực--phân-quyền) | **Cao** - bảo mật | Dương Sơn | 2 hạn:<br>- Thứ Tư 11/11: Xác nhận các API endpoint: Do có phân quyền, nên cần tất cả các route từ việc 1 được hoàn thiện trước<br>- Chủ Nhật 15/11: Hạn hoàn thiện |
| 4 | [API nhà cung cấp](#việc-4---api-nhà-cung-cấp-apisuppliers) | Trung bình | Phương Nam | Chủ Nhật 08/11 |
| 5 | [Kiểm tra dữ liệu vào (zod) + hàm lỗi dùng chung](#việc-5---kiểm-tra-dữ-liệu-vào-zod--hàm-lỗi-dùng-chung) | Trung bình | Phương Nam | Thứ Tư 18/11: Kiểm tra dòng chảy dữ liệu thì yêu cầu toàn bộ route (và auth từ việc 3) được hoàn thiện |
| 6 | [CI: Postgres + bước `pnpm build`](#việc-6---ci-postgres--bước-pnpm-build) | Trung bình - Thấp (Làm đẹp) | (Việc tự do) | - |
| 7 | [Dọn dẹp nhỏ](#việc-7---dọn-dẹp-nhỏ) - hợp làm việc đầu tiên | Thấp | (Việc tự do) | - |

---

## 4. Chi tiết từng việc

### Việc 1 - Giá nhiều mức/Giá áp dụng đối với sản phẩm
**Bối cảnh**: yêu cầu từ chú Quyết ở `docs/playbook/Project_Playbook_VI.md` §6; các quyết định
đã chốt ở `docs/tasks/BLOCKERS.md` → "Đã giải quyết". Ngoài phạm vi lần này: `BLOCKERS.md` §1 (G1–G7).

**Phạm vi** (chốt 22/10/2026):
- Bảng mới: `price_tiers` (chỉ seed Bán lẻ, Đại lý cấp 1, Đại lý cấp 2), `product_prices` (giá
  hiện hành, mỗi sản phẩm × mức giá một dòng), `product_price_history` (lịch sử thay đổi, ghi
  trong cùng transaction với lần sửa giá).
- Mỗi dòng hoá đơn chọn một mức giá (`sales_invoice_items.price_tier_id`).
- **Bỏ cột `products.price`** — phá vỡ tương thích: API sản phẩm không còn trường `price`; trang
  Sản phẩm, Bán hàng và `reports.ts` (bỏ `totalStockValue`) đổi theo.
- Chỉ `admin` sửa bảng giá (trong form sửa sản phẩm). Sửa giá trên dòng hoá đơn: `admin`/`manager`.
  Mức giá chưa có giá → `staff` không bán được dòng đó. Không bao giờ bán 0₫ ngầm.
- Kiểm tra đăng nhập + quyền cho `api/sales/invoices` và `api/products/**` (việc siết xác thực
  bỏ qua hai route này).

**Mốc và tiêu chí hoàn thành**
- [ ] ERD (migration `0014` + bảng mới) và Sequence Diagram cho "admin sửa giá", "tạo hoá đơn
      có mức giá" — gửi nhóm review (hạn …)
- [ ] Migration: sửa `schema.ts` → `pnpm db:generate` → đối chiếu SQL với `schema.ts` → báo nhóm
      (§2.2) → `pnpm db:migrate` trên Neon `dev` → kiểm tra ràng buộc đã có thật (hạn …)
- [ ] Logic store + unit test (hạn …)
- [ ] API + giao diện (hạn …)
- [ ] Integration test cho giao dịch tạo hoá đơn; cập nhật Project Playbook §6 (hạn …)

### Việc 2 - Sửa lỗi sổ kho trong `createTransaction()`

**Bối cảnh.** Trang **Quản lý kho** tạo phiếu nhập/xuất thủ công qua
`POST /api/inventory/transactions` → `createTransaction()` trong
`frontend/src/server/store/inventory.ts`.

Hàm này mắc đúng loại lỗi đã từng sửa trong `store/sales.ts` (xem `docs/decisions/4. Database_Implementation_Documentation.md`, Task 3).

| Tên lỗi | Chi tiết lỗi | Hậu quả |
|---|---|---|
| Phiếu xuất ghi sai dấu (+ -) số lượng. | `products.stock` bị trừ đúng (`delta` âm), nhưng dòng sổ kho lại ghi `quantity: input.quantity` (số dương) | Phá quy ước `stock = SUM(quantity)`. Mỗi phiếu xuất thủ công làm endpoint kiểm toán `/api/inventory/reconcile` báo sai |
| Khi hai người ghi vào database cùng lúc, một người sẽ nhận được data sai | Khi `getProductById` gọi trước `db.transaction`, không có `.for("update")` | Trường hợp hai người thao tác cùng lúc: Người A thấy còn 5 sản phẩm, bán 3 sản phẩm; Người B xem cùng lúc với A cũng sẽ thấy 5 sản phẩm, bán 5 sản phẩm -> dẫn đến bán âm kho. Trong trường hợp khác, giá vốn bình quân tính trên số tồn cũ |
| Ghi giá bán vào cột giá vốn | Hàm ghi `unitCost` người dùng gửi lên cho mọi loại phiếu, kể cả phiếu xuất, nơi con số được gõ vào thường là giá bán | `unit_cost` phải luôn là giá vốn (chú thích trong `schema.ts`). Nhập giá bán vào đây là biến sổ kho thành sổ doanh thu |
| Thiếu thông tin để truy vết | Hàm không nhận và không ghi supplierId, employeeId. Bảng inventory_transactions có sẵn hai cột này nhưng phiếu thủ công luôn để NULL | Không biết hàng nhập từ nhà cung cấp nào, ai đã tạo phiếu      |
| Báo đúng lỗi dựa vào thông báo | Store ném Error thường; route đoán loại lỗi bằng message.includes("Không tìm thấy sản phẩm") | Đổi câu thông báo là 404 âm thầm thành 400. Lỗi bất ngờ (mất kết nối DB…) cũng trả 400 "dữ liệu sai", nên người dùng đi sửa dữ liệu của mình, còn lỗi thật thì bị bỏ qua |

**Phạm vi file**: `frontend/src/server/store/inventory.ts`,
`frontend/src/app/api/inventory/transactions/route.ts`.

**Tiêu chí hoàn thành**

- [ ] Phiếu nhập ghi `quantity` **dương**, phiếu xuất ghi `quantity` **âm** - cùng một giá trị `delta` dùng cho cả dòng sổ kho lẫn `products.stock`.
- [ ] Đọc sản phẩm, kiểm tra tồn kho, tính giá vốn bình quân **bên trong** `db.transaction`, với
      `.for("update")` trên dòng sản phẩm - theo mẫu `createInvoice()` trong `store/sales.ts`.
- [ ] Phiếu xuất ghi `unit_cost` = giá vốn hiện hành của sản phẩm (`products.cost`, giữ `NULL`
      nếu chưa biết), **không** lấy đơn giá người dùng gửi lên. Phiếu nhập giữ nguyên hành vi
      hiện tại.
- [ ] Phiếu nhập nhận `supplierId` (tuỳ chọn, phải tồn tại trong bảng `suppliers`); mọi phiếu
      ghi `employeeId` của người đang đăng nhập (nếu tài khoản có gắn nhân viên).
- [ ] `sourceType`/`sourceId` để **cả hai `NULL`** cho phiếu thủ công. Ràng buộc
      `inv_tx_source_di_cung_nhau` bắt hai cột đi cùng nhau, và phiếu thủ công không có chứng
      từ gốc để trỏ tới - đừng ghi `sourceType: "manual"` một mình.
- [ ] Lỗi có kiểu riêng → mã HTTP đúng: không tìm thấy → `404`, không đủ tồn → `409`, dữ liệu
      sai → `400`.
- [ ] Route kiểm tra đăng nhập (`getSessionUser()` → `401` nếu chưa đăng nhập).
- [ ] Thử trên branch Neon riêng: tạo 1 phiếu nhập + 1 phiếu xuất cho cùng sản phẩm, rồi
      `/api/inventory/reconcile` trả `mismatchCount: 0` cho sản phẩm đó.
- [ ] **Dữ liệu cũ**: viết (nhưng **không tự chạy** trên `dev`/`production`) câu truy vấn tìm
      các dòng đã ghi sai dấu (`type = 'export' AND quantity > 0`), kèm câu sửa, trong mô tả PR.
      Database Engineer duyệt rồi mới chạy.

---

### Việc 3 - Siết xác thực & phân quyền

**Bối cảnh.** `docs/architecture/ARCHITECTURE.md` §7 và `docs/tasks/BLOCKERS.md` Q3: phần lớn `/api/*` **không** kiểm tra
đăng nhập, `/dashboard` mở cho bất kỳ ai, quyền (`staff`/`manager`/`admin`) chỉ được kiểm tra
ở trang Nhân sự (`requireAdmin()`). Thêm hai điểm tìm thấy khi rà code:

- `/api/n8n/internal/*` (doanh số theo ngày, tồn kho thấp, danh sách kho) **hoàn toàn không
  xác thực** - ai biết URL là đọc được số liệu kinh doanh.
- `JWT_SECRET` có giá trị dự phòng ngầm `"dev-secret-change-me"` (`src/server/auth.ts`): quên
  đặt biến môi trường ở production là token giả mạo được.

**Phạm vi file**: `frontend/src/proxy.ts` (mới), `frontend/src/server/session.ts`,
`frontend/src/server/auth.ts`, các route trong `frontend/src/app/api/**` **trừ**
`api/sales/invoices` và `api/products/**` (tính năng giá nhiều mức tự xử lý hai chỗ này).

**Lưu ý kỹ thuật**: dự án dùng **Next.js 16** - file chặn request tên là **`proxy.ts`**, không
phải `middleware.ts`. Đọc `frontend/node_modules/next/dist/docs/` trước khi viết (xem
`frontend/AGENTS.md`).

**Tiêu chí hoàn thành**

- [ ] **Bước 0 - bảng quyền, duyệt trước khi code**: liệt kê từng route + phương thức, quyền tối thiểu (`public` / đã đăng nhập / `manager` / `admin`), đưa Database Engineer + trưởng nhóm duyệt trong PR (hoặc issue) **trước** khi viết code. Giữ 3 quyền hiện có - phân quyền theo phòng ban đang chờ xác nhận (`docs/tasks/BLOCKERS.md` Q1).
- [ ] `src/proxy.ts`: chưa đăng nhập vào `/dashboard/**` → chuyển về `/login`.
- [ ] Mọi route trong phạm vi trả `401` khi chưa đăng nhập, `403` khi sai quyền - dùng hàm kiểm tra dùng chung (mở rộng `session.ts`), không chép lại logic ở từng route.
- [ ] `/api/n8n/internal/*`: xác thực bằng header bí mật dùng chung (ví dụ biến môi trường `N8N_INTERNAL_TOKEN`), **không** dùng cookie đăng nhập - n8n gọi server-to-server. Cập nhật workflow trong `frontend/n8n-workflows/` để gửi header này, và ghi biến mới vào `docs/onboarding/Onboarding_Playbook.md` §2.3.
- [ ] App **không khởi động** ở production nếu thiếu `JWT_SECRET` (bỏ giá trị dự phòng ngầm khi `NODE_ENV === "production"`).
- [ ] Giới hạn số lần thử `/api/auth/login` (chống dò mật khẩu). Ghi rõ trong PR giới hạn chọn là bao nhiêu và lưu ở đâu (bộ nhớ tiến trình chỉ đúng khi chạy một instance - nói rõ điều đó).
- [ ] Cập nhật bảng hạn chế trong `docs/architecture/ARCHITECTURE.md` §7 và mục Q3 trong `docs/tasks/BLOCKERS.md`.

---

### Việc 4 - API nhà cung cấp (`/api/suppliers`)

**Bối cảnh.** Bảng `suppliers` có từ M6 (mã `NCC*`, MST, công nợ đầu kỳ), nhưng hiện **chỉ**
tính năng Nhập Excel (`src/server/import/ap-dung.ts`) ghi vào nó. Không có cách nào xem/sửa nhà
cung cấp qua API, và phiếu nhập kho không chọn được nhà cung cấp (xem việc 2).

**Phụ thuộc**: nên làm sau việc 2 (sửa lỗi sổ kho) - phiếu nhập kho chỉ chọn được nhà cung cấp khi việc đó xong.

**Phạm vi file**: `frontend/src/server/store/suppliers.ts` (mới),
`frontend/src/app/api/suppliers/route.ts` và `api/suppliers/[id]/route.ts` (mới). Lấy `store/customers.ts` + `api/customers/**` làm mẫu - hai bảng gần giống nhau.

**Tiêu chí hoàn thành**

- [ ] `GET /api/suppliers` (tìm theo tên/mã/MST), `GET /api/suppliers/[id]`, `POST`, `PATCH`,
      `DELETE`.
- [ ] `code` so khớp **không phân biệt hoa thường** (đã có unique index `lower(code)`) - trùng
      mã → `409` với thông báo tiếng Việt, không để lỗi DB thô lọt ra `500`.
- [ ] `opening_debt` để `NULL` khi không nhập (không quy về 0 - `NULL` = chưa biết).
- [ ] Xoá nhà cung cấp đã có phiếu nhập: FK là `on delete set null`, nên xoá được nhưng phiếu
      mất liên kết. Quyết định chặn (`409`) hay cho xoá, ghi lý do trong PR.
- [ ] Mọi route kiểm tra đăng nhập; ghi/sửa/xoá theo bảng quyền của việc 3 (nếu việc 3 chưa
      xong, tạm yêu cầu `manager` trở lên và ghi chú lại).

---

### Việc 5 - Kiểm tra dữ liệu vào (zod) + hàm lỗi dùng chung

**Bối cảnh.** `docs/architecture/ARCHITECTURE.md` §7: route tự kiểm tra bằng `if (!x)`, mỗi route trả lỗi một
kiểu, lỗi không lường trước rơi về `500` mặc định của Next.

**Phụ thuộc**: đụng gần như mọi route → **xung đột với việc 3** nếu làm song song. Giao cùng người với việc 3, hoặc bắt đầu sau khi việc 3 merge. Bỏ qua `api/sales/invoices` và `api/products/**` — tính năng giá nhiều mức đang sửa các route này (giống phạm vi của việc 3).

**Tiêu chí hoàn thành**

- [ ] Thêm `zod` (nhớ `pnpm install` và commit `pnpm-lock.yaml`).
- [ ] Một hàm dùng chung đọc + kiểm tra body theo schema zod, trả `400` với `message` tiếng Việt.
- [ ] Một định dạng lỗi thống nhất `{ message: string }` (khớp cái giao diện đang đọc), và một wrapper bắt lỗi không lường trước → `500` + ghi log, không lộ chi tiết lỗi ra ngoài.
- [ ] Áp dụng cho các route trong phạm vi; mỗi route giữ đúng mã HTTP hiện có.
- [ ] Ghi quy ước mới vào `docs/onboarding/Onboarding_Playbook.md` §5.2 (mẫu thêm API route).

---

### Việc 6 - CI: Postgres + bước `pnpm build`

**Bối cảnh.** `.github/workflows/ci.yml` (có từ PR #6) chỉ kiểm lockfile + ESLint. Chưa có `pnpm build` vì `src/server/db/client.ts` ném lỗi ngay khi thiếu `DATABASE_URL` (`docs/tasks/BLOCKERS.md` K3).

**Phạm vi file**: `.github/workflows/ci.yml`.

**Tiêu chí hoàn thành**

- [ ] Job mới dùng **Postgres service container** (`services: postgres`) - không dùng Neon production, không cần bí mật thật.
- [ ] Chạy `pnpm db:migrate` lên Postgres đó, rồi `pnpm build`.
- [ ] `JWT_SECRET` dùng giá trị giả chỉ dành cho CI, khai báo trong workflow.
- [ ] Kiểm tra driver `neon-serverless` (WebSocket) có nói chuyện được với Postgres thường không. Nếu không, đề xuất cách xử lý (ví dụ chọn driver theo biến môi trường) và **hỏi trước khi sửa `client.ts`** - file này cả app dùng.
- [ ] Ghi chú trong workflow (theo phong cách các bước có sẵn) và cập nhật mục K3 trong `docs/tasks/BLOCKERS.md`.

---

### Việc 7 - Dọn dẹp nhỏ

Hợp làm **việc đầu tiên** cho người mới - nhỏ, ít rủi ro, giúp làm quen quy trình PR.

**7a. README + file mẫu biến môi trường** (`docs/tasks/BLOCKERS.md` K2)

- [ ] `README.md` bảo copy `frontend/.env.local.example` - file này **không tồn tại**. Tạo `frontend/.env.example` (đúng tên này: `.gitignore` chặn mọi `.env.*` **trừ** `.env.example`) với nội dung theo `docs/onboarding/Onboarding_Playbook.md` §2.3, không chứa bí mật thật.
- [ ] Sửa `README.md`: trỏ tới `.env.example`, bỏ dòng "user lưu trong bộ nhớ" (đã lỗi thời - giờ ở Postgres), trỏ người mới tới `docs/onboarding/Onboarding_Playbook.md`.

**7b. Cảnh báo ESLint**

- [ ] `frontend/src/server/store/users.ts`, hàm `toPublicUser()`: ESLint báo `passwordHash` "gán mà không dùng". Biến này được tách ra **có chủ đích** - để hash mật khẩu không bao giờ lọt vào JSON trả về. **Không xoá dòng đó.** Tắt cảnh báo đúng chỗ (ví dụ cho phép tên bắt đầu bằng `_` trong `eslint.config.mjs`, rồi đổi thành `passwordHash: _passwordHash`), và kiểm tra `/api/auth/me` vẫn không trả `passwordHash`.
- Cảnh báo còn lại (`employees` import thừa trong `store/sales.ts`) **để nguyên** - file thuộc tính năng giá nhiều mức, cảnh báo sẽ được xử lý ở đó.

**7c. Chuẩn hoá line ending `brain.ts`** (`docs/tasks/BLOCKERS.md` K1) - **chờ PR #3 của đội Brain merge**

- [ ] Sau khi PR #3 merge: một commit riêng chỉ chứa `git add --renormalize frontend/src/server/brain.ts`. Báo đội Brain trước khi push.

---

## 5. Việc phải chờ tính năng giá nhiều mức merge xong

Không giao lúc này - các việc này sửa đúng những file tính năng giá nhiều mức đang sửa, hoặc cần migration (xem 2.2).

| Việc | Vì sao phải chờ |
|---|---|
| **Huỷ hoá đơn** (đảo các dòng sổ kho qua `sourceType = 'sale'` / `sourceId`) | Sửa `store/sales.ts` |
| **Thay `generateProductCode()`** (`count(*) + 1`, có race condition) bằng Postgres sequence | Cần migration + sửa `store/products.ts` |
| **API công nợ phải thu** trên bảng `invoice_payments` (ghi nhận thanh toán; còn nợ = `total − SUM(payments)` + `opening_debt`) | Không xung đột file, nhưng **cần chú Quyết xác nhận** trước: theo dõi công nợ ở ANSER, hay vẫn giữ trong MISA? (liên quan `docs/tasks/BLOCKERS.md` C1–C3) |
| **Kiểm kê** (phiếu điều chỉnh `sourceType = 'stocktake'`) | Cần quy trình kiểm kê thực tế từ chủ doanh nghiệp; ưu tiên thấp |
