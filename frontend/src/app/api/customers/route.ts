import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/server/http";
import { requireSessionUser } from "@/server/session";
import { createCustomer, listCustomers } from "@/server/store/customers";
import { triggerN8nWebhook } from "@/server/n8n";
import { optionalEmail, optionalPhone, optionalText, parseJsonBody, requiredText } from "@/server/validation";

const createCustomerSchema = z.object({
  name: requiredText("Thiếu tên khách hàng."),
  phone: optionalPhone(),
  email: optionalEmail(),
  address: optionalText("Địa chỉ"),
  note: optionalText("Ghi chú"),
});

export const GET = withErrorHandler(async (request: Request) => {
  const { response } = await requireSessionUser();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const customers = await listCustomers(search);
  return NextResponse.json({ customers });
});

export const POST = withErrorHandler(async (request: Request) => {
  const { response } = await requireSessionUser();
  if (response) return response;

  const { data, response: invalid } = await parseJsonBody(request, createCustomerSchema);
  if (invalid) return invalid;

  const customer = await createCustomer(data);

  // Fire-and-forget — n8n tắt/chưa cấu hình không được làm hỏng việc tạo khách hàng.
  void triggerN8nWebhook("new-customer", {
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    notify_email: process.env.N8N_NOTIFY_EMAIL,
  });

  return NextResponse.json({ customer }, { status: 201 });
});
