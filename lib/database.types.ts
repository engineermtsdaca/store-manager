// lib/database.types.ts
// ============================================================
// TypeScript types derived from the Supabase schema
// ============================================================

export type CompanyName  = 'Cappadocia' | 'Addisu Habte' | 'Vila Verde'
export type SiteName     = 'Friendship Site' | 'Lideta Site' | 'JFK Site' | '4 Kilo Site' | 'Bole Site' | 'Summit Site' | 'Meskel Flower Site' | 'Senga Tera Site'
export type UserRole     = 'storekeeper' | 'engineer' | 'purchaser' | 'manager' | 'coordinator' | 'whole_manager' | 'purchase_assistant' | 'payer' | 'finance' | 'ceo' | 'subcontractor' | 'maintenance'
export type POStatus     = 'draft' | 'pending_site_manager_req' | 'pending_whole_manager_req' | 'pending_ceo_req' | 'pending_purchaser_proforma' | 'pending_site_manager_prof' | 'pending_whole_manager_prof' | 'pending_ceo_prof' | 'pending_pa_formal_paper' | 'pending_ceo_formal_paper' | 'pending_whole_manager_payment' | 'pending_payer' | 'pending_finance' | 'shipped' | 'blocked_mismatch' | 'completed'
export type TransferStatus = 'pending_whole_manager' | 'pending_finance' | 'returned_back' | 'completed'
export type TransferType = 'intra' | 'inter'
export type WastageStatus = 'pending' | 'reviewed'
export type MaterialRequestStatus = 'pending_engineer' | 'storekeeper_approved' | 'approved_instock' | 'ordered' | 'delivered' | 'cancelled' | 'ordered_pending'

export type InventorySource = 'received' | 'bought'

export interface Site {
  id:         string
  name:       SiteName
  company:    CompanyName
  created_at: string
}

export interface UserProfile {
  id:         string
  username:   string
  role:       UserRole
  site_id:    string | null
  company:    CompanyName | null
  name_am:    string
  name_en:    string
  is_active:  boolean
  signature_url: string | null
  created_at: string
  updated_at: string
}

export interface InventoryItem {
  id:          string
  site_id:     string
  name:        string
  unit:        string
  received:    number
  bought:      number
  used:        number
  damaged:     number
  transferred: number
  temp_store:  number
  tempStore?:  number
  remained:    number  // generated column
  created_at?: string
  updated_at?: string
}

export interface InventoryLog {
  id:               string
  site_id:          string
  item_id:          string
  transaction_type: string
  quantity:         number
  reference_id:     string | null
  performed_by:     string | null
  notes:            string | null
  created_at:       string
}

export interface PurchaseOrder {
  id:                      string
  po_number:               string
  site_id:                 string
  company:                 CompanyName
  item:                    string
  qty:                     number
  estimated_price:         number | null
  status:                  POStatus
  proforma_attached:       boolean
  proforma_url:            string | null
  bank_ref:                string | null
  bank_name:               string | null
  payment_screenshot_url:  string | null
  finance_audited:         boolean
  requested_by:            string | null
  created_at:              string
  updated_at:              string
}

export interface POStatusHistory {
  id:          string
  po_id:       string
  from_status: POStatus | null
  to_status:   POStatus
  changed_by:  string | null
  note:        string | null
  created_at:  string
}

export interface MaterialRequest {
  id:           string
  req_number:   string
  site_id:      string
  item:         string
  qty:          number
  status:       MaterialRequestStatus
  requested_by: string | null
  created_at:   string
  updated_at:   string
}

export interface MaterialTransfer {
  id:               string
  transfer_number:  string
  source_site_id:   string
  dest_site_id:     string
  item_id:          string
  item_name:        string
  qty:              number
  unit:             string
  transfer_type:    TransferType
  status:           TransferStatus
  balance_before:   number | null
  balance_after:    number | null
  requested_by:     string | null
  approved_by:      string | null
  verified_by:      string | null
  transfer_date:    string
  created_at:       string
  updated_at:       string
}

