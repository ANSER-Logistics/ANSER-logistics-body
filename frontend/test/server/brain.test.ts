import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BrainError,
  askBrain,
  auditInventory,
  auditPartners,
  brainErrorToHttp,
  buildReport,
  checkBrainHealth,
  comparePeriods,
  deleteKnowledgeDocument,
  importInventoryFile,
  importPartnerFile,
  importProductFile,
  isBrainConfigured,
  listKnowledgeDocuments,
  readFreightInvoice,
  searchKnowledge,
  uploadKnowledgeDocument,
  type BrainErrorKind,
} from "@/server/brain";

const BASE = "http://brain.test";
const fetchMock = vi.fn<typeof fetch>();
const who = { userId: "u-1", warehouseId: "kho-1" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function call(i = 0) {
  const [url, init] = fetchMock.mock.calls[i];
  return { url: String(url), init: init ?? {} };
}

/** Chờ promise ném và trả lại lỗi để soi từng trường. */
async function caught(p: Promise<unknown>): Promise<BrainError> {
  const result = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(result).toBeInstanceOf(BrainError);
  return result as BrainError;
}

const anh = () => new File(["fake-image"], "hoadon.jpg", { type: "image/jpeg" });
const excel = () => new File(["fake-xlsx"], "NXT_T10.xlsx");

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("BRAIN_URL", BASE);
  vi.stubEnv("BRAIN_API_TOKEN", "tok-123");
  vi.stubEnv("BRAIN_CHAT_TIMEOUT_MS", undefined);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("brainErrorToHttp", () => {
  it.each<[BrainErrorKind, number]>([
    ["not_configured", 501],
    ["unreachable", 502],
    ["timeout", 504],
    ["overloaded", 503],
    ["not_ready", 503],
    ["unauthorized", 502],
    ["bad_request", 400],
    ["bad_response", 502],
    ["server_error", 502],
  ])("%s ánh xạ sang HTTP %i", (kind, status) => {
    expect(brainErrorToHttp(new BrainError(kind, "chi tiết"))).toEqual({
      status,
      body: { error: "brain_unavailable", kind, detail: "chi tiết" },
    });
  });

  it("Brain bận kèm số giây chờ thì trả retry_after_s và header Retry-After", () => {
    const err = new BrainError("overloaded", "bận", { status: 503, retryAfterSeconds: 7 });
    expect(brainErrorToHttp(err)).toEqual({
      status: 503,
      body: { error: "brain_unavailable", kind: "overloaded", detail: "bận", retry_after_s: 7 },
      headers: { "Retry-After": "7" },
    });
  });

  it("lỗi thường không phải BrainError coi là server_error và giữ message", () => {
    expect(brainErrorToHttp(new TypeError("x is undefined"))).toEqual({
      status: 502,
      body: { error: "brain_unavailable", kind: "server_error", detail: "x is undefined" },
    });
  });

  it("giá trị ném không phải Error thì đổi ra chuỗi", () => {
    expect(brainErrorToHttp("sập").body).toEqual({
      error: "brain_unavailable",
      kind: "server_error",
      detail: "sập",
    });
  });
});

describe("BrainError.retryable", () => {
  it.each<[BrainErrorKind, boolean]>([
    ["overloaded", true],
    ["timeout", true],
    ["not_ready", false],
    ["unreachable", false],
    ["unauthorized", false],
    ["bad_request", false],
    ["server_error", false],
    ["not_configured", false],
    ["bad_response", false],
  ])("%s -> %s", (kind, retryable) => {
    expect(new BrainError(kind, "m").retryable).toBe(retryable);
  });
});

describe("isBrainConfigured", () => {
  it("true khi có BRAIN_URL", () => {
    expect(isBrainConfigured()).toBe(true);
  });

  it("false khi BRAIN_URL rỗng hoặc không đặt", () => {
    vi.stubEnv("BRAIN_URL", "");
    expect(isBrainConfigured()).toBe(false);
    vi.stubEnv("BRAIN_URL", undefined);
    expect(isBrainConfigured()).toBe(false);
  });
});

describe("cấu hình và header", () => {
  it("thiếu BRAIN_URL thì ném not_configured và không gọi mạng", async () => {
    vi.stubEnv("BRAIN_URL", undefined);
    expect((await caught(buildReport({ sales: [] }))).kind).toBe("not_configured");
    expect((await caught(readFreightInvoice(anh()))).kind).toBe("not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bỏ dấu / thừa ở cuối BRAIN_URL", async () => {
    vi.stubEnv("BRAIN_URL", `${BASE}/`);
    fetchMock.mockResolvedValueOnce(json({ ok: 1 }));
    await buildReport({ sales: [] });
    expect(call().url).toBe(`${BASE}/tools/report`);
  });

  it("không có BRAIN_API_TOKEN thì không gửi X-API-Token", async () => {
    vi.stubEnv("BRAIN_API_TOKEN", undefined);
    fetchMock.mockResolvedValueOnce(json({})).mockResolvedValueOnce(json({}));
    await buildReport({ sales: [] });
    await readFreightInvoice(anh());
    expect(call(0).init.headers).toEqual({ "Content-Type": "application/json" });
    expect(call(1).init.headers).toEqual({});
  });

  it.each<[string, number, () => Promise<unknown>]>([
    ["importInventoryFile", 60_000, () => importInventoryFile(excel())],
    [
      "uploadKnowledgeDocument",
      60_000,
      () => uploadKnowledgeDocument(new File(["pdf"], "hd.pdf"), { workspaceId: "ws-1" }),
    ],
    ["buildReport", 30_000, () => buildReport({ sales: [] })],
  ])("%s gắn AbortSignal.timeout(%i) và không dùng cache", async (_n, ms, run) => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValueOnce(json({ source: "hd.pdf" }));

    expect(await run()).toEqual({ source: "hd.pdf" });
    expect(spy).toHaveBeenCalledWith(ms);
    expect(call().init.signal).toBe(spy.mock.results[0].value);
    expect(call().init.cache).toBe("no-store");
  });
});

describe("công cụ JSON", () => {
  const sales = [{ date: "2026-10-01", revenue: 1_500_000, cogs: null }];
  const side = (end: string) => ({
    lines: [{ code: "A01", out_qty: 3 }],
    warehouse: "Kho Hà Nội",
    period_start: "2026-10-01",
    period_end: end,
  });

  it.each<[string, () => Promise<unknown>, string, unknown]>([
    [
      "buildReport",
      () => buildReport({ granularity: "month", sales }),
      "/tools/report",
      { granularity: "month", sales },
    ],
    [
      "auditInventory",
      () => auditInventory({ lines: [{ code: "A01", closing_value: null }], warehouse: "Kho 1" }),
      "/tools/inventory-audit",
      { lines: [{ code: "A01", closing_value: null }], warehouse: "Kho 1" },
    ],
    [
      "auditPartners",
      () => auditPartners({ customers: [{ code: "KH01", balance: null }], cogs_per_day: 100 }),
      "/tools/partner-audit",
      { customers: [{ code: "KH01", balance: null }], cogs_per_day: 100 },
    ],
    [
      "comparePeriods",
      () => comparePeriods(side("2026-10-15"), side("2026-10-31")),
      "/tools/period-diff",
      { truoc: side("2026-10-15"), sau: side("2026-10-31") },
    ],
    [
      "searchKnowledge (top_k mặc định 5)",
      () => searchKnowledge("ws-1", "cước Hà Nội - Hải Phòng"),
      "/knowledge/search",
      { workspace_id: "ws-1", query: "cước Hà Nội - Hải Phòng", top_k: 5 },
    ],
    [
      "searchKnowledge (top_k tuỳ chọn)",
      () => searchKnowledge("ws-1", "công nợ", 2),
      "/knowledge/search",
      { workspace_id: "ws-1", query: "công nợ", top_k: 2 },
    ],
  ])("%s gửi POST JSON đúng đường dẫn và thân, giữ nguyên null", async (_name, run, path, body) => {
    fetchMock.mockResolvedValueOnce(json({ ket_qua: "ok", warnings: [] }));

    expect(await run()).toEqual({ ket_qua: "ok", warnings: [] });

    const { url, init } = call();
    expect(url).toBe(`${BASE}${path}`);
    expect(init.method).toBe("POST");
    // Công cụ tất định không mang danh tính người dùng.
    expect(init.headers).toEqual({ "Content-Type": "application/json", "X-API-Token": "tok-123" });
    expect(JSON.parse(init.body as string)).toEqual(body);
  });
});

describe("kho tri thức", () => {
  it("listKnowledgeDocuments GET với workspace_id mã hoá đúng và trả danh sách", async () => {
    const doc = { source: "bang-gia.pdf", doc_type: "bảng giá", effective_from: null, effective_to: null, chunks: 4 };
    fetchMock.mockResolvedValueOnce(json({ documents: [doc] }));

    expect(await listKnowledgeDocuments("kho Hà Nội & co")).toEqual([doc]);

    const { url, init } = call();
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(`${BASE}/knowledge/documents`);
    expect(u.searchParams.get("workspace_id")).toBe("kho Hà Nội & co");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    // workspace_id là hàng rào — không gửi kèm danh tính người dùng.
    expect(init.headers).toEqual({ "Content-Type": "application/json", "X-API-Token": "tok-123" });
  });

  it("listKnowledgeDocuments trả [] khi Brain không có trường documents", async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    expect(await listKnowledgeDocuments("ws-1")).toEqual([]);
  });

  it("deleteKnowledgeDocument gửi DELETE, mã hoá đúng cả &, + và # trong tham số", async () => {
    fetchMock.mockResolvedValueOnce(json({ deleted: true }));

    await expect(deleteKnowledgeDocument("ws 1&x", "Bảng giá A+B & co #2.pdf")).resolves.toBeUndefined();

    const { url, init } = call();
    const u = new URL(url);
    expect(u.pathname).toBe("/knowledge/documents");
    expect(u.searchParams.get("workspace_id")).toBe("ws 1&x");
    expect(u.searchParams.get("source")).toBe("Bảng giá A+B & co #2.pdf");
    expect(init.method).toBe("DELETE");
    expect(init.headers).toEqual({ "Content-Type": "application/json", "X-API-Token": "tok-123" });
  });

  it("uploadKnowledgeDocument gửi multipart kèm mọi trường tuỳ chọn, trả nguyên kết quả Brain", async () => {
    fetchMock.mockResolvedValueOnce(json({ source: "hd.pdf", chunks: 3 }));

    expect(
      await uploadKnowledgeDocument(new File(["pdf"], "hd.pdf"), {
        workspaceId: "ws-1",
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-12-31",
        docType: "hợp đồng",
      }),
    ).toEqual({ source: "hd.pdf", chunks: 3 });

    const { url, init } = call();
    expect(url).toBe(`${BASE}/knowledge/documents`);
    expect(init.headers).toEqual({ "X-API-Token": "tok-123" });
    const form = init.body as FormData;
    expect((form.get("file") as File).name).toBe("hd.pdf");
    expect(form.get("workspace_id")).toBe("ws-1");
    expect(form.get("effective_from")).toBe("2026-01-01");
    expect(form.get("effective_to")).toBe("2026-12-31");
    expect(form.get("doc_type")).toBe("hợp đồng");
  });

  it("uploadKnowledgeDocument không gửi trường tuỳ chọn khi bỏ trống", async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    await uploadKnowledgeDocument(new File(["pdf"], "hd.pdf"), { workspaceId: "ws-1" });
    const form = call().init.body as FormData;
    expect([...form.keys()].sort()).toEqual(["file", "workspace_id"]);
  });
});

