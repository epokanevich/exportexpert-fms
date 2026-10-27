/** Скелет экрана на время загрузки (холодный старт облачной БД может занимать секунды). */
export default function AppLoading() {
  return (
    <div role="status" aria-label="Загрузка" className="animate-pulse space-y-4 motion-reduce:animate-none">
      <div className="h-8 w-56 rounded-lg bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 rounded-xl bg-slate-200/70" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-slate-200/60" />
      <span className="sr-only">Загрузка…</span>
    </div>
  );
}
