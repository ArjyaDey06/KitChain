-- ============================================================================
-- KITCHAIN - ERP SYSTEM FOR CAFE & RESTAURANT DB SCHEMA
-- ============================================================================
-- Complete PostgreSQL DDL + RLS Policies + Triggers + Functions + Seed Data
-- ============================================================================

-- ============================================================================
-- 1. Extensions & Custom Types
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for secure tokens
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom ENUM types
CREATE TYPE user_role AS ENUM ('admin', 'waiter', 'kitchen_staff', 'cashier');
CREATE TYPE table_status AS ENUM ('free', 'occupied', 'reserved', 'cleaning');
CREATE TYPE order_status AS ENUM ('queued', 'preparing', 'ready', 'served', 'cancelled');
CREATE TYPE order_type AS ENUM ('dine_in', 'takeaway');
CREATE TYPE payment_method AS ENUM ('cash', 'upi', 'card', 'online', 'split');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'refunded', 'partially_paid');
CREATE TYPE inventory_adjustment_reason AS ENUM (
  'auto_deduction', 'manual_add', 'manual_remove',
  'wastage', 'initial_stock', 'return'
);
CREATE TYPE notification_type AS ENUM (
  'low_stock', 'order_ready', 'new_order', 'bill_generated',
  'payment_confirmed', 'table_occupied', 'operational_reminder'
);
CREATE TYPE audit_action AS ENUM (
  'create', 'update', 'delete', 'login', 'logout',
  'generate_bill', 'apply_discount', 'mark_paid',
  'stock_add', 'stock_remove', 'order_status_change', 'table_status_change'
);

-- ============================================================================
-- 2. Profiles (extends auth.users)
-- ============================================================================

CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  display_name  TEXT,
  role          user_role NOT NULL DEFAULT 'waiter',
  avatar_url    TEXT,
  phone         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT false, -- Default to false (pending admin approval)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Secure role helper function to bypass RLS recursion
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- Auto-create profile on new Supabase Auth signup (defaulting is_active to false)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'waiter'),
    false -- FORCE all new signups to be pending approval
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at helper
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Secure RPC function for admins to delete users (since auth.users cannot be deleted directly from client-side)
CREATE OR REPLACE FUNCTION delete_employee(target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Check if the caller is an admin
  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    -- Delete the user from the core auth.users table (cascades to profiles)
    DELETE FROM auth.users WHERE id = target_id;
  ELSE
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;
END;
$$;

-- Profiles RLS Policies (Non-recursive)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_all" 
  ON profiles FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "profiles_insert_admin" 
  ON profiles FOR INSERT 
  WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "profiles_update_admin" 
  ON profiles FOR UPDATE 
  USING (get_my_role() = 'admin');

CREATE POLICY "profiles_update_self" 
  ON profiles FOR UPDATE 
  USING (auth.uid() = id)
  WITH CHECK (role = (SELECT role FROM profiles WHERE id = auth.uid()));

CREATE POLICY "profiles_delete_admin" 
  ON profiles FOR DELETE 
  USING (get_my_role() = 'admin');


-- ============================================================================
-- 3. Menu Management
-- ============================================================================

CREATE TABLE menu_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  image_url   TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER menu_categories_updated_at
  BEFORE UPDATE ON menu_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE menu_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id   UUID NOT NULL REFERENCES menu_categories(id) ON DELETE RESTRICT,
  name          TEXT NOT NULL,
  description   TEXT,
  price         NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  image_url     TEXT,
  is_available  BOOLEAN NOT NULL DEFAULT true,
  is_veg        BOOLEAN NOT NULL DEFAULT true,
  tags          TEXT[],                        -- e.g. ['bestseller', 'spicy']
  prep_time_min INT,                           -- estimated preparation minutes
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Menu RLS
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_categories: authenticated read"
  ON menu_categories FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "menu_items: authenticated read"
  ON menu_items FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "menu_categories: admin write"
  ON menu_categories FOR ALL
  USING (get_my_role() = 'admin');

CREATE POLICY "menu_items: admin write"
  ON menu_items FOR ALL
  USING (get_my_role() = 'admin');


-- ============================================================================
-- 4. Inventory Management
-- ============================================================================

CREATE TABLE inventory_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL UNIQUE,
  unit              TEXT NOT NULL,             -- 'grams', 'ml', 'pieces', 'kg', etc.
  current_stock     NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  threshold_limit   NUMERIC(12,4) NOT NULL DEFAULT 0, -- low-stock alert trigger
  cost_per_unit     NUMERIC(10,4),             -- for cost analytics
  supplier_name     TEXT,
  notes             TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER inventory_items_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE inventory_adjustments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  adjusted_by       UUID NOT NULL REFERENCES profiles(id),
  reason            inventory_adjustment_reason NOT NULL,
  quantity_change   NUMERIC(12,4) NOT NULL,    -- positive = added, negative = removed
  stock_before      NUMERIC(12,4) NOT NULL,
  stock_after       NUMERIC(12,4) NOT NULL,
  order_item_id     UUID,                      -- FK set later after order_items exists
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inventory RLS
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_items: admin & cashier read"
  ON inventory_items FOR SELECT
  USING (get_my_role() IN ('admin', 'cashier'));

CREATE POLICY "inventory_items: admin write"
  ON inventory_items FOR ALL
  USING (get_my_role() = 'admin');

CREATE POLICY "inventory_adjustments: admin & cashier read"
  ON inventory_adjustments FOR SELECT
  USING (get_my_role() IN ('admin', 'cashier'));

CREATE POLICY "inventory_adjustments: admin & cashier insert"
  ON inventory_adjustments FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'cashier'));


