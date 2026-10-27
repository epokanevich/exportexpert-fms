/** Политика паролей (3.3). bcrypt учитывает только первые 72 байта — длиннее не принимаем. */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 72;
export const BCRYPT_COST = 12;

/** Пароли, опубликованные в README демо-стенда, и очевидные варианты. */
const BANNED = new Set(["export2026!", "password123", "qwerty12345", "1234567890", "admin12345"]);

export function passwordProblem(password: string, ctx: { email: string; currentPassword?: string }): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Пароль — не короче ${MIN_PASSWORD_LENGTH} символов`;
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_LENGTH) return `Пароль — не длиннее ${MAX_PASSWORD_LENGTH} байт`;
  if (password.toLowerCase() === ctx.email.toLowerCase()) return "Пароль не должен совпадать с email";
  if (ctx.currentPassword !== undefined && password === ctx.currentPassword) return "Новый пароль совпадает с текущим";
  if (new Set(password).size < 4) return "Слишком простой пароль: используйте разные символы";
  if (BANNED.has(password.toLowerCase())) return "Этот пароль опубликован или слишком распространён — выберите другой";
  return null;
}
