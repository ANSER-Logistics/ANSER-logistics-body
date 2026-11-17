// Client gọi ANSER Brain (service AI Python, repo AI_ANSER).
//
// KHÁC HẲN `n8n.ts` — ở đó lỗi chỉ log rồi bỏ qua, vì n8n chết không được làm
// hỏng việc tạo khách hàng. Brain thì ngược lại: nó trả về CON SỐ và CÂU TRẢ
// LỜI cho chủ doanh nghiệp. Một báo cáo thiếu, một câu trả lời cụt mà im lặng
// còn tệ hơn báo lỗi — người dùng sẽ tưởng đó là sự thật.
//
// Nên mọi hàm ở đây NÉM lỗi có phân loại, để route quyết định hiển thị thế nào.
//
// ---------------------------------------------------------------------------
// Học ngược từ bản tích hợp cũ (ANSER bán lẻ, `core/services/dl_client.py`)
// ---------------------------------------------------------------------------
// Bản đó chạy được, nhưng có bốn điểm không nên lặp lại:
//
//  1. `use_local=True` mặc định — nhét model vào chung tiến trình web bằng
//     `sys.path.insert(os.getcwd() + '/dl_service')`. Vừa phụ thuộc thư mục lúc
//     khởi chạy, vừa buộc web server gánh RAM/GPU của model.
//  2. Mọi lỗi bị nuốt thành `{"error": ..., "status": "failed"}`. **Lỗi trông
//     giống dữ liệu** — tầng trên không phân biệt nổi "model chưa sẵn sàng" với
//     "ảnh không đọc được", nên không thể xử lý khác nhau.
//  3. Không có xác thực nào — không token, không key.
//  4. Timeout cứng 30s cho mọi thứ, kể cả OCR.
//
// Ở đây: luôn qua HTTP, lỗi có kiểu, có token, timeout theo từng loại việc.

export type BrainErrorKind =
  | "not_configured" // thiếu BRAIN_URL — lỗi cấu hình, không phải lỗi chạy
  | "unreachable" // không nối được (chưa bật, sập, sai URL)
  | "timeout" // nhận request nhưng không trả lời kịp
  | "overloaded" // Brain tự báo bận (503 + Retry-After) — CÓ THỂ thử lại
  | "not_ready" // 503 KHÔNG kèm Retry-After: thiếu thư viện / chưa nạp model.
  //              Chờ vô ích — phải đi sửa cấu hình.
  | "unauthorized" // sai/thiếu BRAIN_API_TOKEN
  | "bad_request" // ta gửi sai (4xx)
  | "bad_response" // Brain trả nội dung không đọc được
  | "server_error"; // 5xx khác

export class BrainError extends Error {
  readonly kind: BrainErrorKind;
  readonly status?: number;
  /** Chỉ có khi kind === "overloaded" — số giây Brain đề nghị chờ. */
  readonly retryAfterSeconds?: number;

