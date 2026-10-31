# Phản hồi ERD Merge Strategy + lược đồ dựng được ngay

> Gửi: Database Design + đội Body — 10/08/2026
> Trả lời: `ERD_Merge_Finalization_Strategy.md` (M1–M6)
> Bối cảnh: [`HA_TANG_VA_ERD.md`](HA_TANG_VA_ERD.md) — hạ tầng toàn hệ + D1–D7

Bản Merge Strategy đọc rất kỹ và **sửa đúng ba chỗ bên Brain sai**. Tài liệu này
trả lời từng mục M1–M6, thêm bảy điểm bên Brain phát hiện thêm (`B1–B7`), và kèm
sẵn `schema.ts` đầy đủ + SQL ràng buộc ở phụ lục — để nếu đồng ý thì bắt đầu
được ngay, không phải dịch từ bản vẽ sang code một lần nữa.

**Sơ đồ ERD chuẩn sẽ vẽ sau khi chốt** — đúng bước 2 trong lộ trình các bạn đề
xuất. Chốt trước, vẽ sau, để không có ba bản vẽ mâu thuẫn nhau.

---

## 0. Ba chỗ Merge Strategy sửa đúng

Nói trước cho sòng phẳng.

| Mục | Bên Brain sai ở đâu |
|---|---|
| **M4** | D2 nói *giá trị nào hợp lệ*, không nói *ép bằng cách nào*. Ghi chú trong code không phải ràng buộc. Đúng. |
| **M5** | D3 chỉ đề `numeric` trần. `numeric(14,3)` chặt hơn và đúng hơn. Và các bạn có **bằng chứng thật** bên Brain không có: `38.4`, `172.8`, `940.8`, `2092.8` lít trong file tồn kho thật. D3 từ một lập luận thành ra một dữ kiện. |
| **M6** | Lo ngại "dọn dẹp chuỗi tự do" của D5 **không áp dụng** — chưa có dữ liệu thật thì không có gì để dọn. Đây là bảng mới toanh. |

**M3** cũng là một phát hiện bên Brain không có: `KHO KHUYẾN MẠI` trong tên file
thật. Bên Brain đã đánh giá D7 thấp hơn thực tế — xem `B7`.

---

## 1. Trả lời từng mục M1–M6

### M1 · `Category` thành bảng — **Đồng ý**

Rẻ nhất lúc này, đúng như các bạn nói. Bổ sung một chi tiết:

`automation_rules.categoryFilter` hiện là `text`. Nếu `categories` thành bảng mà
cột này vẫn là text, một lần đổi tên danh mục là **luật cảnh báo tồn kho im
lặng ngừng khớp** — không lỗi, không cảnh báo, chỉ là không bao giờ chạy nữa.

Đề xuất: đổi luôn thành `category_id` FK, `ON DELETE SET NULL`. Sửa một lần cho
cả hai chỗ.

### M2 · Bỏ `Workflow`/`WorkflowExecution` — **Đồng ý, nhưng thiếu một nửa sự thật**

`automation_rules` đúng là bảng thật. Nhưng nó **chỉ chứa luật cảnh báo tồn kho
thấp**. Ngoài nó ra còn **bốn workflow n8n không có mặt trong Postgres**:

| Workflow | Chạy khi nào | Hỏng thì sao |
|---|---|---|
| `logistics_fuel_price_sync` | 6h sáng hàng ngày | báo giá âm thầm dùng giá dầu cũ |
| `logistics_quote_request` | webhook | không báo giá được |
| `logistics_quote_approve` | webhook | không gửi được email khách |
| `logistics_debt_reminder` | thứ 2 hàng tuần | không ai nhắc công nợ |

Nên câu hỏi các bạn đặt ra có một cạnh sắc hơn: workflow cào giá dầu **thiết kế
để THROW khi bóc giá không được** (không ghi giá bịa). Nó hỏng ầm ĩ trong n8n, và
**không ai bên ANSER nhìn thấy**. Sáng hôm sau báo giá vẫn chạy, chỉ là dùng giá
của hôm kia.

Đề xuất tối thiểu — không cần bảng execution đầy đủ:

