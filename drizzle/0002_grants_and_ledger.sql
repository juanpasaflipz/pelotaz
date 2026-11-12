-- Privileges for the request-scoped role. Granted table by table on purpose:
-- a new table is unreachable from tenant code until a migration says otherwise.
GRANT USAGE ON SCHEMA public TO app_tenant;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON
  memberships, brands, brand_dna, crawl_pages, connections, plans,
  content_items, assets, drafts, publications, metrics_daily, suggestions, jobs
TO app_tenant;
--> statement-breakpoint
-- A tenant can read its own account row but not change plan or balance.
GRANT SELECT ON tenants TO app_tenant;
--> statement-breakpoint
-- The ledger is append-only for tenant code.
GRANT SELECT, INSERT ON credit_ledger TO app_tenant;
--> statement-breakpoint
-- Keep tenants.credit_balance equal to the ledger sum. SECURITY DEFINER lets
-- the trigger update a column the inserting role cannot write. Combined with
-- the non-negative CHECK on tenants, an overdrawing debit aborts its whole
-- transaction.
CREATE FUNCTION apply_credit_ledger() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tenants
     SET credit_balance = credit_balance + NEW.amount
   WHERE id = NEW.tenant_id;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER credit_ledger_apply
AFTER INSERT ON credit_ledger
FOR EACH ROW EXECUTE FUNCTION apply_credit_ledger();
