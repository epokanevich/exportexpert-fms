/** Параметры реестра в URL (4.4): фильтры, сортировка, страница — общие для сервера и клиента. */
import { CONDITION_GRADES, OPERATIONAL_STATUSES, SIZE_TYPES, TECH_STATUSES, isOneOf } from "@/lib/domain/constants";
import { normalizeBic } from "@/lib/iso6346";

export const REGISTRY_PAGE_SIZE = 50;

export const SORT_KEYS = ["bicCode", "sizeType", "operationalStatus", "currentLocode", "csc", "idle", "roi"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface RegistryQuery {
  /** Подстрока номера без пробелов и дефисов, верхний регистр. */
  q: string;
  locode: string;
  size: string;
  status: string;
  grade: string;
  tech: string;
  attention: boolean;
  sort: SortKey;
  dir: "asc" | "desc";
  page: number;
}

export const DEFAULT_REGISTRY_QUERY: RegistryQuery = {
  q: "",
  locode: "",
  size: "",
  status: "",
  grade: "",
  tech: "",
  attention: false,
  sort: "bicCode",
  dir: "asc",
  page: 1,
};

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function get(params: Params, key: string): string {
  if (params instanceof URLSearchParams) return params.get(key) ?? "";
  const v = params[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** Разбор и проверка параметров: неизвестные значения отбрасываются, номер нормализуется. */
export function parseRegistryQuery(params: Params): RegistryQuery {
  const q = normalizeBic(get(params, "q")).replace(/[^A-Z0-9]/g, "").slice(0, 11);
  const locode = get(params, "locode").toUpperCase();
  const size = get(params, "size");
  const status = get(params, "status");
  const grade = get(params, "grade");
  const tech = get(params, "tech");
  const sort = get(params, "sort");
  const page = Number.parseInt(get(params, "page"), 10);
  return {
    q,
    locode: /^[A-Z]{2}[A-Z2-9]{3}$/.test(locode) ? locode : "",
    size: isOneOf(SIZE_TYPES, size) ? size : "",
    status: isOneOf(OPERATIONAL_STATUSES, status) ? status : "",
    grade: isOneOf(CONDITION_GRADES, grade) ? grade : "",
    tech: isOneOf(TECH_STATUSES, tech) ? tech : "",
    attention: get(params, "attention") === "1",
    sort: isOneOf(SORT_KEYS, sort) ? sort : "bicCode",
    dir: get(params, "dir") === "desc" ? "desc" : "asc",
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

/** Обратно в строку URL: пустые и значения по умолчанию не пишутся. */
export function registryQueryString(query: Partial<RegistryQuery>): string {
  const merged = { ...DEFAULT_REGISTRY_QUERY, ...query };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  for (const key of ["locode", "size", "status", "grade", "tech"] as const) if (merged[key]) params.set(key, merged[key]);
  if (merged.attention) params.set("attention", "1");
  if (merged.sort !== "bicCode") params.set("sort", merged.sort);
  if (merged.dir !== "asc") params.set("dir", merged.dir);
  if (merged.page > 1) params.set("page", String(merged.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}
