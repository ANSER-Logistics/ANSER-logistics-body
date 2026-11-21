// Ngày giờ theo giờ Việt Nam, KHÔNG theo giờ hệ thống của server.
//
// Vì sao: `setHours(0,0,0,0)`, `getDay()`, `setMonth()` đọc theo múi giờ của
// process. Server chạy UTC (Vercel, Docker mặc định) sẽ coi một đơn bán lúc
// 06:30 sáng giờ VN (= 23:30Z hôm trước) là của ngày hôm trước — sang cả tháng
// và quý trước nếu rơi vào ngày đầu tháng. `toISOString()` thì luôn là UTC.
//
// Việt Nam dùng UTC+7 cố định, không có giờ mùa hè, nên bù một khoảng mili-giây
// cố định là đủ đúng, không cần thư viện múi giờ.

export const DAY_MS = 24 * 60 * 60 * 1000;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Dịch sang "giờ VN đọc bằng hàm getUTC*" — chỉ dùng nội bộ để đọc ngày/tháng/thứ. */
function shiftToVn(d: Date): Date {
  return new Date(d.getTime() + VN_OFFSET_MS);
}

/** 00:00 giờ VN của ngày chứa `d`. */
export function vnStartOfDay(d: Date): Date {
  const shifted = shiftToVn(d);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - VN_OFFSET_MS);
}

/**
 * 00:00 giờ VN của ngày cách `d` đúng `months` tháng về trước (theo lịch VN).
 * Ngày không tồn tại thì tràn sang tháng sau, giống `Date#setMonth`
 * (31/03 lùi 1 tháng → 03/03).
 */
export function vnStartOfDayMonthsAgo(d: Date, months: number): Date {
  const shifted = shiftToVn(d);
  const utc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() - months, shifted.getUTCDate());
  return new Date(utc - VN_OFFSET_MS);
}

/** Thứ trong tuần theo giờ VN (0 = CN … 6 = T7). */
export function vnWeekday(d: Date): number {
  return shiftToVn(d).getUTCDay();
}

/** Ngày theo giờ VN dạng `YYYY-MM-DD`. */
export function vnIsoDate(d: Date): string {
  return shiftToVn(d).toISOString().slice(0, 10);
}

/** Ngày theo giờ VN dạng `dd/mm/yyyy` để hiển thị — không phụ thuộc múi giờ server. */
export function vnDisplayDate(d: Date): string {
  return d.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}