-- ============================================================================
-- 5. Recipe Mapping
-- ============================================================================

CREATE TABLE recipe_ingredients (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_item_id      UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity_used     NUMERIC(10,4) NOT NULL CHECK (quantity_used > 0),  -- per 1 serving
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (menu_item_id, inventory_item_id)
);

CREATE OR REPLACE TRIGGER recipe_ingredients_updated_at
  BEFORE UPDATE ON recipe_ingredients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Recipe RLS
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipe_ingredients: authenticated read"
  ON recipe_ingredients FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "recipe_ingredients: admin write"
  ON recipe_ingredients FOR ALL
  USING (get_my_role() = 'admin');


-- ============================================================================
-- 6. Table Management
-- ============================================================================

CREATE TABLE restaurant_tables (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_number  INT NOT NULL UNIQUE,
  capacity      INT NOT NULL DEFAULT 4,
  status        table_status NOT NULL DEFAULT 'free',
  section       TEXT,                         -- e.g. 'indoor', 'outdoor', 'terrace'
  assigned_to   UUID REFERENCES profiles(id), -- current waiter
  occupied_at   TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER restaurant_tables_updated_at
  BEFORE UPDATE ON restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tables RLS
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tables: authenticated read"
  ON restaurant_tables FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "tables: admin & waiter update"
  ON restaurant_tables FOR UPDATE
  USING (get_my_role() IN ('admin', 'waiter'));

CREATE POLICY "tables: admin insert/delete"
  ON restaurant_tables FOR INSERT
  WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "tables: admin delete"
  ON restaurant_tables FOR DELETE
  USING (get_my_role() = 'admin');


-- ============================================================================
-- 7. Order Management
-- ============================================================================

CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number    SERIAL,                     -- human-readable order number
  table_id        UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  order_type      order_type NOT NULL DEFAULT 'dine_in',
  waiter_id       UUID NOT NULL REFERENCES profiles(id),
  customer_name   TEXT,                       -- for takeaway
  customer_phone  TEXT,                       -- for takeaway
  status          order_status NOT NULL DEFAULT 'queued',
  notes           TEXT,                       -- special instructions
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE order_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id    UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
  quantity        INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price      NUMERIC(10,2) NOT NULL,     -- price snapshot at time of order
  specifications  TEXT,                       -- e.g., 'no onions', 'extra cheese'
  status          order_status NOT NULL DEFAULT 'queued',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER order_items_updated_at
  BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Add the constraints referencing order_items back to inventory_adjustments
ALTER TABLE inventory_adjustments
  ADD CONSTRAINT fk_order_item
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE SET NULL;

-- Orders RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders: authenticated read"
  ON orders FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "order_items: authenticated read"
  ON order_items FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "orders: waiter & admin insert"
  ON orders FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'waiter'));

CREATE POLICY "order_items: waiter & admin insert"
  ON order_items FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'waiter'));

CREATE POLICY "orders: update by role"
  ON orders FOR UPDATE
  USING (get_my_role() IN ('admin', 'waiter', 'kitchen_staff', 'cashier'));

CREATE POLICY "order_items: update by role"
  ON order_items FOR UPDATE
  USING (get_my_role() IN ('admin', 'waiter', 'kitchen_staff'));

CREATE POLICY "order_items: waiter & admin delete"
  ON order_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
        JOIN orders o ON o.id = (SELECT order_id FROM order_items WHERE id = order_items.id)
      WHERE p.id = auth.uid()
        AND (p.role = 'admin' OR o.waiter_id = auth.uid())
    )
  );


-- ============================================================================
-- 8. Kitchen Display System (KDS) & Realtime Inventory Deduction Trigger
-- ============================================================================

CREATE TABLE kds_tickets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  accepted_by     UUID REFERENCES profiles(id),   -- kitchen staff who accepted
  accepted_at     TIMESTAMPTZ,
  ready_at        TIMESTAMPTZ,
  status          order_status NOT NULL DEFAULT 'queued',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id)
);

