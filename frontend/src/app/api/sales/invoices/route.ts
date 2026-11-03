import { NextResponse } from "next/server";
import { getCustomerById } from "@/server/store/customers";
import { InsufficientStockError } from "@/server/store/inventory";
import { createInvoice, CrossWarehouseError, listInvoices, NoItemError, ProductNotFoundError } from "@/server/store/sales";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const invoices = await listInvoices({ limit: limitParam ? Number(limitParam) : undefined });
  return NextResponse.json({ invoices });
}

export async function POST(request: Request) {
  const { customerId, customerName, employeeId, note, items } = await request.json().catch(() => ({}));

  if ((!customerId && !customerName) || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ message: "Thiếu tên khách hàng hoặc danh sách sản phẩm." }, { status: 400 });
  }

  for (const item of items) {
    if (!item.productId || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
      return NextResponse.json({ message: "Danh sách sản phẩm không hợp lệ." }, { status: 400 });
    }
  }

  let resolvedCustomerName = customerName;
  if (customerId) {
    const customer = await getCustomerById(customerId);
    if (!customer) {
      return NextResponse.json({ message: "Không tìm thấy khách hàng." }, { status: 400 });
    }
    resolvedCustomerName = customer.name;
  }

  try {
    const invoice = await createInvoice({
      customerId: customerId || undefined,
      customerName: resolvedCustomerName,
      employeeId: employeeId || undefined,
      note: note || undefined,
      items: items.map((item: { productId: string; quantity: number }) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
      })),
    });
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    if (error instanceof ProductNotFoundError) {
      return NextResponse.json(
        { message: error.message },
        { status: 404 }
      )
    }
    if (error instanceof NoItemError) {
      return NextResponse.json(
        { message: error.message },
        { status: 400 }
      );
    }
    if (
      error instanceof InsufficientStockError ||
      error instanceof CrossWarehouseError
    ) {
      return NextResponse.json(
        { message: error.message },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { message: "Lỗi hệ thống" },
      { status: 500 }
    );
  }
}
