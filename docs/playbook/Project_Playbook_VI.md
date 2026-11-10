# ANSER-v2 — Sổ Tay Dự Án

> Bản dịch tiếng Việt của `docs/playbook/Project_Playbook.md`.
> Cập nhật lần cuối 18/09/2026.
> Tài liệu này không thay thế các tài liệu đánh số `0.`–`4.` bên dưới (trong `docs/decisions/`) — nó chỉ trỏ tới từng tài liệu, cho biết phần nào đã cũ, và bổ sung những gì xảy ra sau khi `4.` được viết lần cuối. 
> Nếu bản này và bản tiếng Anh lệch nhau sau khi chỉnh sửa, coi bản tiếng Anh là gốc.

## 0. Cách dùng tài liệu này

Đọc phần này trước, rồi đi tới đúng tài liệu mà từng mục trỏ tới. Đừng đọc lại toàn bộ
`0.`–`3.` từ đầu đến cuối — đó là **lịch sử quyết định** (mỗi bản bị bản sau thay thế, theo
đúng lời mở đầu của từng tài liệu). `schema.ts` là thứ duy nhất luôn đúng nhất; nếu sổ tay
này và `schema.ts` mâu thuẫn nhau, tin `schema.ts` và sửa lại tài liệu này.

## 1. Dự án này là gì

**ANSER Web v2** — hệ thống quản lý kho + bán hàng cho **Hoàng Phát**, doanh nghiệp phân
phối dầu nhớt tại Việt Nam. Viết lại từ một codebase Flask cũ (không liên quan, không gọi
vào code cũ). Một app Next.js duy nhất: UI + API route trong cùng 1 project, không tách
backend riêng.

| Tầng | Lựa chọn | Vì sao (xem `docs/architecture/STACK_DECISIONS.md`) |
|---|---|---|
| Web app | Next.js (App Router, Route Handlers) | Một lần deploy, một hệ kiểu dữ liệu dùng chung FE↔BE, không cần CORS |
| DB | Neon Postgres qua Drizzle ORM, driver pool `neon-serverless` | Dùng driver pool (không phải `neon-http`) vì `db.transaction()` là bắt buộc cho các thao tác ghi kho |
| Auth | JWT lưu trong cookie httpOnly | — |
| AI (OCR, chat, kiểm toán) | (Các) service riêng, gọi qua HTTP — xem §7 | Giữ cho web app không phải gánh tải model AI |
| Tự động hoá | n8n, tự host, gọi qua webhook | — |

## 2. Bản đồ tài liệu

| Tài liệu | Nhánh | Nội dung | Trạng thái |
|---|---|---|---|
| `docs/decisions/0. HA_TANG_VA_ERD.md` | cả hai | Hạ tầng gốc + ERD v3, đề xuất D1–D7 | Lịch sử |
| `docs/decisions/1. ERD_Merge_Finalization_Strategy.md` | cả hai | Đề xuất gộp của tôi, M1–M6 | Lịch sử |
| `docs/decisions/2. ERD_PHAN_HOI_VA_LUOC_DO.md` | cả hai | Phản hồi của đội dev, thêm B1–B7 | Lịch sử |
| `docs/decisions/3. ERD_CHUAN.md` | cả hai | **ERD chuẩn** sau khi chạy dữ liệu MISA thật qua bộ nạp. Thêm C1/C2. Có kèm `schema.ts` mục tiêu đầy đủ, index, SQL đối chiếu. | **Đã cũ một phần** — xem §3.1 |
| `docs/decisions/4. Database_Implementation_Documentation.md` | **chỉ có ở master** | Nhật ký triển khai từng bước cho Task 1–4 của ERD_CHUAN (migrate schema, kiểm tra constraint, sửa quy ước dấu trong `sales.ts`, `/api/inventory/reconcile`), kèm một đoạn nhìn lại ngắn cho Task 5, thêm ngày 18/09. | Chưa merge vào `feat/database-application` — đọc trên `master` |
| `docs/decisions/evidence/all_constrain.json`, `docs/decisions/evidence/single_table_data_types_and_columns.json` | **chỉ có ở master** | Dữ liệu thô từ Neon (`pg_constraint`/`information_schema`) dùng để kiểm tra Task 2 ở trên | Tài liệu tham chiếu, không phải tài liệu sống |
| `docs/decisions/5. Database_Session_Log.md` | nhánh này, chưa commit | Nhật ký phiên làm việc chi tiết: bug đã tìm/đã sửa, phát hiện khi nhập dữ liệu thật, danh sách việc còn mở theo thứ tự ưu tiên | Mọi thứ ở §5 đều lấy từ đây — đọc trực tiếp để biết chi tiết đầy đủ |
| `docs/architecture/ARCHITECTURE.md` | nhánh này | Bản đồ đầy đủ từng file của app Next.js, luồng request, bảng hạn chế hiện tại | Còn hiện hành, tiếp tục dùng |
| `src/server/db/schema.ts` | nhánh này | **Nguồn chuẩn xác nhất.** Đã vượt qua ERD_CHUAN — xem §3.1 | Luôn cập nhật |

