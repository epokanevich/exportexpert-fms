export type ActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
