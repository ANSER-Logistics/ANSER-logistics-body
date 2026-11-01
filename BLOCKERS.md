# BLOCKERS — việc đang chờ xác nhận

> Cập nhật 26/10/2026
> Danh sách những việc **không được tự quyết** khi code: đang chờ khách hàng (Hoàng Phát),
> đội Brain, hoặc trưởng nhóm xác nhận. Mỗi mục ghi rõ **hiện tại code làm gì** trong lúc chờ.
>
> Khi một mục được xác nhận: ghi kết quả + ngày + người xác nhận vào mục đó, chuyển xuống
> phần [Đã giải quyết](#đã-giải-quyết), rồi mới code.

Ký hiệu nguồn:
**[H11/10]** = buổi họp với công ty ngày 11/10/2026 (ghi chú họp lưu ngoài repo; nội dung
**lẫn lộn** giữa thực tế Hoàng Phát và thông lệ chung của ngành — chưa điểm nào trong đó được
coi là yêu cầu đã xác nhận).
**[PB]** = `5. Project_Playbook_VI.md`. **[CL]** = `frontend/CLAUDE.md`.

## 1. Giá bán & mức giá

| # | Việc | Cần ai xác nhận | Trong lúc chờ, code làm gì | Nguồn |
|---|---|---|---|---|
| G1 | **Quản lý danh sách mức giá** (thêm/đổi tên/sắp xếp/ngừng dùng một mức giá) qua giao diện | Trưởng nhóm + chú Quyết | Không có giao diện. 3 mức được seed sẵn bằng migration; thêm mức sau này là một lệnh `INSERT` vào `price_tiers`, không cần migration | Quyết định 22/10 |
| G2 | **Thêm mức giá** Đại lý cấp 3, Thương mại điện tử (online), Bán theo lô / thanh lý | Chú Quyết: Hoàng Phát có dùng **hôm nay** không? | Chỉ có Bán lẻ, Đại lý cấp 1, Đại lý cấp 2 (đã xác nhận 18/09). Cấp 3 & online xuất phát từ bản demo phần mềm của Tân Phát | [H11/10], [PB] §6 |
| G3 | **Quy tắc biên lợi nhuận**: Đại lý cấp 1 ≈ giá vốn +10–15%; Bán lẻ ≈ Đại lý cấp 1 +20–25% (≈ giá vốn +30–35%). "Giá gốc" = giá vốn (`products.cost`) | Chú Quyết: đây là quy tắc của Hoàng Phát hay ví dụ chung? Con số cố định hay theo từng mặt hàng? | Chỉ ghi lại. Hệ thống **không** gợi ý, không cảnh báo, không tự tính giá — giá do admin nhập tay | [H11/10] |
| G4 | **Duyệt giá** bởi cấp quản lý cao hơn | Chú Quyết | Không có quy trình duyệt. Chỉ admin sửa được giá, mọi thay đổi ghi vào lịch sử giá. 18/09 đã xác nhận Hoàng Phát không có cấp trên duyệt giá; [H11/10] nêu lại — cần hỏi rõ có thay đổi không | [H11/10], [PB] §6 |
| G5 | **Giá theo hợp đồng có thời hạn hiệu lực** (quá hạn thì điều chỉnh lại giá) | Chú Quyết | Chỉ lưu **giá hiện hành** + lịch sử thay đổi. Không có hợp đồng, không có `valid_from`/`valid_to`. Hoá đơn vẫn chụp lại giá đã bán nên lịch sử doanh thu luôn đúng | [H11/10], [PB] §6 câu 3 |
| G6 | **Khách quen vs khách lạ** — gắn mức giá mặc định cho khách, hay chiết khấu riêng trong một mức giá? | Đội Brain + chú Quyết | Không có liên kết khách ↔ mức giá. Chọn mức giá **theo từng dòng hoá đơn** | [PB] §6 câu 5, §7 |
| G7 | **Mức giá phía nhập hàng** (giá nhập lẻ / giá nhập sỉ) | Chú Quyết | Ngoài phạm vi bản đầu. Giá vốn vẫn đi qua `unit_cost` của phiếu nhập | [PB] §6 câu 4 |

## 2. Công nợ, thanh toán, đặt cọc

| # | Việc | Cần ai xác nhận | Trong lúc chờ, code làm gì | Nguồn |
|---|---|---|---|---|
| C1 | **Hạn công nợ** (~60 ngày cho bán lẻ) | Chú Quyết | Không tự đặt `sales_invoices.due_date` | [H11/10] |
| C2 | **Chiết khấu khi thanh toán ngay** | Chú Quyết: tính thế nào, ai được áp? | Không có | [H11/10] |
| C3 | **Đặt cọc ~50%** cho hàng đặt trước (chưa có trong kho, chờ nhập vài tháng) | Chú Quyết | Không có đơn đặt trước. Bảng `invoice_payments` là chỗ ghi thanh toán sau này | [H11/10] |

## 3. Phân quyền

| # | Việc | Cần ai xác nhận | Trong lúc chờ, code làm gì | Nguồn |
|---|---|---|---|---|
| Q1 | **Phân quyền theo phòng ban** (Kế toán / Kinh doanh / Kho & Vận tải) | Chú Quyết: Hoàng Phát (3–5 người kiêm nhiệm) có cần không? | Giữ 3 quyền `staff` / `manager` / `admin` | [H11/10] |
| Q2 | **Ai được dùng chatbot AI**, rủi ro lộ tin nhắn của chủ | Chú Quyết + đội Brain | Chưa giới hạn | [PB] §6 |
| Q3 | Nhiều API route **chưa kiểm tra đăng nhập**, `/dashboard` chưa chặn khách | Trưởng nhóm: lên lịch làm | Hạn chế đã biết; route mới phải tự kiểm tra | `ARCHITECTURE.md` §7 |

## 4. Dữ liệu thật

| # | Việc | Cần ai xác nhận | Trong lúc chờ, code làm gì | Nguồn |
|---|---|---|---|---|
| D1 | **3 mặt hàng lệch** giữa danh mục và báo cáo N-X-T: `KM00008`, `KM00017`, `KM00034` (nhiều khả năng do hai file xuất khác ngày) | Chú Quyết | Không ảnh hưởng ứng dụng: chỉ nhập danh mục (Nhập Excel), không nhập N-X-T. Hỏi khi nào cần đối soát lịch sử | [PB] §5.2, [CL] |
| D2 | **Tồn kho âm**: `VT00039` (−108), `VT00042` (−16), có thể cả `KM00034` (−115,2) — thiếu chứng từ nhập hay do kỳ khoá sổ? | Chú Quyết. **Chưa báo khách** — phải loại trừ khả năng do kỳ khoá sổ trước | Giữ nguyên số liệu | [PB] §5.3, [CL] |
| D5 | **Phân loại danh mục thật** cho dầu nhớt (thay 3 nhóm tạm HH/DV/CP) | Chú Quyết | Nhóm tạm theo tiền tố mã | [CL] |
| D6 | **Quy đổi đơn vị** ghi trong tên hàng (vd `(0.8L×24)` = 19,2 lít/thùng) chưa được tách tự động | Rà tay | `unit_factor` mặc định 1 | [CL] |
| D7 | **Hạn sử dụng / hàng thanh lý** — chưa có chỗ trong schema | Chú Quyết | Không có | [PB] §6 |

## 5. Kỹ thuật & dọn dẹp

| # | Việc | Cần ai xác nhận | Trong lúc chờ, code làm gì | Nguồn |
|---|---|---|---|---|
| K1 | **`frontend/src/server/brain.ts` được commit với line ending CRLF.** Từ khi có `.gitattributes` (`eol=lf`), `git status` luôn báo file này "bị sửa" dù không ai đụng. Sửa bằng một commit `git add --renormalize` — nhưng PR #3 của đội Brain (`feat/brain-integration`) đang sửa file này, renormalize bây giờ sẽ làm PR đó xung đột trên mọi dòng | Đội Brain: báo khi PR #3 merge | **Không commit file này** trừ khi có thay đổi thật. Renormalize ngay sau khi PR #3 merge | Kiểm tra 22/10 |
| K2 | `README.md` bảo copy `frontend/.env.local.example` — **file này không tồn tại**; còn ghi "user lưu trong bộ nhớ" (đã lỗi thời, giờ ở Postgres) | Không cần — chỉ cần làm | Mẫu `.env.local` đầy đủ nằm trong `6. Onboarding_Playbook.md` §2.3 | Kiểm tra 22/10 |
| K3 | CI chưa chạy `pnpm build` — cần một database cho CI (Neon branch hoặc Postgres service) | Trưởng nhóm | CI chỉ kiểm lockfile + ESLint | `.github/workflows/ci.yml` |
| K4 | Workflow lịch sử thực thi (M2) và mô-đun vận tải | Chú Quyết | Ngoài phạm vi | [CL] |

## Đã giải quyết

| # | Việc | Kết quả | Ngày |
|---|---|---|---|
| — | Seed `categories` không bao giờ chạy trên DB đã có `products` | `runStartupSeed()` tách các bước seed độc lập | 21/09/2026 (`16ae83b`) |
| — | Seed dữ liệu mẫu + admin demo chạy cả ở production | Phải bật rõ `ENABLE_STARTUP_SEED=true` | 21/09/2026 (`16ae83b`) |
| — | `getSalesReportForPeriod` cắt số lẻ (`::integer`) | Bỏ cast | 21/09/2026 (`16ae83b`) |
| — | Nhiễu line ending CRLF/LF | Thêm `.gitattributes` (còn sót `brain.ts`, xem K1) | 21/09/2026 (`16ae83b`) |
| — | `products.price` khi có nhiều mức giá | **Bỏ cột**, giá lấy từ `product_prices`; giá cũ không chuyển sang | 22/10/2026 |
| — | Sửa giá trên dòng hoá đơn khác giá của mức giá | Chỉ `admin`/`manager`. Mức giá chưa có giá → `staff` không bán được dòng đó, `admin`/`manager` nhập tay được. Không bao giờ bán 0₫ ngầm | 22/10/2026 |
| — | Ai sửa bảng giá | Chỉ `admin`, trong form sửa sản phẩm; mọi thay đổi ghi lịch sử | 22/10/2026 |
| D3 | `frontend/import-real-data.ts` (dựng lại sổ kho từ N-X-T) còn cần không? | **Xoá.** Nhập Excel đã thay việc đưa hàng hoá + tồn kho vào hệ thống; không cần dựng lại lịch sử nhập/xuất trước ngày dùng phần mềm. Nhập Excel nay ghi một dòng `adjustment` vào sổ kho cho mỗi thay đổi tồn, giữ đúng `stock = SUM(quantity)`. `allows_zero_value` và các cặp `linked_product_id` (mới biết 2 cặp) đặt tay khi cần. Lấy lại script được từ lịch sử git (`5e9b251`) | 26/10/2026 |
| D4 | Thiếu file N-X-T kho KHUYẾN MẠI | Không còn cần — chỉ script N-X-T (đã xoá) dùng file này | 26/10/2026 |
