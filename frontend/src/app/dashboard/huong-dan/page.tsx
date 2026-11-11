import Link from "next/link";
import { AlertTriangleIcon, ChartIcon } from "@/components/dashboard/icons";

export const metadata = {
  title: "Hướng dẫn dùng — ANSER",
};

/**
 * Hướng dẫn cho KẾ TOÁN, không phải cho người làm kỹ thuật.
 *
 * Viết theo đúng thứ tự người dùng làm, không theo thứ tự hệ thống được xây.
 * Mỗi bước nói ba thứ: lấy file ở đâu, bấm vào đâu, và con số hiện ra nghĩa là
 * gì. Thiếu vế thứ ba là chỗ mọi hướng dẫn hỏng — người ta làm đúng thao tác
 * rồi nhìn kết quả mà không biết nên làm gì tiếp.
 *
 * Đường xuất MISA lấy từ HOANG_PHAT_DU_LIEU_CAN_XIN.md bên Brain và từ chính
 * gợi ý đang hiện trong CashHealthPanel/BookAuditPanel — sửa một bên thì phải
 * sửa bên kia, nên chúng được chép đúng nguyên văn chứ không diễn đạt lại.
 */

const KHOI = "rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5";

function Buoc({ so, children }: { so: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[11px] font-bold text-zinc-300">
        {so}
      </span>
      <div className="flex-1 pt-0.5 text-sm leading-relaxed text-zinc-400">{children}</div>
    </li>
  );
}

function ODienTay({ nhan }: { nhan: string }) {
  return (
    <p className="flex flex-wrap items-baseline gap-2 text-sm">
      <span className="text-zinc-400">{nhan}</span>
      <span className="min-w-[220px] flex-1 border-b border-dashed border-white/25" />
    </p>
  );
}

const FILE_MISA = [
  {
    ten: "Danh sách khách hàng",
    duong: "Danh mục → Khách hàng → Xuất khẩu → Excel",
    dung: "Dòng tiền",
  },
  {
    ten: "Danh sách nhà cung cấp",
    duong: "Danh mục → Nhà cung cấp → Xuất khẩu → Excel",
    dung: "Dòng tiền",
  },
  {
    ten: "Danh sách hàng hoá, dịch vụ",
    duong: "Danh mục → Vật tư hàng hoá → Xuất khẩu → Excel",
    dung: "Soát thuế suất",
    luuY: "Phải có cột “Giảm 2% thuế suất thuế GTGT”",
  },
  {
    ten: "Tổng hợp Nhập Xuất Tồn",
    duong: "Báo cáo → Kho → Tổng hợp Nhập Xuất Tồn → Xuất khẩu → Excel",
    dung: "Dòng tiền + So hai kỳ",
  },
];

const BON_O = [
  ["Khách đang nợ mình", "Tiền đã bán ra nhưng chưa thu về."],
  ["Hàng nằm trong kho", "Tiền đã mua hàng nhưng chưa bán được."],
  ["Mình đang nợ nhà cung cấp", "Phần vốn đang mượn được của người bán."],
  [
    "Vốn lưu động bị kẹt",
    "Hai ô đầu trừ ô thứ ba. Đây là tiền thật đã bỏ ra mà chưa quay về tài khoản.",
  ],
];

const MUC_DO = [
  ["cao", "bg-red-500/15 text-red-400 border-red-500/20", "Sai rõ ràng, hoặc số tiền lớn. Xem trước."],
  ["trung bình", "bg-amber-500/15 text-amber-400 border-amber-500/20", "Đáng xem lại, chưa chắc là sai."],
  ["thấp", "bg-sky-500/15 text-sky-400 border-sky-500/20", "Ghi nhận để biết, thường chưa phải làm gì ngay."],
];

