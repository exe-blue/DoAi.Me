-- app_users: Auth0 user sync for created_by tracking
CREATE TABLE IF NOT EXISTS app_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth0_sub     TEXT UNIQUE NOT NULL,
  email         TEXT,
  name          TEXT,
  picture       TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_users_auth0_sub ON app_users(auth0_sub);

-- Note: tasks.created_by may be TEXT in some schemas; FK omitted for type compatibility.
-- Application stores app_users.id (UUID) in created_by. Add FK after ALTER COLUMN if desired.
