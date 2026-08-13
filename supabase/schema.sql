-- ============================================================
-- CAPPADOCIA REALESTATE S.C. — UNIFIED STORE MANAGEMENT SYSTEM
-- Supabase PostgreSQL Schema
-- ============================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE company_name AS ENUM ('Cappadocia', 'Addisu Habte', 'Vila Verde');

CREATE TYPE site_name AS ENUM (
  'Friendship Site', 'Lideta Site', 'JFK Site',
  '4 Kilo Site', 'Bole Site', 'Summit Site',
  'Meskel Flower Site', 'Senga Tera Site'
);

CREATE TYPE user_role AS ENUM (
  'storekeeper', 'engineer', 'purchaser', 'whole_manager',
  'payer', 'finance', 'ceo', 'subcontractor', 'foreman'
);

CREATE TYPE po_status AS ENUM (
  'draft', 'pending_ceo',
  'pending_payer', 'pending_finance', 'money_released',
  'shipped', 'blocked_mismatch', 'completed'
);

CREATE TYPE transfer_status AS ENUM (
  'pending_whole_manager', 'pending_finance', 'returned_back', 'completed'
);

CREATE TYPE transfer_type AS ENUM ('intra', 'inter');

CREATE TYPE wastage_status AS ENUM ('pending', 'reviewed');

CREATE TYPE material_request_status AS ENUM (
  'pending_engineer', 'pending_foreman', 'approved_instock',
  'ordered'
);

CREATE TYPE inventory_source AS ENUM ('received', 'bought');

-- ============================================================
-- CORE LOOKUP TABLES
-- ============================================================

-- Sites and their parent companies
CREATE TABLE sites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        site_name UNIQUE NOT NULL,
  company     company_name NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO sites (name, company) VALUES
  ('Friendship Site',   'Cappadocia'),
  ('Lideta Site',       'Cappadocia'),
  ('JFK Site',          'Cappadocia'),
  ('4 Kilo Site',       'Addisu Habte'),
  ('Bole Site',         'Addisu Habte'),
  ('Summit Site',       'Addisu Habte'),
  ('Meskel Flower Site','Vila Verde'),
  ('Senga Tera Site',   'Vila Verde');

-- ============================================================
-- USER PROFILES (extends Supabase auth.users)
-- ============================================================

CREATE TABLE user_profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     TEXT UNIQUE NOT NULL,        -- e.g. SK1, FIN1
  role         user_role NOT NULL,
  site_id      UUID REFERENCES sites(id),   -- NULL for central roles
  company      company_name,               -- for finance desks
  name_am      TEXT NOT NULL,              -- Amharic display name
  name_en      TEXT NOT NULL,              -- English display name
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVENTORY
-- ============================================================

CREATE TABLE inventory_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id       UUID NOT NULL REFERENCES sites(id),
  name          TEXT NOT NULL,
  unit          TEXT NOT NULL DEFAULT 'pcs',
  received      NUMERIC(12,2) DEFAULT 0,
  bought        NUMERIC(12,2) DEFAULT 0,
  used          NUMERIC(12,2) DEFAULT 0,
  damaged       NUMERIC(12,2) DEFAULT 0,
  transferred   NUMERIC(12,2) DEFAULT 0,
  temp_store    NUMERIC(12,2) DEFAULT 0,
  -- remained is a computed column: received + bought - used - damaged - transferred
  remained      NUMERIC(12,2) GENERATED ALWAYS AS (received + bought - used - damaged - transferred) STORED,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (site_id, name)
);

-- Trigger: update updated_at on change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_items_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed initial Friendship Site inventory
INSERT INTO inventory_items (site_id, name, unit, received, bought, used, damaged, transferred)
SELECT s.id, i.name, i.unit, i.received, i.bought, i.used, i.damaged, i.transferred
FROM sites s, (VALUES
  ('R-bar 12mm',        'pcs',  150, 0, 20, 5,  0),
  ('Cement (Dangote)',  'bags', 200, 0, 60, 10, 10),
  ('Single Switch',     'pcs',  0,  20,  5,  0,  0),
  ('Ceiling Light L',   'pcs',  0,  10,  5,  0,  0)
) AS i(name, unit, received, bought, used, damaged, transferred)
WHERE s.name = 'Friendship Site';

-- ============================================================
-- INVENTORY TRANSACTION LOG (full audit trail)
-- ============================================================

