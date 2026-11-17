"use client";

import { useCallback, useEffect, useState } from "react";
import { BoltIcon, ChartIcon, TrashIcon, UsersIcon, XIcon } from "@/components/dashboard/icons";
import type { AutomationRule } from "@/server/store/automation";
import type { Warehouse } from "@/server/store/warehouses";

const RULE_TYPE_META: Record<string, { icon: typeof BoltIcon; color: string }> = {
  low_stock_alert: { icon: BoltIcon, color: "bg-red-500/15 text-red-400" },
  sales_report_daily: { icon: ChartIcon, color: "bg-violet-500/15 text-violet-400" },
  sales_report_weekly: { icon: ChartIcon, color: "bg-violet-500/15 text-violet-400" },
  sales_report_monthly: { icon: ChartIcon, color: "bg-violet-500/15 text-violet-400" },
  customer_welcome: { icon: UsersIcon, color: "bg-emerald-500/15 text-emerald-400" },
};

const SCHEDULE_REPORT_TYPES = new Set(["sales_report_daily", "sales_report_weekly", "sales_report_monthly"]);
const WEEKDAY_LABELS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

const WORKFLOW_TEMPLATES = [
  {
    type: "low_stock_alert",
    name: "Cảnh báo tồn kho thấp",
    trigger: "Lịch — mỗi 6 giờ",
    description: "Đối chiếu quy tắc đang bật ở dưới với tồn kho thật, gửi email khi có sản phẩm dưới ngưỡng.",
  },
  {
    type: "sales_report_daily",
    name: "Báo cáo doanh số hàng ngày",
    trigger: "Lịch — mỗi ngày",
    description: "Tổng hợp doanh thu và top sản phẩm bán chạy trong ngày, gửi email cho từng kho.",
  },
  {
    type: "sales_report_weekly",
    name: "Báo cáo doanh số hàng tuần",
    trigger: "Lịch — mỗi tuần",
    description: "Tổng hợp doanh thu và top sản phẩm bán chạy trong tuần, gửi email cho từng kho.",
  },
  {
    type: "sales_report_monthly",
    name: "Báo cáo doanh số hàng tháng",
    trigger: "Lịch — mỗi tháng",
    description: "Tổng hợp doanh thu và top sản phẩm bán chạy trong tháng, gửi email cho từng kho.",
  },
  {
    type: "customer_welcome",
    name: "Chào mừng khách hàng mới",
    trigger: "Tự động — khi tạo khách hàng",
    description: "Tự động gửi email chào mừng ngay khi có khách hàng mới ở trang Khách hàng.",
  },
];

function ruleTypeMeta(type: string) {
  return RULE_TYPE_META[type] ?? RULE_TYPE_META.low_stock_alert;
}

type N8nExecutionSummary = {
  id: string | number;
  status: string;
  mode?: string;
  startedAt?: string;
  stoppedAt?: string | null;
};