export interface PettyCashAccount {
  id:              string
  site_id:         string
  balance:         number
  max_balance:     number
  alert_threshold: number
  updated_at:      string
}

export interface PettyCashLog {
  id:           string
  site_id:      string
  description:  string
  amount:       number
  item_name:    string | null
  receipt_url:  string | null
  is_audited:   boolean
  audited_by:   string | null
  performed_by: string | null
  log_date:     string
  created_at:   string
}

export interface ErrorLog {
  id:               string
  error_type:       'syntax' | 'logic' | 'security' | 'other'
  error_content:    string
  reported_by:      string | null
  status:           'open' | 'investigating' | 'resolved'
  resolution_notes: string | null
  created_at:       string
  updated_at:       string
}

export interface Worker {
  id:          string
  site_id:     string
  name:        string
  worker_type: 'professional' | 'labor'
  role_title:  string
  is_active:   boolean
  created_at:  string
}

export interface AttendanceRecord {
  id:           string
  site_id:      string
  worker_id:    string
  record_date:  string
  is_present:   boolean
  submitted_by: string | null
  submitted_at: string | null
  created_at:   string
}

export interface WastageReport {
  id:            string
  report_number: string
  site_id:       string
  item_id:       string | null
  material_name: string
  qty:           number
  reason:        string
  photo_url:     string | null
  reporter_role: UserRole
  reported_by:   string | null
  status:        WastageStatus
  reviewed_by:   string | null
  report_date:   string
  created_at:    string
}

export interface SystemMessage {
  id:                string
  title:             string
  body:              string
  action_key:        string
  recipient_role:    UserRole
  recipient_company: CompanyName | null
  recipient_site_id: string | null
  recipient_user_id: string | null
  is_read:           boolean
  is_dismissed:      boolean
  reference_id:      string | null
  reference_type:    string | null
  created_at:        string
}

export type Database = {
  public: {
    Tables: {
      sites: { Row: any; Insert: any; Update: any; Relationships: any[] }
      user_profiles: { Row: any; Insert: any; Update: any; Relationships: any[] }
      inventory_items: { Row: any; Insert: any; Update: any; Relationships: any[] }
      inventory_logs: { Row: any; Insert: any; Update: any; Relationships: any[] }
      purchase_orders: { Row: any; Insert: any; Update: any; Relationships: any[] }
      po_status_history: { Row: any; Insert: any; Update: any; Relationships: any[] }
      material_requests: { Row: any; Insert: any; Update: any; Relationships: any[] }
      material_transfers: { Row: any; Insert: any; Update: any; Relationships: any[] }
      petty_cash_accounts: { Row: any; Insert: any; Update: any; Relationships: any[] }
      petty_cash_logs: { Row: any; Insert: any; Update: any; Relationships: any[] }
      workers: { Row: any; Insert: any; Update: any; Relationships: any[] }
      attendance_records: { Row: any; Insert: any; Update: any; Relationships: any[] }
      wastage_reports: { Row: any; Insert: any; Update: any; Relationships: any[] }
      system_messages: { Row: any; Insert: any; Update: any; Relationships: any[] }
      action_receipts: { Row: any; Insert: any; Update: any; Relationships: any[] }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      log_inventory_usage: { Args: Record<string, any>; Returns: any }
      add_inventory_item: { Args: Record<string, any>; Returns: any }
      log_wastage: { Args: Record<string, any>; Returns: any }
      initiate_transfer: { Args: Record<string, any>; Returns: any }
      manager_transfer_decision: { Args: Record<string, any>; Returns: any }
      finance_verify_transfer: { Args: Record<string, any>; Returns: any }
      payer_release_payment: { Args: Record<string, any>; Returns: any }
      log_petty_cash_expense: { Args: Record<string, any>; Returns: any }
      weekly_temp_store_transfer: { Args: Record<string, any>; Returns: any }
    }
    Enums: {
      company_name: CompanyName
      site_name: SiteName
      user_role: UserRole
      po_status: POStatus
      transfer_status: TransferStatus
      transfer_type: TransferType
      wastage_status: WastageStatus
      material_request_status: MaterialRequestStatus
      inventory_source: InventorySource
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
