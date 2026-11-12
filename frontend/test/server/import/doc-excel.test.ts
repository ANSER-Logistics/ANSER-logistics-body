import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { docCoKhong, docExcel, docSo } from "@/server/import/doc-excel";

type O = ExcelJS.CellValue;

/** Dựng một .xlsx trong bộ nhớ; mỗi phần tử là một dòng, `null` = ô trống. */
async function xlsx(rows: O[][], tenSheet = "Sheet1") {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(tenSheet);
  rows.forEach((r, i) =>
    r.forEach((v, c) => {
      if (v !== null && v !== undefined) ws.getRow(i + 1).getCell(c + 1).value = v;
    }),
  );
  return wb.xlsx.writeBuffer();
}

/** Khuôn bản xuất MISA: tiêu đề ở dòng 1, dòng 2 trống, header ở dòng 3. */
const misa = (header: O[], ...data: O[][]) => xlsx([["DANH SÁCH"], [], header, ...data]);

describe("docSo", () => {
  it("số thật trong ô giữ nguyên, kể cả số âm và số lẻ", () => {
    expect(docSo(1234.5)).toBe(1234.5);
    expect(docSo(-3)).toBe(-3);
    expect(docSo(0)).toBe(0);
  });

  it("ô trống hay số không hữu hạn là null, không phải 0", () => {
    for (const v of [null, undefined, "", "   ", NaN, Infinity]) expect(docSo(v)).toBeNull();
  });

  it.each([
    ["1.234", 1234],
    ["1.234.567", 1234567],
    ["1.234.567,89", 1234567.89],
    ["1,234,567.89", 1234567.89],
    ["1,234", 1234],
    ["1,5", 1.5],
    ["38,4", 38.4],
    ["101.48", 101.48],
    ["-2,5", -2.5],
    ["(1.500.000)", -1500000],
    ["1.234.567 ₫", 1234567],
    ["150.000đ", 150000],
    ["2.000 VND", 2000],
    [" 1 234 ", 1234],
  ])("đọc chuỗi kiểu Việt %j thành %d", (s, n) => {
    expect(docSo(s)).toBe(n);
  });

  it("chữ không phải số là null", () => {
    for (const v of ["abc", "-", "Không có", "1.2.3", true]) expect(docSo(v)).toBeNull();
  });

  it("ô công thức, rich text, hyperlink lấy giá trị hiển thị; ô lỗi là null", () => {
    expect(docSo({ formula: "B4*2", result: 2468 })).toBe(2468);
    expect(docSo({ formula: "B4", result: "1.234" })).toBe(1234);
    expect(docSo({ richText: [{ text: "1.2" }, { text: "34" }] })).toBe(1234);
    expect(docSo({ text: "5", hyperlink: "https://x.vn" })).toBe(5);
    expect(docSo({ error: "#N/A" })).toBeNull();
    expect(docSo({ formula: "B4" })).toBeNull();
  });

  it("ô chỉ có ký hiệu tiền hoặc '()' là null (chưa biết), không phải 0", () => {
    for (const v of ["đ", "VND", "₫", " vnd ", "()", "( đ )"]) expect(docSo(v)).toBeNull();
  });

  it.each([
    ["0,125", 0.125],
    ["0.125", 0.125],
    ["-0,125", -0.125],
    [",125", 0.125],
    ["(0,125)", -0.125],
    ["10,125", 10125],
    ["10.125", 10125],
  ])("nhóm nghìn không đứng sau số 0 đầu: %j -> %d", (s, n) => {
    expect(docSo(s)).toBe(n);
  });
});

describe("docCoKhong", () => {
  it.each(["Có", " CÓ ", "x", "Yes", "true", true, 1, "Được giảm", "Có giảm"])("%j là true", (v) => {
    expect(docCoKhong(v)).toEqual({ gt: true, la: false });
  });

  it.each(["Không", "no", false, 0, "-", "Không giảm"])("%j là false", (v) => {
    expect(docCoKhong(v)).toEqual({ gt: false, la: false });
  });

  it.each([null, undefined, "", "Chưa xác định", "chưa rõ", "N/A"])("%j là chưa biết, không cảnh báo", (v) => {
    expect(docCoKhong(v)).toEqual({ gt: null, la: false });
  });

  it.each(["Có thể", "lung tung", 2])("%j đọc không nổi: null và cảnh báo, không đoán false", (v) => {
    expect(docCoKhong(v)).toEqual({ gt: null, la: true });
  });
});

