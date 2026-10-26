"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/dal";
import { seedDatabase } from "@/lib/seed/seed-database";
import { serverError } from "./helpers";
import type { ActionResult } from "./types";

export async function resetDemoDataAction(): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "Сброс данных доступен только администратору" };
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