describe("tải file multipart", () => {
  it("readFreightInvoice POST ảnh, KHÔNG tự đặt Content-Type, trả kết quả Brain", async () => {
    const result = { success: true, needs_manual_review: true, invoice: { total: null } };
    fetchMock.mockResolvedValueOnce(json(result));

    expect(await readFreightInvoice(anh())).toEqual(result);

    const { url, init } = call();
    expect(url).toBe(`${BASE}/ocr/freight`);
    expect(init.method).toBe("POST");
    // fetch phải tự sinh boundary — đặt Content-Type tay là hỏng multipart.
    expect(init.headers).toEqual({ "X-API-Token": "tok-123" });
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect((form.get("file") as File).name).toBe("hoadon.jpg");
  });

  it.each<[string, () => Promise<unknown>, string, Record<string, string>]>([
    [
      "importInventoryFile có sheet",
      () => importInventoryFile(excel(), { sheet: "NXT" }),
      "/tools/inventory-import",
      { sheet: "NXT" },
    ],
    ["importInventoryFile không sheet", () => importInventoryFile(excel()), "/tools/inventory-import", {}],
    [
      "importPartnerFile có sheet + role",
      () => importPartnerFile(excel(), { sheet: "KH", role: "customer" }),
      "/tools/partner-import",
      { sheet: "KH", role: "customer" },
    ],
    ["importPartnerFile để Brain tự đoán role", () => importPartnerFile(excel()), "/tools/partner-import", {}],
    [
      "importProductFile có sheet",
      () => importProductFile(excel(), { sheet: "DM" }),
      "/tools/product-import",
      { sheet: "DM" },
    ],
    ["importProductFile không sheet", () => importProductFile(excel()), "/tools/product-import", {}],
  ])("%s", async (_name, run, path, extra) => {
    fetchMock.mockResolvedValueOnce(json({ audit: null, audit_skipped_reason: "lệch cột" }));

    expect(await run()).toEqual({ audit: null, audit_skipped_reason: "lệch cột" });

    const { url, init } = call();
    expect(url).toBe(`${BASE}${path}`);
    const form = init.body as FormData;
    expect((form.get("file") as File).name).toBe("NXT_T10.xlsx");
    const fields = Object.fromEntries([...form.entries()].filter(([k]) => k !== "file"));
    expect(fields).toEqual(extra);
  });

  it("lỗi 400 khi tải file vẫn moi được detail tiếng Việt", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: "File .xls đời cũ, Save As sang .xlsx" }, 400));
    const err = await caught(importInventoryFile(excel()));
    expect(err).toMatchObject({ kind: "bad_request", status: 400 });
    expect(err.message).toBe("File .xls đời cũ, Save As sang .xlsx");
  });
});