describe("docExcel — hàng hoá", () => {
  const HEADER = [
    "STT",
    "Mã hàng",
    "Tên hàng",
    "Giảm 2% thuế suất thuế GTGT",
    "Nhóm VTHH",
    "Đơn vị tính chính",
    "Số lượng tồn",
    "Giá trị tồn",
  ];

  it("đọc bản xuất MISA đủ cột, suy giá vốn từ giá trị tồn / số lượng", async () => {
    const kq = await docExcel(
      await xlsx(
        [["DANH SÁCH HÀNG HOÁ"], [], HEADER, [1, "SP01", "Sữa tươi", "Có", "Đồ uống", "Hộp", 10, 155000]],
        "Hàng hoá",
      ),
    );

    expect(kq).toMatchObject({ loai: "hang_hoa", tenSheet: "Hàng hoá", dongTieuDe: 3, canhBao: [] });
    expect(kq.dong).toEqual([
      {
        dongExcel: 4,
        code: "SP01",
        name: "Sữa tươi",
        unit: "Hộp",
        category: "Đồ uống",
        stock: 10,
        giaTriTon: 155000,
        cost: 15500,
        isReducedVat: true,
        loi: [],
        canhBao: [],
      },
    ]);
  });

  it("giá vốn làm tròn; tồn 0, tồn âm hay thiếu giá trị thì giá vốn là null (chưa biết)", async () => {
    const kq = await docExcel(
      await misa(
        ["Mã hàng", "Tên hàng", "Đơn vị tính chính", "Số lượng tồn", "Giá trị tồn"],
        ["SP01", "A", "Cái", 3, 2000],
        ["SP02", "B", "Cái", 0, 0],
        ["SP03", "C", "Cái", -2, -5000],
        ["SP04", "D", "Cái", 4, null],
        ["SP05", "E", "Cái", "1.234,5", "2.469.000"],
      ),
    );

    expect(kq.dong.map((d) => [d.code, d.stock, d.giaTriTon, d.cost])).toEqual([
      ["SP01", 3, 2000, 667],
      ["SP02", 0, 0, null],
      ["SP03", -2, -5000, null],
      ["SP04", 4, undefined, null],
      ["SP05", 1234.5, 2469000, 2000],
    ]);
  });

  it("giá trị tồn âm với tồn dương: giá vốn là null kèm cảnh báo, không ra giá vốn âm", async () => {
    const kq = await docExcel(
      await misa(
        ["Mã hàng", "Tên hàng", "Số lượng tồn", "Giá trị tồn"],
        ["SP01", "A", 5, -1000],
        ["SP02", "B", 5, 1000],
      ),
    );

    expect(kq.dong.map((d) => [d.code, d.cost, d.canhBao])).toEqual([
      ["SP01", null, ["giá trị tồn âm — không suy ra được giá vốn, để trống"]],
      ["SP02", 200, []],
    ]);
  });

  it("tồn âm vẫn nhập được nhưng gắn cảnh báo; tồn 0 thì không", async () => {
    const kq = await docExcel(
      await misa(["Mã hàng", "Tên hàng", "Số lượng tồn"], ["SP01", "A", -2], ["SP02", "B", 5], ["SP03", "C", 0]),
    );

    expect(kq.dong.map((d) => [d.loi, d.canhBao])).toEqual([
      [[], ["số lượng tồn âm"]],
      [[], []],
      [[], []],
    ]);
  });

  it("thiếu đơn vị tính thì mặc định 'Cái'; nhóm trống là undefined", async () => {
    const kq = await docExcel(await misa(HEADER, [1, "SP01", "A", null, null, null, 1, 1]));

    expect(kq.dong[0].unit).toBe("Cái");
    expect(kq.dong[0].category).toBeUndefined();
  });

  it("cờ giảm 2% VAT: 'Chưa xác định' và ô trống là null im lặng, chữ lạ là null kèm cảnh báo", async () => {
    const kq = await docExcel(
      await misa(
        ["Mã hàng", "Tên hàng", "Giảm 2% thuế suất thuế GTGT"],
        ["SP01", "A", "Chưa xác định"],
        ["SP02", "B", null],
        ["SP03", "C", "lung tung"],
        ["SP04", "D", true],
        ["SP05", "E", "Không"],
      ),
    );

    expect(kq.dong.map((d) => [d.code, d.isReducedVat, d.canhBao])).toEqual([
      ["SP01", null, []],
      ["SP02", null, []],
      ["SP03", null, ["không đọc được cờ giảm 2% VAT — để trống"]],
      ["SP04", true, []],
      ["SP05", false, []],
    ]);
  });

  it("ô rich text và ô công thức đọc ra giá trị, không phải '[object Object]'", async () => {
    const kq = await docExcel(
      await misa(
        ["Mã hàng", "Tên hàng", "Số lượng tồn", "Giá trị tồn"],
        [
          { richText: [{ text: "SP" }, { text: "01" }] },
          { text: "Sữa", hyperlink: "https://x.vn" },
          { formula: "2+3", result: 5 },
          { formula: "100*5", result: 500 },
        ],
      ),
    );

    expect(kq.dong[0]).toMatchObject({ code: "SP01", name: "Sữa", stock: 5, giaTriTon: 500, cost: 100 });
  });

  it("ô công thức lỗi (#DIV/0!) ở cột giá trị tồn là chưa biết, không phải 0", async () => {
    const kq = await docExcel(
      await misa(
        ["Mã hàng", "Tên hàng", "Số lượng tồn", "Giá trị tồn"],
        ["SP01", "A", 5, { formula: "1/0", result: { error: "#DIV/0!" } }],
      ),
    );

    const d = kq.dong[0];
    expect([d.stock, d.giaTriTon, d.cost]).toEqual([5, undefined, null]);
  });

  it("ô công thức lỗi (#N/A) ở cột chữ là trống — dòng không mã bị báo 'thiếu mã', không ra '[object Object]'", async () => {
    const loiNA = { formula: "VLOOKUP(A1,B:B,1,0)", result: { error: "#N/A" } } as O;
    const kq = await docExcel(
      await misa(["Mã hàng", "Tên hàng", "Số lượng tồn"], [loiNA, "Sữa", 5], ["SP02", loiNA, 1]),
    );

    expect(kq.dong.map((d) => [d.code, d.name, d.loi])).toEqual([
      ["", "Sữa", ["thiếu mã"]],
      ["SP02", "", ["thiếu tên"]],
    ]);
  });

  it("nhận ArrayBuffer (kiểu route gửi vào), không chỉ Buffer", async () => {
    const buf = new Uint8Array(await misa(["Mã hàng", "Tên hàng", "Số lượng tồn"], ["SP01", "A", 5])).buffer;
    const kq = await docExcel(buf);

    expect(kq.dong.map((d) => [d.code, d.stock])).toEqual([["SP01", 5]]);
  });

  it.each(["Giảm 2% thuế suất thuế GTGT", "Đơn vị tính chính", "Số lượng tồn"])(
    "cột %j đủ để nhận ra danh mục hàng hoá",
    async (cot) => {
      const kq = await docExcel(await misa(["Mã hàng", "Tên hàng", cot], ["SP01", "A", null]));
      expect(kq.loai).toBe("hang_hoa");
    },
  );

  it("thiếu hẳn cột (đơn vị/tồn/giá trị/giảm 2%) thì trường là undefined (= giữ nguyên), không phải 0/null", async () => {
    const kq = await docExcel(
      await misa(["Mã hàng", "Tên hàng", "Nhóm VTHH", "Đơn vị tính chính"], ["SP01", "A", null, "Lít"]),
    );

    expect(kq.loai).toBe("hang_hoa");
    const d = kq.dong[0];
    expect([d.unit, d.stock, d.giaTriTon, d.cost, d.isReducedVat]).toEqual([
      "Lít",
      undefined,
      undefined,
      undefined,
      undefined,
    ]);

    // Có cột tồn nhưng thiếu cột giá trị: tồn đọc được, giá vốn giữ nguyên.
    const kq2 = await docExcel(
      await misa(["Mã hàng", "Tên hàng", "Số lượng tồn"], ["SP01", "A", 5], ["SP02", "B", null]),
    );
    expect(kq2.dong.map((x) => [x.unit, x.stock, x.cost])).toEqual([
      [undefined, 5, undefined],
      [undefined, 0, undefined],
    ]);
  });
});