## 3. Mô hình dữ liệu hiện tại

```mermaid
erDiagram
    warehouses  ||--o{ products              : "chứa"
    warehouses  ||--o{ employees             : "phụ trách"
    warehouses  ||--o{ automation_rules      : "phạm vi"
    categories  ||--o{ products              : "phân loại"
    categories  ||--o{ automation_rules      : "lọc theo"
    products    ||--o{ products              : "cùng mặt hàng (C1)"
    products    ||--o{ inventory_transactions : "ghi trong"
    products    ||--o{ sales_invoice_items   : "bán trong"
    suppliers   ||--o{ inventory_transactions : "cung cấp"
    employees   ||--o{ inventory_transactions : "thực hiện"
    users       }o--|| employees             : "gắn với"
    customers   ||--o{ sales_invoices        : "đặt"
    sales_invoices ||--|{ sales_invoice_items : "gồm"
    sales_invoices ||--o{ invoice_payments   : "được trả bằng"

    warehouses {
        uuid id PK
        text name UK
        boolean allows_zero_value
    }
    categories {
        uuid id PK
        text name "unique index không phân biệt hoa thường, không phải ràng buộc UK"
    }
    suppliers {
        uuid id PK
        text code "nullable, MISA NCC00001, unique không phân biệt hoa thường"
        text tax_code
        numeric opening_debt
    }
    products {
        uuid id PK
        text code UK
        uuid category_id FK
        uuid warehouse_id FK
        uuid linked_product_id FK
        text unit
        text base_unit
        numeric unit_factor
        numeric stock
        integer price
        integer cost
        boolean is_reduced_vat
    }
    inventory_transactions {
        uuid id PK
        uuid product_id FK
        uuid warehouse_id FK "nullable, D7"
        text type
        numeric quantity "có dấu"
        integer unit_cost
        text source_type
        uuid source_id
        uuid supplier_id FK
        uuid employee_id FK
    }
    customers {
        uuid id PK
        text code "nullable, unique"
        text name
        numeric opening_debt
    }
    sales_invoices {
        uuid id PK
        uuid customer_id FK
        uuid warehouse_id FK
        integer total
        date due_date
    }
    sales_invoice_items {
        uuid id PK
        uuid invoice_id FK
        uuid product_id FK
        text product_name "snapshot"
        integer unit_price "snapshot"
        integer unit_cost "snapshot"
        numeric quantity
    }
    invoice_payments {
        uuid id PK
        uuid invoice_id FK
        integer amount
        text method
    }
    employees {
        uuid id PK
        text name
        uuid warehouse_id FK
    }
    users {
        uuid id PK
        text role "CHECK staff|admin"
        uuid employee_id FK
    }
    automation_rules {
        uuid id PK
        text type
        uuid category_id FK
        uuid warehouse_id FK
        text n8n_workflow_id
    }
```

