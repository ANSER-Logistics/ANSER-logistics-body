import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateN8nWorkflow,
  createN8nWorkflow,
  deactivateN8nWorkflow,
  findSmtpCredentialId,
  getN8nWorkflow,
  isN8nApiConfigured,
  listN8nExecutions,
  listN8nWorkflows,
  updateN8nWorkflow,
} from "./n8nApi";

const BASE = "http://localhost:5679";
const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** URL, method, headers và body (đã parse) của lần gọi fetch thứ `i`. */
function sent(i = 0) {
  const [url, init] = fetchMock.mock.calls[i];
  return {
    url: String(url),
    method: init?.method ?? "GET",
    headers: init?.headers as Record<string, string>,
    body: init?.body ? JSON.parse(init.body as string) : undefined,
    signal: init?.signal,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("N8N_API_URL", BASE);
  vi.stubEnv("N8N_API_KEY", "khoa-bi-mat");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isN8nApiConfigured", () => {
  it("cần cả URL lẫn API key", () => {
    expect(isN8nApiConfigured()).toBe(true);

    vi.stubEnv("N8N_API_KEY", "");
    expect(isN8nApiConfigured()).toBe(false);

    vi.stubEnv("N8N_API_KEY", "khoa-bi-mat");
    vi.stubEnv("N8N_API_URL", "");
    expect(isN8nApiConfigured()).toBe(false);
  });

  it("chưa cấu hình thì mọi lời gọi API báo lỗi hướng dẫn và không gọi mạng", async () => {
    vi.stubEnv("N8N_API_KEY", "");

    await expect(listN8nWorkflows()).rejects.toThrow(/N8N_API_URL\/N8N_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("n8nApiFetch (qua các hàm public)", () => {
  it("nối /api/v1 vào base URL và gửi X-N8N-API-KEY kèm timeout 5 giây", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    await listN8nWorkflows();

    const req = sent();
    expect(req.url).toBe(`${BASE}/api/v1/workflows?limit=100`);
    expect(req.method).toBe("GET");
    expect(req.headers).toMatchObject({ "X-N8N-API-KEY": "khoa-bi-mat", "Content-Type": "application/json" });
    expect(timeoutSpy).toHaveBeenCalledWith(5000);
    expect(req.signal).toBe(timeoutSpy.mock.results[0].value);
  });

  it("HTTP lỗi thì throw kèm mã trạng thái và nội dung n8n trả về", async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"unauthorized"}', { status: 401 }));

    await expect(listN8nWorkflows()).rejects.toThrow('n8n API lỗi 401: {"message":"unauthorized"}');
  });

  it("HTTP lỗi với body rỗng thì không thêm dấu hai chấm thừa", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));

    await expect(listN8nWorkflows()).rejects.toThrow(/^n8n API lỗi 404 — /);
  });

  it("HTTP lỗi mà đọc body cũng lỗi vẫn throw lỗi HTTP, không phải lỗi đọc body", async () => {
    const res = new Response(null, { status: 500 });
    vi.spyOn(res, "text").mockRejectedValue(new Error("stream hỏng"));
    fetchMock.mockResolvedValue(res);

    await expect(listN8nWorkflows()).rejects.toThrow(/^n8n API lỗi 500 — /);
  });

  it("fetch lỗi mạng thì throw lên cho route xử lý", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(listN8nWorkflows()).rejects.toThrow("fetch failed");
  });
});

describe("listN8nWorkflows", () => {
  it("chuẩn hoá id về chuỗi và chỉ giữ id/name/active", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          { id: 7, name: "Báo tồn kho thấp", active: true, nodes: [] },
          { id: "abc", name: "Chào khách mới", active: false },
        ],
      }),
    );

    expect(await listN8nWorkflows()).toEqual([
      { id: "7", name: "Báo tồn kho thấp", active: true },
      { id: "abc", name: "Chào khách mới", active: false },
    ]);
  });

  it("phản hồi không có `data` thì trả mảng rỗng", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    expect(await listN8nWorkflows()).toEqual([]);
  });
});

describe("findSmtpCredentialId", () => {
  it("trả id (dạng chuỗi) của credential SMTP đầu tiên", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          { id: 1, type: "httpBasicAuth" },
          { id: 42, type: "smtp" },
          { id: 43, type: "smtp" },
        ],
      }),
    );

    expect(await findSmtpCredentialId()).toBe("42");
    expect(sent().url).toBe(`${BASE}/api/v1/credentials`);
  });

  it("không có credential SMTP thì trả null", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: 1, type: "httpBasicAuth" }] }));
    expect(await findSmtpCredentialId()).toBeNull();
  });

  it("phản hồi không có `data` thì trả null", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    expect(await findSmtpCredentialId()).toBeNull();
  });
});

