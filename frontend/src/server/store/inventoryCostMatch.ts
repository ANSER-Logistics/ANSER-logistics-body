// Phép khớp giá vốn từ file với danh mục hàng — THUẦN, không đụng DB.
//
// Tách khỏi `inventoryCostImport.ts` vì đây là chỗ dễ sai nhất và sai thì im
// lặng: gán giá vốn vào nhầm mặt hàng không làm gãy gì cả, chỉ tạo ra một con
// số trông hoàn toàn bình thường rồi chảy vào mọi báo cáo lãi lỗ về sau. Không
// kéo theo DB client thì kiểm được bằng dữ liệu dựng tay.

/** Một dòng giá vốn Brain suy ra từ file (khối `unit_costs`). */
export type UnitCostRow = {
  code: string;
  name: string;
  unit: string;
  unit_cost: number;
  /** "xuất" | "tồn cuối" | "tồn đầu" — ba mức KHÔNG đáng tin như nhau. */
  source: string;
};

/** Bề mặt tối thiểu của một mặt hàng mà phép khớp cần. */
export type MatchableProduct = {
  id: string;
  code: string;
  name: string;
  cost: number | null;
};

export type CostMatch = {
  productId: string;
  code: string;
  name: string;
  currentCost: number | null;
  newCost: number;
  source: string;
  /** Khớp bằng mã hàng, hay bằng tên hàng (kém chắc hơn). */
  matchedBy: "code" | "name";
  /** Đang có giá vốn rồi — sẽ bị bỏ qua nếu không bật `overwrite`. */
  wouldOverwrite: boolean;
};

export type CostImportPreview = {
  matches: CostMatch[];
  /** Có trong file nhưng không tìm thấy mặt hàng nào trong ANSER. */
  unmatchedFromFile: Array<{ code: string; name: string; unit_cost: number }>;
  /** Có trong ANSER, chưa có giá vốn, và cũng không có trong file. */
  stillMissing: Array<{ code: string; name: string }>;
  counts: {
    fileRows: number;
    matched: number;
    wouldFill: number;
    wouldOverwrite: number;
    unmatched: number;
    stillMissing: number;
  };
};

const norm = (s: string) => (s ?? "").trim().toLowerCase();

/**
 * Đối chiếu bảng giá vốn từ file với danh mục hàng.
 *
 * Khớp theo MÃ trước, chỉ lùi về TÊN khi mã không tìm thấy — và tên trùng nhau
 * thì bỏ hẳn chứ không chọn bừa. Không có khớp mờ ở đây: gán nhầm giá vốn giữa
 * hai mặt hàng gần tên nhau còn tệ hơn để trống.
 */
export function matchCosts(rows: UnitCostRow[], all: MatchableProduct[]): CostImportPreview {
  const byCode = new Map(all.map((p) => [norm(p.code), p]));

  // Tên trùng giữa nhiều mặt hàng thì BỎ HẲN khỏi bảng tra.
  const nameCounts = new Map<string, number>();
  for (const p of all) nameCounts.set(norm(p.name), (nameCounts.get(norm(p.name)) ?? 0) + 1);
  const byName = new Map(all.filter((p) => nameCounts.get(norm(p.name)) === 1).map((p) => [norm(p.name), p]));

  // Hai lượt, để kết quả không phụ thuộc thứ tự dòng trong file: mọi dòng khớp MÃ
  // chiếm mặt hàng trước, rồi các dòng còn lại mới được khớp TÊN vào mặt hàng còn trống.
  // Trong cùng một mức, dòng đứng trước thắng.
  const claimed = new Map<string, number>(); // productId -> chỉ số dòng đã chiếm
  const matchedBy = new Map<number, { product: MatchableProduct; by: "code" | "name" }>();
  const hitByCode = new Set<number>(); // dòng có mã trúng mặt hàng, dù có chiếm được hay không

  rows.forEach((row, i) => {
    const code = norm(row.code);
    const product = code ? byCode.get(code) : undefined;
    if (!product) return;
    hitByCode.add(i);
    if (claimed.has(product.id)) return;
    claimed.set(product.id, i);
    matchedBy.set(i, { product, by: "code" });
  });

  rows.forEach((row, i) => {
    if (hitByCode.has(i)) return;
    const name = norm(row.name);
    const product = name ? byName.get(name) : undefined;
    if (!product || claimed.has(product.id)) return;
    claimed.set(product.id, i);
    matchedBy.set(i, { product, by: "name" });
  });

  const matches: CostMatch[] = [];
  const unmatchedFromFile: CostImportPreview["unmatchedFromFile"] = [];

  rows.forEach((row, i) => {
    const hit = matchedBy.get(i);
    if (!hit) {
      unmatchedFromFile.push({ code: row.code, name: row.name, unit_cost: row.unit_cost });
      return;
    }
    const { product, by } = hit;
    matches.push({
      productId: product.id,
      code: product.code,
      name: product.name,
      currentCost: product.cost ?? null,
      newCost: row.unit_cost,
      source: row.source,
      matchedBy: by,
      wouldOverwrite: product.cost !== null && product.cost !== undefined,
    });
  });

  const stillMissing = all
    .filter((p) => (p.cost === null || p.cost === undefined) && !claimed.has(p.id))
    .map((p) => ({ code: p.code, name: p.name }));

  return {
    matches,
    unmatchedFromFile,
    stillMissing,
    counts: {
      fileRows: rows.length,
      matched: matches.length,
      wouldFill: matches.filter((m) => !m.wouldOverwrite).length,
      wouldOverwrite: matches.filter((m) => m.wouldOverwrite).length,
      unmatched: unmatchedFromFile.length,
      stillMissing: stillMissing.length,
    },
  };
}
