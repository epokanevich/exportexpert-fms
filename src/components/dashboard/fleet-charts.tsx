"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Link from "next/link";
import { OPERATIONAL_STATUS_LABELS, type OperationalStatus } from "@/lib/domain/constants";

export const STATUS_COLORS: Record<OperationalStatus, string> = {
  AVAILABLE: "#10b981",
  ONE_WAY: "#6366f1",
  LONG_TERM_LEASE: "#8b5cf6",
  IN_TRANSIT: "#0ea5e9",
  MAINTENANCE: "#f97316",
};

interface RegionChartProps {
  data: { region: string; units: number; teu: number }[];
}

export function RegionChart({ data }: RegionChartProps) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={4}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="region" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} interval={0} tickFormatter={(v: string) => (v.length > 10 ? `${v.slice(0, 9)}…` : v)} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
          <Tooltip
            cursor={{ fill: "#f1f5f9" }}
            contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 8px 24px -8px rgb(15 23 42 / .15)" }}
            formatter={(value, name) => [String(value), name === "units" ? "Единиц" : "TEU"]}
          />
          <Bar dataKey="units" name="units" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="teu" name="teu" fill="#c7d2fe" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface StatusChartProps {
  data: { status: OperationalStatus; units: number }[];
  total: number;
}

export function StatusChart({ data, total }: StatusChartProps) {
  const visible = data.filter((d) => d.units > 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
      <div className="relative size-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={visible} dataKey="units" nameKey="status" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="none" startAngle={90} endAngle={-270}>
              {visible.map((d) => (
                <Cell key={d.status} fill={STATUS_COLORS[d.status]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
              formatter={(value, _name, item) => [String(value), OPERATIONAL_STATUS_LABELS[(item.payload as { status: OperationalStatus }).status]]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-3xl font-semibold text-slate-900 tabular">{total}</span>
          <span className="text-xs text-slate-500">единиц</span>
        </div>
      </div>
      <ul className="w-full space-y-1.5">
        {data.map((d) => (
          <li key={d.status}>
            <Link href={`/containers?status=${d.status}`} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
              <span className="size-2.5 rounded-sm" style={{ background: STATUS_COLORS[d.status] }} aria-hidden />
              <span className="flex-1 text-slate-600">{OPERATIONAL_STATUS_LABELS[d.status]}</span>
              <span className="font-mono font-medium text-slate-900 tabular">{d.units}</span>
              <span className="w-10 text-right font-mono text-xs text-slate-500 tabular">{total ? Math.round((d.units / total) * 100) : 0}%</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
