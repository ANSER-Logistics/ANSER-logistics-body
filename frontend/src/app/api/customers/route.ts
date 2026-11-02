import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/session";
import { createCustomer, listCustomers } from "@/server/store/customers";
import { triggerN8nWebhook } from "@/server/n8n";

export async function GET(request: Request) {
  const { response } = await requireSessionUser();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const customers = await listCustomers(search);
  return NextResponse.json({ customers });
}

export async function POST(request: Request) {
  const { response } = await requireSessionUser();
  if (response) return response;

  const { name, phone, email, address, note } = await request.json().catch(() => ({}));

  if (!name) {
    return NextResponse.json({ message: "Thiếu tên khách hàng." }, { status: 400 });
  }

  const customer = await createCustomer({ name, phone, email, address, note });

  // Fire-and-forget — n8n tắt/chưa cấu hình không được làm hỏng việc tạo khách hàng.
  void triggerN8nWebhook("new-customer", {
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    notify_email: process.env.N8N_NOTIFY_EMAIL,
  });

  return NextResponse.json({ customer }, { status: 201 });
}