CREATE OR REPLACE TRIGGER kds_tickets_updated_at
  BEFORE UPDATE ON kds_tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-create KDS ticket when order is created
CREATE OR REPLACE FUNCTION create_kds_ticket()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO kds_tickets (order_id, status)
  VALUES (NEW.id, 'queued');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_order_created
  AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION create_kds_ticket();

-- Notifications Table (defined here since the trigger needs it)
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_roles    user_role[],                -- who should see this
  target_user_id  UUID REFERENCES profiles(id), -- or specific user (nullable = broadcast)
  type            notification_type NOT NULL,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}',
  is_read         BOOLEAN NOT NULL DEFAULT false,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AUTO DEDUCT INVENTORY when kitchen accepts order (status goes from queued -> preparing)
CREATE OR REPLACE FUNCTION deduct_inventory_on_prepare()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item         RECORD;
  v_ingredient   RECORD;
  v_new_stock    NUMERIC;
BEGIN
  -- Only fire on status changing to 'preparing'
  IF NEW.status = 'preparing' AND OLD.status = 'queued' THEN
    -- Loop over all order items in this order
    FOR v_item IN
      SELECT oi.id, oi.menu_item_id, oi.quantity
      FROM order_items oi
      WHERE oi.order_id = NEW.order_id
        AND oi.status NOT IN ('cancelled')
    LOOP
      -- Loop over recipe ingredients for each menu item
      FOR v_ingredient IN
        SELECT ri.inventory_item_id, ri.quantity_used
        FROM recipe_ingredients ri
        WHERE ri.menu_item_id = v_item.menu_item_id
      LOOP
        -- Calculate deduction
        SELECT current_stock INTO v_new_stock
        FROM inventory_items
        WHERE id = v_ingredient.inventory_item_id;

        v_new_stock := v_new_stock - (v_ingredient.quantity_used * v_item.quantity);

        -- Update inventory (floor at 0)
        UPDATE inventory_items
        SET current_stock = GREATEST(0, v_new_stock)
        WHERE id = v_ingredient.inventory_item_id;

        -- Log the adjustment
        INSERT INTO inventory_adjustments (
          inventory_item_id, adjusted_by, reason,
          quantity_change, stock_before, stock_after, order_item_id
        )
        VALUES (
          v_ingredient.inventory_item_id,
          COALESCE(NEW.accepted_by, auth.uid()),
          'auto_deduction',
          -(v_ingredient.quantity_used * v_item.quantity),
          v_new_stock + (v_ingredient.quantity_used * v_item.quantity),
          GREATEST(0, v_new_stock),
          v_item.id
        );

        -- Check low stock threshold and fire notification
        IF v_new_stock <= (
          SELECT threshold_limit FROM inventory_items
          WHERE id = v_ingredient.inventory_item_id
        ) THEN
          INSERT INTO notifications (
            target_roles, type, title, message, metadata
          )
          VALUES (
            ARRAY['admin', 'cashier']::user_role[],
            'low_stock',
            'Low Stock Alert',
            (SELECT name FROM inventory_items WHERE id = v_ingredient.inventory_item_id)
              || ' is running low!',
            jsonb_build_object(
              'inventory_item_id', v_ingredient.inventory_item_id,
              'current_stock', GREATEST(0, v_new_stock)
            )
          );
        END IF;
      END LOOP;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_kds_status_preparing
  AFTER UPDATE ON kds_tickets
  FOR EACH ROW EXECUTE FUNCTION deduct_inventory_on_prepare();

-- KDS RLS
ALTER TABLE kds_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kds_tickets: authenticated read"
  ON kds_tickets FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "kds_tickets: kitchen & admin update"
  ON kds_tickets FOR UPDATE
  USING (get_my_role() IN ('admin', 'kitchen_staff'));

CREATE POLICY "kds_tickets: insert by system"
  ON kds_tickets FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'waiter', 'kitchen_staff'));


-- ============================================================================
-- 9. Billing & POS
-- ============================================================================

