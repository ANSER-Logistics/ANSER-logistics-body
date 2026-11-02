"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import FloatingInput from "@/components/FloatingInput";

const DEMO_ACCOUNT = { email: "demo@anser.dev", password: "demo1234" };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function fillDemoAccount() {
    setEmail(DEMO_ACCOUNT.email);
    setPassword(DEMO_ACCOUNT.password);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message ?? "Email hoặc mật khẩu không đúng.");
      }

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể đăng nhập. Vui lòng thử lại.");
      setLoading(false);
    }
  }

  return (
    <AuthShell
      brandTitle="ANSER"
      brandSubtitle="Hệ thống quản lý thông minh giúp tổ chức công việc hiệu quả với cấu trúc phân lớp và các kênh kết nối mạnh mẽ."
      formTitle="Chào mừng trở lại"
      formSubtitle="Đăng nhập để tiếp tục vào không gian làm việc"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}

        <FloatingInput
          id="email"
          type="email"
          label="Địa chỉ Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <FloatingInput
          id="password"
          type="password"
          label="Mật khẩu"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-white py-4 text-[15px] font-bold text-black transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(255,255,255,0.2)] disabled:opacity-60"
        >
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>

      <div className="mt-10 border-t border-white/[0.08] pt-6">
        <button
          type="button"
          onClick={fillDemoAccount}
          className="flex w-full items-center justify-between rounded-xl border border-white/[0.08] bg-black/30 p-3 text-left transition-colors hover:border-sky-500/40 hover:bg-sky-500/5"
        >
          <span className="text-xs font-semibold text-zinc-400">
            <span className="mr-1">👤</span> Tài khoản demo
          </span>
          <span className="font-mono text-xs text-zinc-500">{DEMO_ACCOUNT.email}</span>
        </button>
      </div>
    </AuthShell>
  );
}
