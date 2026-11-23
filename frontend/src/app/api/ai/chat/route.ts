import { NextResponse } from "next/server";
import { z } from "zod";
import { askBrain } from "@/server/brain";
import { brainErrorResponse } from "@/server/brainHttp";
import { jsonError, withErrorHandler } from "@/server/http";
import { requireSessionUser } from "@/server/session";
import { listWarehouses } from "@/server/store/warehouses";
import { parseJsonBody } from "@/server/validation";

const HISTORY_MESSAGE = "Lịch sử hội thoại không hợp lệ (tối đa 20 tin, mỗi tin tối đa 4000 ký tự)";

// Một lượt hội thoại trước. `z.object` bỏ trường thừa (vd `id` của state trình duyệt),
// nên chỉ `role` + `content` đi sang Brain.
const chatTurnSchema = z.object({
  role: z.enum(["user", "assistant"], { error: HISTORY_MESSAGE }),
  content: z.string({ error: HISTORY_MESSAGE }).max(4000, HISTORY_MESSAGE),
});

const chatSchema = z.object({
  message: z
    .string({ error: "Thiếu nội dung tin nhắn" })
    .trim()
    .min(1, "Thiếu nội dung tin nhắn")
    // Chặn ngay ở cửa thay vì để Brain nuốt một prompt khổng lồ rồi mới hết giờ.
    .max(4000, "Tin nhắn quá dài (tối đa 4000 ký tự)"),
  // Chỉ là gợi ý — sai kiểu thì bỏ qua (về kho mặc định) chứ không báo lỗi, như trước.
  warehouseId: z.string().optional().catch(undefined),
  // Lịch sử đến từ state trình duyệt nên kiểm như mọi dữ liệu client. Trần khớp hợp đồng
  // của Brain (ANSER_AI_Logistics#128 — vượt thì Brain trả 422); Brain chỉ dùng 6 tin gần
  // nhất nên cắt luôn ở đây. Không gửi / null -> [].
  //
  // PHẢI khai báo ở đây: zod bỏ khoá lạ, nên thiếu dòng này thì `history` rơi khỏi body
  // mà không có lỗi nào — route vẫn 200, chỉ là chat không còn nhớ hội thoại.
  // Việc chuyển `body.history` sang `askBrain` thuộc #35 (đổi chữ ký trong `brain.ts`).
  history: z
    .array(chatTurnSchema, { error: HISTORY_MESSAGE })
    .max(20, HISTORY_MESSAGE)
    .nullish()
    .transform((h) => (h ?? []).slice(-6)),
});

export const POST = withErrorHandler(async (request: Request) => {
  const { user, response } = await requireSessionUser();
  if (response) return response;

  const { data: body, response: invalid } = await parseJsonBody(request, chatSchema);
  if (invalid) return invalid;

  // `warehouseId` từ client CHỈ là gợi ý — phải đối chiếu với kho có thật.
  // Nhận thẳng giá trị client gửi là mở đường cho việc hỏi dữ liệu kho khác.
  const warehouses = await listWarehouses();
  if (warehouses.length === 0) {
    return jsonError("Chưa có kho nào", 409);
  }
  const warehouse = warehouses.find((w) => w.id === body.warehouseId) ?? warehouses[0];

  try {
    const answer = await askBrain(body.message, { userId: user.id, warehouseId: warehouse.id });
    return NextResponse.json({
      reply: answer.answer,
      sources: answer.sources ?? null,
      confidence: answer.confidence ?? null,
      warehouseId: warehouse.id,
      taskId: answer.taskId,
    });
  } catch (error) {
    return brainErrorResponse(error);
  }
});