```
automation_rules.last_run_at      timestamptz
automation_rules.last_run_status  text        -- 'ok' | 'failed'
automation_rules.last_run_note    text
```

Ba cột, n8n ghi vào cuối mỗi lần chạy. Đủ để dashboard hiện "cào giá dầu: hỏng
2 ngày rồi". Lịch sử đầy đủ vẫn để n8n giữ.

Kèm điều kiện: bốn workflow trên phải có bản ghi trong `automation_rules` (hiện
chưa có), nếu không thì ba cột này không gắn vào đâu được.

### M3 · Nhiều kho — **Đồng ý hỏi lại chủ DN, và bên Brain xin đổi phiếu**

Phát hiện `KHO KHUYẾN MẠI` là đúng, và nó khớp với một chuyện bên Brain gặp độc
lập: bộ soi lỗi sổ sách có một phép kiểm **"hàng có số lượng nhưng không ghi
nhận giá trị"** — điển hình là **kho khuyến mại**. Hàng nhà cung cấp tặng kèm:
có thật, có giá vốn thật, nhưng không được ghi đồng nào, nên lãi gộp bị thổi lên.

Nghĩa là "kho khuyến mại" không chỉ là một cái tên — nó là một **chính sách định
giá khác**. Nếu nó là kho riêng thật thì:

- D7 (`warehouse_id` trên phiếu kho) lên nhóm ưu tiên đầu
- và phép kiểm zero-value cần biết kho nào được phép có giá trị 0

Đề nghị hỏi chủ DN thêm một câu nữa cạnh câu của các bạn:

> *"Hàng trong KHO KHUYẾN MẠI có được ghi giá vốn không, hay để 0? Khi xuất bán
> kèm thì có tính vào giá vốn đơn hàng không?"*

Câu trả lời quyết định cả D7 lẫn cách bộ soi chấm.

### M4 · Ép `type` bằng ràng buộc — **Đồng ý, và Drizzle 0.45.2 làm được**

Đã kiểm: `drizzle-orm@0.45.2` có `check()` trong `pg-core`. Không cần viết SQL
tay cho phần này. Cú pháp có trong phụ lục A.

Bên Brain đề nghị dùng **`CHECK` chứ không phải native `enum` type**: thêm một
giá trị vào `CHECK` chỉ là một migration `ALTER`; thêm vào Postgres `enum` thì
vướng `ALTER TYPE ... ADD VALUE` không chạy được trong transaction ở một số bản.
Với một danh sách còn có thể đổi, `CHECK` mềm hơn mà chặt ngang.

### M5 · `numeric(14,3)` + `unit_factor` tổng quát — **Đồng ý, thêm hai điều**

Về `unit_factor`: bên Brain đề nghị **một số + một cột `base_unit`**, không cần
bảng tra riêng.

```
unit        'Thùng'     -- đơn vị bán/nhập
base_unit   'Chai'      -- đơn vị quy chuẩn để so sánh và cộng dồn
unit_factor 24          -- 1 Thùng = 24 Chai
```

Phủ được cả `1 Phuy = 200 Lít` lẫn `1 Thùng = 24 Chai`. Chuỗi quy đổi nhiều tầng
(thùng → chai → ml) hiếm trong ngành này; khi nào gặp thật thì tách bảng, chưa
gặp thì đừng dựng sẵn.

**Hai điều bổ sung — xem `B2` và `B3`.** Một chỗ các bạn bỏ sót cột quan trọng
nhất, một chỗ là quy tắc phải thống nhất giữa hai hệ.

### M6 · `suppliers` — **Đồng ý hoàn toàn**

Các bạn đúng về chi phí. Bổ sung một điểm nghiệp vụ: bảng này cần `tax_code`
(MST) chứ không chỉ tên — đối chiếu hoá đơn đầu vào theo MST đáng tin hơn theo
tên, và MST là thứ có trên mọi hoá đơn GTGT.

---

## 2. Bảy bổ sung từ phía Brain

Xếp theo mức thiệt hại.

---

### B1 · `quantity` nên **có dấu**, không phải luôn dương

**Đây là đề xuất bên Brain cho là quan trọng nhất trong bản này.**

