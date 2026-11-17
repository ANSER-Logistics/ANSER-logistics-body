import { NextResponse } from "next/server";
import { jsonError, withErrorHandler } from "@/server/http";
import {
  deleteKnowledgeDocument,
  listKnowledgeDocuments,
  uploadKnowledgeDocument,
} from "@/server/brain";
import { brainErrorResponse } from "@/server/brainHttp";
import { requireSessionUser } from "@/server/session";

/**
 * Tài liệu nội bộ đưa vào kho tri thức: hợp đồng, bảng giá cước, quy định
 * giao nhận, chính sách công nợ.
 *
 * `workspace_id` KHÔNG lấy từ client. Nếu để client gửi thì bất kỳ ai cũng đọc
 * được tài liệu của khách khác chỉ bằng cách đổi một tham số — và đó là loại lỗi
 * không sửa được sau khi đã xảy ra. Ở đây nó là hằng số phía máy chủ.
 */

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Phạm vi tri thức của lần cài đặt này.
 *
 * Bản đầu lấy `warehouses[0].id` làm khoá. Sai — vì lúc CHAT, Body gửi kho đang
 * chọn, không phải kho đầu tiên. Đứng ở kho thứ hai mà hỏi thì mọi tài liệu đã
 * nạp trở nên vô hình, và biểu hiện duy nhất là "không tìm thấy": không lỗi,
 * không cảnh báo, giao diện vẫn liệt kê đủ tài liệu.
 *
 * Hợp đồng và bảng giá cước là của CẢ CÔNG TY, không của riêng kho hàng nào,
 * nên khoá phạm vi tách hẳn khỏi kho. Phải khớp `KB_WORKSPACE_ID` bên Brain —
 * hai bên cùng mặc định "default" nên không cấu hình gì thì vẫn khớp.
 */
function workspaceId(): string {
  return process.env.BRAIN_KB_WORKSPACE?.trim() || "default";
}

export const GET = withErrorHandler(async () => {
  const { response } = await requireSessionUser();
  if (response) return response;

  try {
    return NextResponse.json({ documents: await listKnowledgeDocuments(workspaceId()) });
  } catch (error) {
    return brainErrorResponse(error);
  }
});

export const POST = withErrorHandler(async (request: Request) => {
  const { response } = await requireSessionUser();
  if (response) return response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Cần gửi dạng multipart/form-data", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("Chưa chọn file", 400);
  }
  if (file.size > MAX_BYTES) {
    return jsonError(`File quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB, tối đa 5MB)`, 413);
  }

  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };

  try {
    const result = await uploadKnowledgeDocument(file, {
      workspaceId: workspaceId(),
      effectiveFrom: str("effective_from"),
      effectiveTo: str("effective_to"),
      docType: str("doc_type"),
    });
    return NextResponse.json(result);
  } catch (error) {
    return brainErrorResponse(error);
  }
});

export const DELETE = withErrorHandler(async (request: Request) => {
  const { response } = await requireSessionUser();
  if (response) return response;

  const source = new URL(request.url).searchParams.get("source");
  if (!source) return jsonError("Thiếu tên tài liệu", 400);

  try {
    await deleteKnowledgeDocument(workspaceId(), source);
    return NextResponse.json({ source, deleted: true });
  } catch (error) {
    return brainErrorResponse(error);
  }
});
