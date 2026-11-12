-- Roles are cluster-wide, so this has to survive being run against a second
-- database (or Neon branch) in the same cluster.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
-- The connecting role must be able to `SET LOCAL ROLE app_tenant`. If the
-- application connects as a different role than the one running migrations,
-- run `GRANT app_tenant TO <runtime_role>` once for that role as well.
GRANT app_tenant TO CURRENT_USER;