Toàn bộ lý do cho từng cột/ràng buộc (vì sao `quantity` có dấu, vì sao `NULL` khác `0` ở
`cost`, vì sao có `linked_product_id`, v.v.) nằm trong `docs/decisions/3. ERD_CHUAN.md` §4 — vẫn đúng cho
mọi thứ nó đề cập. Đừng suy luận lại các quyết định đó; đọc trực tiếp.

### 3.1 Những chỗ `schema.ts` thực tế đã vượt qua `ERD_CHUAN`

Migration `0014_youthful_red_wolf.sql` thêm 3 thứ mà ERD_CHUAN không nhắc tới:

| Cột | Vì sao (suy ra từ comment trong schema.ts) |
|---|---|
| `suppliers.code`, `customers.code` (nullable, unique index không phân biệt hoa thường) | Khoá đối chiếu với bản xuất MISA — chỉ dùng MST thì không đáng tin (comment ghi 42/43 nhà cung cấp có MST, nhưng chỉ 77/105 khách hàng có) |
| `suppliers.opening_debt`, `customers.opening_debt` (`numeric(18,2)`) | Công nợ đầu kỳ tại thời điểm xuất file. **Đây là phần schema mới, chưa tồn tại lúc `frontend/import-real-data.ts` (chưa track, xem §5) được viết** — comment của chính script đó nói không có cột này. Giờ điều đó không còn đúng nữa. |
| `products.is_reduced_vat` (boolean, nullable) | Cờ giảm 2% thuế GTGT theo Nghị định 174/2025, được đọc bởi `/api/ai/vat-catalog`. Nullable = "chưa kiểm tra", cùng nguyên tắc NULL-khác-false như `cost`. |

Cũng mới so với ERD_CHUAN: một **module AI** (`/api/ai/*` — chat, report, OCR hoá đơn nhà
xe, inventory-audit, inventory-cost, partner-audit, period-diff, vat-catalog) và một
**tính năng nhập danh mục từ Excel** (`src/server/import/`, commit gần nhất). Cả hai đều
không đổi phần lõi của schema ngoài các cột `0014` ở trên.

## 4. Quá trình đi đến đây (rút gọn)

1. Hai bản ERD vẽ tay + `docs/decisions/0. HA_TANG_VA_ERD.md` (v3, D1–D7) cần được đối chiếu với `schema.ts`
   thực tế → tôi viết `docs/decisions/1. ERD_Merge_Finalization_Strategy.md` (M1–M6).
2. Đội dev đồng ý, thêm B1–B7 (quan trọng nhất là **B1**: `quantity` có dấu thay vì logic
   cộng/trừ theo loại giao dịch không dấu) → `docs/decisions/2. ERD_PHAN_HOI_VA_LUOC_DO.md`.
3. Chạy dữ liệu MISA thật qua bộ nạp, phát sinh thêm 2 quyết định (C1 `linked_product_id`,
   C2 `allows_zero_value`) và xác nhận M3 (KHO KHUYẾN MẠI chỉ là nhãn ghi sổ — thực tế pilot
   chạy một kho) → `docs/decisions/3. ERD_CHUAN.md`, **schema chuẩn**, kèm thứ tự triển khai 7 bước ở cuối.