describe("docExcel — khách hàng và nhà cung cấp", () => {
  it("đọc danh sách khách hàng; ô trống là undefined, công nợ trống là null", async () => {
    const kq = await docExcel(
      await misa(
        ["STT", "Mã khách hàng", "Tên khách hàng", "Địa chỉ", "Mã số thuế", "Điện thoại", "Công nợ"],
        [1, "KH01", "Cửa hàng An Phát", "12 Láng Hạ", "0101234567", "0901234567", "(1.500.000)"],
        [2, "KH02", "Bách Hoá Xanh", null, null, null, null],
      ),
    );

    expect(kq.loai).toBe("khach_hang");
    expect(kq.dong).toEqual([
      {
        dongExcel: 4,
        code: "KH01",
        name: "Cửa hàng An Phát",
        address: "12 Láng Hạ",
        taxCode: "0101234567",
        phone: "0901234567",
        openingDebt: -1500000,
        loi: [],
        canhBao: [],
      },
      { dongExcel: 5, code: "KH02", name: "Bách Hoá Xanh", openingDebt: null, loi: [], canhBao: [] },
    ]);
  });

  it("đọc danh sách nhà cung cấp với nhãn viết tắt MST, ĐT", async () => {
    const kq = await docExcel(
      await misa(
        ["Mã nhà cung cấp", "Tên nhà cung cấp", "MST", "ĐT", "Công nợ"],
        ["NCC01", "Công ty Sữa", "0300588569", "02854155555", 25000000],
      ),
    );

    expect(kq.loai).toBe("nha_cung_cap");
    expect(kq.dong[0]).toMatchObject({
      code: "NCC01",
      name: "Công ty Sữa",
      taxCode: "0300588569",
      phone: "02854155555",
      openingDebt: 25000000,
      loi: [],
      canhBao: [],
    });
  });

  it("cột 'Mã số thuế' đứng trước không bị nhận nhầm thành cột mã", async () => {
    const kq = await docExcel(
      await misa(["Mã số thuế", "Mã khách hàng", "Tên khách hàng"], ["0101234567", "KH01", "An Phát"]),
    );

    expect(kq.dong[0]).toMatchObject({ code: "KH01", taxCode: "0101234567" });
  });

  it("nhãn cột không phân biệt dấu, hoa thường và khoảng trắng thừa", async () => {
    const kq = await docExcel(
      await misa(["  MA   KHACH HANG ", "tên khách HÀNG", "ĐỊA CHỈ"], ["KH01", "An Phát", "Hà Nội"]),
    );

    expect(kq.loai).toBe("khach_hang");
    expect(kq.dong[0]).toMatchObject({ code: "KH01", name: "An Phát", address: "Hà Nội" });
  });
});

