import BrainChat from "@/components/dashboard/BrainChat";
import Sidebar from "@/components/dashboard/Sidebar";
import Topbar from "@/components/dashboard/Topbar";

// Trang tổng quan và Báo cáo đọc database trực tiếp trong server component. Không có
// dòng này, `next build` prerender chúng MỘT LẦN lúc build — production hiển thị số liệu
// đông cứng tại thời điểm build, và build hỏng khi không kết nối được database.
export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#030305] text-white">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      {/* Nút nổi thay vì một mục sidebar riêng: câu hỏi thường nảy ra KHI đang
          xem một trang cụ thể, bắt rời trang để đi hỏi là làm mất ngữ cảnh. */}
      <BrainChat />
    </div>
  );
}