Ghi chú trên ERD v2 nói *"1 bảng này sẽ dùng 1 cái enum và logic backend để tính
toán lúc nào phải cộng và lúc nào phải trừ"*. Code hiện tại làm đúng vậy:
`SET stock = stock - quantity` cho phiếu xuất.

Cách đó **không biểu diễn được `adjustment`**. Kiểm kê có thể ra thừa **hoặc**
thiếu; với `quantity` luôn dương thì phải đẻ thêm `adjustment_up` /
`adjustment_down`, và mỗi lần thêm một loại nghiệp vụ lại phải đẻ thêm một cặp.

Đề xuất: **`quantity` mang dấu.** `+` là tăng kho, `−` là giảm kho.

| Nghiệp vụ | `type` | `quantity` |
|---|---|---|
| Nhập hàng | `import` | `+38.4` |
| Bán / xuất | `export` | `−12` |
| Kiểm kê thiếu | `adjustment` | `−3` |
| Kiểm kê thừa | `adjustment` | `+1` |
| Chuyển kho | `transfer` | `−50` ở kho nguồn, `+50` ở kho đích (hai dòng, cùng `source_id`) |

Ba cái được ngay:

1. **`stock` = `SUM(quantity)`.** D6 (đối chiếu tồn kho) từ một việc phải viết
   logic thành **một câu truy vấn** — và không có logic nào để viết sai.
2. `transfer` biểu diễn được mà không cần bảng riêng.
3. Không bao giờ phải nhớ "loại nào thì trừ".

Đổi lại: `sales.ts` phải sửa `stock - quantity` thành `stock + quantity` và ghi
số âm. Một dòng, và **nên sửa ngay lúc chưa có dữ liệu**.

> Nếu các bạn thấy số âm khó đọc trên giao diện thì hiển thị `ABS()` — đó là
> việc của tầng hiển thị, không phải của lược đồ.

---

### B2 · `products.stock` cũng phải là `numeric(14,3)`

M5 đổi `inventory_transactions.quantity` và `sales_invoice_items.quantity` sang
`numeric`, nhưng **không nhắc `products.stock`** — hiện là `integer`.

Nhập `38.4` lít vào một cột `integer` là **cắt cụt âm thầm**: phiếu ghi đúng
38.4, số dư thành 38. Lệch 0.4 mỗi lần, cộng dồn không ai truy ra.

Đây đúng là lỗi mà D3 sinh ra để chặn, chỉ là ở cột bị bỏ quên.

> Cảnh báo kèm theo: Drizzle trả `numeric` về **kiểu chuỗi** trong JS theo mặc
> định. Có `mode: "number"` trong 0.45.2 — dùng nó, hoặc mọi phép cộng trong
> code sẽ thành nối chuỗi và `"38.4" + 12` ra `"38.412"`. Loại lỗi không có
> triệu chứng nào ngoài một con số vô lý.

---

### B3 · Quy tắc làm tròn tiền phải viết ra, và hai hệ phải giống nhau

Số lượng lẻ kéo theo `line_total = unit_price × quantity` ra số lẻ. Body lưu
tiền là `integer` VND, nên **phải làm tròn** — và quy tắc làm tròn hiện chưa
được viết ở đâu.

Chuyện này không nhỏ, vì Brain **tính lại** tổng hoá đơn để đối chiếu (đó là
toàn bộ giá trị của tính năng kiểm hoá đơn). Hai bên làm tròn khác nhau thì
Brain báo lệch trên chính những hoá đơn đúng — báo động giả, và người dùng học
được cách bỏ qua cảnh báo.

**Brain đang dùng: làm tròn nửa LÊN** (`ROUND_HALF_UP`), không phải kiểu ngân
hàng. Ví dụ: `0.5 → 1`, `2.5 → 3`.

Lưu ý cho phía JS: `Math.round()` làm tròn nửa lên **với số dương** — khớp
Brain. Nhưng `Math.round(-2.5)` ra `-2` (nửa lên theo trục số), còn Brain ra
`-3` (nửa ra xa số 0). Với tiền dương thì không sao; nếu có dòng âm (chiết khấu,
trả hàng) thì **phải chốt lại**.

