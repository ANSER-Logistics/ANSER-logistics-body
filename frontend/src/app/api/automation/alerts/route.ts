import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/session";
import { evaluateAlerts } from "@/server/store/automation";

export async function GET() {
  const { response } = await requireSessionUser();
  if (response) return response;

  const alerts = await evaluateAlerts();
  return NextResponse.json({ alerts });
}
