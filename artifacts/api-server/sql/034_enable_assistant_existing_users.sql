-- Turn on Hey Videh for users still on the old default (assistant_enabled = false).
UPDATE users
SET assistant_enabled = TRUE, updated_at = NOW()
WHERE assistant_enabled = FALSE;