describe("docExcel — dòng tiêu đề", () => {
  it("STT không tính vào ba cột cần có của dòng tiêu đề", async () => {
    const kq = await docExcel(
      await xlsx([
        ["STT", "Mã", "Tên"],
        ["STT", "Mã khách hàng", "Tên khách hàng", "Địa chỉ"],
        [1, "KH01", "An Phát"],
      ]),
    );

    expect(kq.dongTieuDe).toBe(2);
    expect(kq.dong.map((d) => [d.dongExcel, d.code])).toEqual([[3, "KH01"]]);
  });

  it("tìm tiêu đề trong 15 dòng đầu, không xa hơn", async () => {
    const dem = (n: number) => Array.from({ length: n }, (_, i): O[] => [`ghi chú ${i}`]);
    const header: O[] = ["Mã khách hàng", "Tên khách hàng", "Địa chỉ"];

    const kq = await docExcel(await xlsx([...dem(14), header, ["KH01", "An"]]));
    expect(kq.dongTieuDe).toBe(15);

    await expect(docExcel(await xlsx([...dem(15), header, ["KH01", "An"]]))).rejects.toThrow(
      "Không tìm thấy dòng tiêu đề",
    );
  });

  it("có tiêu đề nhưng không rõ loại danh sách thì báo lỗi", async () => {
    await expect(docExcel(await misa(["Mã", "Tên", "Địa chỉ"], ["X", "Y", "Z"]))).rejects.toThrow(
      "không nhận ra đây là danh sách gì",
    );
  });

  it("thiếu cột mã hoặc cột tên: cảnh báo ở cấp file và mọi dòng bị lỗi", async () => {
    const khongMa = await docExcel(
      await misa(["Tên khách hàng", "Địa chỉ", "Điện thoại"], ["An Phát", "Hà Nội", "09"]),
    );
    expect(khongMa.canhBao).toEqual(["Không thấy cột mã — mọi dòng sẽ bị bỏ."]);
    expect(khongMa.dong.map((d) => d.loi)).toEqual([["thiếu mã"]]);

    const khongTen = await docExcel(await misa(["Mã khách hàng", "Địa chỉ", "Điện thoại"], ["KH01", "Hà Nội", "09"]));
    expect(khongTen.canhBao).toEqual(["Không thấy cột tên — mọi dòng sẽ bị bỏ."]);
    expect(khongTen.dong.map((d) => d.loi)).toEqual([["thiếu tên"]]);
  });

  it("workbook không có sheet nào thì báo lỗi", async () => {
    const buf = await new ExcelJS.Workbook().xlsx.writeBuffer();
    await expect(docExcel(buf)).rejects.toThrow("File không có sheet nào.");
  });
});

