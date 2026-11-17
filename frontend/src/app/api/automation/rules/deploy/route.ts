import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, withErrorHandler } from "@/server/http";
import { requireAdminUser } from "@/server/session";
import { createRule, listRules, updateRule } from "@/server/store/automation";
import {
  activateN8nWorkflow,
  createN8nWorkflow,
  findSmtpCredentialId,
  isN8nApiConfigured,
  listN8nWorkflows,
} from "@/server/n8nApi";
import { parseJsonBody } from "@/server/validation";

type WorkflowNode = { type: string; credentials?: Record<string, { id: string }>; [key: string]: unknown };
const TEMPLATE_TYPES = [
  "low_stock_alert",
  "sales_report_daily",
  "sales_report_weekly",
  "sales_report_monthly",
  "customer_welcome",
] as const;
const deploySchema = z.object({
  type: z.enum(TEMPLATE_TYPES, { error: "Loại template không hợp lệ." }),
});

// Tự gán credential SMTP đã có trong n8n vào node Gửi Email lúc tạo workflow mới — để lần sau
// thêm mẫu mới không phải vào n8n UI gán tay nữa (chỉ cần tạo credential SMTP 1 lần duy nhất).
function withSmtpCredential(nodes: WorkflowNode[], smtpCredentialId: string | null): WorkflowNode[] {
  if (!smtpCredentialId) return nodes;
  return nodes.map((node) =>
    node.type === "n8n-nodes-base.emailSend" && !node.credentials
      ? { ...node, credentials: { smtp: { id: smtpCredentialId } } }
      : node,
  );
}

// Mỗi template khớp với đúng 1 file JSON trong frontend/n8n-workflows/ — báo cáo doanh số tách
// 3 loại riêng (ngày/tuần/tháng, giống 3 cấu hình giờ chạy report của ANSER Flask) vì mỗi loại
// là 1 workflow n8n riêng với lịch chạy khác nhau, không gộp chung 1 rule được.
const TEMPLATE_META: Record<(typeof TEMPLATE_TYPES)[number], { name: string; file: string; thresholdQty?: number }> = {
  low_stock_alert: { name: "Cảnh báo tồn kho thấp", file: "low_stock_alert.json", thresholdQty: 20 },
  sales_report_daily: { name: "Báo cáo doanh số hàng ngày", file: "daily_sales_report.json" },
  sales_report_weekly: { name: "Báo cáo doanh số hàng tuần", file: "weekly_sales_report.json" },
  sales_report_monthly: { name: "Báo cáo doanh số hàng tháng", file: "monthly_sales_report.json" },
  customer_welcome: { name: "Chào mừng khách hàng mới", file: "new_customer_welcome.json" },
};

// Giống cách ANSER Flask làm (routes/n8n_api.py deploy_template()): không bắt người dùng nhập
// tay Workflow ID — tự tìm workflow đã tồn tại trong n8n theo tên, không có thì tự tạo qua
// n8n API từ file template, rồi lưu ID vào rule của app luôn.
export const POST = withErrorHandler(async (request: Request) => {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { data, response: invalid } = await parseJsonBody(request, deploySchema);
  if (invalid) return invalid;
  const { type } = data;
  const meta = TEMPLATE_META[type];

  const rules = await listRules();
  const existingRule = rules.find((r) => r.type === type);

  if (!isN8nApiConfigured()) {
    if (existingRule) {
      return NextResponse.json({ rule: existingRule, created: false, n8nLinked: false });
    }
    const rule = await createRule({ name: meta.name, type, thresholdQty: meta.thresholdQty, enabled: true });
    return NextResponse.json({ rule, created: true, n8nLinked: false });
  }

  let template: { name: string; nodes: unknown; connections: unknown; settings?: unknown };
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "n8n-workflows", meta.file), "utf-8");
    template = JSON.parse(raw);
  } catch (error) {
    console.error(`[api] Không đọc được template workflow ${meta.file}:`, error);
    return jsonError("Không đọc được template workflow. Vui lòng liên hệ quản trị viên.", 500);
  }

  try {
    const existingWorkflows = await listN8nWorkflows();
    let workflowId = existingWorkflows.find((w) => w.name === template.name)?.id;
    const createdInN8n = !workflowId;

    if (!workflowId) {
      const smtpCredentialId = await findSmtpCredentialId().catch((error) => {
        console.warn("[api] Không tìm thấy credential SMTP trong n8n:", error);
        return null;
      });
      const created = await createN8nWorkflow({
        name: template.name,
        nodes: withSmtpCredential(template.nodes as WorkflowNode[], smtpCredentialId),
        connections: template.connections,
        settings: template.settings,
      });
      workflowId = created.id;
    }

    let activated = false;
    try {
      const result = await activateN8nWorkflow(workflowId);
      activated = Boolean(result.active);
    } catch (error) {
      // Có thể workflow cần gán credential SMTP thủ công trước khi bật được — không chặn liên kết,
      // chỉ phản ánh đúng trạng thái thật (enabled = activated) để không lệch với n8n.
      console.warn("[api] Không thể kích hoạt workflow n8n vừa tạo:", error);
    }

    const rule = existingRule
      ? await updateRule(existingRule.id, { n8nWorkflowId: workflowId, enabled: activated })
      : await createRule({
          name: meta.name,
          type,
          thresholdQty: meta.thresholdQty,
          enabled: activated,
          n8nWorkflowId: workflowId,
        });

    return NextResponse.json({ rule, created: createdInN8n, n8nLinked: true, activated });
  } catch (error) {
    console.error("[api] Không thể triển khai template workflow n8n:", error);
    return jsonError("Không thể triển khai workflow. Vui lòng kiểm tra cấu hình n8n.", 502);
  }
});