describe("phân loại phản hồi lỗi", () => {
  const report = () => buildReport({ sales: [] });

  it("503 kèm Retry-After là overloaded, giữ số giây chờ", async () => {
    fetchMock.mockResolvedValueOnce(new Response("busy", { status: 503, headers: { "Retry-After": "12" } }));
    const err = await caught(report());
    expect(err).toMatchObject({ kind: "overloaded", status: 503, retryAfterSeconds: 12 });
    expect(err.retryable).toBe(true);
  });

  it("503 không Retry-After là not_ready, lấy detail từ JSON", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: "Kho tri thức chưa khởi tạo" }, 503));
    const err = await caught(report());
    expect(err).toMatchObject({ kind: "not_ready", status: 503, retryAfterSeconds: undefined });
    expect(err.message).toBe("Kho tri thức chưa khởi tạo");
    expect(err.retryable).toBe(false);
  });

  it("503 không Retry-After với thân chữ thường thì giữ nguyên văn", async () => {
    fetchMock.mockResolvedValueOnce(new Response("thiếu thư viện faiss", { status: 503 }));
    expect((await caught(report())).message).toBe("thiếu thư viện faiss");
  });

  it("503 không Retry-After, thân rỗng thì dùng câu mặc định", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const err = await caught(report());
    expect(err.kind).toBe("not_ready");
    expect(err.message).toBe("Một thành phần của Brain chưa sẵn sàng.");
  });

  it.each([401, 403])("%i là unauthorized", async (status) => {
    fetchMock.mockResolvedValueOnce(json({ detail: "bad token" }, status));
    expect(await caught(report())).toMatchObject({ kind: "unauthorized", status });
  });

  it("4xx kèm detail chuỗi thì dùng detail làm message", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: "Thiếu cột doanh thu" }, 400));
    const err = await caught(report());
    expect(err).toMatchObject({ kind: "bad_request", status: 400 });
    expect(err.message).toBe("Thiếu cột doanh thu");
  });

  it("4xx với detail không phải chuỗi (lỗi kiểm dữ liệu) thì giữ nguyên JSON", async () => {
    const body = { detail: [{ loc: ["body", "sales"], msg: "field required" }] };
    fetchMock.mockResolvedValueOnce(json(body, 422));
    const err = await caught(report());
    expect(err).toMatchObject({ kind: "bad_request", status: 422 });
    expect(err.message).toBe(JSON.stringify(body));
  });

  it("4xx thân chữ thường giữ nguyên văn; thân rỗng thì báo mã trạng thái", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
    expect((await caught(report())).message).toBe("Not Found");

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
    expect((await caught(report())).message).toBe("Brain trả 400");
  });

  it.each([500, 502])("%i là server_error", async (status) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));
    const err = await caught(report());
    expect(err).toMatchObject({ kind: "server_error", status });
    expect(err.message).toBe(`Brain trả ${status}`);
  });

  it("5xx kèm detail JSON vẫn là server_error, dùng detail làm message", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: "Lỗi đọc sổ kho" }, 500));
    const err = await caught(report());
    expect(err).toMatchObject({ kind: "server_error", status: 500, message: "Lỗi đọc sổ kho" });
  });

  it.each([
    [503, 500],
    [400, 1000],
  ])("thân lỗi %i quá dài bị cắt còn %i ký tự", async (status, max) => {
    fetchMock.mockResolvedValueOnce(new Response("x".repeat(3000), { status }));
    expect((await caught(report())).message).toHaveLength(max);
  });

  it("2xx nhưng không phải JSON là bad_response, có nêu đường dẫn", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>proxy</html>", { status: 200 }));
    const err = await caught(report());
    expect(err.kind).toBe("bad_response");
    expect(err.message).toContain("/tools/report");
  });
});

