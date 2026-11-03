import BookAuditPanel from "@/components/dashboard/BookAuditPanel";

export const metadata = {
  title: "Cảnh báo sổ sách — ANSER",
};

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">Cảnh báo sổ sách</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-500">
          Hai phép kiểm mà phần mềm kế toán không làm: đối chiếu hai bản xuất của cùng một kỳ để tìm chứng từ bị sửa sau
          khi đã báo cáo, và soát thuế suất từng mã hàng theo quy định đang có hiệu lực.
        </p>
      </header>
      <BookAuditPanel />
    </div>
  );
}
