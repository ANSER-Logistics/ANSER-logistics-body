import { NextResponse } from "next/server";
import { withErrorHandler } from "@/server/http";
import { requireSessionUser } from "@/server/session";
import { evaluateAlerts } from "@/server/store/automation";

export const GET = withErrorHandler(async () => {
  const { response } = await requireSessionUser();
  if (response) return response;

  const alerts = await evaluateAlerts();
  return NextResponse.json({ alerts });
});
