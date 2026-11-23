import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/server/auth";
import { withErrorHandler } from "@/server/http";

export const POST = withErrorHandler(async () => {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  return new NextResponse(null, { status: 204 });
});
