export interface PurchaseOrder {
    id: string;
    site: string;
    company: CompanyName;
    item: string;
    qty: number;
    status: 'draft' | 'pending_ceo' | 'pending_payer' | 'pending_finance' | 'money_released' | 'shipped' | 'blocked_mismatch' | 'completed';
    proformaAttached: boolean;
    bankRef?: string;
    bankName?: string;
    paymentScreenshot?: string;
    estimatedPrice?: number;
    financeAudited?: boolean;
    po_number?: string;
    site_id?: string;
    from_sc_request?: boolean;
    sc_request_id?: string | null;
    pa_signed?: boolean;
    purchaser_signed?: boolean;
    ceo_signed?: boolean;
    sites?: any;
    proformaUrl?: string;
}

export interface InventoryItem {
    id: string;
    name: string;
    unit: string;
    received: number;
    bought: number;
    used: number;
    damaged: number;
    transferred: number;
    remained: number;
    tempStore: number;
}

export interface TransferLog {
    id: string;
    item: string;
    qty: number;
    unit: string;
    destination: string;
    transferType: 'intra' | 'inter';
    status: 'pending_whole_manager' | 'pending_finance' | 'returned_back' | 'completed';
    currentBalance?: number;
    date: string;
}

export interface PettyCashLog {
    id: number;
    site: string;
    desc: string;
    amount: number;
    date: string;
    audited: boolean;
}

export interface WorkerAttendance {
    id: string;
    name: string;
    type: 'professional' | 'labor';
    role: string;
    present: boolean;
}

export interface LoggedInUser {
    role: 'storekeeper' | 'engineer' | 'purchaser' | 'manager' | 'coordinator' | 'whole_manager' | 'purchase_assistant' | 'payer' | 'finance' | 'ceo' | 'subcontractor' | 'maintenance';
    username?: string;
    site?: string;
    site_id?: string;
    company?: CompanyName;
    nameAm: string;
    nameEn: string;
}

export interface MaterialRequest {
    id: string;
    site: string;
    site_id?: string;
    item: string;
    qty: number;
    status: 'pending_engineer' | 'delivered' | 'approved_instock' | 'ordered' | 'cancelled' | 'ordered_pending' | 'storekeeper_approved';
    requestedBy: string;
}

export interface SystemMessage {
    id: string;
    title: string;
    body: string;
    actionKey: 'storekeeper_delivery' | 'engineer_request' | 'engineer_ship_notice' | 'purchaser_request' | 'purchaser_ship_notice' | 'petty_cash_replenish' | 'inventory_add' | 'ceo_purchase' | 'ceo_approvals' | 'payer_release' | 'finance_verify' | 'transfer_review' | 'transfer_verify' | 'wastage_review' | 'sk_transfer_temp' | 'sk_inventory_report' | 'po_workflow' | 'engineer_review' | 'pa_formal_paper' | 'pending_material_return' | 'manager_attendance' | 'manager_approvals' | 'purchaser_sign' | 'storekeeper_signoff' | 'finance_audit' | 'payer_release' | string;
    recipientRole: LoggedInUser['role'];
    recipientCompany?: CompanyName;
    recipientSite?: string;
    reference_id?: string;
    reference_type?: string;
}

export interface WastageReport {
    id: string;
    reporterRole: 'storekeeper' | 'engineer';
    site: string;
    material: string;
    reason: string;
    photoName: string;
    qty: number;
    date: string;
    status: 'pending' | 'reviewed';
}

export type CompanyName = 'Cappadocia' | 'Addisu Habte' | 'Vila Verde';
export type SiteName = | 'Friendship Site'
        | 'Lideta Site'
        | 'JFK Site'
        | '4 Kilo Site'
        | 'Bole Site'
        | 'Summit Site'
        | 'Meskel Flower Site'
        | 'Senga Tera Site';
