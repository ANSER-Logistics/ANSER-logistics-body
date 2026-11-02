# n8n workflows cho ANSER Web v2

5 workflow này được adapt từ `d:\ASDEMO\ANSER\workflow_templates\` (app Flask ANSER bán lẻ) để
gọi vào API của Next.js app này thay vì API Flask cũ. Không tự động import qua n8n REST API —
làm thủ công qua UI (như hướng dẫn dưới), đúng cách app Flask cũ cũng làm.

## 1. Khởi động n8n + MailHog

Yêu cầu Docker Desktop đang chạy. Từ thư mục `frontend/`:

```powershell
docker compose up -d
```

| Service | URL local | Ghi chú |
|---|---|---|
| n8n UI | http://localhost:5679 | Lần đầu vào sẽ yêu cầu tạo tài khoản owner |
| MailHog Web UI | http://localhost:8026 | Xem "email đã gửi" ở đây (không gửi email thật) |

Next.js app (`npm run dev`) phải đang chạy ở `localhost:3000` để n8n gọi vào được (n8n container
gọi qua `host.docker.internal:3000`).

## 2. Tạo credential SMTP (MailHog) trong n8n

Vào n8n UI → **Credentials** → **New** → chọn loại **SMTP**:
- Host: `host.docker.internal`
- Port: `1026`
- User/Password: để trống
- SSL/TLS: tắt

Đặt tên credential (vd "MailHog") — dùng chung cho node "Gửi Email" ở cả 5 workflow.

## 3. Import từng workflow

Vào n8n UI → **Workflows** → **Add workflow** → menu ⋮ (góc phải) → **Import from File** →
chọn từng file trong thư mục này:

- `low_stock_alert.json` — Cảnh báo tồn kho thấp (chạy mỗi 6 giờ)
- `daily_sales_report.json` — Báo cáo doanh số hàng ngày (20h mỗi ngày)
- `weekly_sales_report.json` — Báo cáo doanh số hàng tuần (mỗi 7 ngày, 20h)
- `monthly_sales_report.json` — Báo cáo doanh số hàng tháng (mỗi 30 ngày, 20h)
- `new_customer_welcome.json` — Chào mừng khách hàng mới (webhook, kích hoạt tự động khi tạo
  khách hàng ở trang **Khách hàng**)

Sau khi import, mở node **"Gửi Email"** trong mỗi workflow → chọn credential SMTP vừa tạo ở
bước 2.

## 4. Token nội bộ (bắt buộc từ khi API `/api/n8n/internal/*` đã siết xác thực)

5 workflow này gọi vào `/api/n8n/internal/*` của app — các route đó giờ đòi header
`x-internal-token` khớp với biến `N8N_INTERNAL_TOKEN` (xem `BLOCKERS.md` Q3). Đặt biến này
trong `frontend/.env.local` (dùng chung với app, `docker-compose.yml` đã nạp lại file này vào
container n8n qua `env_file`), rồi `docker compose up -d` lại để n8n nhận biến mới — các node
"Lấy..." trong 5 workflow đã tự gắn `{{ $env.N8N_INTERNAL_TOKEN }}` vào header, không cần sửa
tay nếu import từ các file `.json` trong thư mục này sau khi đã đặt biến.

## 5. Cấu hình email nhận

- **Cảnh báo tồn kho thấp / Báo cáo doanh số**: cần đặt "Email nhận cảnh báo" cho từng kho ở
  bộ chọn kho trên trang **Quản lý kho** (dropdown kho → ô email dưới mỗi kho).
- **Chào mừng khách hàng mới**: cần đặt biến môi trường `N8N_NOTIFY_EMAIL` trong
  `frontend/.env.local` (email admin nhận thông báo mỗi khi có khách hàng mới), rồi restart
  `npm run dev`.

## 6. Bật (Active) từng workflow

Mỗi workflow có toggle **Active** ở góc trên bên phải màn hình chỉnh sửa — bật lên thì:
- 2 workflow báo cáo doanh số theo lịch tự chạy đúng giờ đã đặt.
- Workflow "Chào mừng khách hàng mới" sẵn sàng nhận webhook — test bằng cách tạo 1 khách hàng
  mới ở trang Khách hàng, rồi xem email ở MailHog (`localhost:8026`).

## 7. Test thủ công không cần chờ lịch

Trong màn hình chỉnh sửa mỗi workflow, bấm **Execute workflow** (hoặc nút Play ở từng node) để
chạy ngay một lần, không cần chờ đến giờ lịch đã đặt.

## 8. Liên kết workflow thật với nút Chạy/Dừng/Lịch sử ở trang Tự động hoá

Trước bước này, nút "Chạy/Tạm dừng" và "Lịch sử" ở trang **Tự động hoá** của app chỉ là
bookkeeping riêng — không hề bật/tắt hay đọc dữ liệu workflow thật trong n8n. Làm theo các bước
sau để nối thật:

1. **Tạo API key**: n8n UI → góc dưới trái → **Settings** → **n8n API** → **Create an API
   Key** → copy giá trị.
2. Dán vào `frontend/.env.local`:
   ```
   N8N_API_URL=http://localhost:5679
   N8N_API_KEY=<giá trị vừa copy>
   ```
   Restart `npm run dev` để nhận biến môi trường mới.
3. **Lấy Workflow ID**: mở 1 workflow đã import ở n8n UI, nhìn thanh địa chỉ trình duyệt —
   dạng `http://localhost:5679/workflow/<ID>`. Copy phần `<ID>`.
4. Ở trang **Tự động hoá** của app, tìm quy tắc tương ứng (vd "Cảnh báo tồn kho thấp") → bấm
   **liên kết** ngay dưới mô tả quy tắc → dán Workflow ID → **Lưu**.

Sau khi liên kết, với đúng quy tắc đó:
- Nút **Chạy/Dừng** (và chip trạng thái) gọi thật `POST /api/v1/workflows/{id}/activate|
  deactivate` của n8n — bật/tắt đúng workflow trong n8n, không chỉ đổi cờ trong DB của app.
- Nút **Lịch sử** gọi thật `GET /api/v1/executions?workflowId=...` — hiện danh sách lần chạy
  gần nhất (thành công/lỗi/đang chạy) lấy trực tiếp từ n8n.

Quy tắc chưa liên kết Workflow ID vẫn hoạt động như cũ (chỉ đổi cờ `enabled` trong DB của app,
dùng cho tính "Cảnh báo đang kích hoạt" ở trang này/Dashboard) — không gọi n8n.

## 9. Credential SMTP chỉ cần tạo 1 lần cho mọi mẫu sau này

Tạo credential SMTP (mục 2) chỉ cần làm **1 lần duy nhất** trên toàn hệ thống, không phải lặp
lại cho từng workflow mới. Khi bấm 1 template ở trang Tự động hoá tạo workflow **mới** (workflow
chưa từng tồn tại trong n8n), app tự tìm credential SMTP đã có (`GET /api/v1/credentials`, lọc
`type: "smtp"`) và tự gắn vào node "Gửi Email" của workflow đó lúc tạo — không cần vào n8n UI
gán tay nữa.

3 workflow ban đầu (import trước khi có credential) vẫn cần gán tay 1 lần như mục 3-4 ở trên —
chỉ các mẫu tạo **sau khi đã có credential SMTP** mới được tự động gắn.

## Vì sao không copy y nguyên từ ANSER Flask?

Workflow gốc gọi API nội bộ đặc thù Flask (`/api/n8n/internal/...` trên app Flask, port 5002)
và một số dữ liệu Flask có mà app này không có (mã khách hàng, số nhân viên bán hàng, ngưỡng
tồn kho lưu trên từng kho). Các workflow ở đây đã đổi URL sang API mới của Next.js app
(`src/app/api/n8n/internal/*`) và bỏ những trường dữ liệu không tồn tại — xem chi tiết trong
`ARCHITECTURE.md` mục "Tự động hoá & n8n".
