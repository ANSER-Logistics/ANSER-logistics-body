import { NextResponse } from "next/server";
import { withErrorHandler } from "@/server/http";
import { requireSessionUser } from "@/server/session";
import { listCategories } from "@/server/store/categories";

export const GET = withErrorHandler(async () => {
  const { response } = await requireSessionUser();
  if (response) return response;

  const categories = await listCategories();
  return NextResponse.json({ categories });
});
