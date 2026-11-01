// Đọc ba bản xuất danh mục của MISA thành dòng đã kiểm — KHÔNG ghi gì vào DB.
//
// PHẠM VI CÓ CHỦ ĐÍCH. File này chỉ đọc ba bảng PHẲNG: danh mục hàng hoá, danh
// sách khách hàng, danh sách nhà cung cấp. Cả ba cùng một khuôn: tiêu đề ở dòng
// 0, dòng 1 trống, HEADER Ở DÒNG 2, rồi dữ liệu. Đọc chúng ở đây nghĩa là nhập
// danh mục vẫn chạy khi Brain tắt — mà Brain thì đang sống trên Colab.
//
// `Tổng hợp tồn kho` KHÔNG đọc ở đây, và đó là quyết định chứ không phải thiếu
// sót: bảng đó có HEADER HAI TẦNG (dòng 7 mang nhóm "Đầu kỳ/Nhập/Xuất/Cuối kỳ",
// dòng 8 mang cột con "Số lượng/Giá trị/Đơn giá BQ"), lại còn hai cách bố trí
// khác nhau tuỳ bản xuất. `src/core/inventory_import.py` bên Brain đã giải đúng
// bài đó và có 34 test. Chép lại bằng TypeScript là dựng bản sao thứ hai của
// logic khó nhất rồi để hai bản trôi xa nhau — đúng thứ R4 cấm.
//
// KHÔNG ghi DB ở đây. Đọc và ghi tách hẳn vì luồng nhập là HAI BƯỚC: đọc ->
// người xem trước -> người xác nhận -> mới ghi. Một hàm vừa đọc vừa ghi thì
// không chèn được người vào giữa.

import ExcelJS from "exceljs";

export type LoaiFile = "hang_hoa" | "khach_hang" | "nha_cung_cap";

/** Một dòng đã đọc. `loi` rỗng nghĩa là dòng này nhập được. */
export type DongDoc = {
  /** Số dòng THẬT trong file, 1-based — để người mở Excel tìm đúng chỗ. */
  dongExcel: number;
  code: string;
  name: string;
  // hàng hoá
  unit?: string;
  category?: string;
  stock?: number;
  /** Giá trị tồn (tổng), KHÔNG phải đơn giá. Đơn giá suy ra ở `cost`. */
  giaTriTon?: number;
  cost?: number | null;
  isReducedVat?: boolean | null;
  // đối tác
  address?: string;
  taxCode?: string;
  phone?: string;
  openingDebt?: number | null;
  /** Lỗi CHẶN — dòng này không nhập được. */
  loi: string[];
  /** Bất thường nhưng vẫn nhập được. Hiện ở màn hình xem trước để người quyết. */
  canhBao: string[];
  /**
   * Dòng bỏ qua có chủ đích (trống, hoặc dòng "Tổng cộng" ở cuối bản xuất).
   * Tách khỏi `loi` vì gộp chung là bắt người đọc một danh sách lỗi mà phần lớn
   * không phải lỗi — rồi họ thôi đọc, và bỏ sót lỗi thật nằm lẫn trong đó.
   */
  boQua?: string;
};

export type KetQuaDoc = {
  loai: LoaiFile;
  tenSheet: string;
  dongTieuDe: number;
  dong: DongDoc[];
  canhBao: string[];
};

// --------------------------------------------------------------------------
// Chuẩn hoá + đọc số
// --------------------------------------------------------------------------

/** Bỏ dấu, hạ chữ thường, gộp khoảng trắng — để so nhãn cột không phụ thuộc dấu. */
function chuan(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function chuoi(v: unknown): string {
  if (v === null || v === undefined) return "";
  // ExcelJS trả ô công thức thành {formula, result} và ô rich-text thành
  // {richText:[...]}. Lấy thẳng String() ra sẽ được "[object Object]" — một
  // chuỗi trông như dữ liệu, lọt qua mọi phép kiểm rỗng.
  if (typeof v === "object") {
    const o = v as { result?: unknown; richText?: Array<{ text?: string }>; text?: string };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text ?? "").join("").trim();
    if (o.text !== undefined) return String(o.text).trim();
    if (o.result !== undefined) return String(o.result).trim();
    return "";
  }
  return String(v).trim();
}

