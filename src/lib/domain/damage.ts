/**
 * Повреждения в кодах CEDEX (ISO 9897) / IICL — простая модель без EDI (2.5).
 * Формат кодов проверяется строго (и в БД — CHECK), справочники ниже — подсказки для ввода
 * с распространёнными кодами; полный справочник CEDEX сверяется с M&R-подрядчиком перед боевой работой.
 */
import { z } from "@/lib/zod-setup";
import { formatUsd } from "@/lib/format";
import { sumMoney } from "@/lib/money";

export const DAMAGE_CODE_LABELS: Record<string, string> = {
  BR: "сломано",
  BT: "изогнуто",
  CK: "трещина",
  CO: "коррозия",
  CU: "порез",
  DT: "вмятина",
  HO: "пробоина",
  LO: "ослаблено",
  MS: "отсутствует",
  TR: "разрыв",
};

export const REPAIR_CODE_LABELS: Record<string, string> = {
  RP: "замена",
  PA: "заплата",
  SN: "правка",
  WW: "сварка",
  IT: "вставка",
};

/** Первая буква кода места CEDEX — сторона контейнера. */
export const LOCATION_FACE_LABELS: Record<string, string> = {
  F: "торцевая стенка",
  D: "двери",
  L: "левая стенка",
  R: "правая стенка",
  T: "крыша",
  B: "пол",
  U: "днище / рама",
  I: "внутри",
};

const optionalInt = z
  .union([z.literal("").transform(() => null), z.null(), z.coerce.number().int("Целое число").min(0, "Не меньше 0").max(10_000)])
  .optional()
  .transform((v) => v ?? null);

export const damageLineSchema = z.object({
  locationCode: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{3}$/, "Код места CEDEX: 4 символа, например LX2N"),
  component: z.string().trim().min(1, "Укажите узел").max(80, "Не более 80 символов"),
  damageCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Код повреждения: 2 буквы, например DT"),
  repairCode: z
    .union([z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Код ремонта: 2 буквы, например RP"), z.literal("").transform(() => null), z.null()])
    .optional()
    .transform((v) => v ?? null),
  lengthCm: optionalInt,
  widthCm: optionalInt,
  quantity: z.coerce.number().int("Целое число").min(1, "Минимум 1").max(100),
  costUsd: z
    .union([z.literal("").transform(() => null), z.null(), z.coerce.number().min(0, "Не может быть отрицательной").max(1_000_000)])
    .optional()
    .transform((v) => v ?? null),
});

export type DamageLine = z.output<typeof damageLineSchema>;
export type DamageLineInput = z.input<typeof damageLineSchema>;

/** Не более 50 строк в одном акте — защита от бесконечного массива. */
export const MAX_DAMAGE_LINES = 50;

export function eorFromDamages(lines: readonly { costUsd: number | null }[]): number | null {
  const costs = lines.map((l) => l.costUsd).filter((c): c is number => c !== null);
  return costs.length > 0 ? sumMoney(costs) : null;
}

export function describeDamage(line: DamageLine): string {
  const damage = DAMAGE_CODE_LABELS[line.damageCode] ? `${line.damageCode} (${DAMAGE_CODE_LABELS[line.damageCode]})` : line.damageCode;
  const size = line.lengthCm && line.widthCm ? ` ${line.lengthCm}×${line.widthCm} см` : "";
  const qty = line.quantity > 1 ? ` ×${line.quantity}` : "";
  const repair = line.repairCode ? ` → ${line.repairCode}${REPAIR_CODE_LABELS[line.repairCode] ? ` (${REPAIR_CODE_LABELS[line.repairCode]})` : ""}` : "";
  const cost = line.costUsd !== null ? `, ${formatUsd(line.costUsd)}` : "";
  return `${line.locationCode} ${line.component} — ${damage}${size}${qty}${repair}${cost}`;
}
