"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { importContainersAction, type ImportResult } from "@/actions/containers";
import { buildImportTemplate, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from "@/lib/csv-import";
import { downloadCsv } from "@/lib/csv";

interface ImportSheetProps {
  open: boolean;
  onClose: () => void;
}

/** Импорт парка из CSV (Excel → «Сохранить как CSV»): сначала проверка, затем запись «всё или ничего». */
export function ImportSheet({ open, onClose }: ImportSheetProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setFileName("");
    setCsvText("");
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    reset();
    onClose();
  }

  async function handleFile(file: File | undefined) {
    setResult(null);
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setCsvText("");
      setFileName("");
      setResult({ ok: false, message: "Файл слишком большой — не более 1 МБ", total: 0, imported: 0, errors: [] });
      return;
    }
    const text = await file.text();
    setFileName(file.name);
    setCsvText(text);
    startTransition(async () => setResult(await importContainersAction(text, false)));
  }

  function commit() {
    startTransition(async () => {
      const done = await importContainersAction(csvText, true);
      setResult(done);
      if (done.ok) {
        toast.success(done.message);
        router.refresh();
        close();
      } else toast.error(done.message);
    });
  }

  const canCommit = result?.ok === true && result.imported === 0 && result.total > 0 && !isPending;

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Импорт парка из CSV"
      description={`Excel → «Сохранить как» → CSV (разделитель «;»). До ${MAX_IMPORT_ROWS} контейнеров за раз.`}
      size="lg"
      footer={
        <div className="flex gap-2">
          <Button variant="outline" size="lg" className="flex-1" onClick={close}>Отмена</Button>
          <Button size="lg" className="flex-1" disabled={!canCommit} onClick={commit}>
            {isPending ? "Подождите…" : result?.ok ? `Добавить ${result.total}` : "Добавить"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Скачайте шаблон и заполните его в Excel (строку-пример удалите).</li>
          <li>Загрузите файл: система проверит каждую строку теми же правилами, что и форма «Добавить» (ISO 6346, дубли, тара &lt; брутто).</li>
          <li>Если ошибок нет — нажмите «Добавить». Если есть — исправьте файл: частично данные не загружаются.</li>
        </ol>
        <Button variant="outline" className="h-11" onClick={() => downloadCsv("fms-import-template.csv", buildImportTemplate())}>
          <Download aria-hidden /> Скачать шаблон
        </Button>

        <div>
          <label htmlFor="import-file" className="mb-1 block text-sm font-medium text-slate-700">Файл CSV</label>
          <input
            ref={inputRef}
            id="import-file"
            name="import-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void handleFile(e.target.files?.[0])}
            className="block min-h-11 w-full cursor-pointer rounded-lg border border-slate-300 bg-white text-sm file:mr-3 file:h-11 file:cursor-pointer file:border-0 file:bg-slate-100 file:px-4 file:font-medium"
          />
          {fileName && <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><FileUp className="size-3.5" aria-hidden /> {fileName}</p>}
        </div>

        <div aria-live="polite">
          {isPending && !result && <p className="text-sm text-slate-600">Проверяем файл…</p>}
          {result && (
            <div className={result.ok ? "rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200" : "rounded-lg bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200"}>
              <p className="font-medium">{result.message}</p>
              {result.errors.length > 0 && (
                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto font-mono text-xs">
                  {result.errors.slice(0, 100).map((e, i) => (
                    <li key={`${e.line}-${i}`}>Строка {e.line}: {e.message}</li>
                  ))}
                  {result.errors.length > 100 && <li>… и ещё {result.errors.length - 100}</li>}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