  constructor(
    kind: BrainErrorKind,
    message: string,
    opts: { status?: number; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = "BrainError";
    this.kind = kind;
    this.status = opts.status;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }

  /** Thử lại có ích không? Chỉ khi Brain bận hoặc chưa kịp trả lời. */
  get retryable(): boolean {
    return this.kind === "overloaded" || this.kind === "timeout";
  }
}

/**
 * Ánh xạ lỗi Brain sang mã HTTP giữ đúng NGHĨA cho client.
 *
 * Quan trọng nhất là 503: đó là tín hiệu điều tiết tải có chủ đích của Brain,
 * không phải sự cố. Gộp nó vào 500 thì client sẽ thử lại ngay lập tức và làm
 * tình hình tệ thêm — thay vì chờ đúng số giây Brain đề nghị.
 */
export function brainErrorToHttp(error: unknown): {
  status: number;
  body: { error: string; kind: BrainErrorKind; detail: string; retry_after_s?: number };
  headers?: Record<string, string>;
} {
  const err =
    error instanceof BrainError
      ? error
      : new BrainError("server_error", error instanceof Error ? error.message : String(error));

  const status = {
    not_configured: 501, // chưa lắp, không phải hỏng
    unreachable: 502,
    timeout: 504,
    overloaded: 503,
    not_ready: 503,
    unauthorized: 502, // lỗi cấu hình GIỮA Body và Brain — không phải client sai
    bad_request: 400,
    bad_response: 502,
    server_error: 502,
  }[err.kind];

  return {
    status,
    body: {
      error: "brain_unavailable",
      kind: err.kind,
      detail: err.message,
      ...(err.retryAfterSeconds ? { retry_after_s: err.retryAfterSeconds } : {}),
    },
    ...(err.retryAfterSeconds
      ? { headers: { "Retry-After": String(err.retryAfterSeconds) } }
      : {}),
  };
}

// Timeout theo từng loại việc. Một con số chung là sai ở cả hai đầu: quá ngắn
// cho OCR, quá dài cho health-check (giữ người dùng chờ 30s chỉ để biết Brain chết).
const TIMEOUT_MS = {
  health: 3_000,
  chat: 60_000,
  tool: 30_000,
  upload: 60_000, // tải file + đọc Excel + kiểm sổ trong một lượt
  vision: 120_000,
} as const;

type Op = keyof typeof TIMEOUT_MS;

// `chat` là con số DUY NHẤT chỉnh được bằng env, và đây là lý do.
//
// `POST /chat` của Brain KHÔNG trả ngay như tên "task bất đồng bộ" gợi ý:
// `src/api/routes/chat.py` await `ensure_text_runtime()` TRƯỚC khi tạo
// `task_id`, nên request đầu tiên sau mỗi lần Brain khởi động lại phải chờ
// TRỌN 1–3 phút nạp model. 60s < 1–3 phút, nên câu đầu người dùng gõ luôn
// timeout — và hiện ra y hệt "model chết". Gặp thật 23/08/2026.
//
// Cách chữa đúng là hâm nóng Brain lúc dựng (offline_training/bat_lai_brain.py
// bên repo ANSER_AI làm việc đó). Biến này là lối thoát cho hai trường hợp
// còn lại: Brain nguội mà không hâm được, và một lượt soát hoá đơn đi qua
// vòng agentic nhiều lượt sinh chữ trên model 8B chạy tuần tự.
//
// Mặc định GIỮ NGUYÊN 60s: không đặt biến thì không ai thấy khác gì.
function timeoutMs(op: Op): number {
  if (op === "chat") {
    const raw = Number(process.env.BRAIN_CHAT_TIMEOUT_MS);
    if (Number.isFinite(raw) && raw > 0) return raw;
  }
  return TIMEOUT_MS[op];
}

export function isBrainConfigured(): boolean {
  return Boolean(process.env.BRAIN_URL);
}

function brainUrl(path: string): string {
  const base = process.env.BRAIN_URL;
  if (!base) {
    throw new BrainError(
      "not_configured",
      "Chưa cấu hình BRAIN_URL — Body không biết gọi Brain ở đâu.",
    );
  }
  return `${base.replace(/\/$/, "")}${path}`;
}

function authHeaders(identity?: BrainIdentity): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = process.env.BRAIN_API_TOKEN;
  if (token) headers["X-API-Token"] = token;
  // Brain dùng hai header này để tách lịch sử hội thoại và phạm vi dữ liệu.
  // Chấp cả UUID lẫn số nguyên (xem `resolve_identity` bên Brain).
  if (identity?.userId) headers["X-User-Id"] = identity.userId;
  if (identity?.warehouseId) headers["X-Store-Id"] = identity.warehouseId;
  return headers;
}

export type BrainIdentity = {
  userId: string;
  /** Kho — Brain gọi là `store_id`, dùng để giới hạn phạm vi dữ liệu. */
  warehouseId: string;
};

/** Lỗi ở tầng vận chuyển: hết giờ vs không nối được. Hai đường gọi dùng chung. */
function transportError(error: unknown, url: string, path: string, op: Op): BrainError {
  // AbortSignal.timeout() ném TimeoutError; mọi thứ khác là không nối được.
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return new BrainError(
      "timeout",
      `Brain không trả lời trong ${timeoutMs(op) / 1000}s (${path}).`,
    );
  }
  return new BrainError(
    "unreachable",
    `Không nối được Brain tại ${url}: ${error instanceof Error ? error.message : String(error)}`,
  );
}

