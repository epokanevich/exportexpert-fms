"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/primitives";

/** Ошибка сервера/БД внутри оболочки приложения — вместо англоязычной заглушки Next.js. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={<TriangleAlert />}
        title="Не удалось загрузить данные"
        description={`Возможно, база данных временно недоступна. Повторите попытку через несколько секунд.${error.digest ? ` Код ошибки: ${error.digest}.` : ""}`}
        action={
          <Button onClick={reset}>
            <RotateCcw aria-hidden /> Повторить
          </Button>
        }
      />
    </Card>
  );
}
