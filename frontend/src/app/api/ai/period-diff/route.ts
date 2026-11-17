import { NextResponse } from "next/server";
import { jsonError, withErrorHandler } from "@/server/http";
import { importInventoryFile } from "@/server/brain";
import { comparePeriods } from "@/server/brain";
import { brainErrorResponse } from "@/server/brainHttp";
import { requireSessionUser } from "@/server/session";
import { MAX_UPLOAD_BYTES } from "@/server/uploadGuard";

/**
 * So HAI bản xuất tồn kho của cùng một kỳ để tìm chứng từ bị sửa hồi tố.
 *
 * Nhận hai file trong một lần gửi ('truoc' và 'sau'), đọc cả hai qua Brain rồi
 * gọi tiếp phép so. Ba lượt gọi mạng nội bộ, nhưng đổi lại người dùng chỉ thao
 * tác một lần và Body không phải giữ trạng thái file giữa các bước.
 *
 * Thứ tự QUAN TRỌNG: 'truoc' phải là bản xuất sớm hơn. Truyền ngược thì Brain
 * từ chối so và nói rõ là nhầm thứ tự, chứ không cho ra một kết quả vô nghĩa.
 */
export const POST = withErrorHandler(async (request: Request) => {
  const { response } = await requireSessionUser();
  if (response) return response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Cần gửi multipart/form-data kèm hai file 'truoc' và 'sau'", 400);
  }

  const truoc = form.get("truoc");
  const sau = form.get("sau");
  for (const [ten, f] of [["truoc", truoc], ["sau", sau]] as const) {
    if (!(f instanceof File) || f.size === 0) {
      return jsonError(`Chưa chọn file '${ten}'. Cần cả hai bản xuất để so.`, 400);
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      return jsonError(`File '${ten}' quá lớn (tối đa 5MB)`, 413);
    }
  }

  try {
    const [a, b] = await Promise.all([
      importInventoryFile(truoc as File),
      importInventoryFile(sau as File),
    ]);

    // Đọc hỏng thì KHÔNG so. Một bảng lệch cột đem đi so sẽ cho ra hàng loạt
    // "sửa hồi tố" hoàn toàn tưởng tượng — và cáo buộc sổ sách bị sửa là thứ
    // không được phép sai.
    const hong = [
      { ten: "trước", r: a },
      { ten: "sau", r: b },
    ].filter((x) => !x.r.import.ok);
    if (hong.length) {
      return NextResponse.json({
        findings: [],
        warnings: hong.map(
          (x) =>
            `Chưa đọc chắc chắn được bản ${x.ten} (${x.r.import.file_name ?? "?"}) — ` +
            `không so để tránh báo nhầm là sổ bị sửa. ${x.r.import.warnings.join(" ")}`,
        ),
        summary: { so_sánh_được: false },
        imports: { truoc: a.import, sau: b.import },
      });
    }

    const diff = await comparePeriods(
      {
        lines: a.import.lines,
        warehouse: a.import.warehouse,
        period_start: a.import.period_start,
        period_end: a.import.period_end,
      },
      {
        lines: b.import.lines,
        warehouse: b.import.warehouse,
        period_start: b.import.period_start,
        period_end: b.import.period_end,
      },
    );
    return NextResponse.json({ ...diff, imports: { truoc: a.import, sau: b.import } });
  } catch (error) {
    return brainErrorResponse(error);
  }
});