Đề xuất: viết quy tắc vào comment ngay cạnh cột `line_total`, và làm tròn ở
**một hàm dùng chung**, không rải rác.

---

### B4 · D4 nên là **sổ thanh toán**, không phải cột số dư

Merge Strategy chốt "receivables in Postgres", nhưng chưa chốt hình dạng. Bên
Brain đề nghị: **sổ, không phải số dư**.

`paid_amount` là một số dư chạy — **lặp lại đúng vấn đề mà D6 sinh ra để canh**.
Khách trả làm ba lần, ai đó sửa tay một lần, và không còn cách nào biết đúng
sai.

```
invoice_payments  (id, invoice_id, amount, paid_at, method, note)
```

Còn nợ = `sales_invoices.total − SUM(invoice_payments.amount)`. Suy ra được, đối
chiếu được, và mỗi lần trả có ngày tháng — thứ cần để tính số ngày quá hạn trung
bình.

Trên `sales_invoices` chỉ cần thêm `due_date`. **Không cần cả `status` lẫn
`paid_amount`**: cả hai đều suy ra được, và cả hai đều có thể lệch.

> Nếu vẫn muốn `status` cho nhanh truy vấn thì để dạng cột dẫn xuất/view, và ghi
> rõ nó là bản sao — cùng cách đối xử với `products.stock` ở D6.

---

### B5 · `source_type` / `source_id` cần một `CHECK`

D1 dùng FK đa hình, nên **không có ràng buộc nào ở tầng DB**. Tối thiểu phải ép
hai cột đi cùng nhau:

```sql
CHECK ((source_type IS NULL) = (source_id IS NULL))
```

Không có nó thì `source_id` mồ côi (có ID, không biết trỏ vào bảng nào) là hợp
lệ với database — và chỉ lộ ra khi ai đó đi truy vết một chênh lệch.

Kèm `CHECK` cho tập giá trị `source_type` giống M4.

---

### B6 · Hợp đồng giữa hai repo cần máy kiểm được — bằng chứng: Brain đang sai

Đây là mục bên Brain thấy đáng nói nhất, vì **lần này bên sai là Brain**.

`src/core/saas_api.py` có một khối hằng số ánh xạ tên bảng/cột của Body. Đối
chiếu với `schema.ts` hôm nay:

| Brain đang truy vấn | Thực tế bên Body |
|---|---|
| `products.stock_quantity` | `products.stock` ❌ |
| `products.workspace_id` | `products.warehouse_id` ❌ |
| bảng `sales` | bảng `sales_invoices` ❌ |
| `sales.amount` | `sales_invoices.total` ❌ |

**4 trên 8 định danh không tồn tại.** Nghĩa là nhánh tra cứu dữ liệu nội bộ của
Brain **chưa từng chạy được** với database thật — mọi truy vấn ném lỗi, bị bắt,
và trả ra câu *"Lỗi hệ thống khi tìm sản phẩm"*, trông y hệt một sự cố kết nối.

Điều đáng nói: Brain **có** 23 bài kiểm cho lớp này và tất cả đều xanh — vì bài
kiểm tự dựng bảng **từ chính khối hằng số sai đó**. Hai đầu của phép kiểm cùng
lấy từ một nguồn sai, nên nó tự nhất quán và không nối gì với thực tế.

Bên Brain sẽ sửa **sau khi lược đồ mới chốt**, để không sửa hai lần. Nhưng bài
học thì áp cho cả hai bên:

> Bản vẽ ERD, `schema.ts`, và khối hằng số của Brain là **ba nơi mô tả cùng một
> thứ**. Không có phép kiểm tự động nào nối chúng lại thì chúng sẽ lệch, và
> triệu chứng luôn là "một câu trả lời nghe hợp lý với con số sai".

Đề nghị cụ thể, rẻ:

1. Sau khi chốt lược đồ, đội Body giữ `schema.ts` là **nguồn duy nhất**
2. Brain thêm một bài kiểm đọc thẳng `schema.ts` và đối chiếu từng tên nó truy vấn
3. Đổi tên cột → bài kiểm đỏ ngay, thay vì im lặng thêm vài tháng