CREATE TABLE tax_config (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,           -- e.g., 'CGST', 'SGST', 'IGST'
  rate        NUMERIC(5,2) NOT NULL,   -- percentage, e.g. 2.50 for 2.5%
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bills (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_number      SERIAL,
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  generated_by     UUID NOT NULL REFERENCES profiles(id),       -- waiter who triggered
  processed_by     UUID REFERENCES profiles(id),                -- cashier who collected
  subtotal         NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_note    TEXT,
  tax_details      JSONB NOT NULL DEFAULT '[]',                 -- snapshot of taxes applied
  tax_total        NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total      NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method   payment_method,
  payment_status   payment_status NOT NULL DEFAULT 'pending',
  gst_number       TEXT,                                        -- restaurant's GST number
  upi_qr_url       TEXT,                                        -- generated QR image URL
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  split_details    JSONB DEFAULT NULL,
  cash_received    NUMERIC(12,2) DEFAULT NULL,
  change_returned  NUMERIC(12,2) DEFAULT NULL
);

CREATE OR REPLACE TRIGGER bills_updated_at
  BEFORE UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Trigger to auto-free tables and served orders when bill is marked paid
CREATE OR REPLACE FUNCTION on_bill_paid()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.payment_status = 'paid' AND OLD.payment_status != 'paid' THEN
    -- Mark order as served
    UPDATE orders SET status = 'served' WHERE id = NEW.order_id;

    -- Free the table
    UPDATE restaurant_tables
    SET status = 'free', assigned_to = NULL, occupied_at = NULL
    WHERE id = (SELECT table_id FROM orders WHERE id = NEW.order_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_bill_paid
  AFTER UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION on_bill_paid();

-- Bill calculation function called on "Generate Bill"
CREATE OR REPLACE FUNCTION generate_bill(p_order_id UUID, p_generated_by UUID)
RETURNS bills
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_subtotal      NUMERIC(12,2);
  v_taxes         JSONB;
  v_tax_total     NUMERIC(12,2);
  v_grand_total   NUMERIC(12,2);
  v_bill          bills;
BEGIN
  -- Calculate subtotal from non-cancelled order items
  SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0)
  INTO v_subtotal
  FROM order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status != 'cancelled';

  -- Build tax snapshot from active tax config
  SELECT
    jsonb_agg(jsonb_build_object(
      'name', name,
      'rate', rate,
      'amount', ROUND((v_subtotal * rate / 100)::NUMERIC, 2)
    )),
    COALESCE(SUM(ROUND((v_subtotal * rate / 100)::NUMERIC, 2)), 0)
  INTO v_taxes, v_tax_total
  FROM tax_config
  WHERE is_active = true;

  v_grand_total := v_subtotal + COALESCE(v_tax_total, 0);

  INSERT INTO bills (
    order_id, generated_by, subtotal,
    tax_details, tax_total, grand_total, payment_status
  )
  VALUES (
    p_order_id, p_generated_by, v_subtotal,
    COALESCE(v_taxes, '[]'::JSONB), COALESCE(v_tax_total, 0), v_grand_total, 'pending'
  )
  RETURNING * INTO v_bill;

  RETURN v_bill;
END;
$$;

-- POS RLS
ALTER TABLE tax_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_config: authenticated read"
  ON tax_config FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "tax_config: admin write"
  ON tax_config FOR ALL
  USING (get_my_role() = 'admin');

CREATE POLICY "bills: admin & cashier read"
  ON bills FOR SELECT
  USING (get_my_role() IN ('admin', 'cashier', 'waiter'));

CREATE POLICY "bills: waiter & admin insert"
  ON bills FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'waiter'));

CREATE POLICY "bills: cashier & admin update"
  ON bills FOR UPDATE
  USING (get_my_role() IN ('admin', 'cashier'));


-- ============================================================================
-- 10. Notifications RLS
-- ============================================================================

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications: read own"
  ON notifications FOR SELECT
  USING (
    target_user_id = auth.uid()
    OR get_my_role() = ANY(target_roles)
  );

CREATE POLICY "notifications: admin insert"
  ON notifications FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'cashier', 'waiter', 'kitchen_staff'));

CREATE POLICY "notifications: update read status"
  ON notifications FOR UPDATE
  USING (
    target_user_id = auth.uid()
    OR get_my_role() = ANY(target_roles)
  )
  WITH CHECK (is_read = true);


-- ============================================================================
-- 11. Audit Logs
-- ============================================================================

CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action        audit_action NOT NULL,
  entity_type   TEXT NOT NULL,     -- table name e.g. 'orders', 'inventory_items'
  entity_id     UUID,              -- row ID affected
  old_data      JSONB,             -- before state (for updates/deletes)
  new_data      JSONB,             -- after state (for inserts/updates)
  ip_address    TEXT,
  user_agent    TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generic Audit Trigger Function
CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_action audit_action;
BEGIN
  IF TG_OP = 'INSERT' THEN v_action := 'create';
  ELSIF TG_OP = 'UPDATE' THEN v_action := 'update';
  ELSIF TG_OP = 'DELETE' THEN v_action := 'delete';
  END IF;

  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    auth.uid(),
    v_action,
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach audit triggers
CREATE OR REPLACE TRIGGER audit_orders
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE OR REPLACE TRIGGER audit_order_items
  AFTER INSERT OR UPDATE OR DELETE ON order_items
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE OR REPLACE TRIGGER audit_bills
  AFTER INSERT OR UPDATE OR DELETE ON bills
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE OR REPLACE TRIGGER audit_inventory_items
  AFTER INSERT OR UPDATE OR DELETE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE OR REPLACE TRIGGER audit_menu_items
  AFTER INSERT OR UPDATE OR DELETE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE OR REPLACE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE OR REPLACE TRIGGER audit_restaurant_tables
  AFTER INSERT OR UPDATE OR DELETE ON restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Audit Logs RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs: admin only read"
  ON audit_logs FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "audit_logs: no direct insert"
  ON audit_logs FOR INSERT
  WITH CHECK (false);


