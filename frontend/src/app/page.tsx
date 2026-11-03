import Link from "next/link";
import AmbientOrbs from "@/components/AmbientOrbs";

const features = [
  {
    title: "Thị giác máy tính & Quét OCR",
    desc: "Số hóa chứng từ, hóa đơn tự động. Trích xuất dữ liệu thô thành cấu trúc JSON chuẩn, không cần nhập liệu thủ công.",
    span: "md:col-span-2",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6M9 8h6M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
      />
    ),
  },
  {
    title: "Đồng bộ đa nền tảng",
    desc: "Kết nối liền mạch dữ liệu giữa các bộ phận vận hành trên cùng một hạ tầng bảo mật.",
    span: "",
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8m-8 5h8m-8 5h5M4 4h16v16H4z" />,
  },
  {
    title: "Dự báo rủi ro & nhu cầu",
    desc: "Phân tích chuỗi thời gian, dự báo xu hướng tồn kho và cảnh báo thiếu hụt sớm.",
    span: "",
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5m4 14v-8m4 8V9m4 10V4m4 15v-6" />,
  },
  {
    title: "Tự động hóa luồng công việc",
    desc: "Thiết lập kịch bản phản ứng linh hoạt: gửi email, đồng bộ dữ liệu, cảnh báo tức thời khi có sự kiện.",
    span: "md:col-span-2",
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />,
  },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#030305] text-white">
      <AmbientOrbs />

      <nav className="fixed top-0 left-0 z-50 flex w-full items-center justify-between border-b border-white/[0.08] bg-[#030305]/70 px-6 py-5 backdrop-blur-2xl sm:px-12">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span className="bg-gradient-to-br from-emerald-400 to-teal-300 bg-clip-text text-transparent">▲</span>
          ANSER
        </Link>
        <div className="hidden items-center gap-8 sm:flex">
          <a href="#features" className="text-sm font-medium text-zinc-400 transition-colors hover:text-white">
            Tính năng
          </a>
          <Link href="/login" className="text-sm font-medium text-zinc-400 transition-colors hover:text-white">
            Đăng nhập
          </Link>
          <Link
            href="/register"
            className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-black transition-all hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)]"
          >
            Bắt đầu ngay
          </Link>
        </div>
      </nav>

      <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 pt-36 pb-16 text-center">
        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-violet-500/40 bg-violet-500/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-violet-300 uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          ANSER Engine v2.0 Live
        </div>
        <h1 className="max-w-4xl bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent sm:text-6xl md:text-7xl">
          Thống Lĩnh Dữ Liệu.
          <br />
          Tối Ưu Tương Lai.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
          Nền tảng điều hành thế hệ mới. Tích hợp trợ lý AI theo ngữ cảnh, trích xuất dữ liệu bằng OCR và dự báo vận
          hành bằng mô hình học sâu.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <Link
            href="/register"
            className="rounded-2xl bg-gradient-to-br from-violet-600 to-sky-500 px-9 py-4 text-base font-bold shadow-[0_10px_30px_rgba(124,58,237,0.4)] transition-shadow hover:shadow-[0_12px_35px_rgba(124,58,237,0.55)]"
          >
            Khởi tạo không gian làm việc
          </Link>
          <Link
            href="/login"
            className="rounded-2xl border border-white/[0.08] bg-white/[0.05] px-8 py-4 text-base font-semibold backdrop-blur-md transition-colors hover:border-white/[0.18] hover:bg-white/[0.09]"
          >
            Đăng nhập
          </Link>
        </div>
      </section>

      <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 py-28 sm:px-12">
        <div className="mb-16 text-center">
          <div className="mb-3 text-xs font-bold tracking-widest text-sky-400 uppercase">Hệ sinh thái cốt lõi</div>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Công nghệ vượt xa vận hành truyền thống
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className={`${f.span} rounded-3xl border border-white/[0.08] bg-white/[0.02] p-9 backdrop-blur-xl transition-colors hover:border-violet-500/40`}
            >
              <div className="mb-6 flex h-13 w-13 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-sky-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  className="h-6 w-6"
                >
                  {f.icon}
                </svg>
              </div>
              <h3 className="mb-2.5 text-xl font-bold">{f.title}</h3>
              <p className="text-[15px] leading-relaxed text-zinc-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 px-6 py-28 text-center">
        <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Sẵn sàng tối ưu hóa vận hành?</h2>
        <Link
          href="/register"
          className="mt-8 inline-block rounded-2xl bg-gradient-to-br from-violet-600 to-sky-500 px-12 py-4.5 text-lg font-bold shadow-[0_10px_30px_rgba(124,58,237,0.4)] transition-shadow hover:shadow-[0_12px_35px_rgba(124,58,237,0.55)]"
        >
          Triển khai ANSER ngay hôm nay
        </Link>
        <div className="mx-auto mt-20 flex max-w-6xl flex-col gap-2 border-t border-white/[0.08] pt-8 text-sm text-zinc-500 sm:flex-row sm:justify-between">
          <span>© 2026 ANSER Engine. All rights reserved.</span>
          <span>Hệ thống: Online</span>
        </div>
      </footer>
    </div>
  );
}
