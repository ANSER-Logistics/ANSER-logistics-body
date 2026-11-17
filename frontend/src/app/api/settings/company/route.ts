import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/server/http";
import { requireAdminUser, requireSessionUser } from "@/server/session";
import { getCompanySettings, updateCompanySettings } from "@/server/store/settings";
import { nullableEmail, nullablePhone, nullableText, parseJsonBody, requiredText } from "@/server/validation";

const patchCompanySchema = z.object({
  name: requiredText("Tên doanh nghiệp không được để trống.").optional(),
  address: nullableText("Địa chỉ"),
  phone: nullablePhone(),
  email: nullableEmail(),
  taxCode: nullableText("Mã số thuế"),
  currency: z.enum(["VND", "USD"], { error: "Đơn vị tiền tệ không hợp lệ." }).optional(),
});

export const GET = withErrorHandler(async () => {
  const { response } = await requireSessionUser();
  if (response) return response;

  const settings = await getCompanySettings();
  return NextResponse.json({ settings });
});

export const PATCH = withErrorHandler(async (request: Request) => {
  const { response } = await requireAdminUser();
  if (response) return response;

  const { data: body, response: invalid } = await parseJsonBody(request, patchCompanySchema);
  if (invalid) return invalid;

  const settings = await updateCompanySettings({
    name: body.name !== undefined ? body.name : undefined,
    address: body.address !== undefined ? body.address || null : undefined,
    phone: body.phone !== undefined ? body.phone || null : undefined,
    email: body.email !== undefined ? body.email || null : undefined,
    taxCode: body.taxCode !== undefined ? body.taxCode || null : undefined,
    currency: body.currency,
  });
  return NextResponse.json({ settings });
});
