import { describe, expect, it } from "vitest";
import { matchCosts, type MatchableProduct, type UnitCostRow } from "@/server/store/inventoryCostMatch";

const row = (code: string, name: string, unit_cost: number, source = "xuất"): UnitCostRow => ({
  code,
  name,
  unit: "Lít",
  unit_cost,
  source,
});

const prod = (id: string, code: string, name: string, cost: number | null = null): MatchableProduct => ({
  id,
  code,
  name,
  cost,
});

describe("matchCosts", () => {
  it("khớp theo mã, không phân biệt hoa thường và khoảng trắng, lấy mã/tên của ANSER", () => {
    const { matches } = matchCosts(
      [row(" km00028 ", "tên trong file", 45_000, "tồn cuối")],
      [prod("p1", "KM00028", "Dầu nhớt Castrol 1L")],
    );

    expect(matches).toEqual([
      {
        productId: "p1",
        code: "KM00028",
        name: "Dầu nhớt Castrol 1L",
        currentCost: null,
        newCost: 45_000,
        source: "tồn cuối",
        matchedBy: "code",
        wouldOverwrite: false,
      },
    ]);
  });

  it("mã khớp thì dùng mã, dù tên trong file trùng tên một mặt hàng khác", () => {
    const { matches } = matchCosts(
      [row("KM01", "Hàng B", 10)],
      [prod("a", "KM01", "Hàng A"), prod("b", "KM02", "Hàng B")],
    );
    expect(matches.map((m) => [m.productId, m.matchedBy])).toEqual([["a", "code"]]);
  });

  it("không tìm thấy mã thì lùi về tên (không phân biệt hoa thường)", () => {
    const { matches } = matchCosts(
      [row("VT99999", "  DẦU NHỚT A ", 20), row("", "Dầu nhớt B", 30)],
      [prod("a", "KM01", "Dầu nhớt A"), prod("b", "KM02", "Dầu nhớt B")],
    );
    expect(matches.map((m) => [m.productId, m.matchedBy, m.newCost])).toEqual([
      ["a", "name", 20],
      ["b", "name", 30],
    ]);
  });

  it("tên trùng giữa nhiều mặt hàng thì bỏ hẳn, không chọn bừa", () => {
    const preview = matchCosts(
      [row("XX", "Dầu X", 100), row("VT01", "Dầu X", 200)],
      [prod("a", "KM01", "Dầu X"), prod("b", "VT01", "dầu x")],
    );
    // Tên trùng chỉ bị bỏ khỏi bảng tra TÊN; khớp theo mã vẫn chạy bình thường.
    expect(preview.matches.map((m) => [m.productId, m.matchedBy])).toEqual([["b", "code"]]);
    expect(preview.unmatchedFromFile).toEqual([{ code: "XX", name: "Dầu X", unit_cost: 100 }]);
  });

  it("dòng không khớp được giữ nguyên mã, tên, đơn giá như trong file", () => {
    const preview = matchCosts(
      [row(" km99 ", "Hàng lạ", 77), row("ZZ", "", 88)],
      // Mặt hàng tên rỗng: dòng file tên rỗng không được khớp vào nó.
      [prod("a", "KM01", "Hàng A"), prod("e", "KM02", "")],
    );
    expect(preview.matches).toEqual([]);
    expect(preview.unmatchedFromFile).toEqual([
      { code: " km99 ", name: "Hàng lạ", unit_cost: 77 },
      { code: "ZZ", name: "", unit_cost: 88 },
    ]);
  });

  it("một mặt hàng trúng hai dòng: giữ lần khớp đầu, dòng sau vào danh sách không khớp", () => {
    const preview = matchCosts(
      [row("KM01", "Hàng A", 100), row("KM01", "Hàng A", 999), row("XX", "Hàng A", 555)],
      [prod("a", "KM01", "Hàng A")],
    );
    expect(preview.matches.map((m) => [m.productId, m.newCost, m.matchedBy])).toEqual([["a", 100, "code"]]);
    expect(preview.unmatchedFromFile.map((r) => r.unit_cost)).toEqual([999, 555]);
  });

  it.todo(
    "BUG: dòng khớp TÊN đứng trước chiếm mất mặt hàng, dòng khớp đúng MÃ đứng sau bị đẩy vào 'không khớp' (inventoryCostMatch.ts:95)",
  );

  it("đã có giá vốn (kể cả 0) thì đánh dấu sẽ ghi đè; null thì là điền mới", () => {
    const { matches } = matchCosts(
      [row("A", "", 10), row("B", "", 20), row("C", "", 30)],
      [prod("a", "A", "Hàng A", 0), prod("b", "B", "Hàng B", 15), prod("c", "C", "Hàng C", null)],
    );
    expect(matches.map((m) => [m.productId, m.currentCost, m.wouldOverwrite])).toEqual([
      ["a", 0, true],
      ["b", 15, true],
      ["c", null, false],
    ]);
  });

  it("stillMissing chỉ gồm mặt hàng chưa có giá vốn và không có trong file", () => {
    const preview = matchCosts(
      [row("A", "", 10)],
      [
        prod("a", "A", "Hàng A"), // có trong file
        prod("b", "B", "Hàng B", 0), // đã có giá vốn 0
        prod("c", "C", "Hàng C", 12), // đã có giá vốn
        prod("d", "D", "Hàng D"), // còn thiếu
      ],
    );
    expect(preview.stillMissing).toEqual([{ code: "D", name: "Hàng D" }]);
  });

  it("counts khớp với các danh sách chi tiết", () => {
    const preview = matchCosts(
      [
        row("A", "", 10), // điền mới
        row("B", "", 20), // ghi đè
        row("C", "", 30), // ghi đè
        row("XX", "Không có", 40), // không khớp
        row("A", "", 50), // trùng mặt hàng A → không khớp
      ],
      [
        prod("a", "A", "Hàng A"),
        prod("b", "B", "Hàng B", 1),
        prod("c", "C", "Hàng C", 2),
        prod("d", "D", "Hàng D"),
        prod("e", "E", "Hàng E"),
      ],
    );
    expect(preview.counts).toEqual({
      fileRows: 5,
      matched: 3,
      wouldFill: 1,
      wouldOverwrite: 2,
      unmatched: 2,
      stillMissing: 2,
    });
  });

  it("file rỗng: không khớp gì, mọi mặt hàng chưa có giá vốn đều còn thiếu", () => {
    const preview = matchCosts([], [prod("a", "A", "Hàng A"), prod("b", "B", "Hàng B", 5)]);
    expect(preview.matches).toEqual([]);
    expect(preview.stillMissing).toEqual([{ code: "A", name: "Hàng A" }]);
    expect(preview.counts).toMatchObject({ fileRows: 0, matched: 0, stillMissing: 1 });
  });
});