Kèm một câu hỏi lược đồ đi ra từ đây: **`sales_invoices` không có cột phạm vi
kho nào.** Brain nhận `X-Store-Id` (là `warehouse_id`) và cần lọc doanh số theo
kho. Hiện không lọc được. Nếu M3 xác nhận nhiều kho là thật thì
`sales_invoices.warehouse_id` cần có — nếu không, báo cáo doanh thu theo kho
không dựng được.

---

### B7 · Hai chi tiết nhỏ nhưng sẽ mất thời gian nếu không nói

**Số migration kế tiếp là `0012`, không phải `0011`.** Merge Strategy ghi "10
applied migrations" và "continuing 0011 onward". Nhánh `feat/brain-integration`
đã có `0011_lush_dracula.sql` (commit `fc59f30`, ba cột giá vốn). Nếu dựng từ
nhánh đó thì kế tiếp là `0012`.

**Ba cột giá vốn phải có mặt trong ERD chuẩn.** Chúng đã live trong `schema.ts`
nên là ground truth, không phải đề xuất — nhưng mục "settled" của Merge Strategy
không nhắc tên chúng. Nếu ERD chuẩn được vẽ từ ERD v2 + M1–M6 thì rất dễ **rơi
mất do bỏ sót**:

```
products.cost                    -- NULL = CHƯA BIẾT
inventory_transactions.unit_cost -- giá vốn của chính lô đó
sales_invoice_items.unit_cost    -- snapshot LÚC BÁN
```

Cột thứ ba là cột không thể thiếu: mất nó thì báo cáo lãi gộp lấy giá vốn **hôm
nay** áp cho hoá đơn **quý trước**.

---

## 3. Tổng hợp quyết định

| # | Mục | Bên Brain | Ghi chú |
|---|---|---|---|
| M1 | `categories` thành bảng | ✅ đồng ý | kèm `automation_rules.category_id` |
| M2 | bỏ `Workflow`/`WorkflowExecution` | ✅ đồng ý | thêm 3 cột `last_run_*` |
| M3 | nhiều kho — hỏi chủ DN | ✅ đồng ý | thêm câu hỏi về định giá kho KM |
| M4 | ép `type` bằng ràng buộc | ✅ đồng ý | dùng `CHECK`, không dùng native enum |
| M5 | `numeric(14,3)` + `unit_factor` | ✅ đồng ý | `unit_factor` + `base_unit`, một tầng |
| M6 | `suppliers` | ✅ đồng ý | thêm `tax_code` |
| **B1** | **`quantity` có dấu** | 🔵 đề xuất mới | biến D6 thành một câu truy vấn |
| **B2** | `products.stock` → `numeric` | 🔵 bổ sung M5 | cột bị bỏ sót |
| **B3** | quy tắc làm tròn tiền | 🔵 mới | hai hệ phải giống nhau |
| **B4** | sổ `invoice_payments` | 🔵 sửa D4 | số dư suy ra, không lưu |
| **B5** | `CHECK` cho cặp source | 🔵 bổ sung D1 | |
| **B6** | hợp đồng máy kiểm được | 🔵 mới | Brain đang sai 4/8 định danh |
| **B7** | migration `0012` + ba cột giá vốn | 🔵 nhắc | dễ rơi mất do bỏ sót |

**Ba câu cần người trả lời trước khi vẽ ERD chuẩn:**

1. **M1** — `categories` thành bảng: đội Body duyệt hay bác?
2. **M3** — `KHO KHUYẾN MẠI` là kho thật hay chỉ là cách ghi sổ? *(chủ DN)* — và hàng trong đó có ghi giá vốn không?
3. **B1** — `quantity` có dấu: đội Body thấy hợp lý không? Đây là thay đổi ảnh hưởng tới cách viết code nhiều nhất trong cả bản này.

Trả lời được ba câu đó thì phần còn lại vẽ thẳng ra được.

---

## Phụ lục A — `schema.ts` đề xuất

Đã kiểm cú pháp với `drizzle-orm@0.45.2` (bản đang dùng). Phần **in đậm bằng
comment `// MỚI`** là thay đổi so với hiện tại.

