// n8n tắt/chưa cấu hình không được làm hỏng luồng nghiệp vụ chính (vd tạo khách hàng) —
// mọi lỗi ở đây chỉ log lại, không throw.
export async function triggerN8nWebhook(path: string, payload: unknown) {
  const base = process.env.N8N_WEBHOOK_URL;
  if (!base) return;

  try {
    const res = await fetch(`${base}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });
    // fetch không throw khi n8n trả 404/500 (vd workflow chưa bật) — không log thì không ai biết.
    if (!res.ok) console.error(`[n8n] Webhook "${path}" trả HTTP ${res.status}`);
  } catch (error) {
    console.error(`[n8n] Không gọi được webhook "${path}":`, error);
  }
}