CREATE TABLE inventory_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id         UUID NOT NULL REFERENCES sites(id),
  item_id         UUID NOT NULL REFERENCES inventory_items(id),
  transaction_type TEXT NOT NULL, -- 'received','bought','used','damaged','transferred_out','transferred_in','temp_store_out','temp_store_in'
  quantity        NUMERIC(12,2) NOT NULL,
  reference_id    UUID,           -- PO id, transfer id, etc.
  performed_by    UUID REFERENCES user_profiles(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PURCHASE ORDERS
-- ============================================================

CREATE TABLE purchase_orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number         TEXT UNIQUE NOT NULL,   -- e.g. PO-101
  site_id           UUID NOT NULL REFERENCES sites(id),
  company           company_name NOT NULL,
  item              TEXT NOT NULL,
  qty               NUMERIC(12,2) NOT NULL,
  estimated_price   NUMERIC(14,2),
  status            po_status NOT NULL DEFAULT 'draft',
  proforma_attached BOOLEAN DEFAULT FALSE,
  proforma_url      TEXT,                   -- Supabase Storage path
  bank_ref          TEXT,
  bank_name         TEXT,
  payment_screenshot_url TEXT,             -- Supabase Storage path
  finance_audited   BOOLEAN DEFAULT FALSE,
  requested_by      UUID REFERENCES user_profiles(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- PO status history (full audit)
CREATE TABLE po_status_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id       UUID NOT NULL REFERENCES purchase_orders(id),
  from_status po_status,
  to_status   po_status NOT NULL,
  changed_by  UUID REFERENCES user_profiles(id),
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial POs
INSERT INTO purchase_orders (po_number, site_id, company, item, qty, status, proforma_attached, estimated_price)
SELECT po.po_number, s.id, s.company, po.item, po.qty, po.status::po_status, po.proforma_attached, po.estimated_price
FROM (VALUES
  ('PO-101', 'Friendship Site',   'R-bar 12mm',     100, 'shipped',         TRUE,  106500),
  ('PO-102', 'Lideta Site',       'Cement (Dangote)', 50, 'pending_manager', FALSE, 42000),
  ('PO-103', 'Meskel Flower Site','Ceiling Light L',  20, 'pending_ceo',     TRUE,  145000),
  ('PO-104', '4 Kilo Site',       'Single Switch',     6, 'completed',       TRUE,  900),
  ('PO-105', 'Friendship Site',   'PVC Pipes',        200,'draft',           FALSE, 24000)
) AS po(po_number, site_name, item, qty, status, proforma_attached, estimated_price)
JOIN sites s ON s.name::TEXT = po.site_name;

-- ============================================================
-- MATERIAL REQUESTS (Subcontractor → Engineer → Foreman → SK)
-- ============================================================

CREATE TABLE material_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  req_number    TEXT UNIQUE NOT NULL,
  site_id       UUID NOT NULL REFERENCES sites(id),
  item          TEXT NOT NULL,
  qty           NUMERIC(12,2) NOT NULL,
  status        material_request_status NOT NULL DEFAULT 'pending_engineer',
  requested_by  UUID REFERENCES user_profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER material_requests_updated_at
  BEFORE UPDATE ON material_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- INTER/INTRA SITE TRANSFERS
-- ============================================================

CREATE TABLE material_transfers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_number TEXT UNIQUE NOT NULL,
  source_site_id  UUID NOT NULL REFERENCES sites(id),
  dest_site_id    UUID NOT NULL REFERENCES sites(id),
  item_id         UUID NOT NULL REFERENCES inventory_items(id),
  item_name       TEXT NOT NULL,
  qty             NUMERIC(12,2) NOT NULL,
  unit            TEXT NOT NULL,
  transfer_type   transfer_type NOT NULL DEFAULT 'intra',
  status          transfer_status NOT NULL DEFAULT 'pending_manager',
  balance_before  NUMERIC(12,2),
  balance_after   NUMERIC(12,2),
  requested_by    UUID REFERENCES user_profiles(id),
  approved_by     UUID REFERENCES user_profiles(id),
  verified_by     UUID REFERENCES user_profiles(id),
  transfer_date   DATE DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER material_transfers_updated_at
  BEFORE UPDATE ON material_transfers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- PETTY CASH
-- ============================================================

CREATE TABLE petty_cash_accounts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id     UUID UNIQUE NOT NULL REFERENCES sites(id),
  balance     NUMERIC(14,2) NOT NULL DEFAULT 20000,
  max_balance NUMERIC(14,2) NOT NULL DEFAULT 20000,
  alert_threshold NUMERIC(14,2) NOT NULL DEFAULT 3000,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed petty cash for Friendship Site
INSERT INTO petty_cash_accounts (site_id, balance)
SELECT id, 17200 FROM sites WHERE name = 'Friendship Site';

CREATE TABLE petty_cash_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id     UUID NOT NULL REFERENCES sites(id),
  description TEXT NOT NULL,
  amount      NUMERIC(14,2) NOT NULL,  -- negative = expense, positive = replenishment
  item_name   TEXT,                    -- if tied to inventory purchase
  receipt_url TEXT,                    -- Supabase Storage
  is_audited  BOOLEAN DEFAULT FALSE,
  audited_by  UUID REFERENCES user_profiles(id),
  performed_by UUID REFERENCES user_profiles(id),
  log_date    DATE DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial petty cash logs
INSERT INTO petty_cash_logs (site_id, description, amount, is_audited, log_date)
SELECT s.id, l.description, l.amount, l.is_audited, l.log_date::DATE
FROM sites s, (VALUES
  ('Cemento unloading (235 kuntal)', -5000, FALSE, '2016-08-08'),
  ('ROPE 3 MM & Transport',          -1800, FALSE, '2016-08-07'),
  ('Water purchase for labor',       -1050, TRUE,  '2016-08-05')
) AS l(description, amount, is_audited, log_date)
WHERE s.name = 'Friendship Site';

-- ============================================================
-- ATTENDANCE
-- ============================================================

CREATE TABLE workers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id     UUID NOT NULL REFERENCES sites(id),
  name        TEXT NOT NULL,
  worker_type TEXT NOT NULL CHECK (worker_type IN ('professional', 'labor')),
  role_title  TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE attendance_records (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id     UUID NOT NULL REFERENCES sites(id),
  worker_id   UUID NOT NULL REFERENCES workers(id),
  record_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_present  BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_by UUID REFERENCES user_profiles(id),
  submitted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (worker_id, record_date)
);

-- Seed Friendship Site workers
INSERT INTO workers (site_id, name, worker_type, role_title)
SELECT s.id, w.name, w.worker_type, w.role_title
FROM sites s, (VALUES
  ('Mekonnen Alene',   'professional', 'Site Engineer'),
  ('Solomon Tesfaye',  'professional', 'Foreman'),
  ('Abebe Kebede',     'professional', 'Electrical Lead'),
  ('Tadesse Bekele',   'labor',        'Daily Laborer'),
  ('Aregash Hailu',    'labor',        'Daily Laborer'),
  ('Chala Demisse',    'labor',        'Daily Laborer')
) AS w(name, worker_type, role_title)
WHERE s.name = 'Friendship Site';

-- ============================================================
-- WASTAGE REPORTS
-- ============================================================

CREATE TABLE wastage_reports (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_number TEXT UNIQUE NOT NULL,
  site_id       UUID NOT NULL REFERENCES sites(id),
  item_id       UUID REFERENCES inventory_items(id),
  material_name TEXT NOT NULL,
  qty           NUMERIC(12,2) NOT NULL,
  reason        TEXT NOT NULL,
  photo_url     TEXT,                   -- Supabase Storage
  reporter_role user_role NOT NULL,
  reported_by   UUID REFERENCES user_profiles(id),
  status        wastage_status NOT NULL DEFAULT 'pending',
  reviewed_by   UUID REFERENCES user_profiles(id),
  report_date   DATE DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SYSTEM MESSAGES / NOTIFICATIONS
-- ============================================================

CREATE TABLE system_messages (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  action_key        TEXT NOT NULL,
  recipient_role    user_role NOT NULL,
  recipient_company company_name,
  recipient_site_id UUID REFERENCES sites(id),
  recipient_user_id UUID REFERENCES user_profiles(id), -- for targeted messages
  is_read           BOOLEAN DEFAULT FALSE,
  is_dismissed      BOOLEAN DEFAULT FALSE,
  reference_id      UUID,   -- PO id, transfer id, etc.
  reference_type    TEXT,   -- 'purchase_order', 'transfer', etc.
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE user_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_status_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_transfers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE petty_cash_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE petty_cash_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wastage_reports     ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites               ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's profile
CREATE OR REPLACE FUNCTION auth_user_profile()
RETURNS user_profiles AS $$
  SELECT * FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Sites: everyone can read
CREATE POLICY "sites_read_all" ON sites FOR SELECT USING (TRUE);

-- User profiles: all users can see basic profile info (needed for names on receipts)
CREATE POLICY "profiles_own" ON user_profiles FOR SELECT
  USING (TRUE);

-- Inventory: storekeepers see their site; managers/coordinators/finance see all
CREATE POLICY "inventory_site_read" ON inventory_items FOR SELECT
  USING (
    (auth_user_profile()).role IN ('whole_manager','ceo','finance','purchaser')
    OR site_id = (auth_user_profile()).site_id
  );

CREATE POLICY "inventory_storekeeper_write" ON inventory_items FOR UPDATE
  USING (
    site_id = (auth_user_profile()).site_id
    AND (auth_user_profile()).role IN ('storekeeper', 'engineer')
  );

CREATE POLICY "inventory_storekeeper_insert" ON inventory_items FOR INSERT
  WITH CHECK (
    site_id = (auth_user_profile()).site_id
    AND (auth_user_profile()).role IN ('storekeeper', 'engineer')
  );

-- Purchase Orders: role-filtered
CREATE POLICY "po_read" ON purchase_orders FOR SELECT
  USING (
    (auth_user_profile()).role IN ('whole_manager','ceo','purchaser','payer','finance')
    OR site_id = (auth_user_profile()).site_id
  );

CREATE POLICY "po_insert_engineer" ON purchase_orders FOR INSERT
  WITH CHECK (
    (auth_user_profile()).role IN ('engineer','storekeeper')
    AND site_id = (auth_user_profile()).site_id
  );

CREATE POLICY "po_update_workflow" ON purchase_orders FOR UPDATE
  USING (
    (auth_user_profile()).role IN ('whole_manager','ceo','purchaser','payer','finance')
    OR ((auth_user_profile()).role IN ('engineer','storekeeper') AND site_id = (auth_user_profile()).site_id)
  );

-- Petty Cash: storekeeper sees own site; finance/manager/payer see all
CREATE POLICY "petty_cash_logs_read" ON petty_cash_logs FOR SELECT
  USING (
    (auth_user_profile()).role IN ('whole_manager','ceo','finance','payer')
    OR site_id = (auth_user_profile()).site_id
  );

CREATE POLICY "petty_cash_logs_insert_sk" ON petty_cash_logs FOR INSERT
  WITH CHECK (
    site_id = (auth_user_profile()).site_id
    AND (auth_user_profile()).role = 'storekeeper'
  );

-- Transfers: site-level + finance + manager
CREATE POLICY "transfers_read" ON material_transfers FOR SELECT
  USING (
    (auth_user_profile()).role IN ('whole_manager','ceo','finance')
    OR source_site_id = (auth_user_profile()).site_id
    OR dest_site_id = (auth_user_profile()).site_id
  );

-- Messages: each user only sees messages addressed to them
CREATE POLICY "messages_read" ON system_messages FOR SELECT
  USING (
    recipient_role = (auth_user_profile()).role
    AND (recipient_company IS NULL OR recipient_company = (auth_user_profile()).company)
    AND (recipient_site_id IS NULL OR recipient_site_id = (auth_user_profile()).site_id)
    AND (recipient_user_id IS NULL OR recipient_user_id = auth.uid())
  );

-- Attendance: storekeeper submits; manager reads all
CREATE POLICY "attendance_read" ON attendance_records FOR SELECT
  USING (
    (auth_user_profile()).role IN ('whole_manager','ceo')
    OR site_id = (auth_user_profile()).site_id
  );

CREATE POLICY "attendance_insert_sk" ON attendance_records FOR INSERT
  WITH CHECK (
    site_id = (auth_user_profile()).site_id
    AND (auth_user_profile()).role = 'storekeeper'
  );

-- Wastage: site-level + manager
CREATE POLICY "wastage_read" ON wastage_reports FOR SELECT
  USING (
    (auth_user_profile()).role IN ('whole_manager','ceo')
    OR site_id = (auth_user_profile()).site_id
  );

-- Inventory logs: site or admin
CREATE POLICY "inv_logs_read" ON inventory_logs FOR SELECT
  USING (
    (auth_user_profile()).role IN ('whole_manager','ceo','finance')
    OR site_id = (auth_user_profile()).site_id
  );
