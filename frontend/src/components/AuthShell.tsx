import Link from "next/link";
import { ReactNode } from "react";
import AmbientOrbs from "@/components/AmbientOrbs";

const features = [
  {
    title: "Quản lý khách hàng",
    desc: "Quản lý khách hàng và giữ liên hệ của bạn luôn ngăn nắp.",
  },
  {
    title: "Quản lý sản phẩm & kho hàng",
    desc: "Theo dõi sản phẩm, tồn kho và biến động tại một nơi duy nhất.",
  },
  {
    title: "Tự động hóa thông minh",
    desc: "Tự động hóa các tác vụ thường ngày và nhận báo cáo sẵn sàng dùng.",
  },
];

type AuthShellProps = {
  brandTitle: string;
  brandSubtitle: string;
  formTitle: string;
  formSubtitle: string;
  switchText?: string;
  switchLinkLabel?: string;
  switchHref?: string;
  children: ReactNode;
};

export default function AuthShell({
  brandTitle,
  brandSubtitle,
  formTitle,
  formSubtitle,
  switchText,
  switchLinkLabel,
  switchHref,
  children,
}: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen items-start justify-center overflow-x-hidden bg-[#030305] text-white sm:items-center">
      <AmbientOrbs />

      <div className="relative z-10 flex w-full max-w-5xl min-h-screen flex-col overflow-hidden border-white/[0.06] bg-[rgba(10,10,14,0.6)] sm:my-10 sm:min-h-0 sm:flex-row sm:rounded-3xl sm:border sm:shadow-[0_25px_80px_rgba(0,0,0,0.8)] sm:backdrop-blur-2xl">
        <div className="flex flex-col justify-center border-b border-white/[0.06] p-8 sm:flex-[1.2] sm:border-r sm:border-b-0 sm:p-14">
          <div className="mb-5 flex items-center gap-4">
            <span className="bg-gradient-to-br from-emerald-400 to-teal-300 bg-clip-text text-4xl text-transparent">
              ▲
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{brandTitle}</h1>
          </div>
          <p className="mb-9 max-w-md text-[15px] leading-relaxed text-zinc-400">
            {brandSubtitle}
          </p>

          <div className="hidden flex-col gap-4 sm:flex">
            {features.map((f) => (
              <div
                key={f.title}
                className="flex items-center gap-5 rounded-2xl bg-black/40 p-5 transition-transform hover:translate-x-2"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.03] text-lg">
                  <span className="h-2 w-2 rounded-full bg-sky-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">{f.title}</h4>
                  <p className="text-[13px] leading-snug text-zinc-400">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center p-8 sm:flex-1 sm:p-12">
          <div className="w-full max-w-sm">
            <Link
              href="/"
              className="mb-6 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-white"
            >
              ← Về trang chủ
            </Link>

            <div className="mb-10 text-center">
              <h2 className="mb-2 text-3xl font-bold tracking-tight">{formTitle}</h2>
              <p className="text-sm text-zinc-400">{formSubtitle}</p>
            </div>

            {children}

            {switchText && switchLinkLabel && switchHref && (
              <div className="mt-6 text-center text-sm text-zinc-400">
                {switchText}{" "}
                <Link href={switchHref} className="font-semibold text-white hover:underline">
                  {switchLinkLabel}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
