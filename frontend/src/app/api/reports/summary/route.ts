import { NextResponse } from "next/server";
import { requireAdminUser } from "@/server/session";
import { getReportSummary } from "@/server/reports";

export async function GET() {
  const { response } = await requireAdminUser();
  if (response) return response;

  const summary = await getReportSummary();
  return NextResponse.json(summary);
}