async function callBrain<T>(
  path: string,
  op: Op,
  init: { method: "GET" | "POST" | "DELETE"; body?: unknown; identity?: BrainIdentity },
): Promise<T> {
  const url = brainUrl(path);
  let response: Response;

  try {
    response = await fetch(url, {
      method: init.method,
      headers: authHeaders(init.identity),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(timeoutMs(op)),
      cache: "no-store",
    });
  } catch (error) {
    throw transportError(error, url, path, op);
  }

  return parseResponse<T>(response, path);
}

/** Đọc phản hồi + phân loại lỗi. Hai đường gọi (JSON và multipart) dùng chung. */
async function parseResponse<T>(response: Response, path: string): Promise<T> {
  if (!response.ok) {
    // 503 kèm Retry-After là tín hiệu điều tiết tải CÓ CHỦ ĐÍCH của Brain
    // (ConcurrencyGuard), không phải sự cố. Giữ nguyên nghĩa để UI nói đúng.
    if (response.status === 503) {
      // HAI loại 503 khác hẳn nhau, và gộp chúng làm một là bảo người dùng
      // "thử lại sau ít giây" cho một dịch vụ sẽ KHÔNG BAO GIỜ tự sẵn sàng:
      //
      //   - CÓ Retry-After  -> ConcurrencyGuard điều tiết tải. Chờ là hết.
      //   - KHÔNG Retry-After -> một thành phần chưa dựng được (thiếu thư viện,
      //     chưa nạp model). Chờ bao lâu cũng vô ích; phải đi sửa cấu hình.
      //
      // Phát hiện khi chạy thật: kho tri thức chưa khởi tạo trả 503, Body hiện
      // "Brain đang bận" và không có gì cho thấy nguyên nhân (05/08/2026).
      const retryAfter = Number(response.headers.get("Retry-After"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        throw new BrainError("overloaded", "Brain đang bận, thử lại sau ít giây.", {
          status: 503,
          retryAfterSeconds: retryAfter,
        });
      }
      const chiTiet = (await response.text().catch(() => "")).slice(0, 500);
      let ly = chiTiet;
      try {
        const parsed = JSON.parse(chiTiet) as { detail?: unknown };
        if (typeof parsed.detail === "string") ly = parsed.detail;
      } catch {
        /* không phải JSON — giữ nguyên văn */
      }
      throw new BrainError(
        "not_ready",
        ly || "Một thành phần của Brain chưa sẵn sàng.",
        { status: 503 },
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new BrainError("unauthorized", "BRAIN_API_TOKEN sai hoặc thiếu.", {
        status: response.status,
      });
    }
    const raw = (await response.text().catch(() => "")).slice(0, 1000);
    // Brain trả lỗi dạng {"detail": "..."} — moi ra để người dùng đọc được câu
    // tiếng Việt hữu ích ("File .xls đời cũ, Save As sang .xlsx") thay vì một
    // cục JSON. Không moi được thì dùng nguyên văn.
    let detail = raw;
    try {
      const parsed = JSON.parse(raw) as { detail?: unknown };
      if (typeof parsed.detail === "string") detail = parsed.detail;
    } catch {
      /* không phải JSON — giữ nguyên văn */
    }
    const kind: BrainErrorKind = response.status < 500 ? "bad_request" : "server_error";
    throw new BrainError(kind, detail || `Brain trả ${response.status}`, {
      status: response.status,
    });
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new BrainError("bad_response", `Brain trả nội dung không phải JSON (${path}).`);
  }
}

// ---------------------------------------------------------------------------
// Sức khoẻ
// ---------------------------------------------------------------------------

export type BrainHealth = {
  status: string;
  degraded: boolean;
  engine_ready: boolean;
  kb_ready: boolean;
  vision_ready: boolean;
  runtime_profile?: string;
  engine_error?: string | null;
  load?: Record<string, Record<string, number | string>>;
  /**
   * Brain CÓ đang kiểm token không.
   *
   * `require_api_token` bên Brain bỏ qua mọi kiểm tra khi biến môi trường rỗng
   * — hợp lý lúc chạy máy mình, nhưng nếu biến đặt sai tên lúc triển khai thì
   * Brain mở toang mà không dấu hiệu nào. Đã xảy ra thật: compose đặt
   * `API_TOKEN` trong khi mã đọc `API_AUTH_TOKEN`.
   *
   * Brain phát tín hiệu này từ 13/08/2026 nhưng KHÔNG AI ĐỌC — kiểu đây thiếu
   * trường, route health không chuyển tiếp, UI không hiện. Một phòng thủ dựng
   * dở thì tệ hơn không dựng: nó làm ta tưởng đã che chỗ đó rồi.
   *
   * Không bắt buộc vì Brain cũ chưa trả trường này; `undefined` nghĩa là
   * KHÔNG BIẾT, và không biết thì phải nói là không biết chứ không đoán là an toàn.
   */
  auth_enabled?: boolean;
};

/**
 * KHÔNG ném lỗi — đây là hàm để hiển thị trạng thái, nên bản thân nó không
 * được là chỗ hỏng. Brain chết vẫn phải trả lời được "Brain đang chết".
 */
export async function checkBrainHealth(): Promise<
  { ok: true; health: BrainHealth } | { ok: false; kind: BrainErrorKind; message: string }
> {
  try {
    const health = await callBrain<BrainHealth>("/health", "health", { method: "GET" });
    return { ok: true, health };
  } catch (error) {
    if (error instanceof BrainError) return { ok: false, kind: error.kind, message: error.message };
    return { ok: false, kind: "unreachable", message: String(error) };
  }
}

// ---------------------------------------------------------------------------
// Hội thoại
// ---------------------------------------------------------------------------

export type BrainChatResponse = {
  answer: string;
  sources?: string[] | null;
  confidence?: number | null;
};

type TaskAccepted = { task_id: string; status: string };
type TaskState = { status: "running" | "completed" | "failed"; result?: unknown; error?: string };

/** Nhịp hỏi lại: dày lúc đầu (câu ngắn trả nhanh), thưa dần để đỡ nện Brain. */
const POLL_DELAYS_MS = [250, 250, 500, 500, 1000, 1000, 1500, 2000, 2000, 3000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Hỏi Brain một câu và CHỜ tới khi có câu trả lời.
 *
 * `/chat` của Brain là BẤT ĐỒNG BỘ: nó trả ngay `{task_id, status:"processing"}`
 * rồi chạy nền, kết quả lấy ở `GET /api/v1/task/{id}`. Bản đầu của hàm này đọc
 * thẳng `response`/`answer` từ phản hồi đầu tiên — hai trường đó không tồn tại,
 * nên nó trả về CHUỖI RỖNG mà không lỗi gì. Người dùng sẽ thấy một bong bóng
 * chat trống và không ai biết vì sao. Phát hiện khi chạy thật (31/07/2026).
 */
export async function askBrain(
  message: string,
  identity: BrainIdentity,
): Promise<BrainChatResponse & { taskId: string }> {
  const accepted = await callBrain<TaskAccepted>("/chat", "chat", {
    method: "POST",
    identity,
    // Brain lấy danh tính từ header khi có; thân request giữ cho tương thích.
    body: { user_id: identity.userId, store_id: identity.warehouseId, message },
  });

  if (!accepted?.task_id) {
    throw new BrainError("bad_response", "Brain không trả về task_id cho /chat.");
  }

  const deadline = Date.now() + timeoutMs("chat");
  for (let attempt = 0; ; attempt++) {
    await sleep(POLL_DELAYS_MS[Math.min(attempt, POLL_DELAYS_MS.length - 1)]);

    const task = await callBrain<TaskState>(`/api/v1/task/${accepted.task_id}`, "health", {
      method: "GET",
      identity,
    });

    if (task.status === "completed") {
      const result = (task.result ?? {}) as Partial<BrainChatResponse>;
      // Câu trả lời rỗng là BẤT THƯỜNG, không phải "không có gì để nói".
      // Trả "" ra UI là giấu lỗi — thà báo để còn lần ra nguyên nhân.
      if (!result.answer) {
        throw new BrainError("bad_response", "Brain trả về câu trả lời rỗng.");
      }
      return { ...result, answer: result.answer, taskId: accepted.task_id };
    }

    if (task.status === "failed") {
      throw new BrainError("server_error", `Brain xử lý thất bại: ${task.error ?? "không rõ"}`);
    }

    if (Date.now() > deadline) {
      throw new BrainError(
        "timeout",
        `Brain chưa trả lời sau ${timeoutMs("chat") / 1000}s (task ${accepted.task_id}).`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Công cụ tất định — Brain tính bằng code, không phải model sinh ra số
// ---------------------------------------------------------------------------

/** `cogs = null` nghĩa là CHƯA BIẾT giá vốn, khác hẳn 0. */
export type BrainSaleLine = {
  date: string; // YYYY-MM-DD
  revenue: number;
  product?: string;
  quantity?: number;
  cogs?: number | null;
};

export type BrainExpenseLine = { date: string; amount: number; category?: string };

export type BrainReportRequest = {
  granularity?: "month" | "quarter" | "half" | "year";
  periods_back?: number;
  top_n?: number;
  sales: BrainSaleLine[];
  expenses?: BrainExpenseLine[];
};

export type BrainReport = {
  granularity: string;
  periods: Array<Record<string, number | string | null>>;
  products: Array<Record<string, number | string | boolean | null>>;
  explain: { cogs_coverage_pct: number; confidence: string; formula: string; period_count: number };
  warnings: string[];
};

export async function buildReport(req: BrainReportRequest): Promise<BrainReport> {
  return callBrain<BrainReport>("/tools/report", "tool", { method: "POST", body: req });
}

export type BrainInventoryLine = {
  code: string;
  name?: string;
  unit?: string;
  opening_qty?: number;
  opening_value?: number | null;
  in_qty?: number;
  in_value?: number | null;
  out_qty?: number;
  out_value?: number | null;
  closing_qty?: number;
  closing_value?: number | null;
};

/**
 * Một phát hiện. HÌNH DẠNG DÙNG CHUNG cho mọi lớp kiểm của Brain — tồn kho,
 * công nợ, thuế suất, đối chiếu hai kỳ (`src/core/findings.py`). Nhờ vậy giao
 * diện chỉ cần MỘT component để hiển thị, và Brain thêm phép kiểm mới không kéo
 * theo việc sửa Body.
 *
 * `money_impact === null` KHÁC `=== 0`: null là "chưa quy ra tiền được", 0 là
 * "quy rồi, bằng không". Hiển thị null thành "0đ" là bịa ra một kết luận.
 */
export type BrainFinding = {
  kind: string;
  severity: "cao" | "trung bình" | "thấp";
  code: string | null;
  product: string | null;
  unit?: string | null;
  title: string;
  evidence: Record<string, unknown>;
  money_impact: number | null;
  suggestion: string;
};

export type BrainInventoryAudit = {
  warehouse: string;
  period: { start: string | null; end: string | null; days: number };
  summary: Record<string, number | null>;
  findings: BrainFinding[];
  explain: Record<string, unknown>;
  warnings: string[];
};

export async function auditInventory(req: {
  lines: BrainInventoryLine[];
  warehouse?: string;
  period_start?: string;
  period_end?: string;
}): Promise<BrainInventoryAudit> {
  return callBrain<BrainInventoryAudit>("/tools/inventory-audit", "tool", {
    method: "POST",
    body: req,
  });
}


/**
 * Gửi multipart lên Brain. Ba đường dùng chung: nạp bảng N-X-T, nạp tài liệu
 * vào kho tri thức, và đọc ảnh hoá đơn nhà xe.
 *
 * KHÔNG đặt Content-Type: fetch phải tự sinh boundary. Đặt tay là hỏng — server
 * không tách được các phần và báo "thiếu file", một lỗi rất khó đoán ra.
 */
async function uploadToBrain<T>(path: string, form: FormData): Promise<T> {
  const url = brainUrl(path);
  const headers: Record<string, string> = {};
  const token = process.env.BRAIN_API_TOKEN;
  if (token) headers["X-API-Token"] = token;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS.upload),
      cache: "no-store",
    });
  } catch (error) {
    throw transportError(error, url, path, "upload");
  }
  return parseResponse<T>(response, path);
}

// ---------------------------------------------------------------------------
// Hoá đơn cước vận tải — ảnh chụp của nhà xe
// ---------------------------------------------------------------------------

export type BrainFreightInvoice = {
  success: boolean;
  backend?: string;
  error?: string;
  invoice?: {
    carrier_name: string | null;
    carrier_tax_code: string | null;
    invoice_no: string | null;
    invoice_date: string | null;
    origin: string | null;
    destination: string | null;
    vehicle_type: string | null;
    plate_number: string | null;
    charges: Array<{ kind: string; description: string; quantity: number; unit_price: number }>;
    vat_rate: number | null;
    subtotal: number | null;
    vat_amount: number | null;
    total: number | null;
  };
  validation?: {
    ok: boolean;
    checks_performed: string[];
    issues: string[];
    computed: { subtotal: number; vat_amount: number | null; total: number };
    stated: { subtotal: number | null; vat_amount: number | null; total: number | null };
    missing_required: string[];
  };
  /**
   * `true` khi lớp kiểm số học KHÔNG xác nhận được. Bao gồm cả trường hợp
   * "không kiểm được phép nào" — ảnh mờ đọc ra rỗng KHÔNG phải hoá đơn sạch.
   */
  needs_manual_review?: boolean;
};

/**
 * Đọc ảnh hoá đơn nhà xe. Con số VLM đọc ra CHƯA đáng tin — `validation` mới là
 * chỗ Brain tính lại toàn bộ bằng code và đối chiếu với số in trên tờ giấy.
 * Giao diện phải hiện `needs_manual_review` chứ không được lặng lẽ dùng số.
 */
export async function readFreightInvoice(file: File): Promise<BrainFreightInvoice> {
  const form = new FormData();
  form.append("file", file, file.name);
  return uploadToBrain<BrainFreightInvoice>("/ocr/freight", form);
}

// ---------------------------------------------------------------------------
// Kho tri thức — tài liệu nội bộ của khách
// ---------------------------------------------------------------------------

export type BrainDocument = {
  source: string;
  doc_type: string;
  effective_from: string | null;
  effective_to: string | null;
  chunks: number;
};

export type BrainIngestResult = {
  source: string;
  chunks: number;
  replaced: boolean;
  skipped_unchanged: boolean;
  warnings: string[];
  pages: number | null;
};

export type BrainPassage = {
  text: string;
  source: string;
  score: number;
  heading: string;
  cite: string;
  effective_from: string | null;
  effective_to: string | null;
};

/**
 * `workspaceId` là hàng rào ngăn tài liệu khách này lọt vào câu trả lời cho
 * khách kia. Brain từ chối mọi lời gọi thiếu nó — cố ý không có giá trị mặc
 * định, vì quên truyền phải hỏng ngay chứ không rò lặng lẽ.
 */
export async function uploadKnowledgeDocument(
  file: File,
  opts: { workspaceId: string; effectiveFrom?: string; effectiveTo?: string; docType?: string },
): Promise<BrainIngestResult> {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("workspace_id", opts.workspaceId);
  if (opts.effectiveFrom) form.append("effective_from", opts.effectiveFrom);
  if (opts.effectiveTo) form.append("effective_to", opts.effectiveTo);
  if (opts.docType) form.append("doc_type", opts.docType);
  return uploadToBrain<BrainIngestResult>("/knowledge/documents", form);
}

export async function listKnowledgeDocuments(workspaceId: string): Promise<BrainDocument[]> {
  const q = new URLSearchParams({ workspace_id: workspaceId });
  const r = await callBrain<{ documents: BrainDocument[] }>(
    `/knowledge/documents?${q}`, "tool", { method: "GET" },
  );
  return r.documents ?? [];
}

export async function deleteKnowledgeDocument(
  workspaceId: string, source: string,
): Promise<void> {
  const q = new URLSearchParams({ workspace_id: workspaceId, source });
  await callBrain(`/knowledge/documents?${q}`, "tool", { method: "DELETE" });
}

export async function searchKnowledge(
  workspaceId: string, query: string, topK = 5,
): Promise<{ passages: BrainPassage[]; empty_reason: string | null }> {
  return callBrain("/knowledge/search", "tool", {
    method: "POST",
    body: { workspace_id: workspaceId, query, top_k: topK },
  });
}

export type BrainInventoryImport = {
  import: {
    ok: boolean;
    file_name: string | null;
    warehouse: string;
    period_start: string | null;
    period_end: string | null;
    rows_parsed: number;
    warnings: string[];
    checks: {
      missing_columns?: string[];
      mismatches?: Array<Record<string, unknown>>;
      rows_parsed?: number;
      totals?: Record<string, unknown>;
    };
    lines: BrainInventoryLine[];
  };
  /**
   * Giá vốn suy được cho từng mã, kèm chỗ lấy ra ("xuất" | "tồn cuối" |
   * "tồn đầu" — ba mức KHÔNG đáng tin như nhau). RỖNG khi Brain đọc file không
   * chắc chắn: giá vốn sai còn khó lần ra hơn bản kiểm sai, vì nó nằm lại trong
   * cơ sở dữ liệu và âm thầm chảy vào mọi báo cáo lãi lỗ về sau.
   */
  unit_costs: Array<{
    code: string;
    name: string;
    unit: string;
    unit_cost: number;
    source: string;
  }>;
  audit: BrainInventoryAudit | null;
  /** Có giá trị khi Brain TỪ CHỐI kiểm vì đọc file không chắc chắn. */
  audit_skipped_reason: string | null;
};

/**
 * Tải bảng tổng hợp N-X-T (.xlsx do MISA/Fast/Bravo xuất) lên Brain để đọc + kiểm.
 *
 * Vì sao gửi cả file thay vì tự đọc Excel ở Body: phần khó không nằm ở phép kiểm
 * mà ở chỗ ĐỌC ĐÚNG BẢNG. Brain có ba lớp tự kiểm chống lệch cột (đơn giá BQ
 * trong file vs tính lại, dòng Tổng cộng của file vs tổng ta cộng, và cân đối
 * từng dòng). Chép ba lớp đó sang TypeScript là tạo bản sao thứ hai rồi để nó
 * trôi khỏi bản gốc.
 *
 * `audit` có thể là null — khi đó `audit_skipped_reason` nói vì sao, và giao
 * diện PHẢI hiện lý do đó chứ không được coi như "không có lỗi nào".
 */
export async function importInventoryFile(
  file: File,
  opts: { sheet?: string } = {},
): Promise<BrainInventoryImport> {
  const form = new FormData();
  form.append("file", file, file.name);
  if (opts.sheet) form.append("sheet", opts.sheet);
  return uploadToBrain<BrainInventoryImport>("/tools/inventory-import", form);
}

// ---------------------------------------------------------------------------
// Công nợ — danh sách khách hàng / nhà cung cấp
// ---------------------------------------------------------------------------

export type BrainPartner = {
  code: string;
  name: string;
  address: string;
  /** `null` = CHƯA BIẾT số dư, không phải bằng 0. */
  balance: number | null;
  tax_id: string;
  phone: string;
  role: string;
};

export type BrainPartnerAudit = {
  findings: BrainFinding[];
  summary: {
    số_khách_hàng: number;
    số_nhà_cung_cấp: number;
    tổng_phải_thu: number;
    tổng_phải_trả: number;
    khách_có_số_dư: number;
    số_phát_hiện: number;
    /**
     * Những thứ Brain CỐ Ý không phân tích, kèm lý do. Giao diện phải hiện ra —
     * người đọc một bảng công nợ mà không thấy dòng này sẽ mặc định là đã có
     * phân tích tuổi nợ.
     */
    không_phân_tích_được: string[];
    phải_thu_quy_ra_ngày?: number;
  };
};

export type BrainPartnerImport = {
  import: {
    ok: boolean;
    file_name: string | null;
    role: string;
    rows_parsed: number;
    warnings: string[];
    checks: Record<string, unknown>;
    partners: BrainPartner[];
  };
  audit: BrainPartnerAudit | null;
  audit_skipped_reason: string | null;
};

/**
 * Tải danh sách khách hàng hoặc nhà cung cấp (.xlsx MISA) lên Brain.
 *
 * `role` để trống thì Brain tự đoán từ tiêu đề file — hai bảng chỉ khác nhau ở
 * chữ trong tiêu đề cột mã.
 */
export async function importPartnerFile(
  file: File,
  opts: { sheet?: string; role?: string } = {},
): Promise<BrainPartnerImport> {
  const form = new FormData();
  form.append("file", file, file.name);
  if (opts.sheet) form.append("sheet", opts.sheet);
  if (opts.role) form.append("role", opts.role);
  return uploadToBrain<BrainPartnerImport>("/tools/partner-import", form);
}

/** Soi công nợ từ số dư đã có sẵn (không qua file). */
export async function auditPartners(req: {
  customers: Array<Partial<BrainPartner> & { code: string }>;
  suppliers?: Array<Partial<BrainPartner> & { code: string }>;
  cogs_per_day?: number;
}): Promise<BrainPartnerAudit> {
  return callBrain<BrainPartnerAudit>("/tools/partner-audit", "tool", {
    method: "POST",
    body: req,
  });
}

// ---------------------------------------------------------------------------
// Thuế suất GTGT — danh mục hàng hoá
// ---------------------------------------------------------------------------

export type BrainProduct = {
  code: string;
  name: string;
  /** Cột "Giảm 2% thuế suất thuế GTGT" của MISA. */
  vat_flag: string;
  group: string;
  unit: string;
  qty: number | null;
  value: number | null;
};

export type BrainVatCatalogAudit = {
  findings: BrainFinding[];
  summary: {
    số_mã: number;
    chưa_gắn_cờ: number;
    "tra_ra_8%": number;
    "tra_ra_10%": number;
    không_tra_được: number;
    hiệu_lực_từ: string;
    hiệu_lực_đến: string;
    căn_cứ: string;
    /** Bảng tra là ĐỀ XUẤT. Câu này phải luôn hiện cạnh kết quả. */
    lưu_ý: string;
  };
};

export type BrainProductImport = {
  import: {
    ok: boolean;
    file_name: string | null;
    rows_parsed: number;
    warnings: string[];
    checks: Record<string, unknown>;
    products: BrainProduct[];
  };
  audit: BrainVatCatalogAudit | null;
  audit_skipped_reason: string | null;
};

export async function importProductFile(
  file: File,
  opts: { sheet?: string } = {},
): Promise<BrainProductImport> {
  const form = new FormData();
  form.append("file", file, file.name);
  if (opts.sheet) form.append("sheet", opts.sheet);
  return uploadToBrain<BrainProductImport>("/tools/product-import", form);
}

// ---------------------------------------------------------------------------
// Đối chiếu hai lần xuất cùng một kỳ
// ---------------------------------------------------------------------------

export type BrainPeriodSide = {
  lines: BrainInventoryLine[];
  warehouse?: string;
  period_start?: string | null;
  period_end?: string | null;
};

export type BrainPeriodDiff = {
  findings: BrainFinding[];
  /** KHÔNG rỗng nghĩa là Brain TỪ CHỐI so — khác kho, khác ngày bắt đầu, nhầm thứ tự. */
  warnings: string[];
  summary: {
    kho: string;
    kỳ_bắt_đầu: string | null;
    bản_trước_đến: string | null;
    bản_sau_đến: string | null;
    số_mã_bản_trước: number;
    số_mã_bản_sau: number;
    so_sánh_được: boolean;
    số_mã_so_được?: number;
    số_phát_hiện?: number;
    có_sửa_hồi_tố?: boolean;
    tổng_tiền_ảnh_hưởng?: number;
  };
};

/**
 * So hai lần xuất CÙNG một kỳ để tìm chứng từ bị sửa sau khi đã báo cáo.
 *
 * Đây là phép kiểm mà không bản báo cáo đơn lẻ nào làm được: sổ hôm nay hợp lệ,
 * sổ tháng trước cũng hợp lệ, nhưng hai bản kể hai câu chuyện khác nhau về cùng
 * một quãng thời gian. Kỳ dài hơn mà số xuất luỹ kế GIẢM là điều thời gian
 * không cho phép.
 *
 * `truoc` phải là bản xuất SỚM hơn. Truyền ngược thì Brain từ chối so và nói rõ
 * là nhầm thứ tự, chứ không im lặng cho ra kết quả vô nghĩa.
 */
export async function comparePeriods(
  truoc: BrainPeriodSide,
  sau: BrainPeriodSide,
): Promise<BrainPeriodDiff> {
  return callBrain<BrainPeriodDiff>("/tools/period-diff", "tool", {
    method: "POST",
    body: { truoc, sau },
  });
}
