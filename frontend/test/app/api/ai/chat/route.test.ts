import { beforeEach, describe, expect, it, vi } from "vitest";

const askBrain = vi.hoisted(() => vi.fn());
vi.mock("@/server/brain", async (orig) => ({ ...(await orig<typeof import("@/server/brain")>()), askBrain }));
vi.mock("@/server/session", () => ({ getSessionUser: async () => ({ id: "u-1" }) }));
vi.mock("@/server/store/warehouses", () => ({ listWarehouses: async () => [{ id: "kho-1" }] }));

import { POST } from "@/app/api/ai/chat/route";

const post = (body: unknown) =>
  POST(new Request("http://body.test/api/ai/chat", { method: "POST", body: JSON.stringify(body) }));
const turn = (role: string, content = "x") => ({ role, content });

beforeEach(() => {
  askBrain.mockReset();
  askBrain.mockResolvedValue({ answer: "ok", taskId: "t-1" });
});

describe("POST /api/ai/chat — history", () => {
  it("không gửi history thì vẫn chuyển [] sang Brain", async () => {
    expect((await post({ message: "xin chào" })).status).toBe(200);
    expect(askBrain).toHaveBeenCalledWith("xin chào", { userId: "u-1", warehouseId: "kho-1" }, []);
  });

  it("chỉ chuyển 6 tin gần nhất, giữ thứ tự cũ trước mới sau, bỏ trường thừa", async () => {
    const history = Array.from({ length: 8 }, (_, i) => ({
      ...turn(i % 2 ? "assistant" : "user", `tin ${i}`),
      id: i,
    }));
    await post({ message: "tiếp", history });

    expect(askBrain.mock.calls[0][2]).toEqual(
      [2, 3, 4, 5, 6, 7].map((i) => turn(i % 2 ? "assistant" : "user", `tin ${i}`)),
    );
  });

  it.each([
    ["không phải mảng", "abc"],
    ["quá 20 tin", Array.from({ length: 21 }, () => turn("user"))],
    ["vai khác user/assistant", [turn("system")]],
    ["content không phải chuỗi", [{ role: "user", content: 5 }]],
    ["content quá 4000 ký tự", [turn("assistant", "a".repeat(4001))]],
  ])("history %s thì 400 và không gọi Brain", async (_name, history) => {
    const res = await post({ message: "tiếp", history });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.any(String) });
    expect(askBrain).not.toHaveBeenCalled();
  });
});