-- ============================================================================
-- 12. Dashboard & Analytics Views
-- ============================================================================

-- Daily Sales Summary View
CREATE OR REPLACE VIEW v_daily_sales AS
SELECT
  DATE(b.created_at AT TIME ZONE 'Asia/Kolkata') AS sale_date,
  COUNT(DISTINCT b.id)                            AS total_bills,
  SUM(b.subtotal)                                 AS total_subtotal,
  SUM(b.discount_amount)                          AS total_discounts,
  SUM(b.tax_total)                                AS total_taxes,
  SUM(b.grand_total)                              AS total_revenue,
  COUNT(DISTINCT b.id) FILTER (WHERE b.payment_status = 'paid') AS paid_count
FROM bills b
GROUP BY DATE(b.created_at AT TIME ZONE 'Asia/Kolkata')
ORDER BY sale_date DESC;

-- Most Sold Items View
CREATE OR REPLACE VIEW v_top_menu_items AS
SELECT
  mi.id,
  mi.name,
  mc.name                     AS category,
  SUM(oi.quantity)            AS total_quantity_sold,
  SUM(oi.quantity * oi.unit_price) AS total_revenue
FROM order_items oi
JOIN menu_items mi ON mi.id = oi.menu_item_id
JOIN menu_categories mc ON mc.id = mi.category_id
WHERE oi.status != 'cancelled'
GROUP BY mi.id, mi.name, mc.name
ORDER BY total_quantity_sold DESC;

-- Peak Hours View
CREATE OR REPLACE VIEW v_peak_hours AS
SELECT
  EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Asia/Kolkata') AS hour_of_day,
  COUNT(DISTINCT o.id) AS order_count,
  SUM(b.grand_total)   AS revenue
FROM orders o
LEFT JOIN bills b ON b.order_id = o.id
GROUP BY hour_of_day
ORDER BY order_count DESC;

-- Low Stock Items View
CREATE OR REPLACE VIEW v_low_stock_items AS
SELECT
  id, name, unit, current_stock, threshold_limit,
  (threshold_limit - current_stock) AS deficit
FROM inventory_items
WHERE current_stock <= threshold_limit
  AND is_active = true
ORDER BY deficit DESC;

-- Active Orders View (live dashboard widget)
CREATE OR REPLACE VIEW v_active_orders AS
SELECT
  o.id,
  o.order_number,
  rt.table_number,
  o.order_type,
  p.full_name         AS waiter_name,
  o.status,
  k.status            AS kds_status,
  o.created_at,
  COUNT(oi.id)        AS item_count
FROM orders o
JOIN profiles p       ON p.id = o.waiter_id
LEFT JOIN restaurant_tables rt ON rt.id = o.table_id
LEFT JOIN kds_tickets k ON k.order_id = o.id
LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.status != 'cancelled'
WHERE o.status NOT IN ('served', 'cancelled')
GROUP BY o.id, o.order_number, rt.table_number, o.order_type,
         p.full_name, o.status, k.status, o.created_at
ORDER BY o.created_at ASC;

