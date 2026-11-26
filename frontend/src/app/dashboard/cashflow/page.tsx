import CashHealthPanel from "@/components/dashboard/CashHealthPanel";

export const metadata = {
  title: "Sức khoẻ dòng tiền — ANSER",
};

export default function CashflowPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">Sức khoẻ dòng tiền</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-500">
          Tiền của doanh nghiệp không nằm hết trong tài khoản: một phần ở khách chưa trả, một phần ở hàng chưa bán. Màn
          hình này quy cả ba về cùng một đơn vị — số ngày — để thấy chỗ nào đang giữ tiền lâu nhất.
        </p>
      </header>
      <CashHealthPanel />
    </div>
  );
}