4. `docs/decisions/4. Database_Implementation_Documentation.md` (chỉ có ở master) thực hiện đúng thứ tự
   đó, từng bước, kèm diff code thật:
   - **Task 1** — dán `schema.ts`, sinh `0012_misty_cammi.sql`, tự tay diff SQL sinh ra với
     source (drizzle-kit từng bị biết là bỏ sót `check()` constraint), tạo nhánh Neon `dev`
     tách từ `production` để thử nghiệm an toàn.
   - **Task 2** — xác minh từng constraint thực sự có trên Neon qua truy vấn
     `pg_constraint`/`information_schema` (kết quả lưu thành 2 file `.json`, chỉ có ở master).
   - **Task 3** — sửa quy ước dấu trong `store/sales.ts` (`stock - quantity` → cộng một số
     **âm**), bổ sung `employeeId` còn thiếu, nối `sourceType`/`sourceId` từ phiếu kho về hoá
     đơn gốc, điền `salesInvoices.warehouseId`, làm luồng lỗi trong route handler cho đúng, và
     khoá dòng bằng `.for("update")` để chặn race condition đọc-kiểm tra-ghi khi bán cùng 1
     sản phẩm đồng thời.
   - **Task 4** — dựng `GET /api/inventory/reconcile` (so `products.stock` với
     `SUM(inventory_transactions.quantity)`, `EPSILON = 0.001` cho sai số làm tròn
     numeric(14,3)) — sau khi xác nhận nó không trùng chức năng với `/api/ai/inventory-audit`
     (đối chiếu file ngoài) hay `/api/ai/inventory-cost` (ghi một chiều từ bảng giá vốn).
   - **Task 5** (nhập dữ liệu MISA thật, gắn cờ `allows_zero_value`, nối `linked_product_id`)
     — kế hoạch gốc, đang nằm trong `frontend/import-real-data.ts` (chưa track, §5 mục 1).
     **Tài liệu được cập nhật 18/09 bằng một đoạn nhìn lại thay vì viết tiếp Bước 1**:
     `feat/database-application` tách từ `master` ngày 23/08 (ngay sau khi Task 1–4 của
     `4.` được merge vào), và thay vì làm xong kế hoạch này, đội chuyển hướng sang triển
     khai migration `0014` + tính năng "Nhập Excel" mới cho danh mục, demo app cho chú
     Quyết, rồi tạm dừng toàn bộ việc này cho tới 18/09. Đọc theo nghĩa đen thì giống
     "bài toán nhập liệu chung đã được giải, chứ không phải bài toán dựng lại lịch sử
     riêng" — xem §5 mục 1 để biết vì sao đây là bằng chứng, chứ chưa phải xác nhận.

## 5. Việc còn tồn đọng — đã chuyển đi

Danh sách việc tồn đọng không còn nằm trong sổ tay này. Hai tài liệu sống đang theo dõi chúng:

- **Đang chờ quyết định** (chủ doanh nghiệp, đội Brain, trưởng nhóm) → `docs/tasks/BLOCKERS.md`
- **Sẵn sàng cho người nhận làm** → `docs/tasks/Backend_Task_Board_1Nov26.md`

Từng mục trước đây nằm ở đây đã đi đâu — để các chỗ trích dẫn cũ như "§5 mục 1" hay
"[PB] §5.2" vẫn dẫn tới đúng nơi:

| Mục cũ | Hiện ở |
|---|---|
| 1. `frontend/import-real-data.ts` đã cũ | `docs/tasks/BLOCKERS.md` D3 |
| 2. Ba sản phẩm lệch giữa danh mục và N-X-T (`KM00008`, `KM00017`, `KM00034`) | `docs/tasks/BLOCKERS.md` D1 |
| 3. Dòng tồn kho âm (`VT00039`, `VT00042`, có thể cả `KM00034`) | `docs/tasks/BLOCKERS.md` D2 |
| 4. Không file nguồn nào có giá bán | §6 bên dưới — tính năng giá nhiều mức |
| 5. Cast `::integer` trong `getSalesReportForPeriod` | **Đã sửa** ở `16ae83b` (`docs/tasks/BLOCKERS.md` → "Đã giải quyết") |
| 6. Thứ tự seed (`seedCategories()` không bao giờ chạy) | **Đã sửa** ở `16ae83b` (`runStartupSeed()`) |
| 7. Seed chạy cả ở production | **Đã sửa** ở `16ae83b` (phải bật rõ `ENABLE_STARTUP_SEED=true`) |
| 8. Nhiễu line ending CRLF/LF | **Đã sửa** ở `16ae83b` (`.gitattributes`); `brain.ts` vẫn còn nhiễu → `docs/tasks/BLOCKERS.md` K1 |

## 6. Việc đang làm: giá nhiều mức ("Giá áp dụng")

### Bối cảnh nghiệp vụ (họp với chú Quyết)

- Giá bán **cố ý không có** trong mọi file Excel xuất ra — vì giá thay đổi theo từng khách
  hàng ("khách ruột" khác "khách lạ") và theo nhiều yếu tố khác, không phải do sơ suất.
