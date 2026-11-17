import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { triggerN8nWebhook } from "@/server/n8n";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("triggerN8nWebhook", () => {
  it("chưa cấu hình N8N_WEBHOOK_URL thì không gọi mạng", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "");

    await expect(triggerN8nWebhook("new-customer", { id: "1" })).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POST payload dạng JSON tới <base>/<path>", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "http://localhost:5679/webhook");
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await triggerN8nWebhook("new-customer", { name: "Cửa hàng An Phát", phone: null });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:5679/webhook/new-customer");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init?.body as string)).toEqual({ name: "Cửa hàng An Phát", phone: null });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("n8n sập (fetch lỗi) thì chỉ log, không throw vào luồng nghiệp vụ", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "http://localhost:5679/webhook");
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(triggerN8nWebhook("new-customer", {})).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledOnce();
    expect(String(vi.mocked(console.error).mock.calls[0][0])).toContain('"new-customer"');
  });

  // app/api/customers/route.ts gọi `void triggerN8nWebhook(...)` — throw ở đây là unhandled rejection.
  it("payload không serialize được thì chỉ log, không throw và không gọi mạng", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "http://localhost:5679/webhook");
    const vongLap: Record<string, unknown> = {};
    vongLap.self = vongLap;

    await expect(triggerN8nWebhook("new-customer", vongLap)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("webhook trả HTTP lỗi (vd 404 khi workflow chưa bật) thì không throw", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "http://localhost:5679/webhook");
    fetchMock.mockResolvedValue(new Response("not found", { status: 404 }));

    await expect(triggerN8nWebhook("new-customer", {})).resolves.toBeUndefined();
  });

  it("webhook trả HTTP lỗi thì log đường dẫn và mã trạng thái để gỡ lỗi", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "http://localhost:5679/webhook");
    fetchMock.mockResolvedValue(new Response("not found", { status: 404 }));

    await triggerN8nWebhook("new-customer", {});

    expect(console.error).toHaveBeenCalledOnce();
    const logged = vi.mocked(console.error).mock.calls[0].join(" ");
    expect(logged).toContain("new-customer");
    expect(logged).toContain("404");
  });

  it("webhook trả 2xx thì không log gì", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "http://localhost:5679/webhook");
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await triggerN8nWebhook("new-customer", {});

    expect(console.error).not.toHaveBeenCalled();
  });

  // AbortSignal.timeout chạy trên timer nội bộ của Node, vi.useFakeTimers không
  // tua được — nên kiểm tín hiệu gửi đi là timeout 3s thay vì chờ thật 3 giây.
  it("gửi kèm tín hiệu huỷ sau 3 giây để n8n treo không kéo theo request người dùng", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "http://localhost:5679/webhook");
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await triggerN8nWebhook("slow", {});

    expect(timeoutSpy).toHaveBeenCalledWith(3000);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(timeoutSpy.mock.results[0].value);
  });
});
