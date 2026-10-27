"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isDemoMode } from "@/lib/demo-mode";
import { seedDatabase } from "@/lib/seed/seed-database";
import { authorize, serverError } from "./helpers";
import type { ActionResult } from "./types";

export async function resetDemoDataAction(): Promise<ActionResult> {
  const auth = await authorize("demo:reset");
  if (!auth.ok) return { ok: false, error: "Сброс данных доступен только администратору" };
  // Сброс стирает всю базу — на боевом стенде (DEMO_MODE=false) он недоступен даже администратору.
  if (!isDemoMode()) return { ok: false, error: "Сброс демо-данных отключён: стенд работает не в демо-режиме" };
  try {
    const summary = await seedDatabase(prisma);
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `Демо-данные восстановлены: ${summary.containers} контейнеров, ${summary.oneWayTrips} One-Way, ${summary.leases} договоров`,
    };
  } catch (error) {
    return serverError("demo", error);
  }
}