- Có tồn tại một bảng giá cố định/gốc, nhưng **thay đổi cần được người ở trên duyệt** trước
  khi có hiệu lực — không phải sửa trực tiếp một trường dữ liệu.
- Chú quyết định giá *hằng ngày* bằng cách cân nhắc **Đại lý cấp 1, cấp 2, và giá bán lẻ
  cùng lúc** so với thị trường — các mức giá này ảnh hưởng lẫn nhau, không phải là các bảng
  giá độc lập chỉ set một lần rồi bỏ đó.
- Giá nhập (mua vào) cũng có mức: **giá nhập lẻ và giá nhập sỉ** — một khái niệm tách biệt
  với các mức giá bán ở dưới.
- Phần mềm ERP của công ty khác của chú (`erp.eteksofts.com`) chỉ hỗ trợ **1 trường mức giá
  cho mỗi hoá đơn** — hoá đơn có sản phẩm cần bán theo mức giá khác phải tách thành nhiều hoá
  đơn. Bất cứ thứ gì ANSER xây nên hỗ trợ chọn mức giá **theo từng dòng sản phẩm** để vượt
  qua hạn chế này.
- Còn mở, chưa giải quyết, không phải câu hỏi về DB nhưng đáng theo dõi: RBAC cho chatbot AI
  (ai được dùng, rủi ro rò rỉ tin nhắn của chú) và TODO về hạn sử dụng / hàng thanh lý — cả
  hai đều chưa có chỗ trong schema.

### Yêu cầu tính năng (từ buổi demo của chú)

Một bộ chọn "Giá áp dụng" khi tạo giao dịch bán hàng, 5 mức:
`Bán lẻ` · `Đại lý cấp 1` · `Đại lý cấp 2` · `Đại lý cấp 3` · `Giá bán thương mại điện tử (online)`.

### Làm rõ ngày 18/09/2026 (có đồng nghiệp thứ hai cùng rà lại ghi chú buổi họp)

Hai điều sau làm thay đổi thiết kế, rút ra trực tiếp từ việc rà lại ghi chú buổi họp cùng
người khác cũng có mặt hôm đó:

- **Chú Quyết mang hai vai trò.** Chú là *nhân viên* ở "Tân Phát" (chủ sở hữu phần mềm demo
  `erp.eteksofts.com`) và đồng thời là *chủ sở hữu* của "Hoàng Phát" (khách hàng pilot thật
  sự). Câu trả lời "cần có bên đứng trên để duyệt giá" mô tả quy trình của **Tân Phát** (ở đó
  chú phải trình lên cấp trên duyệt) — **không áp dụng cho Hoàng Phát**. Ở Hoàng Phát chú là
  chủ của một đội 3–5 người; kế toán nhập giá tay và chú **giám sát**, nhưng không có ai "ở
  trên chú" để chặn một thay đổi. → **Câu hỏi mở #2 bên dưới coi như đã giải quyết: không cần
  thiết kế quy trình duyệt.**
- **Đại lý cấp 3 và giá online/TMĐT là chi tiết từ demo của Tân Phát, chưa được xác nhận là
  mức giá của Hoàng Phát.** Phần mềm của Tân Phát có thể đơn giản là có bảng giá rộng hơn
  những gì Hoàng Phát thực tế đang dùng. Các mức giá được xác nhận đang dùng thật ở Hoàng
  Phát hiện chỉ có **Bán lẻ, Đại lý cấp 1, Đại lý cấp 2**. Cấp 3/online có thể được thêm sau
  — và khi đó, việc thêm phải là một thao tác INSERT dữ liệu, không phải một migration
  schema. **Điều này loại bỏ phương án `CHECK ... IN (5 giá trị)` cứng** (bản phác thảo đầu
  tiên của tôi) để chuyển sang dùng bảng tra cứu (lookup table).

### Đề xuất schema — **đề xuất mở, chưa triển khai, cần được thông qua**