function timeAgo(dateInput: string | Date) {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "vừa xong";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

export default function AutomationPage() {
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [n8nStatus, setN8nStatus] = useState<"checking" | "connected" | "offline" | "unconfigured">("checking");
  const [showTemplates, setShowTemplates] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [historyRule, setHistoryRule] = useState<AutomationRule | null>(null);
  const [historyExecutions, setHistoryExecutions] = useState<N8nExecutionSummary[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [scheduleHour, setScheduleHour] = useState(20);
  const [scheduleDay, setScheduleDay] = useState(1);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const load = useCallback(async () => {
    const [rulesRes, warehousesRes, categoriesRes] = await Promise.all([
      fetch("/api/automation/rules"),
      fetch("/api/warehouses"),
      fetch("/api/categories"),
    ]);
    const rulesData = await rulesRes.json();
    const warehousesData = await warehousesRes.json();
    const categoriesData = await categoriesRes.json();
    setRules(rulesData.rules ?? []);
    setWarehouses(warehousesData.warehouses ?? []);
    setCategories(categoriesData.categories ?? []);
  }, []);

  const checkN8nStatus = useCallback(async () => {
    setN8nStatus("checking");
    const res = await fetch("/api/n8n/status");
    const data = await res.json();
    if (!data.configured) setN8nStatus("unconfigured");
    else setN8nStatus(data.connected ? "connected" : "offline");
  }, []);

  useEffect(() => {
    const timeout = setTimeout(load, 0);
    return () => clearTimeout(timeout);
  }, [load]);

  useEffect(() => {
    const timeout = setTimeout(checkN8nStatus, 0);
    return () => clearTimeout(timeout);
  }, [checkN8nStatus]);

  function refreshAll() {
    load();
    checkN8nStatus();
  }

  function warehouseName(id: string | null) {
    return warehouses.find((w) => w.id === id)?.name;
  }

  function categoryName(id: string | null) {
    return categories.find((c) => c.id === id)?.name;
  }

  async function toggleRule(rule: AutomationRule) {
    const res = await fetch(`/api/automation/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    if (!res.ok) {
      showToast("Chưa chạy được, thử lại sau.");
      return;
    }
    await load();
  }

  async function runRule(rule: AutomationRule) {
    const res = await fetch(`/api/automation/rules/${rule.id}/run`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    showToast(data.message ?? (res.ok ? "Đã chạy." : "Chưa chạy được, thử lại sau."));
    await load();
  }

  async function saveSchedule(rule: AutomationRule) {
    setSavingSchedule(true);
    const res = await fetch(`/api/automation/rules/${rule.id}/schedule`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hour: scheduleHour,
        day: rule.type === "sales_report_daily" ? undefined : scheduleDay,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingSchedule(false);
    showToast(data.message ?? (res.ok ? "Đã lưu." : "Không lưu được lịch chạy."));
    if (res.ok) setEditingScheduleId(null);
  }

  async function showHistory(rule: AutomationRule) {
    setHistoryRule(rule);
    setHistoryExecutions(null);
    setHistoryError(null);
    if (!rule.n8nWorkflowId) {
      setHistoryError("Quy tắc này chưa có lịch sử — chỉ áp dụng cho quy tắc thêm từ Templates.");
      return;
    }
    setHistoryLoading(true);
    const res = await fetch(`/api/automation/rules/${rule.id}/executions`);
    const data = await res.json().catch(() => ({}));
    setHistoryLoading(false);
    if (!res.ok) {
      setHistoryError(data.message ?? "Không lấy được lịch sử.");
      return;
    }
    setHistoryExecutions(data.executions ?? []);
  }

  async function deleteRule(id: string) {
    if (!confirm("Xoá quy tắc này?")) return;
    await fetch(`/api/automation/rules/${id}`, { method: "DELETE" });
    await load();
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }

  async function deployTemplate(template: (typeof WORKFLOW_TEMPLATES)[number]) {
    const existing = rules.find((r) => r.type === template.type);
    if (existing) {
      showToast(`"${template.name}" đã có trong Quy tắc.`);
      return;
    }

    const res = await fetch("/api/automation/rules/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: template.type }),
    });

    if (!res.ok) {
      showToast(`Không thêm được "${template.name}".`);
      return;
    }

    showToast(`Đã thêm "${template.name}" vào Quy tắc.`);
    await load();
  }

  const statusStyles: Record<typeof n8nStatus, string> = {
    checking: "bg-white/[0.06] text-zinc-400",
    connected: "bg-emerald-500/15 text-emerald-400",
    offline: "bg-red-500/15 text-red-400",
    unconfigured: "bg-amber-500/15 text-amber-400",
  };
  const statusDot: Record<typeof n8nStatus, string> = {
    checking: "bg-zinc-500",
    connected: "bg-emerald-400",
    offline: "bg-red-400",
    unconfigured: "bg-amber-400",
  };
  const statusText: Record<typeof n8nStatus, string> = {
    checking: "Đang kiểm tra...",
    connected: "Tự động hoá đang hoạt động",
    offline: "Tự động hoá ngoại tuyến",
    unconfigured: "Tự động hoá chưa thiết lập",
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
        Trang chủ <span className="mx-1.5">›</span> <span className="text-zinc-300">Tự động hoá</span>
      </div>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold">Tự động hoá</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[n8nStatus]}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot[n8nStatus]}`} />
              {statusText[n8nStatus]}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowTemplates((s) => !s)}
            className="flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-white/[0.09]"
          >
            Templates
          </button>
          <button
            onClick={refreshAll}
            className="flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-white/[0.09]"
          >
            Refresh
          </button>
        </div>
      </div>

      {showTemplates && (
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.04] p-5">
          <p className="mb-4 text-xs font-semibold text-sky-400">Chọn mẫu có sẵn để thêm nhanh vào Quy tắc bên dưới.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {WORKFLOW_TEMPLATES.map((t) => {
              const meta = ruleTypeMeta(t.type);
              const Icon = meta.icon;
              const deployedRule = rules.find((r) => r.type === t.type);
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => deployTemplate(t)}
                  className="flex flex-col items-start rounded-xl border border-white/[0.08] bg-black/30 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg"
                >
                  <div className="mb-2 flex w-full items-center justify-between">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${meta.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    {deployedRule && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        Đã thêm
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-zinc-100">{t.name}</p>
                  <p className="mt-1 text-[11px] font-medium text-zinc-400">{t.trigger}</p>
                  <p className="mt-2 text-xs text-zinc-500">{t.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-4 text-sm font-semibold text-zinc-200">Quy tắc</h3>
        {rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] px-6 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.05] text-zinc-500">
              <BoltIcon className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-zinc-200">Chưa có quy tắc nào</h3>
            <p className="mt-1 max-w-sm text-xs text-zinc-500">Chọn mẫu có sẵn trong Templates để bắt đầu.</p>
            <button
              onClick={() => setShowTemplates(true)}
              className="mt-4 flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black transition-transform hover:-translate-y-0.5"
            >
              Xem Templates
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rules.map((rule) => {
              const meta = ruleTypeMeta(rule.type);
              const Icon = meta.icon;
              return (
                <div
                  key={rule.id}
                  className="flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 transition-colors hover:border-white/20"
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-zinc-100">{rule.name}</p>
                        <button
                          onClick={() => toggleRule(rule)}
                          title={rule.enabled ? "Bấm để tắt" : "Bấm để bật"}
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                            rule.enabled
                              ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                              : "bg-white/10 text-zinc-400 hover:bg-white/20"
                          }`}
                        >
                          {rule.enabled ? "Đang bật" : "Đã tắt"}
                        </button>
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-500">Tạo {timeAgo(rule.createdAt)}</p>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-zinc-500">
                    {rule.type === "low_stock_alert" ? (
                      <>
                        Ngưỡng tồn kho &lt; {rule.thresholdQty ?? 20}
                        {rule.categoryId
                          ? ` · ${categoryName(rule.categoryId) ?? "Danh mục đã xoá"}`
                          : " · Mọi danh mục"}
                        {rule.warehouseId ? ` · ${warehouseName(rule.warehouseId) ?? "Kho đã xoá"}` : " · Mọi kho"}
                      </>
                    ) : (
                      (WORKFLOW_TEMPLATES.find((t) => t.type === rule.type)?.description ?? "Tự động chạy theo lịch.")
                    )}
                  </p>

                  {SCHEDULE_REPORT_TYPES.has(rule.type) && (
                    <div className="mt-2 text-[11px]">
                      {editingScheduleId === rule.id ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {rule.type !== "sales_report_daily" && (
                            <select
                              value={scheduleDay}
                              onChange={(e) => setScheduleDay(Number(e.target.value))}
                              className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[11px] outline-none focus:border-sky-500"
                            >
                              {(rule.type === "sales_report_weekly"
                                ? WEEKDAY_LABELS.map((label, idx) => ({ value: idx, label }))
                                : Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `Ngày ${i + 1}` }))
                              ).map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          )}
                          <select
                            value={scheduleHour}
                            onChange={(e) => setScheduleHour(Number(e.target.value))}
                            className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[11px] outline-none focus:border-sky-500"
                          >
                            {Array.from({ length: 24 }, (_, h) => (
                              <option key={h} value={h}>
                                {h}:00
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => saveSchedule(rule)}
                            disabled={savingSchedule}
                            className="font-semibold text-emerald-400 hover:underline disabled:opacity-60"
                          >
                            Lưu
                          </button>
                          <button onClick={() => setEditingScheduleId(null)} className="text-zinc-500 hover:underline">
                            Huỷ
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingScheduleId(rule.id);
                            setScheduleHour(20);
                            setScheduleDay(rule.type === "sales_report_weekly" ? 1 : 1);
                          }}
                          className="font-semibold text-sky-400 hover:underline"
                        >
                          Đặt giờ chạy
                        </button>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-3">
                    <button
                      onClick={() => runRule(rule)}
                      className="flex-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black transition-colors hover:bg-amber-400"
                    >
                      ▶ Chạy
                    </button>
                    <button
                      onClick={() => showHistory(rule)}
                      className="rounded-lg bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/[0.09]"
                    >
                      Lịch sử
                    </button>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-400"
                      title="Xoá"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {historyRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-zinc-950 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Lịch sử chạy — {historyRule.name}</h2>
              <button onClick={() => setHistoryRule(null)} className="rounded-lg p-1 text-zinc-400 hover:text-white">
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            {historyLoading && <p className="text-sm text-zinc-500">Đang tải...</p>}
            {historyError && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">{historyError}</p>
            )}
            {historyExecutions && historyExecutions.length === 0 && (
              <p className="text-sm text-zinc-500">Chưa có lần chạy nào.</p>
            )}
            {historyExecutions && historyExecutions.length > 0 && (
              <div className="flex flex-col gap-2">
                {historyExecutions.map((ex) => (
                  <div
                    key={ex.id}
                    className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs"
                  >
                    <span
                      className={
                        ex.status === "success"
                          ? "font-semibold text-emerald-400"
                          : ex.status === "error"
                            ? "font-semibold text-red-400"
                            : "font-semibold text-zinc-400"
                      }
                    >
                      {ex.status === "success"
                        ? "Thành công"
                        : ex.status === "error"
                          ? "Lỗi"
                          : ex.status === "running"
                            ? "Đang chạy"
                            : ex.status}
                    </span>
                    <span className="text-zinc-500">{ex.startedAt ? timeAgo(ex.startedAt) : "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed right-6 bottom-6 z-50 max-w-xs rounded-xl border border-white/[0.08] bg-zinc-900 px-4 py-3 text-sm text-zinc-200 shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