export default function HuongDanPage() {
  return (
    <div className="max-w-3xl space-y-8 pb-16">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">Hướng dẫn dùng</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Phần này làm{" "}
          <strong className="text-zinc-200">hai việc mà phần mềm kế toán không làm</strong>
          : quy mọi con số về <em>số ngày</em> để biết tiền đang kẹt ở đâu, và soi những
          chỗ sổ sách sai mà không có cảnh báo nào.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          Cả hai chạy trên file Excel xuất từ MISA. Không cần cài gì thêm, không nối vào
          phần mềm kế toán, và không sửa gì trong đó.
        </p>
      </header>

      <section className={KHOI}>
        <h2 className="text-sm font-semibold text-zinc-200">Trước khi bắt đầu</h2>
        <div className="mt-3 space-y-3">
          <ODienTay nhan="Địa chỉ mở trên trình duyệt:" />
          <ODienTay nhan="Email đăng nhập:" />
          <ODienTay nhan="Mật khẩu:" />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">
          Ba dòng trên do bên kỹ thuật điền và gửi riêng. Địa chỉ có thể đổi khi máy chủ
          khởi động lại — đổi thì sẽ được báo trước, đó không phải hỏng.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white">Bốn file cần xuất từ MISA</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Xuất một lần, dùng được cho cả hai việc bên dưới.
        </p>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/[0.08]">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium">Đường xuất trong MISA</th>
                <th className="px-4 py-3 font-medium">Dùng cho</th>
              </tr>
            </thead>
            <tbody>
              {FILE_MISA.map((f) => (
                <tr key={f.ten} className="border-t border-white/[0.06] align-top">
                  <td className="px-4 py-3 font-medium text-zinc-200">
                    {f.ten}
                    {f.luuY ? (
                      <span className="mt-1 block text-xs font-normal text-amber-300/80">
                        {f.luuY}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs leading-relaxed text-zinc-400">
                    {f.duong}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{f.dung}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ChartIcon className="h-5 w-5 text-sky-400" />
          <h2 className="text-lg font-bold text-white">Việc 1 — Xem tiền đang nằm ở đâu</h2>
        </div>
        <p className="text-sm leading-relaxed text-zinc-400">
          Vào{" "}
          <Link
            href="/dashboard/cashflow"
            className="font-semibold text-sky-300 hover:underline"
          >
            Dòng tiền
          </Link>
          . Màn hình này trả lời một câu:{" "}
          <em>tiền công ty bỏ ra đang nằm ở chỗ nào, và bao lâu rồi chưa quay về.</em>
        </p>

        <ol className="space-y-3">
          <Buoc so={1}>
            Ô <strong className="text-zinc-200">Danh sách khách hàng / nhà cung cấp</strong>
            : chọn file khách hàng rồi bấm <em>Soi ngay</em>. Xong thì làm lại đúng ô đó
            với file nhà cung cấp — hệ thống tự nhận ra file nào là file nào.
          </Buoc>
          <Buoc so={2}>
            Ô <strong className="text-zinc-200">Bảng tổng hợp tồn kho</strong>: chọn file
            Tổng hợp Nhập Xuất Tồn rồi bấm <em>Nạp tồn kho</em>. Không bắt buộc, nhưng
            thiếu nó thì chỉ thấy số tiền chứ không thấy được <strong>số ngày</strong>.
          </Buoc>
          <Buoc so={3}>
            Đọc bốn ô số ở khối{" "}
            <strong className="text-zinc-200">Tiền đang nằm ở đâu</strong>.
          </Buoc>
        </ol>

        <div className={KHOI}>
          <h3 className="text-sm font-semibold text-zinc-200">Bốn ô đó nghĩa là gì</h3>
          <dl className="mt-3 space-y-2.5 text-sm">
            {BON_O.map(([nhan, y]) => (
              <div key={nhan} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="w-56 shrink-0 font-medium text-zinc-300">{nhan}</dt>
                <dd className="text-zinc-500">{y}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 rounded-xl bg-white/[0.03] p-3 text-xs leading-relaxed text-zinc-400">
            Dòng chữ nhỏ dưới mỗi ô — ví dụ <em>“113 ngày giá vốn”</em> — mới là con số
            đáng nhìn. Nó nói: số tiền đó bằng bao nhiêu ngày bán hàng. “3,9 tỷ” tự nó
            không cho biết nhiều hay ít; “113 ngày” thì có.
          </p>
        </div>

        <div className={KHOI}>
          <h3 className="text-sm font-semibold text-zinc-200">
            Khối “Những thứ dữ liệu này chưa cho biết”
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Đừng bỏ qua khối này. Nó liệt kê những câu hệ thống{" "}
            <strong>cố ý không trả lời</strong> vì file hiện có chưa đủ — ví dụ tuổi nợ
            30/60/90 ngày cần <em>Sổ chi tiết công nợ phải thu</em>, mà danh sách khách
            hàng thì không kèm ngày hoá đơn.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            Một hệ thống nói thẳng “chưa biết” đáng tin hơn hệ thống đoán bừa rồi trình
            bày như thể chắc chắn.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangleIcon className="h-5 w-5 text-amber-400" />
          <h2 className="text-lg font-bold text-white">Việc 2 — Soát sổ sách</h2>
        </div>
        <p className="text-sm leading-relaxed text-zinc-400">
          Vào{" "}
          <Link
            href="/dashboard/audit"
            className="font-semibold text-amber-300 hover:underline"
          >
            Cảnh báo sổ sách
          </Link>
          . Có hai thẻ, làm cái nào trước cũng được.
        </p>

        <div className={KHOI}>
          <h3 className="text-sm font-semibold text-zinc-200">
            Thẻ “Thuế suất” — soát 8% hay 10%
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Chọn file{" "}
            <strong className="text-zinc-200">Danh sách hàng hoá, dịch vụ</strong> rồi bấm{" "}
            <em>Soát thuế suất</em>. Hệ thống đối chiếu từng mã với quy định đang có hiệu
            lực và nói mã nào thuộc diện giảm còn 8%.
          </p>
          <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-200/90">
            Kết quả là <strong>đề xuất</strong>, không phải quyết định. Mã nào bảng tra
            không chắc thì nó nói thẳng là cần kế toán xác nhận. Trước khi sửa cờ thuế
            trong MISA, đọc phần căn cứ kèm theo và tự kiểm lại.
          </p>
        </div>

        <div className={KHOI}>
          <h3 className="text-sm font-semibold text-zinc-200">
            Thẻ “So hai kỳ” — tìm chứng từ bị sửa sau khi đã báo cáo
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Cần{" "}
            <strong className="text-zinc-200">
              hai file Tổng hợp Nhập Xuất Tồn của cùng một kỳ
            </strong>
            : cùng ngày bắt đầu, khác ngày kết thúc. Ví dụ bản xuất hồi tháng trước và
            bản xuất hôm nay, cùng bắt đầu từ 01/01.
          </p>
          <ol className="mt-3 space-y-3">
            <Buoc so={1}>
              Ô bên trái: bản xuất <strong className="text-zinc-200">CŨ</strong> hơn.
            </Buoc>
            <Buoc so={2}>
              Ô bên phải: bản xuất <strong className="text-zinc-200">MỚI</strong> hơn. Đặt
              nhầm thứ tự thì hệ thống từ chối so, chứ không so ngược.
            </Buoc>
            <Buoc so={3}>
              Bấm <em>So hai bản</em>, rồi nhìn ô{" "}
              <strong className="text-zinc-200">Dấu hiệu sửa hồi tố</strong>.
            </Buoc>
          </ol>
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">
            Số cộng dồn của một kỳ đã qua thì chỉ được phép <em>tăng</em>. Thấy nó{" "}
            <em>giảm</em> nghĩa là có chứng từ cũ bị sửa hoặc xoá sau khi kỳ đó đã lên báo
            cáo.
          </p>
          <p className="mt-3 rounded-xl bg-white/[0.03] p-3 text-xs leading-relaxed text-zinc-400">
            Đây là chênh lệch giữa hai lần xuất,{" "}
            <strong>không phải kết luận ai làm gì</strong>. Cách chặn tận gốc là khoá sổ
            theo tháng: chốt xong thì không sửa được chứng từ của kỳ đã báo cáo nữa.
          </p>
        </div>
      </section>

      <section className={KHOI}>
        <h2 className="text-sm font-semibold text-zinc-200">Đọc danh sách phát hiện</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Mỗi dòng có một nhãn màu. Danh sách xếp nặng trước, và trong cùng mức thì nhiều
          tiền trước.
        </p>
        <div className="mt-3 space-y-2">
          {MUC_DO.map(([muc, lop, y]) => (
            <p key={muc} className="flex flex-wrap items-center gap-3 text-sm">
              <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${lop}`}>
                {muc}
              </span>
              <span className="text-zinc-500">{y}</span>
            </p>
          ))}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          Mỗi phát hiện đều kèm <strong className="text-zinc-200">bằng chứng số</strong> —
          mã hàng, số lượng, số tiền — để kiểm lại trong MISA. Chỗ nào ghi{" "}
          <em>“chưa quy ra tiền được”</em> thì đúng nghĩa đen là chưa quy được, không phải
          bằng không.
        </p>
      </section>

      <section className="rounded-2xl border border-white/[0.10] bg-black/25 p-5">
        <h2 className="text-sm font-semibold text-zinc-200">Ba điều nên nhớ</h2>
        <ol className="mt-3 space-y-3 text-sm leading-relaxed text-zinc-400">
          <li>
            <strong className="text-zinc-200">Đây là đề xuất, không phải kết luận.</strong>{" "}
            Hệ thống chỉ chỗ đáng nhìn và đưa bằng chứng. Quyết định sửa hay không vẫn là
            của kế toán.
          </li>
          <li>
            <strong className="text-zinc-200">“Chưa biết” khác “bằng 0”.</strong> Chỗ nào
            thiếu dữ liệu thì nó để trống và nói rõ thiếu gì, chứ không điền số 0 vào cho
            đầy bảng.
          </li>
          <li>
            <strong className="text-zinc-200">File tải lên không được lưu lại.</strong> Đọc
            xong là bỏ, không ghi ra đĩa. Muốn xem lại thì tải lên lần nữa.
          </li>
        </ol>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-zinc-200">Gặp trục trặc</h2>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-500">
          <li>
            • <strong className="text-zinc-400">Báo lỗi khi tải file</strong> — kiểm xem có
            đúng file xuất từ MISA không, và có đuôi <code>.xlsx</code> không. File tự gõ
            tay hoặc đã sửa cột thì hệ thống không đọc được.
          </li>
          <li>
            • <strong className="text-zinc-400">Bấm nút mà không có gì xảy ra</strong> —
            nhìn góc dưới bên trái: chấm tròn không phải màu xanh thì phần AI đang tắt hoặc
            mất kết nối, báo lại bên kỹ thuật.
          </li>
          <li>
            • <strong className="text-zinc-400">Con số trông sai</strong> — đừng sửa gì
            trong MISA vội. Chụp màn hình gửi lại, kèm tên file đã tải lên.
          </li>
        </ul>
      </section>
    </div>
  );
}
