"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Khung hỏi đáp với Brain — nút nổi, dùng được ở mọi trang trong dashboard.
 *
 * Ba điều màn hình này phải làm đúng, vì làm sai thì người dùng tin vào thứ
 * không có thật:
 *
 *  1. `/chat` của Brain là BẤT ĐỒNG BỘ (trả task_id rồi chạy nền). Bên server
 *     `askBrain()` đã chờ hộ, nhưng câu hỏi phức tạp vẫn mất vài chục giây —
 *     phải cho thấy là đang chạy, đừng để màn hình đứng im như treo.
 *  2. Lỗi KHÔNG được hiện như một câu trả lời. Bong bóng lỗi phải trông khác
 *     hẳn bong bóng trả lời, nếu không người ta đọc lời xin lỗi của hệ thống
 *     như thể đó là kết luận nghiệp vụ.
 *  3. Brain bận (503) là tín hiệu điều tiết tải có chủ đích, không phải sự cố —
 *     nói rõ "thử lại sau N giây" thay vì "đã xảy ra lỗi".
 */

type Msg =
  | { role: "user"; text: string }
  | { role: "brain"; text: string; confidence?: number | null; sources?: string[] | null }
  | { role: "error"; text: string; retryAfter?: number };

const SUGGESTIONS = [
  "Tháng này bán được bao nhiêu?",
  "Mặt hàng nào tồn kho lâu nhất?",
  "Lãi gộp quý này so với quý trước thế nào?",
];

export default function BrainChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;

    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        setMessages((m) => [
          ...m,
          {
            role: "error",
            text: data.detail ?? data.error ?? `Lỗi ${res.status}`,
            retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
          },
        ]);
        return;
      }

      setMessages((m) => [
        ...m,
        { role: "brain", text: data.reply ?? "", confidence: data.confidence, sources: data.sources },
      ]);
    } catch (e) {
      setMessages((m) => [...m, { role: "error", text: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-6 bottom-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-sky-500 text-2xl shadow-lg shadow-violet-900/40 transition-transform hover:-translate-y-0.5"
        title="Hỏi ANSER"
        aria-label="Hỏi ANSER"
      >
        ▲
      </button>
    );
  }

  return (
    <div className="fixed right-6 bottom-6 z-40 flex h-[32rem] w-[min(24rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-zinc-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <div>
          <p className="text-sm font-bold">Hỏi ANSER</p>
          <p className="text-xs text-zinc-500">Số liệu do máy tính bằng code, không phải model đoán</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-2 py-1 text-zinc-400 hover:text-white"
          aria-label="Đóng"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-zinc-500">Thử hỏi:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void send(s)}
                className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-white/[0.06]"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => {
          if (m.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-sky-600/25 px-3.5 py-2 text-sm whitespace-pre-wrap">
                  {m.text}
                </p>
              </div>
            );
          }
          if (m.role === "error") {
            // Bong bóng lỗi CỐ Ý trông khác hẳn bong bóng trả lời — đọc nhầm
            // lời báo lỗi thành kết luận nghiệp vụ là chuyện có thật.
            return (
              <div key={i} className="rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5">
                <p className="text-xs font-bold text-red-400">Không trả lời được</p>
                <p className="mt-1 text-sm whitespace-pre-wrap text-red-300/90">{m.text}</p>
                {m.retryAfter && <p className="mt-1 text-xs text-red-300/70">Thử lại sau {m.retryAfter} giây.</p>}
              </div>
            );
          }
          return (
            <div key={i} className="flex flex-col items-start gap-1">
              <p className="max-w-[90%] rounded-2xl rounded-bl-md bg-white/[0.06] px-3.5 py-2 text-sm whitespace-pre-wrap">
                {m.text}
              </p>
              {(m.confidence !== null && m.confidence !== undefined) || m.sources?.length ? (
                <p className="pl-1 text-xs text-zinc-500">
                  {m.confidence !== null &&
                    m.confidence !== undefined &&
                    `độ tin cậy ${Math.round(m.confidence * 100)}%`}
                  {m.sources?.length ? ` · nguồn: ${m.sources.join(", ")}` : ""}
                </p>
              ) : null}
            </div>
          );
        })}

        {busy && (
          <p className="text-sm text-zinc-500">
            Đang tính<span className="animate-pulse">...</span>
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex gap-2 border-t border-white/[0.08] p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Hỏi về doanh thu, tồn kho, lãi lỗ..."
          maxLength={4000}
          className="flex-1 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black disabled:opacity-40"
        >
          Gửi
        </button>
      </form>
    </div>
  );
}
