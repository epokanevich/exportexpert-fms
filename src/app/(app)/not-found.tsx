import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/primitives";

export default function AppNotFound() {
  return (
    <Card>
      <EmptyState
        icon={<SearchX />}
        title="Запись не найдена"
        description="Контейнер, рейс или договор не существует — возможно, он списан или демо-данные были сброшены."
        action={
          <Link href="/containers" className={buttonClasses("outline")}>
            К реестру контейнеров
          </Link>
        }
      />
    </Card>
  );
}