describe("lỗi vận chuyển", () => {
  const timeoutErr = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");

  it.each<[string, () => Promise<unknown>, string]>([
    ["công cụ 30s", () => buildReport({ sales: [] }), "Brain không trả lời trong 30s (/tools/report)."],
    ["tải file 60s", () => importInventoryFile(excel()), "Brain không trả lời trong 60s (/tools/inventory-import)."],
  ])("TimeoutError là timeout, nêu đúng ngân sách (%s)", async (_name, run, message) => {
    fetchMock.mockRejectedValueOnce(timeoutErr());
    const err = await caught(run());
    expect(err.kind).toBe("timeout");
    expect(err.message).toBe(message);
  });

  it.todo(
    "BUG: readFreightInvoice (đọc ảnh bằng VLM) dùng timeout upload 60s; TIMEOUT_MS.vision = 120s khai báo cho OCR nhưng không đường nào dùng",
  );

  it("fetch hỏng (Brain tắt, sai URL) là unreachable, nêu URL và nguyên nhân", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const err = await caught(buildReport({ sales: [] }));
    expect(err.kind).toBe("unreachable");
    expect(err.message).toBe(`Không nối được Brain tại ${BASE}/tools/report: fetch failed`);
  });

  it("AbortError không phải hết giờ — vẫn là unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    expect((await caught(buildReport({ sales: [] }))).kind).toBe("unreachable");
  });

  it("đường tải file cũng phân loại unreachable, kể cả khi ném giá trị không phải Error", async () => {
    fetchMock.mockRejectedValueOnce("ECONNREFUSED");
    const err = await caught(readFreightInvoice(anh()));
    expect(err.kind).toBe("unreachable");
    expect(err.message).toBe(`Không nối được Brain tại ${BASE}/ocr/freight: ECONNREFUSED`);
  });
});

