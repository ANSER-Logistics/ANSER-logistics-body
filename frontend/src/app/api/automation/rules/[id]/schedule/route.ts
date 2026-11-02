import { NextResponse } from "next/server";
import { requireAdminUser } from "@/server/session";
import { getRule } from "@/server/store/automation";
import { getN8nWorkflow, isN8nApiConfigured, updateN8nWorkflow, type N8nWorkflowNode } from "@/server/n8nApi";

// Giống ANSER Flask (routes/n8n_api.py sync_report_hour/sync_daily_report_hour): đổi giờ/ngày
// chạy báo cáo ở đây sẽ tự cập nhật thẳng node Schedule Trigger của workflow đã tạo trong n8n —
// không cần vào n8n UI sửa tay.
function buildInterval(type: string, hour: number, day?: number) {
  if (type === "sales_report_weekly") {
    return [{ field: "weeks", weeksInterval: 1, triggerAtDay: [day ?? 1], triggerAtHour: hour }];
  }
  if (type === "sales_report_monthly") {
    return [{ field: "months", monthsInterval: 1, triggerAtDayOfMonth: day ?? 1, triggerAtHour: hour }];
  }
  return [{ field: "hours", hoursInterval: 24, triggerAtHour: hour }];
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const hour = Number(body.hour);
  const day = body.day !== undefined ? Number(body.day) : undefined;

  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    return NextResponse.json({ message: "Giờ chạy không hợp lệ (0-23)." }, { status: 400 });
  }

  const rule = await getRule(id);
  if (!rule) {
    return NextResponse.json({ message: "Không tìm thấy quy tắc." }, { status: 404 });
  }
  if (!["sales_report_daily", "sales_report_weekly", "sales_report_monthly"].includes(rule.type)) {
    return NextResponse.json({ message: "Quy tắc này không hỗ trợ đặt lịch chạy." }, { status: 400 });
  }
  if (!rule.n8nWorkflowId) {
    return NextResponse.json({ message: "Quy tắc này chưa được thêm từ Templates." }, { status: 400 });
  }
  if (!isN8nApiConfigured()) {
    return NextResponse.json({ message: "Tự động hoá chưa được thiết lập." }, { status: 400 });
  }

  try {
    const workflow = await getN8nWorkflow(rule.n8nWorkflowId);
    const nodes = workflow.nodes.map((node: N8nWorkflowNode) =>
      node.type === "n8n-nodes-base.scheduleTrigger"
        ? { ...node, parameters: { ...node.parameters, rule: { interval: buildInterval(rule.type, hour, day) } } }
        : node,
    );
    await updateN8nWorkflow(rule.n8nWorkflowId, {
      name: workflow.name,
      nodes,
      connections: workflow.connections,
      settings: workflow.settings,
    });
    return NextResponse.json({ message: "Đã cập nhật lịch chạy." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Không cập nhật được lịch chạy." },
      { status: 502 },
    );
  }
}
