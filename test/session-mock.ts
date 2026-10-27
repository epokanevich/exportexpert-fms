/** Подмена сессии для интеграционных тестов экшенов: authorize() читает пользователя из настоящей БД по userId. */
export const currentSession = { userId: "", email: "", name: "", role: "ADMIN", tokenVersion: 0 };

export function actAsUser(user: { id: string; email: string; name: string; role: string; tokenVersion?: number }): void {
  Object.assign(currentSession, { userId: user.id, email: user.email, name: user.name, role: user.role, tokenVersion: user.tokenVersion ?? 0 });
}