describe("checkBrainHealth", () => {
  it("Brain sống thì trả health, gọi GET /health không kèm danh tính", async () => {
    const health = { status: "ok", degraded: false, engine_ready: true, kb_ready: false, vision_ready: true };
    fetchMock.mockResolvedValueOnce(json(health));

    expect(await checkBrainHealth()).toEqual({ ok: true, health });
    const { url, init } = call();
    expect(url).toBe(`${BASE}/health`);
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ "Content-Type": "application/json", "X-API-Token": "tok-123" });
  });

  it("không ném khi Brain lỗi — trả kind và message", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503, headers: { "Retry-After": "5" } }));
    expect(await checkBrainHealth()).toEqual({
      ok: false,
      kind: "overloaded",
      message: "Brain đang bận, thử lại sau ít giây.",
    });
  });

  it("health chỉ chờ 3s rồi báo timeout", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    expect(await checkBrainHealth()).toEqual({
      ok: false,
      kind: "timeout",
      message: "Brain không trả lời trong 3s (/health).",
    });
    expect(spy).toHaveBeenCalledWith(3_000);
    expect(call().init.signal).toBe(spy.mock.results[0].value);
  });

  it("chưa cấu hình thì trả not_configured", async () => {
    vi.stubEnv("BRAIN_URL", "");
    expect(await checkBrainHealth()).toMatchObject({ ok: false, kind: "not_configured" });
  });

  it("lỗi lạ không phải BrainError vẫn không ném, coi là unreachable", async () => {
    // fetch trả về thứ không phải Response -> TypeError trong lúc đọc phản hồi.
    fetchMock.mockResolvedValueOnce(undefined as unknown as Response);
    const r = await checkBrainHealth();
    expect(r).toMatchObject({ ok: false, kind: "unreachable" });
  });
});

