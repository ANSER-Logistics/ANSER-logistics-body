import { boolean, check, integer, numeric, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const warehouses = pgTable("warehouses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  notificationEmail: text("notification_email"),
  // C2 — bằng chứng: kho KHUYẾN MẠI trong bản xuất MISA thật có 29/38 dòng
  // "có số lượng, giá trị = 0". Đó là TRẠNG THÁI BÌNH THƯỜNG của kho này (hàng
  // nhà cung cấp tặng kèm), không phải lỗi. Không có cờ này thì bộ soi gắn cờ
  // gần như mọi dòng — và bộ soi kêu ca liên tục thì người dùng tắt nó đi.
  allowsZeroValue: boolean("allows_zero_value").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// M1
// Removed `.unique()` from name, since this enforce exact uniqueness
// The uniqueIndex is here to enforce case-insensitive uniqueness
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("categories_name_case_insensitive_unique").on(sql`lower(${t.name})`),
]);

// M6
export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Mã đối tác từ bản xuất MISA (`Mã nhà cung cấp`, dạng NCC00001).
  //
  // NULLABLE có chủ đích: bản ghi tạo tay trong ứng dụng không có mã, và ép mã
  // cho chúng nghĩa là bịa ra một định danh không tồn tại bên sổ kế toán.
  // Postgres cho phép nhiều NULL trong unique index, nên chúng cùng tồn tại.
  //
  // Đây là KHOÁ ĐỐI CHIẾU của bộ nhập Excel. Không có nó thì phải so bằng MST,
  // mà bản xuất thật chỉ 42/43 nhà cung cấp có MST — và với khách hàng còn tệ
  // hơn: 28/105 bỏ trống. Rơi xuống so theo tên là rơi vào chỗ "CÔNG TY ABC"
  // và "Công ty ABC" thành hai bản ghi, âm thầm.
  code: text("code"),
  name: text("name").notNull(),
  // Công nợ đầu kỳ tại thời điểm bản xuất (VND). `numeric` chứ không `integer`:
  // trần int32 là ~2,1 tỷ, mà công nợ một nhà cung cấp lớn vượt qua dễ dàng.
  openingDebt: numeric("opening_debt", { precision: 18, scale: 2, mode: "number" }),
  // MST đáng tin hơn tên khi đối chiếu hoá đơn đầu vào: "Cty ABC" / "ABC" /
  // "abc trading" là ba chuỗi khác nhau nhưng cùng một MST.
  taxCode: text("tax_code"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Không khoá phân biệt hoa thường: bản xuất MISA ghi "NCC00001", người gõ tay
  // dễ ra "ncc00001". Cùng khuôn với `categories_name_case_insensitive_unique`.
  uniqueIndex("suppliers_code_unique").on(sql`lower(${t.code})`),
]);

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
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
  // C1 — bằng chứng: KM00028 và VT00069 là CÙNG một mặt hàng, hai mã, hai kho
  // (kiểm trên bản xuất thật). Hỏi "còn bao nhiêu dầu này" mà chỉ tra một mã là
  // đếm thiếu. Tự trỏ, nullable — mã hàng hoá thường không trỏ đi đâu.
  linkedProductId: uuid("linked_product_id")
    .references((): AnyPgColumn => products.id, { onDelete: "set null" }),
  unit: text("unit").notNull().default("Cái"),
  // M5 — quy đổi MỘT TẦNG. Bản xuất thật có 10 đơn vị: Lít, kg, Xô, Chiếc,
  // Thùng, Chai, Phuy, Can, Tuýp, Lon. Ví dụ có thật: KM00034 ghi "(0.8L×24)",
  // tức 1 Thùng = 19,2 Lít.
  baseUnit: text("base_unit"),
  unitFactor: numeric("unit_factor", { precision: 14, scale: 4, mode: "number" })
    .notNull().default(1),
  // B2 — `integer` cắt cụt 38.4 thành 38, im lặng. 24/157 dòng trong bản xuất
  // thật có số lẻ (15%), kể cả 101.48.
  // `mode: "number"` BẮT BUỘC: mặc định Drizzle trả numeric về CHUỖI, và
  // "38.4" + 12 ra "38.412".
  stock: numeric("stock", { precision: 14, scale: 3, mode: "number" }).notNull().default(0),
  price: integer("price").notNull().default(0),
  // Giá vốn đơn vị hiện hành (VND). NULLABLE có chủ đích: `null` = CHƯA BIẾT,
  // khác hẳn 0 = "hàng không tốn đồng nào". Không có phân biệt này thì báo cáo
  // lãi lỗ sẽ coi mọi mặt hàng chưa nhập giá vốn là lãi 100% — con số sai mà
  // nghe rất xuôi tai, đúng loại lỗi không ai phát hiện tới lúc quyết toán.
  cost: integer("cost"),
  // Cột `Giảm 2% thuế suất thuế GTGT` của bản xuất MISA.
  //
  // NULLABLE = CHƯA BIẾT, khác hẳn `false` = "đã tra, mặt hàng này KHÔNG được
  // giảm". Cùng lý do với `cost` ở trên: mặc định `false` biến 161 mặt hàng
  // chưa nhập thành 161 khẳng định sai — mà tool `vat-catalog-audit` (Nghị định
  // 174/2025) đọc thẳng cờ này, nên khẳng định sai ở đây thành kết luận thuế sai.
  isReducedVat: boolean("is_reduced_vat"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("products_unit_factor_duong", sql`${t.unitFactor} > 0`),
  // Tự trỏ vào chính mình là một vòng lặp vô nghĩa.
  check("products_khong_tu_tro", sql`${t.linkedProductId} IS NULL OR ${t.linkedProductId} <> ${t.id}`),
]);