describe("docExcel — phân loại dòng", () => {
  it("dòng trống bị bỏ im lặng, dòng tổng cộng là boQua, thiếu mã/tên là lỗi; dongExcel đúng số dòng thật", async () => {
    const kq = await docExcel(
      await misa(
        ["Mã khách hàng", "Tên khách hàng", "Địa chỉ", "Công nợ"],
        ["KH01", "An Phát", null, null], // 4
        [], // 5: trống
        ["  ", " ", null, null], // 6: chỉ khoảng trắng
        [null, "TỔNG CỘNG", null, 5000000], // 7
        [null, null, null, 100], // 8: không mã, không tên, có số
        [null, "Khách lẻ", null, null], // 9
        ["KH10", null, "Hà Nội", null], // 10
        ["KH11", "Tổng đại lý Hà Nội", null, null], // 11: có mã thì không phải dòng tổng
      ),
    );

    expect(kq.dong.map((d) => [d.dongExcel, d.code, d.boQua, d.loi])).toEqual([
      [4, "KH01", undefined, []],
      [7, "", "dòng tổng cộng / không có mã", []],
      [8, "", "dòng tổng cộng / không có mã", []],
      [9, "", undefined, ["thiếu mã"]],
      [10, "KH10", undefined, ["thiếu tên"]],
      [11, "KH11", undefined, []],
    ]);
  });

  it("khách/NCC tên 'Tổng công ty …' mà thiếu mã là lỗi 'thiếu mã', chỉ nhãn dòng tổng mới bị bỏ qua", async () => {
    const kq = await docExcel(
      await misa(
        ["Mã khách hàng", "Tên khách hàng", "Công nợ"],
        [null, "Tổng công ty Xăng dầu Việt Nam", 100], // 4
        [null, "Tổng đại lý Hà Nội", null], // 5
        [null, "Tổng", 100], // 6
        [null, "Tổng cộng:", 100], // 7
        [null, "Cộng", 100], // 8
        [null, "Tổng số (VND)", 100], // 9
      ),
    );

    expect(kq.dong.map((d) => [d.dongExcel, d.boQua, d.loi])).toEqual([
      [4, undefined, ["thiếu mã"]],
      [5, undefined, ["thiếu mã"]],
      [6, "dòng tổng cộng / không có mã", []],
      [7, "dòng tổng cộng / không có mã", []],
      [8, "dòng tổng cộng / không có mã", []],
      [9, "dòng tổng cộng / không có mã", []],
    ]);
  });

  it("thiếu hẳn cột công nợ thì openingDebt là undefined (giữ nguyên), có cột mà ô trống thì null", async () => {
    const thieu = await docExcel(await misa(["Mã khách hàng", "Tên khách hàng", "Địa chỉ"], ["KH01", "A", null]));
    expect(thieu.dong[0].openingDebt).toBeUndefined();

    const trong = await docExcel(await misa(["Mã khách hàng", "Tên khách hàng", "Công nợ"], ["KH01", "A", null]));
    expect(trong.dong[0].openingDebt).toBeNull();
  });

  it("mã trùng trong cùng file (không phân biệt hoa thường) là lỗi ở mọi dòng trùng", async () => {
    const kq = await docExcel(
      await misa(
        ["Mã hàng", "Tên hàng", "Số lượng tồn"],
        ["SP01", "A", 1],
        [" sp01 ", null, 2],
        ["SP02", "C", 3],
        [null, "Tổng cộng", 6],
        [null, "Tổng cộng", 6],
      ),
    );

    const trung = "mã trùng với dòng khác trong cùng file";
    expect(kq.dong.map((d) => [d.code, d.loi])).toEqual([
      ["SP01", [trung]],
      ["sp01", ["thiếu tên", trung]],
      ["SP02", []],
      ["", []],
      ["", []],
    ]);
  });
});