describe("askBrain", () => {
  /** Chạy askBrain tới khi xong dưới đồng hồ giả; `ms` là thời gian giả đã trôi lúc nó kết thúc. */
  async function runAsk() {
    const t0 = Date.now();
    const settled = askBrain("Tồn kho mã A01 còn bao nhiêu?", who).then(
      (value) => ({ value, error: undefined, ms: Date.now() - t0 }),
      (error: unknown) => ({ value: undefined, error, ms: Date.now() - t0 }),
    );
    await vi.runAllTimersAsync();
    return settled;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
  });

  it("gửi câu hỏi kèm danh tính, hỏi lại task tới khi xong và trả câu trả lời", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    fetchMock
      .mockResolvedValueOnce(json({ task_id: "t-1", status: "processing" }))
      .mockResolvedValueOnce(json({ status: "processing" }))
      .mockResolvedValueOnce(
        json({ status: "completed", result: { answer: "Còn 12 thùng.", sources: ["nxt.xlsx"], confidence: 0.9 } }),
      );

    const { value, error } = await runAsk();
    expect(error).toBeUndefined();
    expect(value).toEqual({ answer: "Còn 12 thùng.", sources: ["nxt.xlsx"], confidence: 0.9, taskId: "t-1" });

    // Một lần gửi + hai lần hỏi lại, không hỏi thêm sau khi đã xong.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // /chat chờ 60s; mỗi lần hỏi lại chỉ chờ 3s.
    expect(spy.mock.calls.map((c) => c[0])).toEqual([60_000, 3_000, 3_000]);

    const identityHeaders = {
      "Content-Type": "application/json",
      "X-API-Token": "tok-123",
      "X-User-Id": "u-1",
      "X-Store-Id": "kho-1",
    };
    const chat = call(0);
    expect(chat.url).toBe(`${BASE}/chat`);
    expect(chat.init.method).toBe("POST");
    expect(chat.init.headers).toEqual(identityHeaders);
    expect(JSON.parse(chat.init.body as string)).toEqual({
      user_id: "u-1",
      store_id: "kho-1",
      message: "Tồn kho mã A01 còn bao nhiêu?",
    });

    for (const i of [1, 2]) {
      expect(call(i).url).toBe(`${BASE}/api/v1/task/t-1`);
      expect(call(i).init.method).toBe("GET");
      expect(call(i).init.headers).toEqual(identityHeaders);
    }
  });

  it.each([
    ["thiếu task_id", { status: "processing" }],
    ["thân JSON null", null],
  ])("Brain trả %s thì bad_response, không hỏi lại", async (_name, body) => {
    fetchMock.mockResolvedValueOnce(json(body));
    const { error } = await runAsk();
    expect(error).toMatchObject({ kind: "bad_response", message: "Brain không trả về task_id cho /chat." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lỗi HTTP khi hỏi lại task thì ném ngay, không hỏi tiếp", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ task_id: "t-1" }))
      .mockResolvedValueOnce(json({ detail: "Không có task t-1" }, 404))
      .mockImplementation(async () => json({ status: "running" }));

    const { error } = await runAsk();
    expect(error).toMatchObject({ kind: "bad_request", status: 404, message: "Không có task t-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["answer rỗng", { status: "completed", result: { answer: "" } }],
    ["không có result", { status: "completed" }],
  ])("xong nhưng %s là bad_response, không trả chuỗi rỗng ra UI", async (_name, task) => {
    fetchMock.mockResolvedValueOnce(json({ task_id: "t-1" })).mockResolvedValueOnce(json(task));
    const { error } = await runAsk();
    expect(error).toBeInstanceOf(BrainError);
    expect(error).toMatchObject({ kind: "bad_response", message: "Brain trả về câu trả lời rỗng." });
  });

  it.each([
    [{ status: "failed", error: "CUDA out of memory" }, "Brain xử lý thất bại: CUDA out of memory"],
    [{ status: "failed" }, "Brain xử lý thất bại: không rõ"],
  ])("task failed là server_error kèm lý do (%o)", async (task, message) => {
    fetchMock.mockResolvedValueOnce(json({ task_id: "t-1" })).mockResolvedValueOnce(json(task));
    const { error } = await runAsk();
    expect(error).toMatchObject({ kind: "server_error", message });
  });

  it("task chạy mãi thì dừng hỏi và báo timeout sau 60s mặc định", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ task_id: "t-9" }))
      .mockImplementation(async () => json({ status: "running" }));

    const { error, ms } = await runAsk();
    expect(error).toMatchObject({ kind: "timeout", message: "Brain chưa trả lời sau 60s (task t-9)." });
    // Bỏ cuộc sau hạn 60s, trễ tối đa một nhịp hỏi 3s — không sớm hơn, không treo thêm.
    expect(ms).toBeGreaterThan(60_000);
    expect(ms).toBeLessThanOrEqual(63_000);
  });

  it("BRAIN_CHAT_TIMEOUT_MS rút ngắn hạn chờ của vòng hỏi lại", async () => {
    vi.stubEnv("BRAIN_CHAT_TIMEOUT_MS", "1000");
    fetchMock
      .mockResolvedValueOnce(json({ task_id: "t-2" }))
      .mockImplementation(async () => json({ status: "running" }));

    const { error } = await runAsk();
    expect(error).toMatchObject({ kind: "timeout", message: "Brain chưa trả lời sau 1s (task t-2)." });
    expect(fetchMock.mock.calls.length - 1).toBeLessThan(6);
  });
});

describe("timeout của /chat", () => {
  it("BRAIN_CHAT_TIMEOUT_MS hợp lệ thay ngân sách của request /chat", async () => {
    vi.stubEnv("BRAIN_CHAT_TIMEOUT_MS", "180000");
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));

    const err = await caught(askBrain("xin chào", who));
    expect(timeoutSpy).toHaveBeenCalledWith(180_000);
    expect(err).toMatchObject({ kind: "timeout", message: "Brain không trả lời trong 180s (/chat)." });
  });

  it.each(["abc", "0", "-5", ""])("BRAIN_CHAT_TIMEOUT_MS=%j không hợp lệ thì giữ 60s", async (raw) => {
    vi.stubEnv("BRAIN_CHAT_TIMEOUT_MS", raw);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValueOnce(json({ detail: "x" }, 500));

    await caught(askBrain("xin chào", who));
    expect(timeoutSpy).toHaveBeenCalledWith(60_000);
  });

  it("biến này chỉ ảnh hưởng chat, không đổi timeout công cụ", async () => {
    vi.stubEnv("BRAIN_CHAT_TIMEOUT_MS", "180000");
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValueOnce(json({}));

    await buildReport({ sales: [] });
    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
  });
});
