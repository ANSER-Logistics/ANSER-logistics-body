import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/session";
import { listCategories } from "@/server/store/categories";

export async function GET() {
  const { response } = await requireSessionUser();
  if (response) return response;

  const categories = await listCategories();
  return NextResponse.json({ categories });
}
