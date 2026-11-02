import { NextResponse } from "next/server";
import { requireAdminUser, requireSessionUser } from "@/server/session";
import { getCompanySettings, updateCompanySettings } from "@/server/store/settings";

export async function GET() {
  const { response } = await requireSessionUser();
  if (response) return response;

  const settings = await getCompanySettings();
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  const { response } = await requireAdminUser();
  if (response) return response;

  const body = await request.json().catch(() => ({}));

  if (body.name !== undefined && !String(body.name).trim()) {
    return NextResponse.json({ message: "Tên doanh nghiệp không được để trống." }, { status: 400 });
  }

  if (body.currency !== undefined && !["VND", "USD"].includes(body.currency)) {
    return NextResponse.json({ message: "Đơn vị tiền tệ không hợp lệ." }, { status: 400 });
  }

  const settings = await updateCompanySettings({
    name: body.name !== undefined ? body.name : undefined,
    address: body.address !== undefined ? body.address || null : undefined,
    phone: body.phone !== undefined ? body.phone || null : undefined,
    email: body.email !== undefined ? body.email || null : undefined,
    taxCode: body.taxCode !== undefined ? body.taxCode || null : undefined,
    currency: body.currency,
  });
  return NextResponse.json({ settings });
}
