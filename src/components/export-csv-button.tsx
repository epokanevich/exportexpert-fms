"use client";

import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildCsv, csvFilename, downloadCsv, type CsvColumn } from "@/lib/csv";
import { cn } from "@/lib/utils";

interface ExportCsvButtonProps<T> {
  rows: readonly T[];
  columns: readonly CsvColumn<T>[];
  /** Префикс имени файла, например «fms-registry». */
  filePrefix: string;
  className?: string;
}

/** Выгрузка текущей (отфильтрованной) выборки в CSV для Excel. */
export function ExportCsvButton<T>({ rows, columns, filePrefix, className }: ExportCsvButtonProps<T>) {
  function handleExport() {
    if (rows.length === 0) {
      toast.info("Нет строк для выгрузки — измените фильтры");
      return;
    }
    downloadCsv(csvFilename(filePrefix), buildCsv(rows, columns));
    toast.success(`Выгружено строк: ${rows.length}`);
  }

  return (
    <Button variant="outline" className={cn("h-11 lg:h-10", className)} onClick={handleExport} title="Скачать текущую выборку в CSV (Excel)" aria-label="Выгрузить в Excel (CSV)">
      <FileSpreadsheet className="text-emerald-600" />
      <span className="hidden sm:inline">Excel / CSV</span>
    </Button>
  );
}