-- Date Range Revenue Function
CREATE OR REPLACE FUNCTION get_revenue_by_range(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE (
  sale_date     DATE,
  total_bills   BIGINT,
  total_revenue NUMERIC
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    DATE(b.created_at AT TIME ZONE 'Asia/Kolkata'),
    COUNT(DISTINCT b.id),
    SUM(b.grand_total)
  FROM bills b
  WHERE b.created_at BETWEEN p_from AND p_to
    AND b.payment_status = 'paid'
  GROUP BY DATE(b.created_at AT TIME ZONE 'Asia/Kolkata')
  ORDER BY 1 ASC;
$$;


-- ============================================================================
-- 13. Realtime Configuration
-- ============================================================================

-- Enable Realtime on operational tables
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE kds_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE restaurant_tables;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE bills;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_items;


-- ============================================================================
-- 14. Indexes
-- ============================================================================

-- Orders Indexes
CREATE INDEX idx_orders_table_id    ON orders(table_id);
CREATE INDEX idx_orders_waiter_id   ON orders(waiter_id);
CREATE INDEX idx_orders_status      ON orders(status);
CREATE INDEX idx_orders_created_at  ON orders(created_at DESC);

-- Order Items Indexes
CREATE INDEX idx_order_items_order_id     ON order_items(order_id);
CREATE INDEX idx_order_items_menu_item_id ON order_items(menu_item_id);
CREATE INDEX idx_order_items_status       ON order_items(status);

-- KDS Indexes
CREATE INDEX idx_kds_order_id  ON kds_tickets(order_id);
CREATE INDEX idx_kds_status    ON kds_tickets(status);

-- Bills Indexes
CREATE INDEX idx_bills_order_id       ON bills(order_id);
CREATE INDEX idx_bills_payment_status ON bills(payment_status);
CREATE INDEX idx_bills_created_at     ON bills(created_at DESC);

-- Inventory Indexes
CREATE INDEX idx_inventory_name       ON inventory_items(name);
CREATE INDEX idx_inventory_threshold  ON inventory_items(current_stock, threshold_limit);

-- Audit Logs Indexes
CREATE INDEX idx_audit_user_id      ON audit_logs(user_id);
CREATE INDEX idx_audit_entity       ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created_at   ON audit_logs(created_at DESC);

-- Notifications Indexes
CREATE INDEX idx_notif_target_user  ON notifications(target_user_id);
CREATE INDEX idx_notif_created_at   ON notifications(created_at DESC);


-- ============================================================================
-- 15. Seed Data & Tax Config
-- ============================================================================

-- Tax Configuration (GST India)
INSERT INTO tax_config (name, rate, is_active) VALUES
  ('CGST', 2.50, true),
  ('SGST', 2.50, true)
ON CONFLICT DO NOTHING;

-- Restaurant Tables Seed
INSERT INTO restaurant_tables (table_number, capacity, section) VALUES
  (1, 2, 'indoor'), (2, 4, 'indoor'), (3, 4, 'indoor'),
  (4, 6, 'indoor'), (5, 6, 'indoor'), (6, 4, 'outdoor'),
  (7, 4, 'outdoor'), (8, 8, 'terrace'), (9, 4, 'terrace'),
  (10, 2, 'bar')
ON CONFLICT (table_number) DO NOTHING;

-- Menu Categories Seed
INSERT INTO menu_categories (id, name, sort_order) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'Starters', 1),
  ('a2222222-2222-2222-2222-222222222222', 'Main Course', 2),
  ('a3333333-3333-3333-3333-333333333333', 'Beverages', 3),
  ('a4444444-4444-4444-4444-444444444444', 'Desserts', 4),
  ('a5555555-5555-5555-5555-555555555555', 'Combos', 5)
ON CONFLICT DO NOTHING;

-- Abundant Inventory Items Seed
INSERT INTO inventory_items (id, name, unit, current_stock, threshold_limit, cost_per_unit, supplier_name, notes) VALUES
  ('b0100000-0000-0000-0000-000000000001', 'Pizza Flour', 'kg', 50.00, 10.00, 45.00, 'Metro WholeSale', 'High-gluten Italian 00 flour'),
  ('b0200000-0000-0000-0000-000000000002', 'Mozzarella Cheese', 'kg', 25.00, 5.00, 380.00, 'Amul Dairy', 'Shredded mozzarella cheese'),
  ('b0300000-0000-0000-0000-000000000003', 'Tomato Pizza Sauce', 'kg', 30.00, 5.00, 120.00, 'San Marzano Co', 'Herb tomato pizza base sauce'),
  ('b0400000-0000-0000-0000-000000000004', 'Pepperoni Slices', 'kg', 10.00, 2.00, 750.00, 'Prasuma Cold Cuts', 'Pork pepperoni slices'),
  ('b0500000-0000-0000-0000-000000000005', 'Jalapeños', 'kg', 5.00, 1.00, 180.00, 'Del Monte', 'Sliced pickled jalapeños'),
  ('b0600000-0000-0000-0000-000000000006', 'Bell Peppers (Capsicum)', 'kg', 15.00, 3.00, 60.00, 'Fresh Veggie Farm', 'Mixed green & red capsicum'),
  ('b0700000-0000-0000-0000-000000000007', 'Onions', 'kg', 30.00, 5.00, 30.00, 'Fresh Veggie Farm', 'Red onions'),
  ('b0800000-0000-0000-0000-000000000008', 'Garlic', 'kg', 5.00, 1.00, 150.00, 'Fresh Veggie Farm', 'Peeled garlic cloves'),
  ('b0900000-0000-0000-0000-000000000009', 'Olive Oil', 'liters', 20.00, 4.00, 450.00, 'Borges India', 'Extra virgin olive oil'),
  ('b1000000-0000-0000-0000-000000000010', 'Butter', 'kg', 12.00, 2.00, 420.00, 'Amul Dairy', 'Unsalted cooking butter'),
  ('b1100000-0000-0000-0000-000000000011', 'Espresso Coffee Beans', 'kg', 15.00, 3.00, 850.00, 'Blue Tokai Roasters', 'Arabica Dark Roast'),
  ('b1200000-0000-0000-0000-000000000012', 'Whole Milk', 'liters', 40.00, 10.00, 60.00, 'Mother Dairy', 'Fresh full cream milk'),
  ('b1300000-0000-0000-0000-000000000013', 'Sugar', 'kg', 25.00, 5.00, 42.00, 'Local Mart', 'Fine refined sugar'),
  ('b1400000-0000-0000-0000-000000000014', 'Potatoes (French Fries)', 'kg', 40.00, 8.00, 35.00, 'McCain Fresh', 'Cut potato fry sticks'),
  ('b1500000-0000-0000-0000-000000000015', 'Chicken Breast', 'kg', 20.00, 5.00, 240.00, 'FreshToHome Meat', 'Boneless fresh chicken breast'),
  ('b1600000-0000-0000-0000-000000000016', 'Burger Buns', 'pieces', 100.00, 20.00, 8.00, 'Britannia Bakery', 'Brioche burger buns'),
  ('b1700000-0000-0000-0000-000000000017', 'Paneer (Cottage Cheese)', 'kg', 15.00, 3.00, 320.00, 'Amul Dairy', 'Fresh malai paneer blocks'),
  ('b1800000-0000-0000-0000-000000000018', 'Penne Pasta', 'kg', 25.00, 5.00, 140.00, 'Barilla India', 'Durum wheat penne pasta'),
  ('b1900000-0000-0000-0000-000000000019', 'Heavy Cream', 'liters', 10.00, 2.00, 220.00, 'Amul Dairy', 'Fresh cooking cream'),
  ('b2000000-0000-0000-0000-000000000020', 'Chocolate Fudge Sauce', 'liters', 8.00, 1.50, 310.00, 'Hersheys India', 'Rich dark chocolate sauce'),
  ('b2100000-0000-0000-0000-000000000021', 'Takeaway Containers', 'pieces', 200.00, 50.00, 5.00, 'EcoPack Solutions', 'Biodegradable meal boxes')
ON CONFLICT (name) DO NOTHING;

-- Menu Items Seed
INSERT INTO menu_items (id, category_id, name, price, description, is_veg, is_available, preparation_time, tags) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'Garlic Bread Sticks', 149.00, 'Freshly baked bread sticks brushed with butter & fresh garlic', true, true, 10, ARRAY['bestseller', 'starter']),
  ('c2000000-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', 'Crispy French Fries', 119.00, 'Golden fried salted potato fries served with dip', true, true, 8, ARRAY['quick', 'snack']),
  ('c3000000-0000-0000-0000-000000000003', 'a1111111-1111-1111-1111-111111111111', 'Paneer Tikka Skewers', 229.00, 'Char-grilled marinated paneer cubes with peppers & onions', true, true, 15, ARRAY['tandoori', 'chef_special']),
  ('c4000000-0000-0000-0000-000000000004', 'a2222222-2222-2222-2222-222222222222', 'Classic Margherita Pizza', 299.00, 'Italian tomato sauce, mozzarella cheese, and fresh basil', true, true, 15, ARRAY['classic', 'pizza']),
  ('c5000000-0000-0000-0000-000000000005', 'a2222222-2222-2222-2222-222222222222', 'Loaded Pepperoni Pizza', 449.00, 'Crispy pepperoni slices loaded with mozzarella cheese', false, true, 18, ARRAY['non_veg', 'popular']),
  ('c6000000-0000-0000-0000-000000000006', 'a2222222-2222-2222-2222-222222222222', 'Creamy Alfredo Penne', 279.00, 'Penne pasta tossed in rich butter cream & parmesan sauce', true, true, 12, ARRAY['pasta', 'creamy']),
  ('c7000000-0000-0000-0000-000000000007', 'a2222222-2222-2222-2222-222222222222', 'Grilled Chicken Burger', 249.00, 'Juicy grilled chicken breast patty with brioche bun', false, true, 12, ARRAY['burger', 'non_veg']),
  ('c8000000-0000-0000-0000-000000000008', 'a3333333-3333-3333-3333-333333333333', 'Creamy Cold Coffee', 149.00, 'Chilled blended espresso with fresh milk & chocolate drizzle', true, true, 5, ARRAY['beverage', 'bestseller']),
  ('c9000000-0000-0000-0000-000000000009', 'a4444444-4444-4444-4444-444444444444', 'Chocolate Lava Cake', 179.00, 'Warm chocolate cake with molten chocolate center', true, true, 8, ARRAY['sweet', 'dessert'])
