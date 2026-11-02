import { NextResponse } from "next/server";
import { requireAdminUser } from "@/server/session";
import { getRule, updateRule } from "@/server/store/automation";
import { activateN8nWorkflow, isN8nApiConfigured } from "@/server/n8nApi";

// Đúng cơ chế n8n thật (đối chiếu ANSER Flask routes/n8n_api.py _do_run_workflow): "Active"
// (bật/tắt) và "Chạy" là 2 việc khác nhau. Active chỉ vũ trang cho trigger (lịch/webhook).
// - Loại chạy theo lịch (low_stock_alert, sales_report): "Chạy" = đảm bảo đã Active — sau đó tự
//   chạy theo lịch đã đặt, không có "chạy ngay 1 lần" (n8n Public API không hỗ trợ ép chạy ngay
//   cho loại lịch).
// - Loại chạy theo webhook (customer_welcome): "Chạy" = đảm bảo đã Active, RỒI gọi thật webhook
//   để thực thi ngay 1 lần — có kết quả ngay lập tức, giống hệt ANSER Flask.
const SCHEDULE_TYPES = new Set(["low_stock_alert", "sales_report"]);
const WEBHOOK_PATH_BY_TYPE: Record<string, string> = {
  customer_welcome: "new-customer",
};

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  const rule = await getRule(id);
  if (!rule) {
    return NextResponse.json({ message: "Không tìm thấy quy tắc." }, { status: 404 });
  }
  if (!rule.n8nWorkflowId) {
    return NextResponse.json({ message: "Quy tắc này chưa được thêm từ Templates." }, { status: 400 });
  }
  if (!isN8nApiConfigured()) {
    return NextResponse.json({ message: "Tự động hoá chưa được thiết lập." }, { status: 400 });
  }

  let active = rule.enabled;
  if (!active) {
    try {
      const result = await activateN8nWorkflow(rule.n8nWorkflowId);
      active = Boolean(result.active);
    } catch {
      active = false;
    }
    await updateRule(rule.id, { enabled: active });
    if (!active) {
      return NextResponse.json({ message: "Không thể kích hoạt — kiểm tra cấu hình." }, { status: 502 });
    }
  }

  if (SCHEDULE_TYPES.has(rule.type)) {
    return NextResponse.json({ message: "Đã kích hoạt — sẽ chạy tự động theo lịch." });
  }

  const webhookPath = WEBHOOK_PATH_BY_TYPE[rule.type];
  const webhookBase = process.env.N8N_WEBHOOK_URL;
  if (!webhookPath || !webhookBase) {
    return NextResponse.json({ message: "Đã kích hoạt." });
  }

  try {
    const res = await fetch(`${webhookBase}/${webhookPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Khách hàng thử nghiệm", phone: "", email: "", address: "" }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return NextResponse.json({ message: "Đã kích hoạt nhưng chạy thử thất bại — kiểm tra cấu hình." }, { status: 502 });
    }
    return NextResponse.json({ message: "Đã chạy thử — kiểm tra email tại MailHog." });
  } catch {
    return NextResponse.json({ message: "Đã kích hoạt nhưng chạy thử thất bại — kiểm tra cấu hình." }, { status: 502 });
  }
}