```ts
import { check, integer, numeric, pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const warehouses = pgTable("warehouses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  notificationEmail: text("notification_email"),
  // MỚI (M3): kho khuyến mại có chính sách định giá khác — hàng nhà cung cấp
  // tặng kèm được phép có giá trị 0. Không đánh dấu thì bộ soi lỗi sổ sách sẽ
  // gắn cờ "hàng có số lượng nhưng không ghi nhận giá trị" cho cả kho này.
  allowsZeroValue: boolean("allows_zero_value").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// MỚI (M1)
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// MỚI (M6/D5)
export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // MST đáng tin hơn tên khi đối chiếu hoá đơn đầu vào, và có trên mọi hoá đơn GTGT.
  taxCode: text("tax_code"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  position: text("position"),
  phone: text("phone"),
  email: text("email"),
  hireDate: timestamp("hire_date", { withTimezone: true }),
  warehouseId: uuid("warehouse_id").references(() => warehouses.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("staff"),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("users_role_hop_le", sql`${t.role} IN ('staff','manager','admin')`),
]);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  // MỚI (M1): thay `category: text`
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  unit: text("unit").notNull().default("Cái"),
  // MỚI (M5): quy đổi MỘT TẦNG về đơn vị gốc. 1 Phuy = 200 Lít; 1 Thùng = 24 Chai.
  baseUnit: text("base_unit"),
  unitFactor: numeric("unit_factor", { precision: 14, scale: 4, mode: "number" })
    .notNull().default(1),
  // MỚI (B2): `integer` cắt cụt 38.4 thành 38 — im lặng, cộng dồn, không truy ra được.
  // `mode: "number"` BẮT BUỘC: mặc định Drizzle trả numeric về CHUỖI, và
  // "38.4" + 12 ra "38.412".
  stock: numeric("stock", { precision: 14, scale: 3, mode: "number" }).notNull().default(0),
  price: integer("price").notNull().default(0),
  // NULL = CHƯA BIẾT, khác hẳn 0 = "hàng không tốn đồng nào". Không có phân biệt
  // này thì báo cáo lãi lỗ coi mọi mặt hàng chưa nhập giá vốn là lãi 100%.
  cost: integer("cost"),
  warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryTransactions = pgTable("inventory_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  // MỚI (D7): pending M3. Để nullable trước; NOT NULL sau khi chủ DN xác nhận.
  warehouseId: uuid("warehouse_id").references(() => warehouses.id),
  // MỚI (D2 + M4): ép ở tầng DB, không phải comment.
  type: text("type").notNull(),
  // MỚI (B1 + M5): CÓ DẤU. `+` tăng kho, `−` giảm kho.
  //   stock = SUM(quantity)  -> đối chiếu là MỘT câu truy vấn, không có logic để sai.
  //   `adjustment` biểu diễn được cả thừa lẫn thiếu mà không cần hai loại.
  //   `transfer` = hai dòng cùng `source_id`: −50 kho nguồn, +50 kho đích.
  quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
  // Giá vốn của chính lô này. Đáng tin hơn `products.cost` (bình quân trôi theo
  // thời gian). NULL = phiếu chưa ghi giá. LUÔN là giá vốn, kể cả ở dòng xuất —
  // ghi giá bán vào đây là biến sổ kho thành sổ doanh thu.
  unitCost: integer("unit_cost"),
  // MỚI (D1): nối phiếu kho về chứng từ gốc. `counterparty` là chữ tự do nên
  // hai khách trùng tên là đối chiếu không ra.
  sourceType: text("source_type"),
  sourceId: uuid("source_id"),
  // MỚI (D5)
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  counterparty: text("counterparty"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("inv_tx_type_hop_le",
    sql`${t.type} IN ('import','export','adjustment','transfer')`),
  // MỚI (B5): FK đa hình không có ràng buộc nào ở tầng DB. Tối thiểu ép hai cột
  // đi cùng nhau — `source_id` mồ côi chỉ lộ ra khi ai đó đi truy vết chênh lệch.
  check("inv_tx_source_di_cung_nhau",
    sql`(${t.sourceType} IS NULL) = (${t.sourceId} IS NULL)`),
  check("inv_tx_source_type_hop_le",
    sql`${t.sourceType} IS NULL OR ${t.sourceType} IN ('sale','purchase','stocktake','transfer','manual')`),
  // Số lượng 0 không phải nghiệp vụ nào cả — chặn để khỏi có dòng rác.
  check("inv_tx_quantity_khac_khong", sql`${t.quantity} <> 0`),
]);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  taxCode: text("tax_code"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const salesInvoices = pgTable("sales_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  customerName: text("customer_name").notNull(),
  // MỚI (B6): pending M3. Không có cột này thì không lọc được doanh số theo kho,
  // và Brain nhận `X-Store-Id` nhưng không dùng vào đâu được.
  warehouseId: uuid("warehouse_id").references(() => warehouses.id),
  note: text("note"),
  total: integer("total").notNull(),
  // MỚI (D4): hạn thanh toán. Còn nợ thì SUY RA từ invoice_payments — xem B4.
  dueDate: timestamp("due_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const salesInvoiceItems = pgTable("sales_invoice_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull()
    .references(() => salesInvoices.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  // Snapshot lúc bán — lịch sử doanh thu phải đúng kể cả khi sản phẩm đổi giá
  // hoặc bị xoá.
  productName: text("product_name").notNull(),
  unit: text("unit").notNull().default("Cái"),
  unitPrice: integer("unit_price").notNull(),
  // Giá vốn LÚC BÁN. Mất cột này thì lãi gộp lấy giá vốn HÔM NAY áp cho hoá đơn
  // QUÝ TRƯỚC. NULL = chưa biết giá vốn lúc bán.
  unitCost: integer("unit_cost"),
  // MỚI (M5/B2)
  quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
  // B3: LÀM TRÒN NỬA LÊN (0.5 -> 1). Brain tính lại tổng hoá đơn để đối chiếu,
  // nên hai bên làm tròn khác nhau là báo động giả trên chính hoá đơn ĐÚNG.
  // JS: Math.round() khớp với số dương; số âm thì khác — chốt lại nếu có dòng âm.
  lineTotal: integer("line_total").notNull(),
});

// MỚI (D4 + B4): SỔ thanh toán, không phải cột số dư.
// Còn nợ = sales_invoices.total − SUM(invoice_payments.amount)
// `paid_amount` dạng số dư lặp lại đúng vấn đề mà D6 sinh ra để canh.
export const invoicePayments = pgTable("invoice_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull()
    .references(() => salesInvoices.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  method: text("method"),
  note: text("note"),
}, (t) => [
  check("payment_method_hop_le",
    sql`${t.method} IS NULL OR ${t.method} IN ('cash','bank_transfer','other')`),
  check("payment_amount_khac_khong", sql`${t.amount} <> 0`),
]);

export const companySettings = pgTable("company_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().default("ANSER"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  taxCode: text("tax_code"),
  currency: text("currency").notNull().default("VND"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationRules = pgTable("automation_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull().default("low_stock_alert"),
  thresholdQty: numeric("threshold_qty", { precision: 14, scale: 3, mode: "number" }),
  // MỚI (M1): thay `categoryFilter: text` — đổi tên danh mục thì luật im lặng
  // ngừng khớp, không lỗi, không cảnh báo.
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  warehouseId: uuid("warehouse_id").references(() => warehouses.id, { onDelete: "set null" }),
  enabled: boolean("enabled").notNull().default(true),
  n8nWorkflowId: text("n8n_workflow_id"),
  // MỚI (M2): đủ để dashboard hiện "cào giá dầu: hỏng 2 ngày rồi".
  // Lịch sử đầy đủ vẫn để n8n giữ.
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastRunStatus: text("last_run_status"),
  lastRunNote: text("last_run_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("automation_last_run_status_hop_le",
    sql`${t.lastRunStatus} IS NULL OR ${t.lastRunStatus} IN ('ok','failed')`),
]);
```