```ts
// Bảng tra cứu (lookup table), không phải enum cứng — thêm một mức giá mới sau này
// (cấp 3, online, hay bất cứ gì Hoàng Phát nghĩ ra) là một câu INSERT, không phải migration.
export const priceTiers = pgTable("price_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(), // 'retail' | 'agent_1' | 'agent_2' | ... — tự do, không ép cứng
  name: text("name").notNull(), // tên hiển thị, vd "Bán lẻ"
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true), // ngừng dùng một mức giá mà không xoá lịch sử giá của nó
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("price_tiers_code_unique").on(sql`lower(${t.code})`),
]);

export const productPrices = pgTable("product_prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  tierId: uuid("tier_id").notNull().references(() => priceTiers.id, { onDelete: "restrict" }),
  price: integer("price").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("product_prices_product_tier_unique").on(t.productId, t.tierId),
]);
```

Chỉ seed 3 dòng đã xác nhận (`retail`/`agent_1`/`agent_2`) — đừng seed sẵn `agent_3`/`online`
cho tới khi Hoàng Phát thực sự yêu cầu.

Thêm một cột FK nullable trên dòng bán hàng hiện có (nullable = khách vãng lai/ghi đè tay,
không chọn mức giá nào):

```ts
priceTierId: uuid("price_tier_id").references(() => priceTiers.id, { onDelete: "set null" }), // trên sales_invoice_items
```

**Câu hỏi mở cần giải quyết trước khi viết migration**:

1. **`products.price` hiện đang được đọc trực tiếp ở rất nhiều chỗ**
   (`totalStockValue` trong `reports.ts`, `unitPrice` mặc định trong `sales.ts`, giao diện
   danh sách sản phẩm). Nó sẽ trở thành bản sao của dòng `retail`, bị bỏ hẳn để luôn join
   với `product_prices`, hay giữ lại làm giá trị dự phòng khi một mức giá chưa được set? Cần
   chốt trước khi migrate — quyết định này quyết định migration là additive hay breaking.
2. ~~Quy trình duyệt giá~~ **Đã giải quyết 18/09** — không cần cổng duyệt cho Hoàng Phát (xem
   ở trên). Vẫn đáng hỏi thêm liệu "chú giám sát" có muốn nhiều hơn thế không — vd một cặp
   `updated_by`/`updated_at` đơn giản trên `product_prices` để có thể xem lại, chứ không cần
   một quy trình chặn thật sự. Ưu tiên thấp, không phải điểm chặn.
3. **Hiệu lực theo thời gian (effective-dating)** — giá "sửa liên tục". Ghi đè trực tiếp
   (last-write-wins) có chấp nhận được không, hay báo cáo cần biết giá của một mức tại một
   thời điểm trong quá khứ, độc lập với bất kỳ giao dịch bán nào (snapshot trên dòng hoá đơn
   chỉ ghi lại giá đã bán thực tế, không phải lịch sử giá niêm yết của cả mức giá đó)?
4. **Mức giá bên mua** (giá nhập lẻ/sỉ) — làm một bảng riêng tương tự bảng này nhưng gắn với
   `inventory_transactions`, hay để ngoài phạm vi cho tới khi bên bán xong trước? Vẫn còn mở
   — cũng chưa xác nhận được đây là câu trả lời trực tiếp cho một câu hỏi cụ thể hay là chú
   tự nói thêm (xem danh sách câu hỏi còn treo ngày 18/09 trong chính ghi chú buổi họp).
5. **Xác nhận vẫn còn mở, chưa được giải quyết ở đợt rà soát 18/09**: ý tưởng khách lâu năm
   so với khách vãng lai của đội AI (§7) rốt cuộc sẽ là thêm một dòng trong `price_tiers`,
   một cột `customers.default_tier_id`, hay một thứ hoàn toàn tách biệt khỏi bảng này (vd một
   khoản giảm giá áp *trong* mức giá mà khách đã thuộc về)? Đã xác nhận trực tiếp là vẫn chưa
   ai quyết được — không phải điều chú Quyết đã làm rõ, và đội AI cũng chưa viết thành văn
   bản.

