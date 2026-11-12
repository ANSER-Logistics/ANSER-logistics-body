"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { EditIcon, PlusIcon, TrashIcon, XIcon } from "@/components/dashboard/icons";

type Employee = {
  id: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  hireDate: string | null;
  warehouseId: string | null;
  note: string | null;
};

type AccountUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: "staff" | "admin";
  employeeId: string | null;
};

type Warehouse = { id: string; name: string };

const ROLE_LABELS: Record<string, string> = { admin: "Admin", staff: "Nhân viên" };
const ROLE_STYLES: Record<string, string> = {
  admin: "bg-red-500/15 text-red-400",
  staff: "bg-white/10 text-zinc-300",
};

type EmployeeForm = {
  name: string;
  position: string;
  phone: string;
  email: string;
  hireDate: string;
  warehouseId: string;
  note: string;
};
const emptyEmployeeForm: EmployeeForm = {
  name: "",
  position: "",
  phone: "",
  email: "",
  hireDate: "",
  warehouseId: "",
  note: "",
};

type AccountForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  employeeId: string;
};
const emptyAccountForm: AccountForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "",
  role: "staff",
  employeeId: "",
};

export default function StaffPage() {
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [accounts, setAccounts] = useState<AccountUser[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [employeeForm, setEmployeeForm] = useState<EmployeeForm>(emptyEmployeeForm);
  const [employeeError, setEmployeeError] = useState<string | null>(null);
  const [savingEmployee, setSavingEmployee] = useState(false);

  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountForm, setAccountForm] = useState<AccountForm>(emptyAccountForm);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [empRes, userRes, whRes, meRes] = await Promise.all([
      fetch("/api/employees"),
      fetch("/api/users"),
      fetch("/api/warehouses"),
      fetch("/api/auth/me"),
    ]);

    if (empRes.status === 403 || userRes.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }

    const empData = await empRes.json();
    const userData = await userRes.json();
    const whData = await whRes.json();
    const meData = await meRes.json().catch(() => ({}));

    setEmployees(empData.employees ?? []);
    setAccounts(userData.users ?? []);
    setWarehouses(whData.warehouses ?? []);
    setCurrentUserId(meData.user?.id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(load, 0);
    return () => clearTimeout(timeout);
  }, [load]);

  function warehouseName(id: string | null) {
    return warehouses.find((w) => w.id === id)?.name;
  }

  function employeeName(id: string | null) {
    return employees.find((e) => e.id === id)?.name;
  }

  function openCreateEmployee() {
    setEditingEmployeeId(null);
    setEmployeeForm(emptyEmployeeForm);
    setEmployeeError(null);
    setEmployeeModalOpen(true);
  }

  function openEditEmployee(employee: Employee) {
    setEditingEmployeeId(employee.id);
    setEmployeeForm({
      name: employee.name,
      position: employee.position ?? "",
      phone: employee.phone ?? "",
      email: employee.email ?? "",
      hireDate: employee.hireDate ? employee.hireDate.slice(0, 10) : "",
      warehouseId: employee.warehouseId ?? "",
      note: employee.note ?? "",
    });
    setEmployeeError(null);
    setEmployeeModalOpen(true);
  }

  async function handleEmployeeSubmit(e: FormEvent) {
    e.preventDefault();
    setSavingEmployee(true);
    setEmployeeError(null);

    const payload = {
      name: employeeForm.name,
      position: employeeForm.position || undefined,
      phone: employeeForm.phone || undefined,
      email: employeeForm.email || undefined,
      hireDate: employeeForm.hireDate || undefined,
      warehouseId: employeeForm.warehouseId || undefined,
      note: employeeForm.note || undefined,
    };

    const res = await fetch(editingEmployeeId ? `/api/employees/${editingEmployeeId}` : "/api/employees", {
      method: editingEmployeeId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSavingEmployee(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setEmployeeError(data.message ?? "Có lỗi xảy ra.");
      return;
    }

    setEmployeeModalOpen(false);
    await load();
  }

  async function handleDeleteEmployee(id: string) {
    if (!confirm("Xoá nhân viên này?")) return;
    await fetch(`/api/employees/${id}`, { method: "DELETE" });
    await load();
  }

  function openCreateAccount() {
    setAccountForm(emptyAccountForm);
    setAccountError(null);
    setAccountModalOpen(true);
  }

  async function handleAccountSubmit(e: FormEvent) {
    e.preventDefault();
    setSavingAccount(true);
    setAccountError(null);

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: accountForm.firstName,
        lastName: accountForm.lastName,
        email: accountForm.email,
        phone: accountForm.phone || undefined,
        password: accountForm.password,
        role: accountForm.role,
        employeeId: accountForm.employeeId || undefined,
      }),
    });

    setSavingAccount(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAccountError(data.message ?? "Có lỗi xảy ra.");
      return;
    }

    setAccountModalOpen(false);
    await load();
  }

  async function handleDeleteAccount(id: string) {
    if (!confirm("Xoá tài khoản này?")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.message ?? "Không xoá được tài khoản.");
    }
    await load();
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Đang tải...</p>;
  }

  if (forbidden) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] px-6 py-16 text-center">
        <h3 className="text-sm font-semibold text-zinc-200">Không có quyền truy cập</h3>
        <p className="mt-1 max-w-sm text-xs text-zinc-500">Chỉ tài khoản Admin mới xem được trang Nhân sự.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Nhân sự</h1>
        <p className="mt-1 text-sm text-zinc-400">Hồ sơ nhân viên và tài khoản đăng nhập vào hệ thống.</p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">Nhân viên</h3>
          <button
            onClick={openCreateEmployee}
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black transition-transform hover:-translate-y-0.5"
          >
            <PlusIcon className="h-4 w-4" />
            Thêm nhân viên
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs text-zinc-500 uppercase">
                  <th className="px-5 py-3 font-medium">Tên</th>
                  <th className="px-5 py-3 font-medium">Chức vụ</th>
                  <th className="px-5 py-3 font-medium">Liên hệ</th>
                  <th className="px-5 py-3 font-medium">Kho</th>
                  <th className="px-5 py-3 font-medium">Ngày vào làm</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-zinc-500">
                      Chưa có nhân viên nào.
                    </td>
                  </tr>
                )}
                {employees.map((emp) => (
                  <tr key={emp.id} className="border-b border-white/[0.05] last:border-0">
                    <td className="px-5 py-3 font-medium">{emp.name}</td>
                    <td className="px-5 py-3 text-zinc-400">{emp.position || "—"}</td>
                    <td className="px-5 py-3 text-zinc-400">
                      {emp.phone || "—"}
                      {emp.email ? ` · ${emp.email}` : ""}
                    </td>
                    <td className="px-5 py-3 text-zinc-400">{warehouseName(emp.warehouseId) ?? "—"}</td>
                    <td className="px-5 py-3 text-zinc-400">
                      {emp.hireDate ? new Date(emp.hireDate).toLocaleDateString("vi-VN") : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditEmployee(emp)}
                          className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                          title="Sửa"
                        >
                          <EditIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteEmployee(emp.id)}
                          className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-400"
                          title="Xoá"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">Tài khoản đăng nhập</h3>
          <button
            onClick={openCreateAccount}
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black transition-transform hover:-translate-y-0.5"
          >
            <PlusIcon className="h-4 w-4" />
            Thêm tài khoản
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs text-zinc-500 uppercase">
                  <th className="px-5 py-3 font-medium">Tên</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Nhân viên liên kết</th>
                  <th className="px-5 py-3 font-medium">Vai trò</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => (
                  <tr key={acc.id} className="border-b border-white/[0.05] last:border-0">
                    <td className="px-5 py-3 font-medium">
                      {acc.firstName} {acc.lastName}
                      {acc.id === currentUserId && (
                        <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-400">Bạn</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-zinc-400">{acc.email}</td>
                    <td className="px-5 py-3 text-zinc-400">{employeeName(acc.employeeId) ?? "—"}</td>
                    <td className="px-5 py-3">
                      {acc.role === "admin" ? (
                        <span
                          title="Admin dành riêng cho đội ngũ ANSER, không đổi được ở đây."
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ROLE_STYLES.admin}`}
                        >
                          {ROLE_LABELS.admin}
                        </span>
                      ) : (
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ROLE_STYLES.staff}`}>
                          {ROLE_LABELS.staff}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => handleDeleteAccount(acc.id)}
                        disabled={acc.id === currentUserId}
                        className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                        title="Xoá"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {employeeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-zinc-950 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold">{editingEmployeeId ? "Sửa nhân viên" : "Thêm nhân viên"}</h2>
              <button
                onClick={() => setEmployeeModalOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:text-white"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEmployeeSubmit} className="flex flex-col gap-4">
              {employeeError && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{employeeError}</p>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Tên nhân viên</label>
                <input
                  required
                  value={employeeForm.name}
                  onChange={(e) => setEmployeeForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Chức vụ</label>
                  <input
                    value={employeeForm.position}
                    onChange={(e) => setEmployeeForm((f) => ({ ...f, position: e.target.value }))}
                    placeholder="VD: Lái xe, Thủ kho..."
                    className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Ngày vào làm</label>
                  <input
                    type="date"
                    value={employeeForm.hireDate}
                    onChange={(e) => setEmployeeForm((f) => ({ ...f, hireDate: e.target.value }))}
                    className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Số điện thoại</label>
                  <input
                    value={employeeForm.phone}
                    onChange={(e) => setEmployeeForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Email</label>
                  <input
                    type="email"
                    value={employeeForm.email}
                    onChange={(e) => setEmployeeForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Kho phụ trách (tuỳ chọn)</label>
                <select
                  value={employeeForm.warehouseId}
                  onChange={(e) => setEmployeeForm((f) => ({ ...f, warehouseId: e.target.value }))}
                  className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                >
                  <option value="">Không</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Ghi chú</label>
                <input
                  value={employeeForm.note}
                  onChange={(e) => setEmployeeForm((f) => ({ ...f, note: e.target.value }))}
                  className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                />
              </div>

              <button
                type="submit"
                disabled={savingEmployee}
                className="mt-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-60"
              >
                {savingEmployee ? "Đang lưu..." : editingEmployeeId ? "Lưu thay đổi" : "Tạo nhân viên"}
              </button>
            </form>
          </div>
        </div>
      )}

      {accountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-zinc-950 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold">Thêm tài khoản</h2>
              <button
                onClick={() => setAccountModalOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:text-white"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAccountSubmit} className="flex flex-col gap-4">
              {accountError && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{accountError}</p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Họ</label>
                  <input
                    required
                    value={accountForm.lastName}
                    onChange={(e) => setAccountForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Tên</label>
                  <input
                    required
                    value={accountForm.firstName}
                    onChange={(e) => setAccountForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Email</label>
                <input
                  required
                  type="email"
                  value={accountForm.email}
                  onChange={(e) => setAccountForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Số điện thoại</label>
                  <input
                    value={accountForm.phone}
                    onChange={(e) => setAccountForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Mật khẩu</label>
                  <input
                    required
                    type="password"
                    value={accountForm.password}
                    onChange={(e) => setAccountForm((f) => ({ ...f, password: e.target.value }))}
                    className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-400">
                    Gắn với nhân viên (tuỳ chọn)
                  </label>
                  <select
                    value={accountForm.employeeId}
                    onChange={(e) => setAccountForm((f) => ({ ...f, employeeId: e.target.value }))}
                    className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                  >
                    <option value="">Không</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingAccount}
                className="mt-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-60"
              >
                {savingAccount ? "Đang tạo..." : "Tạo tài khoản"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
