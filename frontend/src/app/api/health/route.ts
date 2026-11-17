import { NextResponse } from "next/server";
import { withErrorHandler } from "@/server/http";

export const GET = withErrorHandler(async () => {
  return NextResponse.json({ status: "ok" });
});
