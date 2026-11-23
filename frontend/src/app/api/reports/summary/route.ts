import { NextResponse } from "next/server";
import { withErrorHandler } from "@/server/http";
import { requireAdminUser } from "@/server/session";
import { getReportSummary } from "@/server/reports";

export const GET = withErrorHandler(async () => {
  const { response } = await requireAdminUser();
  if (response) return response;

  const summary = await getReportSummary();
  return NextResponse.json(summary);
});