---

## Phụ lục B — chỉ mục và câu đối chiếu

### B.1. Chỉ mục cần có

Báo cáo lãi lỗ quét theo kỳ; không có chỉ mục thì mỗi lần mở báo cáo là một lần
quét toàn bảng.

```sql
CREATE INDEX idx_inv_tx_product_date  ON inventory_transactions (product_id, created_at DESC);
CREATE INDEX idx_inv_tx_source        ON inventory_transactions (source_type, source_id);
CREATE INDEX idx_inv_tx_warehouse     ON inventory_transactions (warehouse_id, created_at DESC);
CREATE INDEX idx_invoices_date        ON sales_invoices (created_at DESC);
CREATE INDEX idx_invoices_due         ON sales_invoices (due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_invoice_items_prod   ON sales_invoice_items (product_id);
CREATE INDEX idx_payments_invoice     ON invoice_payments (invoice_id);
```

### B.2. D6 — đối chiếu tồn kho, sau `B1` chỉ còn một câu

```sql
SELECT p.code, p.name,
       p.stock                         AS ton_dang_ghi,
       COALESCE(SUM(t.quantity), 0)    AS ton_theo_so,
       p.stock - COALESCE(SUM(t.quantity), 0) AS lech
FROM products p
LEFT JOIN inventory_transactions t ON t.product_id = p.id
GROUP BY p.id, p.code, p.name, p.stock
HAVING p.stock <> COALESCE(SUM(t.quantity), 0);
```

