"use client";

import { useState } from "react";
import { XIcon } from "@/components/dashboard/icons";

type PublicUser = { firstName: string; lastName: string; email: string; phone: string | null };

export default function ProfileModal({
  user,
  onClose,
  onUpdated,
}: {
  user: PublicUser;
  onClose: () => void;
  onUpdated: (user: PublicUser) => void;
}) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  async function saveProfile() {
    setSavingProfile(true);
    setProfileError(null);
    setProfileSaved(false);

    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, phone: phone || null }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingProfile(false);

    if (!res.ok) {
      setProfileError(data.message ?? "Có lỗi xảy ra.");
      return;
    }
    setProfileSaved(true);
    onUpdated(data.user);
  }

  async function savePassword() {
    setPasswordError(null);
    setPasswordSaved(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("Xác nhận mật khẩu mới không khớp.");
      return;
    }

    setSavingPassword(true);
    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingPassword(false);

    if (!res.ok) {
      setPasswordError(data.message ?? "Có lỗi xảy ra.");
      return;
    }
    setPasswordSaved(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-zinc-950 p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold">Hồ sơ của tôi</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:text-white">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase">Thông tin cá nhân</h3>
          {profileError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{profileError}</p>}
          {profileSaved && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">Đã lưu.</p>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Họ</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Tên</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Email</label>
            <input
              disabled
              value={user.email}
              className="w-full cursor-not-allowed rounded-xl border border-white/[0.08] bg-black/10 px-3 py-2.5 text-sm text-zinc-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Số điện thoại</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
            />
          </div>

          <button
            onClick={saveProfile}
            disabled={savingProfile}
            className="self-start rounded-xl bg-white px-4 py-2 text-sm font-bold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            {savingProfile ? "Đang lưu..." : "Lưu thông tin"}
          </button>

          <hr className="border-white/[0.08]" />

          <h3 className="text-xs font-semibold text-zinc-400 uppercase">Đổi mật khẩu</h3>
          {passwordError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{passwordError}</p>}
          {passwordSaved && (
            <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">Đã đổi mật khẩu.</p>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Mật khẩu hiện tại</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Mật khẩu mới</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Xác nhận mật khẩu mới</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <button
            onClick={savePassword}
            disabled={savingPassword || !currentPassword || !newPassword}
            className="self-start rounded-xl bg-white px-4 py-2 text-sm font-bold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            {savingPassword ? "Đang đổi..." : "Đổi mật khẩu"}
          </button>
        </div>
      </div>
    </div>
  );
}
