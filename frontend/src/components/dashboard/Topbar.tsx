"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellIcon, ChevronDownIcon, SearchIcon } from "@/components/dashboard/icons";
import ProfileModal from "@/components/dashboard/ProfileModal";

type PublicUser = { firstName: string; lastName: string; email: string; phone: string | null };

export default function Topbar() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return;
    const data = await res.json();
    setUser(data.user);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(load, 0);
    return () => clearTimeout(timeout);
  }, [load]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const initial = user ? user.firstName.charAt(0).toUpperCase() : "?";
  const fullName = user ? `${user.firstName} ${user.lastName}` : "Đang tải...";

  return (
    <>
      <header className="relative flex items-center justify-between gap-4 border-b border-white/[0.08] bg-[#030305]/70 px-6 py-4 backdrop-blur-xl">
        <div className="relative hidden max-w-xs flex-1 sm:block">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Tìm kiếm..."
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-sky-500"
          />
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            className="relative rounded-full p-2 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <BellIcon className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-white/[0.06]"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-sky-500 text-sm font-bold">
                {initial}
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-sm font-semibold">{fullName}</p>
                <p className="text-xs text-zinc-500">Quản trị viên</p>
              </div>
              <ChevronDownIcon className="h-4 w-4 text-zinc-500" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-50 mt-2 w-48 rounded-xl border border-white/[0.08] bg-zinc-950 p-1.5 shadow-xl">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setProfileOpen(true);
                    }}
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                  >
                    Hồ sơ của tôi
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
                  >
                    Đăng xuất
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {profileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onUpdated={(u) => setUser(u)} />
      )}
    </>
  );
}