describe("createN8nWorkflow", () => {
  it("POST workflow, thiếu settings thì gửi {} và trả id dạng chuỗi", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 99, name: "x" }));

    const result = await createN8nWorkflow({ name: "Báo tồn kho", nodes: [{ id: "n1" }], connections: {} });

    expect(result).toEqual({ id: "99" });
    const req = sent();
    expect(req.url).toBe(`${BASE}/api/v1/workflows`);
    expect(req.method).toBe("POST");
    expect(req.body).toEqual({ name: "Báo tồn kho", nodes: [{ id: "n1" }], connections: {}, settings: {} });
  });

  it("giữ nguyên settings khi có truyền", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "w1" }));

    await createN8nWorkflow({ name: "x", nodes: [], connections: {}, settings: { timezone: "Asia/Ho_Chi_Minh" } });

    expect(sent().body.settings).toEqual({ timezone: "Asia/Ho_Chi_Minh" });
  });
});

describe("getN8nWorkflow / updateN8nWorkflow", () => {
  it("getN8nWorkflow chỉ lấy name/nodes/connections/settings, bỏ các trường chỉ-đọc", async () => {
    const nodes = [{ id: "n1", name: "Cron", type: "n8n-nodes-base.cron", parameters: {} }];
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: "w1",
        name: "Báo tồn kho",
        active: true,
        versionId: "v9",
        nodes,
        connections: { Cron: {} },
        settings: { timezone: "Asia/Ho_Chi_Minh" },
      }),
    );

    const wf = await getN8nWorkflow("w1");

    expect(sent().url).toBe(`${BASE}/api/v1/workflows/w1`);
    // PUT /workflows của n8n từ chối trường thừa (id, active, versionId...) —
    // get rồi update lại nguyên object phải chạy được.
    expect(wf).toEqual({
      name: "Báo tồn kho",
      nodes,
      connections: { Cron: {} },
      settings: { timezone: "Asia/Ho_Chi_Minh" },
    });
  });

  it("updateN8nWorkflow PUT đúng workflow, thiếu settings thì gửi {}", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await updateN8nWorkflow("w1", { name: "Báo tồn kho", nodes: [], connections: {} });

    const req = sent();
    expect(req.url).toBe(`${BASE}/api/v1/workflows/w1`);
    expect(req.method).toBe("PUT");
    expect(req.body).toEqual({ name: "Báo tồn kho", nodes: [], connections: {}, settings: {} });
  });

  it("updateN8nWorkflow giữ nguyên settings khi có truyền", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await updateN8nWorkflow("w1", { name: "x", nodes: [], connections: {}, settings: { timezone: "Asia/Ho_Chi_Minh" } });

    expect(sent().body.settings).toEqual({ timezone: "Asia/Ho_Chi_Minh" });
  });

  // n8nWorkflowId do người dùng dán vào (PATCH /api/automation/rules/[id]) được ghép
  // thẳng vào path; listN8nExecutions thì có encodeURIComponent. Id "../credentials"
  // khiến URL chuẩn hoá thành /api/v1/credentials — gọi nhầm endpoint bằng API key server.
  it.todo("BUG: get/update/activate/deactivate không encodeURIComponent workflowId khi ghép vào path");
});

describe("activate / deactivate", () => {
  it("bật workflow bằng POST /activate và trả kết quả của n8n", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "w1", active: true }));

    expect(await activateN8nWorkflow("w1")).toMatchObject({ active: true });
    expect(sent()).toMatchObject({ url: `${BASE}/api/v1/workflows/w1/activate`, method: "POST" });
  });

  it("tắt workflow bằng POST /deactivate", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "w1", active: false }));

    expect(await deactivateN8nWorkflow("w1")).toMatchObject({ active: false });
    expect(sent()).toMatchObject({ url: `${BASE}/api/v1/workflows/w1/deactivate`, method: "POST" });
  });

  it("phản hồi OK nhưng body không phải JSON thì trả {} thay vì throw", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    expect(await activateN8nWorkflow("w1")).toEqual({});
  });
});

describe("listN8nExecutions", () => {
  it("mã hoá workflowId trong query và mặc định lấy 10 lần chạy", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    await listN8nExecutions("a&b=c");

    expect(sent().url).toBe(`${BASE}/api/v1/executions?workflowId=a%26b%3Dc&limit=10`);
  });

  it("truyền limit tuỳ chọn", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    await listN8nExecutions("w1", 3);

    expect(sent().url).toBe(`${BASE}/api/v1/executions?workflowId=w1&limit=3`);
  });

  it("dùng status của n8n nếu có; n8n cũ không có status thì suy ra từ stoppedAt/finished", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          { id: 1, status: "waiting", finished: false, stoppedAt: null, mode: "trigger", startedAt: "2026-01-01T00:00:00Z" },
          { id: 2, finished: false, stoppedAt: null },
          { id: 3, finished: true, stoppedAt: "2026-01-01T00:01:00Z" },
          { id: 4, finished: false, stoppedAt: "2026-01-01T00:02:00Z" },
        ],
      }),
    );

    const execs = await listN8nExecutions("w1");

    expect(execs.map((e) => [e.id, e.status])).toEqual([
      [1, "waiting"],
      [2, "running"],
      [3, "success"],
      [4, "error"],
    ]);
    expect(execs[0]).toEqual({
      id: 1,
      status: "waiting",
      mode: "trigger",
      startedAt: "2026-01-01T00:00:00Z",
      stoppedAt: null,
    });
  });

  it("phản hồi không có `data` thì trả mảng rỗng", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    expect(await listN8nExecutions("w1")).toEqual([]);
  });
});
