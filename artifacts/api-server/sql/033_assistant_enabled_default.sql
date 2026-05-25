-- New users: Hey Videh on by default (existing rows unchanged).
ALTER TABLE users ALTER COLUMN assistant_enabled SET DEFAULT TRUE;