export const inventoryTransactions = pgTable("inventory_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  // D7 HOÃN — để nullable. Mã hàng không trùng giữa hai kho (VT* vs KM*) nên
  // suy được từ `products.warehouse_id`. Có sẵn cột thì ngày cần chuyển kho chỉ
  // phải điền, không phải thêm cột rồi truy ngược.
  warehouseId: uuid("warehouse_id").references(() => warehouses.id),
  type: text("type").notNull(),
  // B1 — CÓ DẤU. `+` tăng kho, `−` giảm kho.
  //   stock = SUM(quantity)  -> đối chiếu là MỘT câu truy vấn (phụ lục B.1),
  //   không còn logic cộng-trừ để chép sai ở mỗi nơi cần đối chiếu.
  //   `adjustment` biểu diễn được cả thừa lẫn thiếu mà không cần hai loại.
  //   `transfer` = hai dòng cùng `source_id`: −50 kho nguồn, +50 kho đích.
  quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
  // Giá vốn của chính lô này — đáng tin hơn `products.cost` (bình quân trôi theo
  // thời gian). LUÔN là giá vốn, kể cả ở dòng xuất: ghi giá bán vào đây là biến
  // sổ kho thành sổ doanh thu. NULL = phiếu chưa ghi giá.
  unitCost: integer("unit_cost"),
  // D1 — nối phiếu kho về chứng từ gốc. `counterparty` là chữ tự do nên hai
  // khách trùng tên là đối chiếu không ra, và huỷ hoá đơn không tìm được phiếu
  // kho để đảo lại.
  sourceType: text("source_type"),
  sourceId: uuid("source_id"),
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  counterparty: text("counterparty"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // M4 — ép ở tầng DB. Ghi chú trong code không chặn được `"exprt"` viết nhầm,
  // và một giá trị viết nhầm thì không khớp bộ lọc nào, im lặng, mãi mãi.
  check("inv_tx_type_hop_le",
    sql`${t.type} IN ('import','export','adjustment','transfer')`),
  // B5 — FK đa hình không có ràng buộc nào. Tối thiểu ép hai cột đi cùng nhau:
  // `source_id` mồ côi chỉ lộ ra khi ai đó đi truy vết một chênh lệch.
  check("inv_tx_source_di_cung_nhau",
    sql`(${t.sourceType} IS NULL) = (${t.sourceId} IS NULL)`),
  check("inv_tx_source_type_hop_le",
    sql`${t.sourceType} IS NULL OR ${t.sourceType} IN ('sale','purchase','stocktake','transfer','manual')`),
  // Số lượng 0 không ứng với nghiệp vụ nào — chặn để khỏi có dòng rác.
  check("inv_tx_quantity_khac_khong", sql`${t.quantity} <> 0`),
]);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Xem ghi chú ở `suppliers.code` — cùng lý do, cùng cách dùng.
  code: text("code"),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  taxCode: text("tax_code"),
  openingDebt: numeric("opening_debt", { precision: 18, scale: 2, mode: "number" }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("customers_code_unique").on(sql`lower(${t.code})`),
]);

export const salesInvoices = pgTable("sales_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  customerName: text("customer_name").notNull(),
  // B6 — Brain nhận `X-Store-Id` (là warehouse) và cần lọc doanh số theo kho.
  // Không có cột này thì báo cáo doanh thu theo kho không dựng được.
  warehouseId: uuid("warehouse_id").references(() => warehouses.id),
  note: text("note"),
  total: integer("total").notNull(),
  // B4 — hạn thanh toán. Còn nợ SUY RA từ invoice_payments, không lưu.
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
  quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
  // B3 — LÀM TRÒN NỬA LÊN (0.5 -> 1), KHÔNG phải kiểu ngân hàng. Brain tính lại
  // tổng hoá đơn để đối chiếu, nên hai bên làm tròn khác nhau là báo động giả
  // trên chính hoá đơn ĐÚNG — và người dùng học được cách bỏ qua cảnh báo.
  // JS: Math.round() khớp với số dương. Số âm khác (Math.round(-2.5) = -2,
  // Brain ra -3) — chốt lại nếu có dòng âm (chiết khấu, trả hàng).
  lineTotal: integer("line_total").notNull(),
}, (t) => [
  check("invoice_item_quantity_khac_khong", sql`${t.quantity} <> 0`),
]);

// B4 — SỔ thanh toán, không phải cột số dư.
//   còn nợ = sales_invoices.total − SUM(invoice_payments.amount)
// `paid_amount` dạng số dư lặp lại đúng vấn đề mà D6 sinh ra để canh: khách trả
// ba lần, ai đó sửa tay một lần, và không còn cách nào biết đúng sai.
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
  // M1 — thay `categoryFilter: text`. Đổi tên danh mục thì luật im lặng ngừng
  // khớp: không lỗi, không cảnh báo, chỉ là không bao giờ chạy nữa.
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  warehouseId: uuid("warehouse_id").references(() => warehouses.id, { onDelete: "set null" }),
  enabled: boolean("enabled").notNull().default(true),
  n8nWorkflowId: text("n8n_workflow_id"),
  // M2 — đủ để dashboard hiện "cào giá dầu: hỏng 2 ngày rồi". Workflow cào giá
  // dầu thiết kế để THROW khi bóc giá không được (không ghi giá bịa) — nó hỏng
  // ầm ĩ trong n8n mà không ai bên ANSER nhìn thấy, và sáng hôm sau báo giá vẫn
  // chạy bằng giá của hôm kia. Lịch sử đầy đủ vẫn để n8n giữ.
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastRunStatus: text("last_run_status"),
  lastRunNote: text("last_run_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("automation_last_run_status_hop_le",
    sql`${t.lastRunStatus} IS NULL OR ${t.lastRunStatus} IN ('ok','failed')`),
]);