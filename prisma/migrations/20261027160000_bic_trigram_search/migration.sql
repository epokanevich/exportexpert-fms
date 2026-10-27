-- 4.4: поиск по подстроке номера на сервере. GIN-индекс pg_trgm ускоряет LIKE '%2918%' при тысячах единиц.
-- Расширение pg_trgm есть в PostgreSQL contrib (Neon, Supabase, RDS) — создаётся владельцем базы.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Container_bicCode_trgm_idx" ON "Container" USING GIN ("bicCode" gin_trgm_ops);
