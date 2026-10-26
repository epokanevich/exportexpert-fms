"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/actions/types";

/** Вызов Server Action с тостами, флагом ожидания и ошибками полей. */
export function useServerAction() {
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function run(action: () => Promise<ActionResult>, onSuccess?: (result: Extract<ActionResult, { ok: true }>) => void) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          setFieldErrors({});
          toast.success(result.message);
          onSuccess?.(result);
        } else {
          setFieldErrors(result.fieldErrors ?? {});
          toast.error(result.error);
        }
      } catch (error) {
        // redirect() из requireSession (истёкшая сессия) пробрасываем — его обрабатывает Next.
        unstable_rethrow(error);
        toast.error("Сервер недоступен или произошла ошибка. Повторите попытку.");
      }
    });
  }

  return { run, isPending, fieldErrors, setFieldErrors };
}
