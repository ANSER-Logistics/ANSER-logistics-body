import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, withErrorHandler } from "@/server/http";
import { requireAdminUser } from "@/server/session";
import { getRule } from "@/server/store/automation";
import { getN8nWorkflow, isN8nApiConfigured, updateN8nWorkflow, type N8nWorkflowNode } from "@/server/n8nApi";
import { numberLike, parseJsonBody } from "@/server/validation";

const scheduleSchema = z.object({
  hour: numberLike("Giờ chạy không hợp lệ (0-23).").pipe(
    z.number().min(0, "Giờ chạy không hợp lệ (0-23).").max(23, "Giờ chạy không hợp lệ (0-23)."),
  ),
  day: numberLike("Ngày chạy không hợp lệ.").optional(),
});

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

export const PATCH = withErrorHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { id } = await params;
  const { data, response: invalid } = await parseJsonBody(request, scheduleSchema);
  if (invalid) return invalid;
  const { hour, day } = data;

  const rule = await getRule(id);
  if (!rule) {
    return jsonError("Không tìm thấy quy tắc.", 404);
  }
  if (!["sales_report_daily", "sales_report_weekly", "sales_report_monthly"].includes(rule.type)) {
    return jsonError("Quy tắc này không hỗ trợ đặt lịch chạy.", 400);
  }
  if (!rule.n8nWorkflowId) {
    return jsonError("Quy tắc này chưa được thêm từ Templates.", 400);
  }
  if (!isN8nApiConfigured()) {
    return jsonError("Tự động hoá chưa được thiết lập.", 400);
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
    console.error("[api] Không thể cập nhật lịch workflow n8n:", error);
    return jsonError("Không thể cập nhật lịch chạy. Vui lòng kiểm tra cấu hình.", 502);
  }
});