/**
 * Số kiểu Việt: "1.234.567,89" -> 1234567.89.
 *
 * Bản xuất MISA thường để số THẬT trong ô nên nhánh `typeof number` đủ dùng.
 * Nhánh chuỗi là cho file đã qua tay người: chép sang Google Sheets rồi tải về,
 * hay một cột bị đặt định dạng Text. Khi đó "1.234" là MỘT NGHÌN HAI TRĂM BA
 * MƯƠI TƯ, không phải 1.234 — đọc nhầm chỗ này là sai số liệu tồn kho.
 */
export function docSo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = chuoi(v).replace(/\s/g, "");
  if (!s) return null;
  const am = /^\(.*\)$/.test(s);           // kế toán ghi số âm bằng ngoặc
  if (am) s = s.slice(1, -1);
  s = s.replace(/[₫đvnd]/gi, "");
  const cham = s.lastIndexOf(".");
  const phay = s.lastIndexOf(",");
  if (cham >= 0 && phay >= 0) {
    // Cái nào đứng SAU là dấu thập phân.
    s = phay > cham ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (phay >= 0) {
    // Chỉ có phẩy: là thập phân khi đứng cách đuôi != 3 chữ số, ngược lại là
    // phân cách nghìn. "1,5" -> 1.5 ; "1,234" -> 1234.
    s = s.length - phay - 1 === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (cham >= 0) {
    s = s.length - cham - 1 === 3 ? s.replace(/\./g, "") : s;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return am ? -n : n;
}

const CO = new Set(["co", "x", "yes", "true", "1", "duoc giam", "giam", "co giam"]);
const KHONG = new Set(["khong", "no", "false", "0", "-", "khong giam"]);
// MISA tự ghi "Chưa xác định" khi kế toán chưa phân loại mặt hàng. Đó là một
// câu trả lời RÕ RÀNG rằng chưa biết — khác hẳn một ô có chữ lạ mà ta đọc
// không nổi. Cả hai cùng ra `null`, nhưng chỉ cái sau mới đáng cảnh báo.
//
// Đo trên bản xuất thật 23/08/2026: 161/161 mặt hàng đều "Chưa xác định".
// Nghĩa là cột này HIỆN CHƯA MANG THÔNG TIN NÀO. Vẫn nhập, vì khi kế toán
// phân loại xong thì bản xuất sau có ngay — nhưng đừng trông đợi
// `vat-catalog-audit` kết luận được gì từ nó hôm nay.
const CHUA_BIET = new Set(["chua xac dinh", "chua ro", "n/a", "na"]);

/**
 * Cột `Giảm 2% thuế suất thuế GTGT` -> true / false / null.
 *
 * `null` = CHƯA ĐỌC ĐƯỢC, và nó phải khác `false`. Cờ này đi thẳng vào tool
 * `vat-catalog-audit` (Nghị định 174/2025); đoán bừa `false` cho một ô lạ là
 * biến "không biết" thành một khẳng định về thuế suất.
 */
export function docCoKhong(v: unknown): { gt: boolean | null; la: boolean } {
  const s = chuan(v);
  if (!s || CHUA_BIET.has(s)) return { gt: null, la: false };
  if (CO.has(s)) return { gt: true, la: false };
  if (KHONG.has(s)) return { gt: false, la: false };
  return { gt: null, la: true };      // đọc không nổi -> đáng cảnh báo
}

// --------------------------------------------------------------------------
// Nhận dạng cột
// --------------------------------------------------------------------------

/** Nhãn cột -> tên trường. Mỗi trường nhận nhiều cách viết đã gặp. */
const NHAN: Array<[keyof DongDoc | "stt", string[]]> = [
  ["stt", ["stt", "so tt"]],
  ["code", ["ma", "ma khach hang", "ma nha cung cap", "ma hang", "ma vthh", "ma so"]],
  ["name", ["ten", "ten khach hang", "ten nha cung cap", "ten hang", "ten vthh"]],
  ["isReducedVat", ["giam 2% thue suat thue gtgt", "giam 2%", "giam thue gtgt"]],
  ["category", ["nhom vthh", "nhom vat tu hang hoa", "nhom hang", "loai"]],
  ["unit", ["don vi tinh chinh", "don vi tinh", "dvt"]],
  ["stock", ["so luong ton", "so luong", "ton kho"]],
  ["giaTriTon", ["gia tri ton", "gia tri"]],
  ["address", ["dia chi"]],
  ["openingDebt", ["cong no"]],
  ["taxCode", ["ma so thue", "mst"]],
  ["phone", ["dien thoai", "so dien thoai", "dt"]],
];

function mapCot(hang: unknown[]): Record<string, number> {
  const m: Record<string, number> = {};
  hang.forEach((o, i) => {
    const s = chuan(o);
    if (!s) return;
    for (const [truong, bienThe] of NHAN) {
      // Khớp CHÍNH XÁC, không phải chuỗi con. "Mã" là chuỗi con của "Mã số
      // thuế"; dò kiểu chuỗi-con thì cột MST bị nhận thành cột mã, và mọi
      // khách hàng mang mã là dãy số thuế.
      if (bienThe.includes(s) && m[truong] === undefined) {
        m[truong] = i;
        return;
      }
    }
  });
  return m;
}

/** Dòng tiêu đề = dòng đầu tiên trong 15 dòng đầu map được >= 3 trường. */
function timTieuDe(rows: unknown[][]): { i: number; cot: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cot = mapCot(rows[i]);
    if (Object.keys(cot).filter((k) => k !== "stt").length >= 3) return { i, cot };
  }
  return null;
}

function doanLoai(hang: unknown[]): LoaiFile | null {
  const nhan = hang.map(chuan);
  if (nhan.includes("ma khach hang") || nhan.includes("ten khach hang")) return "khach_hang";
  if (nhan.includes("ma nha cung cap") || nhan.includes("ten nha cung cap")) return "nha_cung_cap";
  if (nhan.some((n) => n.startsWith("giam 2%")) || nhan.includes("don vi tinh chinh")
      || nhan.includes("so luong ton")) return "hang_hoa";
  return null;
}

// --------------------------------------------------------------------------
// Đọc
// --------------------------------------------------------------------------

export async function docExcel(buf: ArrayBuffer | Buffer): Promise<KetQuaDoc> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("File không có sheet nào.");

  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const v = row.values as unknown[];
    // ExcelJS trả mảng 1-based (phần tử [0] luôn trống). Bỏ đi để chỉ số cột
    // khớp với những gì người thấy khi đếm từ trái sang.
    rows.push(Array.isArray(v) ? v.slice(1) : []);
  });

  const td = timTieuDe(rows);
  if (!td) {
    throw new Error(
      "Không tìm thấy dòng tiêu đề. File phải là bản xuất MISA của Danh sách " +
      "hàng hoá/khách hàng/nhà cung cấp, giữ nguyên các cột gốc.",
    );
  }
  const loai = doanLoai(rows[td.i]);
  if (!loai) {
    throw new Error(
      "Đọc được tiêu đề nhưng không nhận ra đây là danh sách gì. Cần có một " +
      "trong: 'Mã khách hàng', 'Mã nhà cung cấp', hoặc 'Đơn vị tính chính'.",
    );
  }

  const cot = td.cot;
  const canhBao: string[] = [];
  if (cot.code === undefined) canhBao.push("Không thấy cột mã — mọi dòng sẽ bị bỏ.");
  if (cot.name === undefined) canhBao.push("Không thấy cột tên — mọi dòng sẽ bị bỏ.");

  const o = (r: unknown[], t: string) => (cot[t] === undefined ? undefined : r[cot[t]]);
  const dong: DongDoc[] = [];

  for (let i = td.i + 1; i < rows.length; i++) {
    const r = rows[i];
    const code = chuoi(o(r, "code"));
    const name = chuoi(o(r, "name"));
    // Dòng trống hoàn toàn: bỏ im lặng. Bản xuất MISA có dòng tổng cộng và
    // dòng đệm ở cuối; báo lỗi cho chúng là bắt người đọc một danh sách lỗi
    // toàn thứ không phải lỗi, rồi họ thôi đọc.
    if (!code && !name && r.every((c) => !chuoi(c))) continue;

    const d: DongDoc = { dongExcel: i + 1, code, name, loi: [], canhBao: [] };

    // Dòng "Tổng cộng" ở cuối bản xuất MISA: không mã, không tên, nhưng CÓ số.
    // Bản đầu tính nó là "thiếu mã" và đẩy vào danh sách lỗi — một lỗi giả,
    // xuất hiện ở CẢ BA file (đo 23/08/2026), tức mỗi lần nhập người dùng đều
    // thấy ít nhất một lỗi không phải lỗi.
    const laTong = !code && (!name || chuan(name).startsWith("tong"));
    if (laTong) {
      d.boQua = "dòng tổng cộng / không có mã";
      dong.push(d);
      continue;
    }
    if (!code) d.loi.push("thiếu mã");
    if (!name) d.loi.push("thiếu tên");

    if (loai === "hang_hoa") {
      d.unit = chuoi(o(r, "unit")) || "Cái";
      d.category = chuoi(o(r, "category")) || undefined;
      const sl = docSo(o(r, "stock"));
      const gt = docSo(o(r, "giaTriTon"));
      d.stock = sl ?? 0;
      d.giaTriTon = gt ?? undefined;
      // Tồn âm là LỖI SỔ SÁCH có thật (xuất quá tồn, nhập sau ghi trước) — bản
      // xuất thật có 2/161 dòng như vậy. Nhưng chặn nhập thì hai mặt hàng đó
      // vĩnh viễn không vào hệ thống, mà chúng lại chính là hai mặt hàng cần
      // được nhìn thấy nhất. Nhập vào, gắn cờ, để bộ soi kho xử lý sau.
      if (sl !== null && sl < 0) d.canhBao.push("số lượng tồn âm");
      // Giá vốn đơn vị = giá trị tồn / số lượng tồn. Tồn 0 thì KHÔNG suy ra
      // được gì — để `null` (CHƯA BIẾT), không phải 0. Đặt 0 ở đây là khai
      // rằng mặt hàng không tốn đồng nào, và báo cáo lãi lỗ sẽ coi nó lãi 100%.
      d.cost = sl && sl > 0 && gt !== null ? Math.round(gt / sl) : null;
      const cvat = docCoKhong(o(r, "isReducedVat"));
      d.isReducedVat = cvat.gt;
      if (cvat.la) d.canhBao.push("không đọc được cờ giảm 2% VAT — để trống");
    } else {
      d.address = chuoi(o(r, "address")) || undefined;
      d.taxCode = chuoi(o(r, "taxCode")) || undefined;
      d.phone = chuoi(o(r, "phone")) || undefined;
      d.openingDebt = docSo(o(r, "openingDebt"));
    }
    dong.push(d);
  }

  // Trùng mã NGAY TRONG FILE — phải bắt ở đây, không đợi tới lúc ghi DB. Hai
  // dòng cùng mã mà cứ thế upsert thì dòng sau ghi đè dòng trước, kết quả phụ
  // thuộc thứ tự và không ai thấy gì.
  const dem = new Map<string, number>();
  for (const d of dong) {
    if (!d.code || d.boQua) continue;
    const k = d.code.toLowerCase();
    dem.set(k, (dem.get(k) ?? 0) + 1);
  }
  for (const d of dong) {
    if (d.code && (dem.get(d.code.toLowerCase()) ?? 0) > 1) {
      d.loi.push("mã trùng với dòng khác trong cùng file");
    }
  }

  return { loai, tenSheet: ws.name, dongTieuDe: td.i + 1, dong, canhBao };
}