Trả về rỗng = khớp. Đây là toàn bộ `POST /api/inventory/reconcile` — không cần
tự sửa, chỉ cần **nhìn thấy**.

> Nếu `quantity` giữ dạng luôn dương (không theo `B1`) thì câu này phải có
> `CASE WHEN type IN (...) THEN ... ELSE ...`, tức là logic cộng-trừ bị nhân bản
> ra mọi nơi cần đối chiếu — và nơi nào chép sai thì báo khớp trong khi thực tế
> lệch.

### B.3. Công nợ sau `B4`

```sql
SELECT i.id, i.customer_name, i.total,
       COALESCE(SUM(p.amount), 0)              AS da_tra,
       i.total - COALESCE(SUM(p.amount), 0)    AS con_no,
       i.due_date,
       CURRENT_DATE - i.due_date::date         AS so_ngay_qua_han
FROM sales_invoices i
LEFT JOIN invoice_payments p ON p.invoice_id = i.id
WHERE i.due_date IS NOT NULL
GROUP BY i.id
HAVING i.total - COALESCE(SUM(p.amount), 0) > 0
   AND i.due_date::date < CURRENT_DATE
ORDER BY i.due_date;
```

Đây chính là thứ workflow `logistics_debt_reminder` đang làm trên Google Sheet.
Chuyển sang được thì bỏ hẳn một nguồn dữ liệu song song.

---

## Phụ lục C — thứ tự triển khai đề xuất

1. **Chốt ba câu ở mục 3** (M1, M3, B1) — B1 ảnh hưởng cách viết code nhiều nhất,
   nên chốt trước khi ai viết dòng nào
2. **Vẽ ERD chuẩn** từ `schema.ts` đã chốt — một bản duy nhất, thay cả v1/v2/v3
3. **`drizzle-kit generate`** → `0012_*.sql`
4. **Sửa `sales.ts`**: `stock - quantity` → `stock + quantity` với số âm; ghi
   `source_type='sale'` + `source_id=invoice.id`
5. **Endpoint đối chiếu** `POST /api/inventory/reconcile` (câu SQL ở B.2)
6. **Brain sửa khối hằng số** theo tên cột đã chốt + thêm bài kiểm hợp đồng
   (mục B6)
7. **Nhập dữ liệu lịch sử** — sau bước 3, để dòng xấu **hỏng ầm ĩ lúc nhập** thay
   vì âm thầm vi phạm giả định về sau

Bước 6 phụ thuộc bước 3: bên Brain cố ý **chưa sửa bây giờ** để khỏi sửa hai lần.

---

*Có mục nào các bạn thấy không hợp lý, hoặc đã có cách giải khác, cứ bác thẳng.
Đây là đề xuất để chốt, không phải yêu cầu — và ít nhất một mục (`B6`) là chỗ bên
Brain đang sai.*
