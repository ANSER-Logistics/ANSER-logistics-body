import { describe, expect, it } from "vitest";
import { weightedAverageCost } from "./inventoryCost";

describe("weightedAverageCost", () => {
  it("bình quân gia quyền theo số lượng tồn cũ và lô nhập", () => {
    // (10×100 + 30×200) / 40 = 175
    expect(weightedAverageCost({ oldStock: 10, oldCost: 100, inQty: 30, inCost: 200 })).toBe(175);
  });

  it("làm tròn về đồng gần nhất, cả lên lẫn xuống", () => {
    // 302/3 = 100,67 → 101
    expect(weightedAverageCost({ oldStock: 1, oldCost: 100, inQty: 2, inCost: 101 })).toBe(101);
    // 301/3 = 100,33 → 100
    expect(weightedAverageCost({ oldStock: 2, oldCost: 100, inQty: 1, inCost: 101 })).toBe(100);
  });

  it("tính đúng với số lượng lẻ", () => {
    // (38,4×1000 + 1,6×2000) / 40 = 1040
    expect(weightedAverageCost({ oldStock: 38.4, oldCost: 1000, inQty: 1.6, inCost: 2000 })).toBe(1040);
  });

  it("phiếu nhập không ghi đơn giá thì giữ nguyên giá vốn cũ, kể cả khi giá cũ chưa biết", () => {
    expect(weightedAverageCost({ oldStock: 10, oldCost: 150, inQty: 5, inCost: null })).toBe(150);
    expect(weightedAverageCost({ oldStock: 10, oldCost: null, inQty: 5, inCost: null })).toBeNull();
  });

  it("lô nhập số lượng 0 hoặc âm không làm đổi giá vốn", () => {
    expect(weightedAverageCost({ oldStock: 10, oldCost: 150, inQty: 0, inCost: 999 })).toBe(150);
    expect(weightedAverageCost({ oldStock: 10, oldCost: 150, inQty: -3, inCost: 999 })).toBe(150);
    // Hết hàng mà lô nhập rỗng: vẫn giữ giá cũ, không để giá lô 0 cái thành giá vốn.
    expect(weightedAverageCost({ oldStock: 0, oldCost: 150, inQty: 0, inCost: 999 })).toBe(150);
  });

  it("hết hàng hoặc tồn âm thì giá lô mới thành giá vốn, dù giá cũ chưa biết", () => {
    expect(weightedAverageCost({ oldStock: 0, oldCost: 100, inQty: 5, inCost: 300 })).toBe(300);
    expect(weightedAverageCost({ oldStock: -4, oldCost: 100, inQty: 5, inCost: 300 })).toBe(300);
    expect(weightedAverageCost({ oldStock: 0, oldCost: null, inQty: 5, inCost: 300 })).toBe(300);
  });

  it("đang có tồn mà tồn đó chưa có giá vốn thì trả null, không bịa bằng giá lô mới hay 0", () => {
    expect(weightedAverageCost({ oldStock: 10, oldCost: null, inQty: 5, inCost: 300 })).toBeNull();
  });

  it("giá 0 là giá đã biết, vẫn được đưa vào bình quân", () => {
    // Lô hàng tặng (đơn giá 0) kéo giá vốn xuống, không bị coi như "không ghi giá".
    expect(weightedAverageCost({ oldStock: 10, oldCost: 100, inQty: 10, inCost: 0 })).toBe(50);
    // Tồn cũ giá 0 cũng là đã biết, không bị coi như null.
    expect(weightedAverageCost({ oldStock: 10, oldCost: 0, inQty: 10, inCost: 100 })).toBe(50);
  });
});
