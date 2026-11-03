import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, layFileTaiLen, truongText } from "./uploadGuard";

function multipart(form: FormData) {
  return new Request("http://localhost/api/ai/report", { method: "POST", body: form });
}

function xlsx(bytes: number, name = "ban-hang.xlsx") {
  return new File([new Uint8Array(bytes)], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Ép kết quả là NextResponse lỗi rồi đọc status + body. */
async function loi(kq: Awaited<ReturnType<typeof layFileTaiLen>>) {
  expect(kq).toBeInstanceOf(NextResponse);
  const res = kq as NextResponse;
  return { status: res.status, body: (await res.json()) as { error: string } };
}

describe("layFileTaiLen", () => {
  it("trả file và form khi file hợp lệ", async () => {
    const form = new FormData();
    form.set("file", xlsx(1234));
    form.set("sheet", "Tháng 1");

    const kq = await layFileTaiLen(multipart(form));

    expect(kq).not.toBeInstanceOf(NextResponse);
    const { file, form: parsed } = kq as { file: File; form: FormData };
    expect(file.name).toBe("ban-hang.xlsx");
    expect(file.size).toBe(1234);
    expect(parsed.get("sheet")).toBe("Tháng 1");
  });

  it("body không phải multipart thì 400 và nêu tên trường cần gửi", async () => {
    const req = new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: "abc" }),
    });

    expect(await loi(await layFileTaiLen(req, { truong: "tep" }))).toEqual({
      status: 400,
      body: { error: "Cần gửi dạng multipart/form-data kèm trường 'tep'" },
    });
  });

  it("thiếu trường file thì 400 'Chưa chọn file'", async () => {
    const form = new FormData();
    form.set("sheet", "Tháng 1");

    expect(await loi(await layFileTaiLen(multipart(form)))).toEqual({
      status: 400,
      body: { error: "Chưa chọn file" },
    });
  });

  it("trường file là chuỗi chứ không phải file thì 400", async () => {
    const form = new FormData();
    form.set("file", "không phải file");

    expect((await loi(await layFileTaiLen(multipart(form)))).status).toBe(400);
  });

  it("file rỗng (0 byte) thì 400 — chọn file nhưng file trống vẫn là chưa chọn", async () => {
    const form = new FormData();
    form.set("file", xlsx(0));

    expect(await loi(await layFileTaiLen(multipart(form)))).toEqual({
      status: 400,
      body: { error: "Chưa chọn file" },
    });
  });

  it("đúng bằng MAX_UPLOAD_BYTES vẫn được nhận", async () => {
    const form = new FormData();
    form.set("file", xlsx(MAX_UPLOAD_BYTES));

    const kq = await layFileTaiLen(multipart(form));

    expect(kq).not.toBeInstanceOf(NextResponse);
    expect((kq as { file: File }).file.size).toBe(MAX_UPLOAD_BYTES);
  });

  it("vượt MAX_UPLOAD_BYTES một byte thì 413 kèm kích thước MB", async () => {
    const form = new FormData();
    form.set("file", xlsx(MAX_UPLOAD_BYTES + 1));

    expect(await loi(await layFileTaiLen(multipart(form)))).toEqual({
      status: 413,
      body: { error: "File quá lớn (5.0MB, tối đa 5MB)" },
    });
  });

  it("đọc file từ trường tuỳ chọn `truong` thay cho 'file'", async () => {
    const form = new FormData();
    form.set("file", xlsx(10, "sai.xlsx"));
    form.set("tep", xlsx(20, "dung.xlsx"));

    const kq = await layFileTaiLen(multipart(form), { truong: "tep" });

    expect((kq as { file: File }).file.name).toBe("dung.xlsx");
  });
});

describe("truongText", () => {
  const form = new FormData();
  form.set("sheet", "  Tháng 1  ");
  form.set("trong", "   ");
  form.set("tep", xlsx(5));

  it("cắt khoảng trắng hai đầu", () => {
    expect(truongText(form, "sheet")).toBe("Tháng 1");
  });

  it("chỉ có khoảng trắng thì coi như không gửi", () => {
    expect(truongText(form, "trong")).toBeUndefined();
  });

  it("thiếu trường thì undefined", () => {
    expect(truongText(form, "role")).toBeUndefined();
  });

  it("trường là file thì undefined, không trả '[object File]'", () => {
    expect(truongText(form, "tep")).toBeUndefined();
  });
});