## 7. Phụ thuộc: đội AI/"Brain"

Repo riêng: `PCBoiz/ANSER_AI`, nhánh `feat/workflow-format-and-deterministic-core`. Có 2 tài
liệu bàn giao ở đó (`TIEN_TRINH_BRAIN.md` — tình trạng engine kế toán/AI,
`BAN_GIAO_VAN_TAI.md` — module báo giá vận tải, đã bị hạ ưu tiên sang nhánh phụ vì khách
pilot không phải công ty vận tải). Không tài liệu nào trong 2 cái đó hiện có ghi rõ ý tưởng
giá theo khách lâu năm-vs-vãng lai bằng văn bản — tính đến lúc viết bài này, nó vẫn chỉ là
một cuộc trao đổi miệng phía họ, chưa thành spec.

**Một nguyên tắc từ tài liệu của họ đáng mang theo vào bất kỳ việc gì liên quan tới giá ở
đây**: nguyên tắc không thương lượng của họ là AI **không bao giờ tính ra số liệu tài chính,
chỉ có code tất định mới được làm việc đó** (họ từng gặp một sự cố thật: một model tự nhẩm
`5.000.000 + 500.000` trong đầu, ra đúng kết quả, và điều đó bị đánh dấu là nguy hiểm chính
*vì* nó tình cờ đúng lần đó). Dù đội AI đề xuất gì cho việc định giá theo khách hàng, phép
tính giá thật sự tính vào hoá đơn nên nằm ở backend tất định của repo này — Brain có thể gợi
ý hoặc giải thích một mức giá, chứ không nên là nơi tính ra con số cuối cùng ghi vào hoá đơn.

## 8. Làm việc trong repo này — lưu ý vận hành

- **Một lockfile duy nhất**: `frontend/pnpm-lock.yaml`. Dùng package manager nào tuỳ ý để
  phát triển, nhưng phải `pnpm install` + commit lại lockfile sau mỗi lần đổi dependency
  (`README.md`).
- **Quy trình Drizzle**: sửa `schema.ts` → `pnpm db:generate` → **tự tay diff SQL sinh ra với
  `schema.ts`** trước khi tin nó — drizzle-kit từng bỏ sót `check()` constraint (xem §4, Task
  1 bước 2) → `pnpm db:migrate`.
- **Xác minh constraint thực sự có trên Neon** sau khi migrate, đừng chỉ tin bộ sinh migration
  — các truy vấn `pg_constraint`/`information_schema` trong `4.` (master) là khuôn mẫu để
  dùng lại.
- **Dùng nhánh Neon riêng để thử nghiệm** (`dev`, tách từ `production`), đừng thử trực tiếp
  trên production — dự án này đã làm vậy rồi (§4, Task 1 bước 3).
- **Line ending**: `.gitattributes` chuẩn hoá mọi file về LF (từ `16ae83b`). Đặt editor dùng
  LF. `frontend/src/server/brain.ts` vẫn báo "bị sửa" ở mỗi lần checkout — đừng commit nó; xem
  `docs/tasks/BLOCKERS.md` K1.

## 9. Bắt đầu từ đâu

1. Mới vào codebase, hoặc mới học lập trình? Đọc `docs/onboarding/Onboarding_Playbook.md`
   trước (cài đặt, cách code chia tầng, những điều không bao giờ làm).
2. Đọc §1–§4 và §6 ở đây để nắm bức tranh toàn cảnh, rồi `docs/decisions/5. Database_Session_Log.md` để xem nhật ký
   chi tiết (sổ tay này chỉ lập mục lục cho nó).
3. Chọn việc trong `docs/tasks/Backend_Task_Board_1Nov26.md`, và làm theo quy tắc phối hợp ở đó
   (tạo nhánh từ đâu, ai được tạo migration).
4. Trước khi tự quyết điều gì về mức giá, công nợ, phân quyền hay bất thường trong dữ liệu
   thật, xem `docs/tasks/BLOCKERS.md` — nếu việc đó nằm trong danh sách, không phải việc mình
   tự quyết.