ON CONFLICT (id) DO NOTHING;

-- Recipe Mapping Seed (Menu Items -> Inventory Ingredients)
INSERT INTO recipe_ingredients (menu_item_id, inventory_item_id, quantity_used) VALUES
  -- Margherita Pizza
  ('c4000000-0000-0000-0000-000000000004', 'b0100000-0000-0000-0000-000000000001', 0.2000), -- 200g Flour
  ('c4000000-0000-0000-0000-000000000004', 'b0200000-0000-0000-0000-000000000002', 0.1500), -- 150g Mozzarella
  ('c4000000-0000-0000-0000-000000000004', 'b0300000-0000-0000-0000-000000000003', 0.1000), -- 100g Sauce
  ('c4000000-0000-0000-0000-000000000004', 'b0900000-0000-0000-0000-000000000009', 0.0100), -- 10ml Olive Oil

  -- Loaded Pepperoni Pizza
  ('c5000000-0000-0000-0000-000000000005', 'b0100000-0000-0000-0000-000000000001', 0.2000), -- 200g Flour
  ('c5000000-0000-0000-0000-000000000005', 'b0200000-0000-0000-0000-000000000002', 0.1800), -- 180g Mozzarella
  ('c5000000-0000-0000-0000-000000000005', 'b0300000-0000-0000-0000-000000000003', 0.1000), -- 100g Sauce
  ('c5000000-0000-0000-0000-000000000005', 'b0400000-0000-0000-0000-000000000004', 0.1000), -- 100g Pepperoni
  ('c5000000-0000-0000-0000-000000000005', 'b0500000-0000-0000-0000-000000000005', 0.0200), -- 20g Jalapenos

  -- Garlic Bread Sticks
  ('c1000000-0000-0000-0000-000000000001', 'b0100000-0000-0000-0000-000000000001', 0.1500), -- 150g Flour
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000010', 0.0500), -- 50g Butter
  ('c1000000-0000-0000-0000-000000000001', 'b0800000-0000-0000-0000-000000000008', 0.0200), -- 20g Garlic
  ('c1000000-0000-0000-0000-000000000001', 'b0200000-0000-0000-0000-000000000002', 0.0500), -- 50g Cheese

  -- Crispy French Fries
  ('c2000000-0000-0000-0000-000000000002', 'b1400000-0000-0000-0000-000000000014', 0.2500), -- 250g Potatoes
  ('c2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000010', 0.0200), -- 20g Butter

  -- Creamy Alfredo Penne
  ('c6000000-0000-0000-0000-000000000006', 'b1800000-0000-0000-0000-000000000018', 0.1500), -- 150g Penne Pasta
  ('c6000000-0000-0000-0000-000000000006', 'b1900000-0000-0000-0000-000000000019', 0.0800), -- 80ml Cream
  ('c6000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000010', 0.0300), -- 30g Butter
  ('c6000000-0000-0000-0000-000000000006', 'b0200000-0000-0000-0000-000000000002', 0.0400), -- 40g Cheese

  -- Grilled Chicken Burger
  ('c7000000-0000-0000-0000-000000000007', 'b1600000-0000-0000-0000-000000000016', 1.0000), -- 1 Bun
  ('c7000000-0000-0000-0000-000000000007', 'b1500000-0000-0000-0000-000000000015', 0.1800), -- 180g Chicken
  ('c7000000-0000-0000-0000-000000000007', 'b0700000-0000-0000-0000-000000000007', 0.0200), -- 20g Onion
  ('c7000000-0000-0000-0000-000000000007', 'b0600000-0000-0000-0000-000000000006', 0.0200), -- 20g Bell Peppers

  -- Creamy Cold Coffee
  ('c8000000-0000-0000-0000-000000000008', 'b1100000-0000-0000-0000-000000000011', 0.0200), -- 20g Coffee Beans
  ('c8000000-0000-0000-0000-000000000008', 'b1200000-0000-0000-0000-000000000012', 0.2500), -- 250ml Milk
  ('c8000000-0000-0000-0000-000000000008', 'b1300000-0000-0000-0000-000000000013', 0.0200), -- 20g Sugar
  ('c8000000-0000-0000-0000-000000000008', 'b2000000-0000-0000-0000-000000000020', 0.0100), -- 10ml Chocolate Sauce

  -- Chocolate Lava Cake
  ('c9000000-0000-0000-0000-000000000009', 'b2000000-0000-0000-0000-000000000020', 0.0500), -- 50ml Chocolate Fudge Sauce
  ('c9000000-0000-0000-0000-000000000009', 'b1000000-0000-0000-0000-000000000010', 0.0300), -- 30g Butter
  ('c9000000-0000-0000-0000-000000000009', 'b1300000-0000-0000-0000-000000000013', 0.0200), -- 20g Sugar
  ('c9000000-0000-0000-0000-000000000009', 'b0100000-0000-0000-0000-000000000001', 0.0300)  -- 30g Flour
ON CONFLICT (menu_item_id, inventory_item_id) DO NOTHING;

