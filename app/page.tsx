'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useInventory } from '@/hooks/useInventory';
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders';
import { usePettyCash } from '@/hooks/usePettyCash';
import { useSystemMessages } from '@/hooks/useSystemMessages';
import { useTransfers } from '@/hooks/useTransfers';
import { useWastage } from '@/hooks/useWastage';
import { useAttendance } from '@/hooks/useAttendance';
import { useReceipts } from '@/hooks/useReceipts';
import { useMaterialRequests } from '@/hooks/useMaterialRequests';
// Lazy-loaded: ReceiptModal statically pulls in jspdf + dom-to-image-more (large libs)
// which are only needed when a receipt is opened. Loading it on demand keeps them out
// of the initial page bundle. Behaviour is unchanged (modal only renders when opened).
const ReceiptModal = dynamic(() => import('@/components/ReceiptModal'), { ssr: false });
import ReceiptsStore from '@/components/ReceiptsStore';
import PurchaseOrderWorkflow from '@/components/PurchaseOrderWorkflow';
import MaintenanceDashboard from '@/components/MaintenanceDashboard';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import { PurchaseOrder, InventoryItem, TransferLog, PettyCashLog, WorkerAttendance, LoggedInUser, MaterialRequest, SystemMessage, WastageReport, CompanyName, SiteName } from "@/lib/types";
import { SITE_DIRECTORY, STOREKEEPER_ACCOUNTS, FINANCE_DESKS, SUBCON_ACCOUNTS, getCompanyForSite } from "@/lib/constants";

const formatAmount = (amount: number) => amount.toLocaleString();

// --- SYSTEM DATABASE TYPES ---

export default function CappadociaApp() {
    const router = useRouter();
    // --- SYSTEM PREFERENCE STATES ---
    const [language, setLanguage] = useState<'am' | 'en'>('en');
    const [isDarkMode, setIsDarkMode] = useState<boolean>(true);


    // --- LOGIN STATE ---
    const { profile, login: authLogin, logout: authLogout, loading } = useAuth();
    
    useEffect(() => {
        if (!loading && !profile) {
            router.push('/login');
        }
    }, [profile, loading, router]);

    const [user, setUser] = useState<LoggedInUser | null>(null);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');

    // Suppress ugly browser native alerts
    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.alert = (msg: string) => {
                console.log("Supressed alert: ", msg);
            };
        }
    }, []);

    // --- REAL-TIME SUPABASE DATA HOOKS ---
    const { receipts, fetchReceipts, generateReceipt, pendingReceipt, openReceiptModal, closeReceiptModal } = useReceipts();
    
    // Helper to format old alphanumeric IDs into numeric IDs for display
    const formatReqNumber = (reqNum?: string) => {
        if (!reqNum) return 'Legacy Request';
        const suffix = reqNum.replace('REQ-', '').replace('PO-', '').replace('REC-', '');
        if (/[A-Z]/.test(suffix)) {
            let hash = 0;
            for (let i = 0; i < suffix.length; i++) hash = suffix.charCodeAt(i) + ((hash << 5) - hash);
            return reqNum.split('-')[0] + '-' + Math.abs(hash).toString().slice(0, 6);
        }
        return reqNum;
    };

    useEffect(() => {
        if (profile) {
            setUser({
                role: profile.role,
                username: profile.username,
                site: (profile as any).sites?.name || profile.site_id || undefined,
                site_id: profile.site_id || undefined,
                company: profile.company || undefined,
                nameAm: profile.name_am,
                nameEn: profile.name_en,
            });
            fetchReceipts();
        } else {
            setUser(null);
        }
    }, [profile, fetchReceipts]);

    const { materialRequests, refresh: refreshMaterialRequests } = useMaterialRequests(profile?.site_id ?? undefined);
    const { inventory: friendshipInventory, addItem: addInventoryItem, logUsage: logInventoryUsage, refresh: refreshInventory } = useInventory(profile?.site_id ?? null);
    const { orders: rawOrders, updateStatus: updatePOStatus, createOrder: createPO, refresh: refreshOrders } = usePurchaseOrders(undefined);
    const { account: pettyCashAccount, logs: pettyCashLogs, logExpense, replenish: replenishCash, auditLog: auditPettyCash } = usePettyCash(profile?.site_id ?? null);
    const pettyCashBalance = pettyCashAccount?.balance ?? 0;
    const { messages: systemMessages, sendMessage, dismiss: dismissMsg, clearAll: clearAllMsgs } = useSystemMessages(profile?.role, profile?.company, profile?.site_id);
    const { transfers: dbTransfers, requestTransfer, managerDecision: transferManagerDecision, financeVerify: transferFinanceVerify, refresh: refreshTransfers } = useTransfers(profile?.site_id ?? null);
    const { wastageReports: dbWastageReports, logWastage, reviewWastage, refresh: refreshWastage } = useWastage(profile?.site_id ?? null);
    const { workers: dbWorkers, attendanceSubmitted, toggleWorker: dbToggleWorker, submitAttendance: dbSubmitAttendance, refresh: refreshAttendance } = useAttendance(profile?.site_id ?? null);

    // --- LOCAL UI ADAPTORS (maps DB types to local UI shape) ---
    const friendshipInventoryUI: InventoryItem[] = friendshipInventory.map(i => {
        const reservedQty = materialRequests
            .filter(req => req.status === 'approved_instock' && req.item === i.name && (req.site_id === i.site_id || req.site === (i as any).sites?.name))
            .reduce((sum, req) => sum + req.qty, 0);

        const pendingTransferQty = dbTransfers
            .filter(tr => (tr.status === 'pending_whole_manager' || tr.status === 'pending_finance') && tr.item_name === i.name)
            .reduce((sum, tr) => sum + tr.qty, 0);

        return { 
            ...i, 
            tempStore: (i as any).temp_store ?? 0,
            remained: i.remained - reservedQty - pendingTransferQty,
            transferred: i.transferred + pendingTransferQty
        };
    });
    // Transfers: map DB MaterialTransfer → UI TransferLog
    const transfers: TransferLog[] = dbTransfers.map(t => ({
        id: t.id,
        item: t.item_name,
        qty: t.qty,
        unit: t.unit,
        destination: t.dest_site_id,
        transferType: t.transfer_type,
        status: t.status,
        currentBalance: t.balance_before ?? undefined,
        date: t.transfer_date?.slice(0, 10) ?? '',
    }));
    // WastageReports: map DB → UI
    const wastageReports: WastageReport[] = dbWastageReports.map(w => ({
        id: w.id,
        reporterRole: w.reporter_role === 'engineer' ? 'engineer' : 'storekeeper',
        site: w.site_id,
        material: w.material_name,
        reason: w.reason,
        photoName: w.photo_url ?? '',
        qty: w.qty,
        date: w.report_date,
        status: w.status,
    }));
    // Workers: map DB → UI
    const workers: WorkerAttendance[] = dbWorkers.map(w => ({
        id: w.id,
        name: w.name,
        type: w.worker_type,
        role: w.role_title,
        present: w.present,
    }));
    // Purchase Orders: map DB PurchaseOrder → UI PurchaseOrder shape
    const purchases: PurchaseOrder[] = (rawOrders as any[]).map((p: any) => ({
        id: p.id,
        site: p.sites?.name ?? p.site_id,
        company: p.company ?? p.sites?.company ?? 'Cappadocia',
        item: p.item,
        qty: p.qty,
        status: p.status,
        proformaAttached: p.proforma_attached ?? false,
        proformaUrl: p.proforma_url,
        bankRef: p.bank_ref,
        bankName: p.bank_name,
        paymentScreenshot: p.payment_screenshot_url,
        estimatedPrice: p.estimated_price,
        financeAudited: p.finance_audited ?? false,
        // Extended fields for full workflow
        po_number: p.po_number,
        site_id: p.site_id,
        from_sc_request: p.from_sc_request ?? false,
        sc_request_id: p.sc_request_id ?? null,
        pa_signed: p.pa_signed ?? false,
        purchaser_signed: p.purchaser_signed ?? false,
        ceo_signed: p.ceo_signed ?? false,
        sites: p.sites,
    }));
    // Petty Cash Logs: map DB → UI
    const pettyCashLogsUI = pettyCashLogs.map((l: any) => ({
        id: l.id,
        site: l.site_id,
        desc: l.description,
        amount: l.amount,
        date: l.log_date,
        audited: l.is_audited,
    }));

    // System messages: map DB field names → UI field names
    const visibleSystemMessagesRaw = systemMessages.filter(msg => {
        if (!user) return false;
        if ((msg as any).recipient_role !== user.role) return false;
        if ((msg as any).recipient_company && (msg as any).recipient_company !== user.company) return false;
        return true;
    });
    // Re-shape for the existing UI (uses recipientRole, actionKey etc.)
    const visibleSystemMessages: SystemMessage[] = visibleSystemMessagesRaw.map(msg => ({
        ...msg,
        recipientRole: (msg as any).recipient_role,
        recipientCompany: (msg as any).recipient_company,
        recipientSite: (msg as any).recipient_site_id,
        actionKey: (msg as any).action_key,
    } as any));

    // --- MESSAGE CENTER STATE ---
    const [showInstantApprovalPopup, setShowInstantApprovalPopup] = useState<boolean>(false);
    const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
    const [pettyCashReplenishmentAlerted, setPettyCashReplenishmentAlerted] = useState(false);

    // --- ACCOUNT / SECURITY STATE ---
    const [showChangePassword, setShowChangePassword] = useState<boolean>(false);

    // --- MODULAR FUNCTION OVERLAYS (Rest is hidden until clicked) ---
    const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
    const [showAvailablesId, setShowAvailablesId] = useState<string | null>(null);
    const [showAllAvailablesId, setShowAllAvailablesId] = useState<string | null>(null);
    const [splitApprovalReq, setSplitApprovalReq] = useState<{ id: string, available: number, remaining: number, exactName: string } | null>(null);
    const [selectedInventoryForReq, setSelectedInventoryForReq] = useState<Record<string, string>>({});
    const [inventorySelectionErrorForReq, setInventorySelectionErrorForReq] = useState<string | null>(null);

    // --- PROFORMA MODAL STATE ---
    const [showProformaModal, setShowProformaModal] = useState(false);
    const [activeProformaItem, setActiveProformaItem] = useState<string>('');

    // --- LIVE SYSTEM COMPANY FILTER ---
    const [companyFilter, setCompanyFilter] = useState<'all' | 'Cappadocia' | 'Addisu Habte' | 'Vila Verde'>('all');

    // --- PREVENT BODY SCROLLING WHEN MODALS ARE OPEN ---
    useEffect(() => {
        if (activeOverlay || showInstantApprovalPopup || showProformaModal || pendingReceipt || showChangePassword) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [activeOverlay, showInstantApprovalPopup, showProformaModal, pendingReceipt, showChangePassword]);

    // --- Local Material Requests (client-side, sent to API) ---
    // --- Local Material Requests (client-side, sent to API) ---
    const attendanceDate = new Date().toLocaleDateString('en-ET');

    // --- TEMPORARY FORM STATES ---
    const [newExpenseDesc, setNewExpenseDesc] = useState('');
    const [newExpenseAmount, setNewExpenseAmount] = useState('');
    const [newExpenseItem, setNewExpenseItem] = useState('');
    const [inventoryItemName, setInventoryItemName] = useState('');
    const [inventoryItemUnit, setInventoryItemUnit] = useState('pcs');
    const [inventoryItemQty, setInventoryItemQty] = useState('');
    const [inventoryItemSource, setInventoryItemSource] = useState<'received' | 'bought'>('received');
    const [inventoryItemSourceSite, setInventoryItemSourceSite] = useState('');
    const [transferItem, setTransferItem] = useState('');
    const [transferQty, setTransferQty] = useState('');
    const [transferDest, setTransferDest] = useState('');
    const [transferType, setTransferType] = useState<'intra' | 'inter'>('intra');
    const [reqItemName, setReqItemName] = useState('');
    const [reqQty, setReqQty] = useState('');
    const [subconItemName, setSubconItemName] = useState('');
    const [subconQty, setSubconQty] = useState('');
    const [wastageItem, setWastageItem] = useState('');
    const [wastageQty, setWastageQty] = useState('');
    const [wastageReason, setWastageReason] = useState('');
    const [wastagePhotoName, setWastagePhotoName] = useState('');
    const [selectedInventoryItem, setSelectedInventoryItem] = useState<any>(null);
    const [inventoryAction, setInventoryAction] = useState<'transfer' | 'used' | 'damage' | 'add_new' | 'add_existing' | null>(null);
    const [usageUsedBy, setUsageUsedBy] = useState('');
    
    // --- GLOBAL UI LOCK STATE ---
    const [processingItems, setProcessingItems] = useState<Set<string>>(new Set());

    const withProcessing = async (id: string, action: () => Promise<void>) => {
        if (processingItems.has(id)) return;
        setProcessingItems(prev => new Set(prev).add(id));
        try {
            await action();
        } finally {
            setProcessingItems(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };
    
    // --- Return Material States ---
    const [returnQty, setReturnQty] = useState('');
    const [returnReason, setReturnReason] = useState('');
    const [returningReq, setReturningReq] = useState<any>(null);
    const [usageItem, setUsageItem] = useState('');
    const [usageQty, setUsageQty] = useState('');
    const [selectedBank, setSelectedBank] = useState('Commercial Bank of Ethiopia');
    const [paymentScreenshotName, setPaymentScreenshotName] = useState('');
    const [newLaborName, setNewLaborName] = useState('');
    const [newLaborRole, setNewLaborRole] = useState('Daily Laborer');
    const [isAddingLabor, setIsAddingLabor] = useState(false);

    const addSystemMessage = (
        title: string,
        body: string,
        actionKey: string,
        recipient: { role: LoggedInUser['role']; company?: CompanyName; site?: string }
    ) => {
        // Send to real Supabase system_messages table
        sendMessage(title, body, actionKey, {
            role: recipient.role,
            company: recipient.company,
            site_id: recipient.site,
        }).catch(console.error);
    };



    const clearSystemMessages = () => {
        clearAllMsgs();
    };

    const dismissSystemMessage = (messageId: string) => {
        dismissMsg(messageId);
        setExpandedMessageId(prev => prev === messageId ? null : prev);
    };

    const renderMessageActions = (message: SystemMessage) => {
        const poWorkflowKeys = ['manager_approvals', 'ceo_approvals', 'pa_formal_paper', 'payer_release', 'purchaser_request', 'purchaser_ship_notice', 'storekeeper_delivery'];
        
        let targetOverlay: string = message.actionKey;
        if (poWorkflowKeys.includes(message.actionKey)) {
            targetOverlay = 'po_workflow';
        } else if (message.actionKey === 'finance_verify') {
            targetOverlay = 'finance_audit';
        } else if (message.actionKey === 'engineer_request') {
            targetOverlay = 'engineer_review';
        }

        if (message.actionKey === 'pending_material_return') {
            return (
                <div className="flex gap-2 pt-2">
                    <button
                        disabled={processingItems.has(`return-${message.id}`)} onClick={(e) => { e.stopPropagation(); withProcessing(`return-${message.id}`, async () => handleApproveReturn(message.id)); }} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold">{processingItems.has(`return-${message.id}`) ? 'Processing...' : (language === 'am' ? 'ተቀበል (Approve)' : 'Approve Return')}</button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            dismissSystemMessage(message.id);
                        }}
                        className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold"
                    >
                        {language === 'am' ? 'አትቀበል (Reject)' : 'Reject'}
                    </button>
                </div>
            );
        }

        const infoOnlyKeys = ['engineer_ship_notice', 'subcon_received', 'petty_cash_replenish', 'transfer_verify', 'inventory_add', 'info_only'];
        const isRejection = message.title?.toLowerCase().includes('reject');
        
        if (infoOnlyKeys.includes(message.actionKey) || isRejection) {
            return (
                <div className="flex gap-2 pt-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            dismissSystemMessage(message.id);
                        }}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold"
                    >
                        {language === 'am' ? 'እሺ (Acknowledge)' : 'Acknowledge'}
                    </button>
                </div>
            );
        }

        return (
            <div className="flex gap-2 pt-2">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setActiveOverlay(targetOverlay);
                        setShowInstantApprovalPopup(false);
                        setExpandedMessageId(null);
                    }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold"
                >
                    {language === 'am' ? 'ወደ ስራው ሂድ' : 'Open Task'}
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        dismissSystemMessage(message.id);
                    }}
                    className="flex-1 bg-blue-50 hover:bg-blue-100 text-red-600 px-4 py-2 rounded-xl text-xs font-bold"
                >
                    {language === 'am' ? 'ዝጋ' : 'Dismiss'}
                </button>
            </div>
        );
    };

    // --- LANGUAGE RENDERING HELPER ---
    const renderText = (amText: string, enText: string, extraClasses = '') => {
        if (language === 'am') {
            return (
                <span className={extraClasses}>
                    <span className="block font-extrabold tracking-tight leading-snug text-[15px]">{amText}</span>
                    <span className="block text-[10px] text-[#A3AED0] font-semibold uppercase tracking-wider mt-1">{enText}</span>
                </span>
            );
        } else {
            return (
                <span className={extraClasses}>
                    <span className="block font-extrabold tracking-tight leading-snug text-[15px]">{enText}</span>
                    <span className="block text-[10px] text-[#A3AED0] font-medium mt-1">{amText}</span>
                </span>
            );
        }
    };

    // --- SECURITY LOGIN VERIFICATION (Supabase Auth) ---
    const handleSystemLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError('');
        try {
            await authLogin(username, password);
            // profile useEffect will set user automatically
        } catch {
            setLoginError(language === 'am' ? 'የተጠቃሚ ስም ወይም የይለፍ ቃል የተሳሳተ ነው!' : 'Incorrect Username or Password!');
        }
    };


    const handleSystemLogout = async () => {
        await authLogout();
        setUser(null);
        setUsername('');
        setPassword('');
        setShowInstantApprovalPopup(false);
        setActiveOverlay(null);
    };

    // --- OPERATIONAL ACTIONS ---

    const handleToggleAttendance = (workerId: string) => {
        dbToggleWorker(workerId);
    };

    const handleAddLaborer = async () => {
        if (!newLaborName.trim() || !profile?.site_id) return;
        setIsAddingLabor(true);
        try {
            const res = await fetch('/api/attendance', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    site_id: profile.site_id,
                    name: newLaborName.trim(),
                    role_title: newLaborRole.trim() || 'Daily Laborer',
                    worker_type: 'labor',
                }),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            setNewLaborName('');
            setNewLaborRole('Daily Laborer');
            await refreshAttendance();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsAddingLabor(false);
        }
    };

    const handleSubmitAttendance = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await dbSubmitAttendance();
            await refreshAttendance();
            setActiveOverlay(null);
            alert(language === 'am' ? 'የሠራተኞች መገኘት በተሳካ ሁኔታ ተመዝግቧል!' : 'Attendance record submitted to Whole Manager!');
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleAddExpense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newExpenseDesc || !newExpenseAmount) return;
        const amountNum = parseFloat(newExpenseAmount);
        try {
            await logExpense(newExpenseDesc, amountNum, newExpenseItem || undefined);
            await generateReceipt('Petty Cash Expense', { 
                Description: newExpenseDesc, 
                Amount: amountNum, 
                Item: newExpenseItem || 'N/A' 
            }, profile?.site_id ?? null);
            setNewExpenseDesc('');
            setNewExpenseAmount('');
            setNewExpenseItem('');
            // Alert payer if balance goes low
            const nextBalance = pettyCashBalance - amountNum;
            if (nextBalance < 3000 && !pettyCashReplenishmentAlerted) {
                setPettyCashReplenishmentAlerted(true);
                addSystemMessage('Petty cash low', 'Storekeeper balance dropped below 3,000 birr. Release another 20,000 birr.', 'petty_cash_replenish', { role: 'payer' });
            }
            setActiveOverlay(null);
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleAddInventoryItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inventoryItemName || !inventoryItemUnit || !inventoryItemQty) {
            alert(language === 'am' ? 'እባክዎ ሁሉንም መረጃዎች ያስገቡ (Please fill all fields)' : 'Please fill all fields');
            return;
        }
        if (inventoryItemSource === 'received' && !inventoryItemSourceSite) {
            alert(language === 'am' ? 'እባክዎ መጣበትን ሳይት ይምረጡ (Please select a site)' : 'Please select a site');
            return;
        }
        const qtyNum = parseFloat(inventoryItemQty);
        try {
            await addInventoryItem(inventoryItemName, inventoryItemUnit, qtyNum, inventoryItemSource, inventoryItemSource === 'received' ? inventoryItemSourceSite : undefined);
            
            const receiptPayload: any = { item: inventoryItemName, qty: qtyNum, unit: inventoryItemUnit, source: inventoryItemSource };
            if (inventoryItemSource === 'received') {
                receiptPayload['from_site'] = inventoryItemSourceSite;
            }
            await generateReceipt('Inventory Addition', receiptPayload, profile?.site_id ?? null);
            
            setInventoryItemName('');
            setInventoryItemUnit('pcs');
            setInventoryItemQty('');
            setInventoryItemSource('received');
            setInventoryItemSourceSite('');
            
            let successMsg = `${inventoryItemName} was added to site inventory.`;
            if (inventoryItemSource === 'received' && inventoryItemSourceSite) {
                successMsg = `${inventoryItemName} was added to site inventory from ${inventoryItemSourceSite}.`;
            }
            addSystemMessage('Inventory updated', successMsg, 'inventory_add', { role: 'whole_manager' });
            await refreshInventory();
            setInventoryAction(null);
        } catch (err: any) {
            console.error(err.message);
            if (err.message === 'Unauthorized' || err.message?.includes('Unauthorized')) {
                alert(language === 'am' ? 'እባክዎ አስቀድመው ይግቡ! (Unauthorized)' : 'Please sign in first to perform this action.');
                router.push('/login');
            } else {
                alert(err.message || (language === 'am' ? 'ስህተት ተከስቷል' : 'An error occurred'));
            }
        }
    };

    const handleMaterialTransfer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!transferItem || !transferQty || !transferDest) {
            alert(language === 'am' ? 'እባክዎ ሁሉንም መረጃዎች ያስገቡ (Please fill all fields)' : 'Please fill all fields');
            return;
        }
        const qtyNum = parseFloat(transferQty);

        const currentStock = friendshipInventoryUI.find(i => i.name === transferItem);
        if (!currentStock || currentStock.remained < qtyNum) {
            alert(language === 'am' ? 'ስህተት፡ የሚበቃ ክምችት የለም!' : 'Error: Insufficient stock available.');
            return;
        }
        try {
            await requestTransfer({
                item_id: currentStock.id,
                item_name: transferItem,
                qty: qtyNum,
                unit: currentStock.unit,
                dest_site_id: transferDest,
                transfer_type: transferType,
            });
            await generateReceipt('Material Transfer Request', { item: transferItem, qty: transferQty, destination: transferDest, type: transferType }, profile?.site_id ?? null);
            setTransferQty('');
            setTransferDest('');
            setTransferType('intra');
            addSystemMessage('Transfer requested', `${transferItem} to ${transferDest} is waiting for manager review.`, 'transfer_review', { role: 'whole_manager' });
            await refreshTransfers();
            await refreshInventory();
            setSelectedInventoryItem(null);
            setInventoryAction(null);
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleTransferManagerDecision = async (transferId: string, decision: 'approve' | 'return') => {
        const transferRecord = transfers.find(transfer => transfer.id === transferId);
        try {
            await transferManagerDecision(transferId, decision === 'approve' ? 'approve' : 'reject');
            await generateReceipt('Transfer ' + decision, { 
                Item: transferRecord?.item, 
                Destination: transferRecord?.destination,
                Type: transferRecord?.transferType,
                Decision: decision 
            }, profile?.site_id ?? null);
            if (transferRecord) {
                const wasReturned = decision === 'return' || transferRecord.transferType === 'inter';
                addSystemMessage(
                    'Transfer routed',
                    wasReturned
                        ? `${transferRecord.item} for ${transferRecord.destination} was returned back.`
                        : `${transferRecord.item} for ${transferRecord.destination} moved to finance verification.`,
                    'transfer_review',
                    wasReturned
                        ? { role: 'storekeeper', site: (user?.site || 'Friendship Site') }
                        : { role: 'finance', company: 'Cappadocia' }
                );
            }
            await refreshTransfers();
        } catch (err: any) { alert(err.message); }
    };

    const handleVerifyTransfer = async (transferId: string) => {
        const transferRecord = transfers.find(transfer => transfer.id === transferId);
        if (!transferRecord) return;
        try {
            await transferFinanceVerify(transferId);
            addSystemMessage('Transfer verified', `${transferRecord.item} balance was verified and the transfer was completed.`, 'transfer_verify', { role: 'storekeeper', site: (user?.site || 'Friendship Site') });
            await refreshTransfers();
            await refreshInventory();
            await generateReceipt('Transfer Verification', { 
                Item: transferRecord?.item, 
                Destination: transferRecord?.destination,
                Verified_By: user?.nameEn || user?.username
            }, profile?.site_id ?? null);
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleRequestMaterial = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reqItemName || !reqQty) return;
        const qtyNum = parseFloat(reqQty);
        try {
            await createPO({
                site_id: profile?.site_id ?? '',
                company: user?.company ?? getCompanyForSite(user?.site || (user?.site || 'Friendship Site')),
                item: reqItemName,
                qty: qtyNum,
                estimated_price: qtyNum * 1200,
            });
            await generateReceipt('Site Engineer Material Request', { 
                Item: reqItemName, 
                Qty: qtyNum 
            }, profile?.site_id ?? null);
            setReqItemName('');
            setReqQty('');
            // Removed premature notification to purchaser. They will be notified after CEO approval.
            await refreshOrders();
            setActiveOverlay(null);
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleSubconRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!subconItemName || !subconQty) return;
        try {
            const res = await fetch('/api/material-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    site_id: profile?.site_id,
                    item: subconItemName,
                    qty: Number(subconQty),
                }),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            setSubconItemName('');
            setSubconQty('');
            await refreshMaterialRequests();
            await generateReceipt('Subcontractor Request', { item: subconItemName, qty: Number(subconQty) }, profile?.site_id ?? null);
            // System message is created on the backend
            setActiveOverlay(null);
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleEngineerReviewDecision = async (reqId: string, decision: 'instock' | 'outofstock') => {
        const req = materialRequests.find(r => r.id === reqId);
        if (!req) return;
        try {
            const searchStr = (req.item || '').toLowerCase();
            const exactStock = friendshipInventoryUI.find(i => i.name.toLowerCase() === searchStr);
            const exactName = selectedInventoryForReq[reqId] || exactStock?.name;

            // ── Determine if this request came from a Subcontractor ──
            // Any request from a SC (requestedBy is set, role is 'subcontractor') is tracked.
            const isFromSC = !!(req.requestedBy);

            if (decision === 'instock') {
                // INSTOCK: item must be matched in inventory — selection is required
                if (!exactName) {
                    const similarInventory = friendshipInventoryUI.filter(inv => {
                        const invName = inv.name.toLowerCase();
                        if (invName === searchStr || invName.includes(searchStr) || searchStr.includes(invName)) return true;
                        let matchCount = 0;
                        for (let i = 0; i < searchStr.length - 2; i++) {
                            if (invName.includes(searchStr.substring(i, i + 3))) { matchCount++; break; }
                        }
                        return matchCount > 0;
                    });
                    if (similarInventory.length > 0) {
                        setInventorySelectionErrorForReq(reqId);
                        setShowAvailablesId(reqId);
                        setShowAllAvailablesId(null);
                    } else {
                        setInventorySelectionErrorForReq(reqId);
                        setShowAllAvailablesId(reqId);
                        setShowAvailablesId(null);
                    }
                    return; // only instock blocks on missing selection
                }
                const currentStock = friendshipInventoryUI.find(i => i.name === exactName);
                if (!currentStock || currentStock.remained < req.qty) {
                    setSplitApprovalReq({
                        id: req.id,
                        available: currentStock ? currentStock.remained : 0,
                        remaining: req.qty - (currentStock ? currentStock.remained : 0),
                        exactName: exactName
                    });
                    return;
                }
                await fetch('/api/material-requests', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ request_id: reqId, action: 'engineer_approve_instock', site_id: req.site_id || req.site, exact_item_name: exactName || req.item })
                });
                alert(language === 'am' ? 'ለዕቃ ግምጃ ቤት ተልኳል' : 'Approved from stock. Ready for Storekeeper handover.');
            } else {
                // OUTOFSTOCK: no item selection required — directly create a PO.
                // Pass from_sc_request so SK can auto-notify SC on receipt.
                await fetch('/api/material-requests', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        request_id: reqId,
                        action: 'engineer_order',
                        site_id: req.site_id || req.site,
                        exact_item_name: req.item,
                        from_sc_request: isFromSC,
                        sc_request_id: isFromSC ? reqId : null,
                    })
                });
                alert(language === 'am' ? 'ወደ ሲተ ማናጀር (አዲስ) ተልኳል' : 'Purchase Order created → Sent to Site Manager (Addis) for authorization.');
            }
            
            // Manually clear from the UI state since Realtime publication is missing
            const msgToDismiss = systemMessages.find(m => m.reference_id === reqId && m.action_key === 'engineer_request');
            if (msgToDismiss) {
                dismissMsg(msgToDismiss.id);
            }

            await refreshMaterialRequests();
            await refreshInventory();
            await generateReceipt('Engineer Material Review', { 
                Item: req?.item || 'Unknown Request',
                Qty: req?.qty,
                Decision: decision 
            }, profile?.site_id ?? null);
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleSplitApproval = async (reqId: string, splitAction: 'cancel_remaining' | 'buy_remaining') => {
        if (!splitApprovalReq || splitApprovalReq.id !== reqId) return;
        const req = materialRequests.find(r => r.id === reqId);
        if (!req) return;

        try {
            await fetch('/api/material-requests', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    request_id: reqId, 
                    action: 'engineer_approve_partial', 
                    site_id: req.site_id || req.site, 
                    exact_item_name: splitApprovalReq.exactName,
                    approve_qty: splitApprovalReq.available,
                    split_action: splitAction,
                    remaining_qty: splitApprovalReq.remaining
                })
            });

            const msgToDismiss = systemMessages.find(m => m.reference_id === reqId && m.action_key === 'engineer_request');
            if (msgToDismiss) {
                dismissMsg(msgToDismiss.id);
            }

            if (splitAction === 'buy_remaining') {
                setReqItemName(splitApprovalReq.exactName);
                setReqQty(splitApprovalReq.remaining.toString());
                setActiveOverlay('request');
            } else {
                alert(language === 'am' ? 'የተረፈው ተሰርዟል' : 'Remaining quantity cancelled.');
            }

            setSplitApprovalReq(null);
            await refreshMaterialRequests();
            await refreshInventory();
            await generateReceipt('Engineer Material Review Partial', { 
                Item: splitApprovalReq.exactName || req?.item, 
                Approved_Qty: splitApprovalReq.available,
                Remaining_Qty: splitApprovalReq.remaining
            }, profile?.site_id ?? null);
        } catch (err: any) {
            alert(err.message || 'Error processing split approval');
        }
    };

    const handleStoreKeeperSignoff = async (reqId: string) => {
        try {
            const res = await fetch('/api/material-requests', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request_id: reqId, action: 'storekeeper_signoff' })
            });
            
            let data: any;
            try {
                data = await res.json();
            } catch {
                throw new Error(`Server error (${res.status}). Please try again.`);
            }
            
            if (!res.ok || data.error) {
                throw new Error(data?.error || `Request failed (${res.status})`);
            }
            
            const msgToDismiss = systemMessages.find(m => m.reference_id === reqId && m.action_key === 'storekeeper_signoff');
            if (msgToDismiss) dismissMsg(msgToDismiss.id);

            await refreshMaterialRequests();
            await refreshInventory();
            alert(language === 'am' ? 'እቃ ተሰጥቷል!' : 'Material handover logged as used.');
            await generateReceipt('Storekeeper Material Handover', { 
                Subcontractor: data.subcontractorName || 'Unknown',
                Approved_By_Engineer: data.engineerName || 'Unknown',
                Item: data.item || 'Unknown',
                Qty: data.qty || 0
            }, profile?.site_id ?? null);
        } catch (err: any) {
            alert(err.message || 'Handover failed. Please try again.');
        }
    };

    const handleWastageLog = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!wastageItem || !wastageQty || !wastageReason) {
            alert(language === 'am' ? 'እባክዎ ሁሉንም መረጃዎች ያስገቡ (Please fill all fields)' : 'Please fill all fields');
            return;
        }
        const qtyNum = parseFloat(wastageQty);

        const currentStock = friendshipInventoryUI.find(i => i.name === wastageItem);
        if (!currentStock || currentStock.remained < qtyNum) {
            alert(language === 'am' ? 'ስህተት፡ ክምችት ላይ ከተመዘገበው በላይ ብልሽት ማስገባት አይቻልም!' : 'Error: Cannot log wastage exceeding available stock.');
            return;
        }
        try {
            await logWastage({
                item_id: currentStock.id,
                item_name: wastageItem,
                qty: qtyNum,
                reason: wastageReason,
                photo_name: wastagePhotoName || undefined,
                reporter_role: user?.role === 'engineer' ? 'engineer' : 'storekeeper',
            });
            setWastageItem('');
            setWastageQty('');
            setWastageReason('');
            setWastagePhotoName('');
            await generateReceipt('Wastage Report', { 
                Item: wastageItem, 
                Qty: qtyNum, 
                Reason: wastageReason 
            }, profile?.site_id ?? null);
            addSystemMessage('Wastage reported', `${wastageItem} was reported by ${user?.role === 'engineer' ? 'site engineer' : 'storekeeper'} for manager review.`, 'wastage_review', { role: 'whole_manager' });
            await refreshWastage();
            await refreshInventory();
            setSelectedInventoryItem(null);
            setInventoryAction(null);
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleUsageLog = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!usageItem || !usageQty || !usageUsedBy) {
            alert(language === 'am' ? 'እባክዎ ሁሉንም መረጃዎች ያስገቡ (Please fill all fields)' : 'Please fill all fields');
            return;
        }
        const qtyNum = parseFloat(usageQty);

        const currentStock = friendshipInventoryUI.find(i => i.name === usageItem);
        if (!currentStock || currentStock.remained < qtyNum) {
            alert(language === 'am' ? 'ስህተት፡ የሚበቃ ክምችት የለም!' : 'Error: Insufficient stock available.');
            return;
        }
        try {
            await logInventoryUsage(currentStock.id, qtyNum);
            await generateReceipt('Material Usage', { 
                Item: usageItem, 
                Qty: qtyNum,
                UsedBy: usageUsedBy
            }, profile?.site_id ?? null);
            setUsageQty('');
            setUsageItem('');
            setUsageUsedBy('');
            setSelectedInventoryItem(null);
            setInventoryAction(null);
            await refreshInventory();
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleReturnSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!returningReq || !returnQty || !returnReason) return;
        
        try {
            const res = await fetch('/api/material-returns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reqId: returningReq.id,
                    itemName: returningReq.item,
                    qty: returnQty,
                    reason: returnReason
                })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            // Show receipt modal using the existing receipt system
            await generateReceipt('Material Return Request', {
                item: returningReq.item,
                qty_returned: parseFloat(returnQty),
                reason: returnReason,
                subcontractor: user?.nameEn || user?.username,
                status: 'Pending Storekeeper Approval',
                receipt_number: data.receiptNumber
            }, profile?.site_id);

            setReturningReq(null);
            setReturnQty('');
            setReturnReason('');
            await refreshMaterialRequests();
            setActiveOverlay('subcon_received');
        } catch (err: any) {
            alert(err.message || 'Error submitting return');
        }
    };

    const handleApproveReturn = async (messageId: string) => {
        try {
            const res = await fetch('/api/material-returns', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageId })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            // Show receipt modal for the Storekeeper
            await generateReceipt('Material Return Approved', {
                item: data.itemName,
                qty_returned: data.qty,
                unit: data.unit,
                subcontractor: data.subcontractorName,
                approved_by: user?.nameEn || user?.username,
                status: 'Returned to Inventory'
            }, profile?.site_id);

            dismissSystemMessage(messageId);
            await refreshInventory();
        } catch (err: any) {
            alert(err.message || 'Error approving return');
        }
    };

    const handlePayerRelease = async (poId: string) => {
        if (!selectedBank) {
            alert(language === 'am' ? 'ስህተት፡ እባክዎ ባንክ ይምረጡ!' : 'Error: Please select a bank.');
            return;
        }
        if (!paymentScreenshotName) {
            alert(language === 'am' ? 'ስህተት፡ እባክዎ የክፍያ ስክሪንሾት ያስገቡ!' : 'Error: Please attach the payment screenshot.');
            return;
        }
        try {
            await updatePOStatus(poId, 'pending_finance', {
                bank_name: selectedBank,
                payment_screenshot_url: paymentScreenshotName,
                finance_audited: false,
            });
            setPaymentScreenshotName('');
            await refreshOrders();
            const po = purchases.find(p => p.id === poId);
            await generateReceipt('PO Payment Proof Attached', { 
                PO_Number: po?.po_number || 'Unknown PO',
                Item: po?.item,
                Amount: po?.estimatedPrice,
                Bank: selectedBank
            }, profile?.site_id ?? null);
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleFinanceVerifyReceipt = async (poId: string) => {
        try {
            await updatePOStatus(poId, 'money_released', { finance_audited: true });
            await refreshOrders();
            const po = purchases.find(p => p.id === poId);
            await generateReceipt('Finance PO Verification', { 
                PO_Number: po?.po_number || 'Unknown PO',
                Item: po?.item,
                Amount: po?.estimatedPrice
            }, profile?.site_id ?? null);
        } catch (err: any) { alert(err.message); }
    };

    const handleReplenishPettyCash = async () => {
        try {
            await replenishCash();
            setPettyCashReplenishmentAlerted(false);
            await generateReceipt('Petty Cash Replenishment', { amount: 5000 }, profile?.site_id ?? null);
            setActiveOverlay(null);
        } catch (err: any) { alert(err.message); }
    };

    const handleAuditPettyCash = async (id: string | number) => {
        await auditPettyCash(String(id));
        await generateReceipt('Petty Cash Audit', { transactionId: id }, profile?.site_id ?? null);
    };

    const handleWorkflowStatusUpdate = async (id: string, newStatus: any, metadata?: any) => {
        try {
            await updatePOStatus(id, newStatus, metadata);
            const purchase = purchases.find(item => item.id === id);
            const siteName = (purchase as any)?.sites?.name || (purchase as any)?.site || 'the site';
            const itemName = purchase?.item || 'Material';
            // System messages are generated by the backend API in /api/purchase-orders/route.ts
            await refreshOrders();
            if (newStatus === 'sk_received') {
                await refreshInventory();
            }
        } catch (err: any) { alert(err.message); }
    };

    return (
        <div 
            className={`min-h-screen font-sans pb-12 transition-all duration-500 noise-bg ${isDarkMode ? 'text-white' : 'text-[#1B2559]'}`}
            style={{
                backgroundImage: isDarkMode 
                    ? 'linear-gradient(rgba(15, 23, 42, 0.85), rgba(15, 23, 42, 0.92)), url(/bg-building.jpg)' 
                    : 'linear-gradient(rgba(248, 249, 254, 0.85), rgba(254, 242, 242, 0.92)), url(/bg-building.jpg)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundAttachment: 'fixed'
            }}
        >

            
            {/* --- RECEIPT MODAL & STORE --- */}
            <ReceiptModal receipt={pendingReceipt} onClose={closeReceiptModal} language={language} />
            {activeOverlay === 'receipts' && user && (
                <ReceiptsStore 
                    receipts={receipts} 
                    onClose={() => setActiveOverlay(null)} 
                    language={language}
                    isDarkMode={isDarkMode}
                    onPrint={(receipt) => openReceiptModal(receipt)}
                    userRole={profile?.role || 'user'}
                />
            )}

            {/* --- CHANGE PASSWORD MODAL --- */}
            <ChangePasswordModal
                isOpen={showChangePassword}
                onClose={() => setShowChangePassword(false)}
                language={language}
                isDarkMode={isDarkMode}
                currentUsername={profile?.username}
                hasTelegramLinked={!!((profile as any)?.telegram_chat_id)}
                currentRecoveryPhone={(profile as any)?.recovery_phone || ''}
            />
            
            {/* CAPPADOCIA REALESTATE TOP BRAND BAR */}
            <header className={`sticky top-0 z-40 px-1 sm:px-5 py-1 sm:py-4 border-b transition-colors duration-500 ${isDarkMode ? 'bg-[#0a1232]/90 border-slate-800/50 glass' : 'bg-blue-950/95 text-white glass border-red-600/30'}`}>
                <div className="max-w-7xl mx-auto flex flex-row justify-between items-center gap-1 sm:gap-4 w-full">
                    
                    {/* LEFT SIDE: Language & Theme */}
                    <div className="flex flex-col sm:flex-row items-center gap-0 sm:gap-1.5 bg-white/[0.06] p-0 sm:p-2.5 rounded-md sm:rounded-xl border border-white/[0.06] shrink-0">
                        {/* Night / Day Switcher (Now at the top) */}
                        <button onClick={() => setIsDarkMode(!isDarkMode)} className="py-0 px-1 sm:p-1.5 rounded-lg bg-[#F4F7FE]/10 text-white hover:bg-white/20 transition-all text-[10px] sm:text-base w-full sm:w-auto flex items-center justify-center h-4 sm:h-auto" title="Toggle Day/Night">
                            <span className="transform scale-75 origin-center">{isDarkMode ? '☀️' : '🌙'}</span>
                        </button>
                        {/* Bilingual Switcher */}
                        <div className="flex bg-[#F4F7FE]/15 p-0 rounded-lg text-[8px] sm:text-xs">
                            <button onClick={() => setLanguage('am')} className={`px-1.5 sm:px-3 py-0 sm:py-1 rounded-md font-bold transition-all h-4 sm:h-auto flex items-center justify-center ${language === 'am' ? 'bg-blue-600 text-white shadow' : 'text-blue-200'}`}>
                                <span className="hidden sm:inline">አማርኛ</span><span className="sm:hidden leading-none">አማ</span>
                            </button>
                            <button onClick={() => setLanguage('en')} className={`px-1.5 sm:px-3 py-0 sm:py-1 rounded-md font-bold transition-all h-4 sm:h-auto flex items-center justify-center ${language === 'en' ? 'bg-blue-600 text-white shadow' : 'text-blue-200'}`}>
                                <span className="hidden sm:inline">English</span><span className="sm:hidden leading-none">EN</span>
                            </button>
                        </div>
                    </div>

                    {/* CENTER: Title Block */}
                    <div className="text-center flex-1 px-1">
                        <span className="text-[6px] sm:text-[10px] font-bold bg-gradient-to-r from-blue-600 to-blue-500 px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full tracking-widest text-white uppercase shadow-lg shadow-blue-600/25 inline-block mb-0.5 sm:mb-1">
                            {language === 'am' ? 'የተቀናጀ የቁጥጥር ሥርዓት' : 'Unified Control System'}
                        </span>
                        <h1 className="text-[7px] sm:text-lg font-bold sm:font-extrabold tracking-tight text-white/90 uppercase leading-tight">
                            <span className="hidden sm:inline">CAPPADOCIA REALESTATE S.C. • ADDISU HABTE • VILA VERDE</span>
                            <span className="sm:hidden">CAPPADOCIA R.E. • ADDISU HABTE</span>
                        </h1>
                        <p className="text-[5px] sm:text-[11px] text-blue-300/80 mt-0.5 font-medium leading-tight">
                            {language === 'am' ? 'የግንባታ እቃዎችና የጥቃቅን ገንዘብ ቁጥጥር' : 'Building Materials & Petty Cash'}
                        </p>
                        {user && (
                            <p className="text-[6px] sm:text-[10px] font-bold text-white tracking-wide mt-0.5 md:hidden opacity-90 leading-none">
                                {language === 'am' ? user.nameAm : user.nameEn} <span className="text-white/50 mx-0.5">•</span> <span className="text-blue-300">{user.site || (language === 'am' ? 'ማዕከላዊ አስተዳደር' : 'Central Admin')}</span>
                            </p>
                        )}
                    </div>

                    {/* RIGHT SIDE: Action Buttons */}
                    {user && (
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-0 sm:gap-1.5 bg-white/[0.06] p-0 sm:p-2.5 rounded-md sm:rounded-xl border border-white/[0.06] shrink-0">
                            {/* Logout (Now at the top on mobile) */}
                            <button onClick={handleSystemLogout} className="bg-blue-600 hover:bg-blue-700 text-white text-[8px] sm:text-xs font-bold px-1.5 sm:px-3 py-0 sm:py-1.5 rounded-lg transition w-full sm:w-auto order-1 sm:order-4 h-4 sm:h-auto flex items-center justify-center">
                                <span className="leading-none">{language === 'am' ? 'ውጣ' : 'Logout'}</span>
                            </button>
                            
                            {/* Security (Key Button) (Now 2nd on mobile) Minimized height */}
                            <button onClick={() => setShowChangePassword(true)} title={language === 'am' ? 'የይለፍ ቃል ቀይር' : 'Account Settings'} className="bg-white/10 hover:bg-white/20 text-white text-[8px] sm:text-xs font-bold px-1.5 sm:px-3 py-0 sm:py-1.5 rounded-lg transition flex items-center justify-center w-full sm:w-auto order-2 sm:order-3 h-4 sm:h-auto">
                                <span className="transform scale-[0.65] origin-center leading-none">🔐</span> <span className="hidden sm:inline ml-1.5">{language === 'am' ? 'ደህንነት' : 'Security'}</span>
                            </button>

                            {/* Messages (Now 3rd on mobile) */}
                            <button onClick={() => setShowInstantApprovalPopup(true)} className="relative bg-white/10 hover:bg-white/20 text-white text-[8px] sm:text-xs font-bold px-1.5 sm:px-3 py-0 sm:py-1.5 rounded-lg transition flex items-center justify-center w-full sm:w-auto order-3 sm:order-1 h-4 sm:h-auto">
                                <span className="leading-none">{language === 'am' ? 'መልዕክት' : 'Messages'}</span>
                                {visibleSystemMessages.length > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 sm:min-w-5 sm:h-5 px-1 rounded-full bg-blue-600 text-white text-[8px] sm:text-[10px] font-black flex items-center justify-center border border-[#0a1232]">
                                        {visibleSystemMessages.length}
                                    </span>
                                )}
                            </button>

                            <div className="text-right hidden md:block w-full sm:w-auto order-4 sm:order-2">
                                <p className="text-xs font-black text-white">{language === 'am' ? user.nameAm : user.nameEn}</p>
                                <p className="text-[10px] text-blue-200">{user.site || (language === 'am' ? 'ማዕከላዊ አስተዳደር' : 'Central Admin')}</p>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            {/* BODY WRAPPER */}
            <main className="max-w-7xl mx-auto p-2 sm:p-4 md:p-6 mt-4 sm:mt-8 relative">

                {/* ==================== GATE 0: SECURE BILINGUAL LOGIN SCREEN ==================== */}
                {!user && (
                    <div className="flex h-[50vh] items-center justify-center">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
                    </div>
                )}

                {/* ==================== SYSTEM MAIN INTERFACE ==================== */}
                {user && (
                    <div className="space-y-6">

                        {/* ==================== THE ULTIMATE 100% CLEAN LAUNCHPAD (ZERO CLUTTER) ==================== */}
                        {/* The rest is NOT SEEN by default. Only these beautiful visual action cards (with custom SVG illustrations) are shown. */}

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5 stagger-children">

                            {/* --- GLOBAL ACTION: RECEIPTS --- */}
                            <div onClick={() => setActiveOverlay('receipts')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                  <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                  </svg>
                                  {renderText('ደረሰኞች (Receipts)', 'SYSTEM RECEIPTS')}
                              </div>


                            {/* --- ROLE 1: STOREKEEPER ACTIONS --- */}
                            {user.role === 'storekeeper' && (
                                <>
                                    {/* Card 1: Storekeeper Signoff */}
                                    <div
                                        onClick={() => setActiveOverlay('sk_quick_tasks')}
                                        className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}
                                    >
                                        <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                        </svg>
                                        {renderText('ፈጣን ተግባራት', 'Quick Tasks')}
                                    </div>

                                    {/* Card 2: Inventory Table */}
                                    <div
                                        onClick={() => setActiveOverlay('inventory')}
                                        className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}
                                    >
                                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                                        </svg>
                                        {renderText('የዕቃዎች ክምችት / ቆጠራ', 'Site Inventory Levels')}
                                    </div>

                                    {/* Card 2: Attendance checklist */}
                                    <div
                                        onClick={() => setActiveOverlay('attendance')}
                                        className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}
                                    >
                                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
                                        </svg>
                                        {renderText('የሠራተኞች ዕለት መገኘት ሰነድ', 'Timekeeper Site Attendance')}
                                    </div>

                                    {/* Card 3: Petty Cash Drawer */}
                                    <div
                                        onClick={() => setActiveOverlay('pettycash')}
                                        className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}
                                    >
                                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path>
                                        </svg>
                                        {renderText('የጥቃቅን ገንዘብ ወጪ መዝገብ', 'Petty Cash Ledger')}
                                    </div>

                                </>
                            )}


                            {/* ENGINEER BUTTONS */}
                            {user.role === 'engineer' && (
                                <>
                                    <div onClick={() => setActiveOverlay('engineer_review')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                                        {renderText('የሳብ ኮንትራክተር ጥያቄዎች', 'Review Subcontractor Requests')}
                                    </div>
                                    <div onClick={() => setActiveOverlay('request')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                        {renderText('አዲስ የእቃ ጥያቄ', 'Submit Material Request (Direct)')}
                                    </div>
                                    <div onClick={() => setActiveOverlay('wastage')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                        {renderText('የብልሽት ሪፖርት', 'Report Wastage to Manager')}
                                    </div>
                                    <div onClick={() => setActiveOverlay('engineer_shipments')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                        {renderText('የተላኩ እቃዎች', 'View Shipped Materials')}
                                    </div>
                                    <div onClick={() => setActiveOverlay('eng_sc_usage')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                        <svg className="w-10 h-10 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                        {renderText('የሳብ ኮንትራክተሮች የቁሳቁስ አጠቃቀም', 'SC Material Usage')}
                                    </div>
                                </>
                            )}

                            {/* PURCHASER BUTTONS */}
                            {user.role === 'purchaser' && (
                                <>
                                    <div onClick={() => setActiveOverlay('po_workflow')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                        {renderText('የገዢ ተግባራት', 'Purchaser Tasks')}
                                    </div>
                                </>
                            )}

                            {/* MANAGER BUTTONS */}
                            {user.role === 'manager' && (
                                <div onClick={() => setActiveOverlay('po_workflow')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                    <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                                    {renderText('የሳይት ስራ አስኪያጅ ማረጋገጫ', 'Site Manager Approvals')}
                                </div>
                            )}

                            {/* PAYER BUTTONS */}
                            
                                {user.role === 'whole_manager' && (
                                    <div onClick={() => setActiveOverlay('po_workflow')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                                        {renderText('የዋና ስራ አስኪያጅ ማረጋገጫ', 'Whole Manager Approvals')}
                                    </div>
                                )}
                                {user.role === 'whole_manager' && (
                                    <div onClick={() => setActiveOverlay('manager_attendance')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                                        {renderText('የሠራተኞች መገኘት ሪፖርት', 'Attendance Report')}
                                    </div>
                                )}
                                {user.role === 'purchase_assistant' && (
                                    <div onClick={() => setActiveOverlay('po_workflow')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                        {renderText('መደበኛ ፎርም መጻፊያ', 'Formal Papers')}
                                    </div>
                                )}

                                {user.role === 'payer' && (
                                    <div onClick={() => setActiveOverlay('po_workflow')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                                        {renderText('የባንክ ክፍያ ፈጻሚ', 'Release Payment by Bank Screenshot')}
                                    </div>
                                )}

                            {/* FINANCE BUTTONS */}
                            {user.role === 'finance' && (
                                <>
                                    <div onClick={() => setActiveOverlay('finance_audit')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                        {renderText('የማረጋገጫ እና ቀሪ ሂሳብ', 'Verify Receipts and Balances')}
                                    </div>
                                    <div onClick={() => setActiveOverlay('finance_transfers')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                                        {renderText('የዕቃ ዝውውር ማረጋገጫ', 'Approve Intra-Company Transfers')}
                                    </div>
                                </>
                            )}


                            {/* CEO BUTTONS */}
                            {user.role === 'ceo' && (
                                <>
                                    <div
                                        onClick={() => setActiveOverlay('po_workflow')}
                                        className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-purple-50 border-purple-100/80'}`}
                                    >
                                        <svg className="w-10 h-10 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
                                        </svg>
                                        <div>
                                            {renderText('ሲኢኦ ማጽደቂያ', 'CEO Approvals')}
                                            {purchases.filter((p: any) =>
                                                p.status === 'pending_ceo_req' ||
                                                p.status === 'pending_ceo_prof' ||
                                                p.status === 'pending_ceo_formal_paper'
                                            ).length > 0 && (
                                                <span className="block mt-1 text-xs font-bold text-purple-600">
                                                    {purchases.filter((p: any) =>
                                                        p.status === 'pending_ceo_req' ||
                                                        p.status === 'pending_ceo_prof' ||
                                                        p.status === 'pending_ceo_formal_paper'
                                                    ).length} pending
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div onClick={() => setActiveOverlay('coordinator_analytics')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.5 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                        {renderText('ግሎባል ሳይት ኤክስፕሎረር', 'Global Project Site Explorer')}
                                    </div>
                                </>
                            )}

                            {/* SUBCONTRACTOR BUTTONS */}
                            {user.role === 'subcontractor' && (
                                <>
                                    <div onClick={() => setActiveOverlay('subcon_request')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                        {renderText('አዲስ የእቃ ጥያቄ', 'Request Materials')}
                                    </div>
                                    <div onClick={() => setActiveOverlay('subcon_view')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                                        {renderText('የጥያቄዎች ሁኔታ', 'View My Requests')}
                                    </div>
                                    <div onClick={() => setActiveOverlay('subcon_received')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                        <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                        {renderText('የተቀበልኳቸው እቃዎች', 'Your Received Items')}
                                    </div>
                                </>
                            )}
                                                    {user.role === 'maintenance' && (
                                <>
                                    <div onClick={() => setActiveOverlay('maintenance_sync')} className={`p-6 rounded-[24px] shadow-[0_4px_24px_rgba(15,23,42,0.06)] border cursor-pointer card-glow flex flex-col justify-between h-48 ${isDarkMode ? 'bg-[#1e293b] border-slate-800/60' : 'bg-white border-slate-100/80'}`}>
                                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                        {renderText('የሲስተም ጥገና', 'System Maintenance')}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* ==================== ACTIVE VIEW COLLAPSIBLE CONTAINERS ==================== */}
                        {activeOverlay && activeOverlay !== 'receipts' && (
                            <div className="fixed inset-0 bg-slate-950/50 overlay-backdrop flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) setActiveOverlay(null); }}>
                                <div className={`rounded-t-[28px] sm:rounded-[28px] shadow-[0_-10px_60px_rgba(0,0,0,0.15)] max-w-4xl w-full max-h-[90vh] sm:max-h-[85vh] overflow-y-auto p-6 animate-slide-up ${isDarkMode ? 'bg-[#1e293b] text-white border border-slate-700/50' : 'bg-white text-slate-800'}`}>

                                    {activeOverlay !== 'inventory' && (
                                        <div className="flex justify-between items-center pb-4 mb-5 border-b border-slate-200/10">
                                            <div className="flex items-center gap-3">
                                                <div className="w-1.5 h-8 rounded-full bg-gradient-to-b from-blue-600 to-blue-400"></div>
                                                <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{renderText('የተግባር ማከፋፈያ', 'Workspace Action')}</h3>
                                            </div>
                                            <button type="button" onClick={() => setActiveOverlay(null)} className={`group flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white' : 'bg-slate-100 hover:bg-blue-50 text-slate-500 hover:text-blue-600'}`}>
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                                {language === 'am' ? 'ዝጋ' : 'Close'}
                                            </button>
                                        </div>
                                    )}

                                    {/* A1: Inventory Overlay (7-Column Spreadsheet) */}
                                    {activeOverlay === 'inventory' && (
                                        <div className="space-y-4">
                                            {/* Header with Add New Item button */}
                                            <div className="flex flex-wrap justify-between items-center border-b border-slate-200/20 pb-3 gap-3">
                                                <div className="flex items-center gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => { setInventoryAction('add_new'); setSelectedInventoryItem(null); }}
                                                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                                                        {language === 'am' ? 'አዲስ እቃ ጨምር (Add New Item)' : 'Add New Item (አዲስ እቃ ጨምር)'}
                                                    </button>
                                                    <h3 className="text-lg font-black tracking-tight">{renderText('የዕቃዎች ክምችት ሁኔታ', 'Site Inventory Levels')}</h3>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full font-bold uppercase">ቀጥታ መረጃ (Live)</span>
                                                    <button type="button" onClick={() => { setActiveOverlay(null); setSelectedInventoryItem(null); setInventoryAction(null); }} className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white' : 'bg-slate-100 hover:bg-blue-50 text-slate-500 hover:text-blue-600'}`}>
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                                        {language === 'am' ? 'ዝጋ' : 'Close'}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Add New Item form (shown at top when inventoryAction === 'add_new') */}
                                            {inventoryAction === 'add_new' && (
                                                <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-blue-50 border-blue-200'}`}>
                                                    <div className="flex justify-between items-center mb-3">
                                                        <h4 className="font-extrabold text-sm">{language === 'am' ? 'ነባር እቃ ማስገቢያ (Add Existing Inventory)' : 'Add Existing Inventory (ነባር እቃ ማስገቢያ)'}</h4>
                                                        <button type="button" onClick={() => setInventoryAction(null)} className="text-xs text-slate-400 hover:text-red-500 font-bold">✕</button>
                                                    </div>
                                                    <form onSubmit={(e) => { e.preventDefault(); withProcessing('global-form', async () => handleAddInventoryItem(e)); }} className="space-y-3">
                                                        <input type="text" placeholder={language === 'am' ? 'የእቃ ስም' : 'Item name'} value={inventoryItemName} onChange={e => setInventoryItemName(e.target.value)} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700' : 'bg-white text-slate-800 border-slate-200'}`} />
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <input type="text" placeholder={language === 'am' ? 'የመለኪያ አይነት' : 'Unit e.g. pcs, bags'} value={inventoryItemUnit} onChange={e => setInventoryItemUnit(e.target.value)} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700' : 'bg-white text-slate-800 border-slate-200'}`} />
                                                            <input type="number" placeholder={language === 'am' ? 'ብዛት' : 'Quantity'} value={inventoryItemQty} onChange={e => setInventoryItemQty(e.target.value)} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700' : 'bg-white text-slate-800 border-slate-200'}`} />
                                                        </div>
                                                        <select value={inventoryItemSource} onChange={e => setInventoryItemSource(e.target.value as 'received' | 'bought')} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700' : 'bg-white text-slate-800 border-slate-200'}`}>
                                                            <option value="received">{language === 'am' ? 'የገባ (Received)' : 'Received'}</option>
                                                            <option value="bought">{language === 'am' ? 'የተገዛ (Bought)' : 'Bought'}</option>
                                                        </select>
                                                        {inventoryItemSource === 'received' && (
                                                            <select required value={inventoryItemSourceSite} onChange={e => setInventoryItemSourceSite(e.target.value)} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700' : 'bg-white text-slate-800 border-slate-200'}`}>
                                                                <option value="">{language === 'am' ? 'ከየትኛው ሳይት? (From which site?)' : 'From which site? (ከየትኛው ሳይት?)'}</option>
                                                                <option value="Lideta Site">Lideta Site</option>
                                                                <option value="Meskel Flower Site">Meskel Flower Site</option>
                                                                <option value="4 Kilo Site">4 Kilo Site</option>
                                                                <option value="JFK Site">JFK Site</option>
                                                                <option value="Bole Site">Bole Site</option>
                                                                <option value="Summit Site">Summit Site</option>
                                                                <option value="Senga Tera Site">Senga Tera Site</option>
                                                            </select>
                                                        )}
                                                        <button type="submit" disabled={processingItems.has('global-form')} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-xs font-bold transition disabled:opacity-50">{processingItems.has('global-form') ? 'Processing...' : (language === 'am' ? 'አስገባ (Save Inventory)' : 'Save Inventory (አስገባ)')}</button>
                                                    </form>
                                                </div>
                                            )}

                                            {/* Inventory Table */}
                                            <div className="overflow-x-auto mobile-table-wrap text-xs">
                                                <table className="w-full text-left border-collapse">
                                                    <thead>
                                                        <tr className={`border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'} uppercase text-[#A3AED0]`}>
                                                            <th className="pb-3 font-bold">የዕቃው ዓይነት</th>
                                                            <th className="pb-3 font-bold">የገባ (Received)</th>
                                                            <th className="pb-3 font-bold">የተገዛ (Bought)</th>
                                                            <th className="pb-3 font-bold">ወጪ የተደረገ (Used)</th>
                                                            <th className="pb-3 font-bold">የተበላሸ (Damaged)</th>
                                                            <th className="pb-3 font-bold">የተዘዋወረ (Transferred)</th>
                                                            <th className={`pb-3 font-black text-center ${isDarkMode ? 'bg-[#1e293b] text-white' : 'bg-[#F4F7FE] text-[#422AFB]'}`}>የቀረ ክምችት (Remained)</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100/10">
                                                        {friendshipInventoryUI.map(item => (
                                                            <React.Fragment key={item.id}>
                                                                <tr
                                                                    className={`cursor-pointer transition-colors ${selectedInventoryItem?.id === item.id ? (isDarkMode ? 'bg-blue-900/30' : 'bg-blue-50') : 'hover:bg-slate-50/5'}`}
                                                                    onClick={() => {
                                                                        if (selectedInventoryItem?.id === item.id) {
                                                                            setSelectedInventoryItem(null);
                                                                            setInventoryAction(null);
                                                                        } else {
                                                                            setSelectedInventoryItem(item);
                                                                            setInventoryAction(null);
                                                                            setTransferItem(item.name);
                                                                            setUsageItem(item.name);
                                                                            setWastageItem(item.name);
                                                                        }
                                                                    }}
                                                                >
                                                                    <td className="py-4 font-extrabold">{item.name}</td>
                                                                    <td className="py-4 font-semibold text-slate-500">{item.received} {item.unit}</td>
                                                                    <td className="py-4 font-semibold text-slate-500">{item.bought} {item.unit}</td>
                                                                    <td className="py-4 font-semibold text-slate-500">{item.used} {item.unit}</td>
                                                                    <td className="py-4 font-semibold text-slate-400">{item.damaged} {item.unit}</td>
                                                                    <td className="py-4 font-semibold text-slate-400">{item.transferred} {item.unit}</td>
                                                                    <td className={`py-4 font-black text-center ${isDarkMode ? 'bg-[#1e293b]/50' : 'bg-[#F4F7FE]/60 text-[#422AFB]'}`}>{item.remained} {item.unit}</td>
                                                                </tr>

                                                                {/* Action buttons row - shown when this item is selected */}
                                                                {selectedInventoryItem?.id === item.id && !inventoryAction && (
                                                                    <tr>
                                                                        <td colSpan={7} className="py-3">
                                                                            <div className="flex flex-wrap gap-2 justify-center">
                                                                                <button onClick={(e) => { e.stopPropagation(); setInventoryAction('transfer'); }} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all">
                                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                                                                                    {language === 'am' ? 'ማስተላለፍ (Transfer)' : 'Transfer (ማስተላለፍ)'}
                                                                                </button>
                                                                                <button onClick={(e) => { e.stopPropagation(); setInventoryAction('used'); }} className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all">
                                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                                                                                    {language === 'am' ? 'ጥቅም ላይ የዋለ (Used)' : 'Used (ጥቅም ላይ የዋለ)'}
                                                                                </button>
                                                                                <button onClick={(e) => { e.stopPropagation(); setInventoryAction('damage'); }} className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all">
                                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                                                                    {language === 'am' ? 'ብልሽት (Damage)' : 'Damage (ብልሽት)'}
                                                                                </button>
                                                                                <button onClick={(e) => { 
                                                                                    e.stopPropagation(); 
                                                                                    setInventoryItemName(item.name);
                                                                                    setInventoryItemUnit(item.unit);
                                                                                    setInventoryItemQty('');
                                                                                    setInventoryItemSource('received');
                                                                                    setInventoryAction('add_existing'); 
                                                                                }} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all">
                                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                                                                                    {language === 'am' ? 'ነባር እቃ (Add Existing)' : 'Add Existing (ነባር እቃ)'}
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                )}

                                                                {/* Add Existing form inline */}
                                                                {selectedInventoryItem?.id === item.id && inventoryAction === 'add_existing' && (
                                                                    <tr>
                                                                        <td colSpan={7} className="py-3">
                                                                            <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-blue-50 border-blue-200'}`}>
                                                                                <div className="flex justify-between items-center mb-3">
                                                                                    <h4 className="font-extrabold text-sm">{language === 'am' ? 'ነባር እቃ ማስገቢያ (Add Existing Inventory)' : 'Add Existing Inventory (ነባር እቃ ማስገቢያ)'} — {item.name}</h4>
                                                                                    <button type="button" onClick={() => setInventoryAction(null)} className="text-xs text-slate-400 hover:text-red-500 font-bold">✕</button>
                                                                                </div>
                                                                                <form onSubmit={(e) => { e.preventDefault(); withProcessing('global-form', async () => handleAddInventoryItem(e)); }} className="space-y-3">
                                                                                    <input required type="number" placeholder={language === 'am' ? 'ብዛት' : 'Quantity'} value={inventoryItemQty} onChange={e => setInventoryItemQty(e.target.value)} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700' : 'bg-white text-slate-800 border-slate-200'}`} />
                                                                                    <select required value={inventoryItemSource} onChange={e => setInventoryItemSource(e.target.value as 'received' | 'bought')} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700' : 'bg-white text-slate-800 border-slate-200'}`}>
                                                                                        <option value="received">{language === 'am' ? 'ገቢ (Received)' : 'Received'}</option>
                                                                                        <option value="bought">{language === 'am' ? 'የተገዛ (Bought)' : 'Bought'}</option>
                                                                                    </select>
                                                                                    {inventoryItemSource === 'received' && (
                                                                                        <select required value={inventoryItemSourceSite} onChange={e => setInventoryItemSourceSite(e.target.value)} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700' : 'bg-white text-slate-800 border-slate-200'}`}>
                                                                                            <option value="">{language === 'am' ? 'ከየትኛው ሳይት? (From which site?)' : 'From which site? (ከየትኛው ሳይት?)'}</option>
                                                                                            <option value="Lideta Site">Lideta Site</option>
                                                                                            <option value="Meskel Flower Site">Meskel Flower Site</option>
                                                                                            <option value="4 Kilo Site">4 Kilo Site</option>
                                                                                            <option value="JFK Site">JFK Site</option>
                                                                                            <option value="Bole Site">Bole Site</option>
                                                                                            <option value="Summit Site">Summit Site</option>
                                                                                            <option value="Senga Tera Site">Senga Tera Site</option>
                                                                                        </select>
                                                                                    )}
                                                                                    <button type="submit" disabled={processingItems.has('global-form')} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-xs font-bold transition disabled:opacity-50">{processingItems.has('global-form') ? 'Processing...' : (language === 'am' ? 'መዝግብ (Save)' : 'Save (መዝግብ)')}</button>
                                                                                </form>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                )}

                                                                {/* Transfer form inline */}
                                                                {selectedInventoryItem?.id === item.id && inventoryAction === 'transfer' && (
                                                                    <tr>
                                                                        <td colSpan={7} className="py-3">
                                                                            <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-indigo-50 border-indigo-200'}`}>
                                                                                <div className="flex justify-between items-center mb-3">
                                                                                    <h4 className="font-extrabold text-sm">{language === 'am' ? 'ማስተላለፍ (Transfer)' : 'Transfer (ማስተላለፍ)'} — {item.name} <span className="text-slate-400 font-normal">({item.remained} {item.unit} {language === 'am' ? 'ቀሪ (left)' : 'left (ቀሪ)'})</span></h4>
                                                                                    <button type="button" onClick={() => setInventoryAction(null)} className="text-xs text-slate-400 hover:text-red-500 font-bold">✕</button>
                                                                                </div>
                                                                                <form onSubmit={(e) => { e.preventDefault(); withProcessing('global-form', async () => handleMaterialTransfer(e)); }} className="space-y-3">
                                                                                    <select required value={transferType} onChange={e => setTransferType(e.target.value as 'intra' | 'inter')} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700' : 'bg-white text-slate-800 border-slate-200'}`}>
                                                                                        <option value="intra">{language === 'am' ? 'ኩባንያ ውስጥ ዝውውር (Intra-company)' : 'Intra-company transfer (ኩባንያ ውስጥ ዝውውር)'}</option>
                                                                                        <option value="inter">{language === 'am' ? 'ኩባንያ ውጪ ዝውውር (Inter-company)' : 'Inter-company transfer (ኩባንያ ውጪ ዝውውር)'}</option>
                                                                                    </select>
                                                                                    <input required type="number" placeholder={language === 'am' ? 'ብዛት' : 'Quantity'} value={transferQty} onChange={e => setTransferQty(e.target.value)} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700' : 'bg-white text-slate-800 border-slate-200'}`} />
                                                                                    <select required value={transferDest} onChange={e => setTransferDest(e.target.value)} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700' : 'bg-white text-slate-800 border-slate-200'}`}>
                                                                                        <option value="">{language === 'am' ? 'የመድረሻ ሳይት ይምረጡ... (Select Destination)' : 'Select Destination... (የመድረሻ ሳይት)'}</option>
                                                                                        <option value="Lideta Site">Lideta Site</option>
                                                                                        <option value="Meskel Flower Site">Meskel Flower Site</option>
                                                                                        <option value="4 Kilo Site">4 Kilo Site</option>
                                                                                        <option value="JFK Site">JFK Site</option>
                                                                                        <option value="Bole Site">Bole Site</option>
                                                                                        <option value="Summit Site">Summit Site</option>
                                                                                        <option value="Senga Tera Site">Senga Tera Site</option>
                                                                                    </select>
                                                                                    <button type="submit" disabled={processingItems.has('global-form')} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-xs font-bold transition disabled:opacity-50">{processingItems.has('global-form') ? 'Processing...' : (language === 'am' ? 'አስተላልፍ (Execute Transfer)' : 'Execute Transfer (አስተላልፍ)')}</button>
                                                                                </form>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                )}

                                                                {/* Used form inline */}
                                                                {selectedInventoryItem?.id === item.id && inventoryAction === 'used' && (
                                                                    <tr>
                                                                        <td colSpan={7} className="py-3">
                                                                            <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-amber-50 border-amber-200'}`}>
                                                                                <div className="flex justify-between items-center mb-3">
                                                                                    <h4 className="font-extrabold text-sm">{language === 'am' ? 'ጥቅም ላይ የዋለ (Material Used)' : 'Material Used (ጥቅም ላይ የዋለ)'} — {item.name} <span className="text-slate-400 font-normal">({item.remained} {item.unit} {language === 'am' ? 'ቀሪ (left)' : 'left (ቀሪ)'})</span></h4>
                                                                                    <button type="button" onClick={() => setInventoryAction(null)} className="text-xs text-slate-400 hover:text-red-500 font-bold">✕</button>
                                                                                </div>
                                                                                <form onSubmit={(e) => { e.preventDefault(); withProcessing('global-form', async () => handleUsageLog(e)); }} className="space-y-3">
                                                                                    <input required type="text" placeholder={language === 'am' ? 'ማን ተጠቀመው? (ስም)' : 'Who used it? (Name)'} value={usageUsedBy} onChange={e => setUsageUsedBy(e.target.value)} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700' : 'bg-white text-slate-800 border-slate-200'}`} />
                                                                                    <input required type="number" placeholder={language === 'am' ? 'የወጣው ብዛት' : 'Quantity Used'} value={usageQty} onChange={e => setUsageQty(e.target.value)} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700' : 'bg-white text-slate-800 border-slate-200'}`} />
                                                                                    <button type="submit" disabled={processingItems.has('global-form')} className="w-full bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-xl text-xs font-bold transition disabled:opacity-50">{processingItems.has('global-form') ? 'Processing...' : (language === 'am' ? 'ወጪ መዝግብ (Log Usage)' : 'Log Usage (ወጪ መዝግብ)')}</button>
                                                                                </form>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                )}

                                                                {/* Damage form inline */}
                                                                {selectedInventoryItem?.id === item.id && inventoryAction === 'damage' && (
                                                                    <tr>
                                                                        <td colSpan={7} className="py-3">
                                                                            <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-red-50 border-red-200'}`}>
                                                                                <div className="flex justify-between items-center mb-3">
                                                                                    <h4 className="font-extrabold text-sm">{language === 'am' ? 'ብልሽት መዝግብ (Report Damage)' : 'Report Damage (ብልሽት መዝግብ)'} — {item.name} <span className="text-slate-400 font-normal">({item.remained} {item.unit} {language === 'am' ? 'ቀሪ (left)' : 'left (ቀሪ)'})</span></h4>
                                                                                    <button type="button" onClick={() => setInventoryAction(null)} className="text-xs text-slate-400 hover:text-red-500 font-bold">✕</button>
                                                                                </div>
                                                                                <form onSubmit={(e) => { e.preventDefault(); handleWastageLog(e); }} className="space-y-3">
                                                                                    <input required type="number" placeholder={language === 'am' ? 'የተበላሸው ብዛት' : 'Quantity Damaged'} value={wastageQty} onChange={e => setWastageQty(e.target.value)} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700' : 'bg-white text-slate-800 border-slate-200'}`} />
                                                                                    <input required type="text" placeholder={language === 'am' ? 'የብልሽቱ ምክንያት' : 'Reason for Damage'} value={wastageReason} onChange={e => setWastageReason(e.target.value)} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700' : 'bg-white text-slate-800 border-slate-200'}`} />
                                                                                    <label className={`block w-full text-xs p-3 border rounded-xl cursor-pointer ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700' : 'bg-white text-slate-800 border-slate-200'}`}>
                                                                                        <span className="block font-bold">{language === 'am' ? 'ፎቶ ያያይዙ (Attach photo)' : 'Attach photo (ፎቶ ያያይዙ)'}</span>
                                                                                        <input type="file" accept="image/*" className="hidden" onChange={e => setWastagePhotoName(e.target.files?.[0]?.name ?? '')} />
                                                                                        <span className="block mt-1 text-[10px] text-slate-400 break-all">{wastagePhotoName || (language === 'am' ? 'ፎቶ አልተመረጠም' : 'No photo selected')}</span>
                                                                                    </label>
                                                                                    <button type="submit" disabled={processingItems.has('global-form')} className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl text-xs font-bold transition disabled:opacity-50">{processingItems.has('global-form') ? 'Processing...' : (language === 'am' ? 'ብልሽት መዝግብ (Log Damage)' : 'Log Damage (ብልሽት መዝግብ)')}</button>
                                                                                </form>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </React.Fragment>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* A2: Attendance Checklist */}
                                    {activeOverlay === 'attendance' && (
                                        <div className="space-y-6 max-w-lg mx-auto">
                                            <div className="border-b border-slate-100/10 pb-3 flex justify-between items-center">
                                                {renderText('የሠራተኞች ዕለት መገኘት መመዝገቢያ', 'Site Attendance Sheet')}
                                                <span className="text-xs font-mono">{attendanceDate}</span>
                                            </div>

                                            <form onSubmit={(e) => withProcessing('global-form', async () => handleSubmitAttendance(e))} className="space-y-6">
                                                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">

                                                    {/* Professionals */}
                                                    <div className="py-2">
                                                        <p className="text-[11px] font-black text-[#422AFB] uppercase tracking-wider mb-3">የሳይቱ ባለሙያዎች (Site Professionals)</p>
                                                        <div className="space-y-4">
                                                            {workers.filter(w => w.type === 'professional').map(w => (
                                                                <div key={w.id} className="flex justify-between items-center text-xs">
                                                                    <div className="space-y-0.5">
                                                                        <p className="font-extrabold text-slate-900 dark:text-white">{w.name}</p>
                                                                        <p className="text-[10px] text-slate-400 font-semibold">{w.role}</p>
                                                                    </div>
                                                                    <input type="checkbox" checked={w.present} disabled={attendanceSubmitted} onChange={() => handleToggleAttendance(w.id)} className="w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-blue-600 cursor-pointer" />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Daily Labourers */}
                                                    <div className="py-2 border-t border-slate-100/10 pt-4">
                                                        <p className="text-[11px] font-black text-[#422AFB] uppercase tracking-wider mb-3">የእለት ሰራተኞች (Daily Laborers)</p>
                                                        <div className="space-y-4">
                                                            {workers.filter(w => w.type === 'labor').map(w => (
                                                                <div key={w.id} className="flex justify-between items-center text-xs">
                                                                    <div className="space-y-0.5">
                                                                        <p className="font-extrabold text-slate-900 dark:text-white">{w.name}</p>
                                                                        <p className="text-[10px] text-slate-400 font-semibold">{w.role}</p>
                                                                    </div>
                                                                    <input type="checkbox" checked={w.present} disabled={attendanceSubmitted} onChange={() => handleToggleAttendance(w.id)} className="w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-blue-600 cursor-pointer" />
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {/* Add new labour employee inline */}
                                                        {!attendanceSubmitted && (
                                                            <div className={`mt-4 pt-3 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                                                                <p className="text-[11px] font-bold text-slate-400 mb-2">{language === 'am' ? '+ አዲስ የእለት ሰራተኛ ጨምር' : '+ Add New Labour Employee'}</p>
                                                                <div className="flex gap-2">
                                                                    <input
                                                                        type="text"
                                                                        placeholder={language === 'am' ? 'ሰራተኛ ስም' : 'Worker Name'}
                                                                        value={newLaborName}
                                                                        onChange={e => setNewLaborName(e.target.value)}
                                                                        className={`flex-1 text-xs p-2.5 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700' : 'bg-[#F4F7FE] text-slate-800 border-slate-200'}`}
                                                                    />
                                                                    <input
                                                                        type="text"
                                                                        placeholder={language === 'am' ? 'ሙያ' : 'Trade/Role'}
                                                                        value={newLaborRole}
                                                                        onChange={e => setNewLaborRole(e.target.value)}
                                                                        className={`w-28 text-xs p-2.5 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700' : 'bg-[#F4F7FE] text-slate-800 border-slate-200'}`}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => withProcessing('global-form', async () => handleAddLaborer())}
                                                                        disabled={isAddingLabor || !newLaborName.trim()}
                                                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all"
                                                                    >
                                                                        {isAddingLabor ? '...' : '+'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                </div>

                                                {!attendanceSubmitted ? (
                                                    <button type="submit" disabled={processingItems.has('global-form')} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl text-xs font-bold transition disabled:opacity-50">{processingItems.has('global-form') ? 'Processing...' : 'ይህን መገኘት መዝግብና ላክ (Submit Attendance Sheet)'}</button>
                                                ) : (
                                                    <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-emerald-800 text-xs text-center font-bold">✓ የዛሬው መገኘት ሰነድ ለሥራ አስኪያጅ ተልኳል!</div>
                                                )}
                                            </form>
                                        </div>
                                    )}

                                    {/* A3: Request Form */}
                                    {activeOverlay === 'request' && (
                                        <div className="max-w-md mx-auto space-y-4">
                                            <h3 className="font-extrabold text-base border-b pb-3">{language === 'am' ? 'የሳይት ኢንጅነር እቃ ጥያቄ' : 'Site Engineer Material Request'}</h3>
                                            <form onSubmit={(e) => withProcessing('global-form', async () => handleRequestMaterial(e))} className="space-y-3">
                                                <input list="inventory_items" placeholder={language === 'am' ? 'የሚፈለገው እቃ ስም' : 'Item Name'} value={reqItemName} onChange={e => setReqItemName(e.target.value)} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#1e293b] text-white border-slate-700' : 'bg-[#F4F7FE] text-slate-800 border-slate-200'}`} />
                                                <datalist id="inventory_items">
                                                    <option value="R-bar 10mm" />
                                                    <option value="R-bar 12mm" />
                                                    <option value="Cement (Dangote)" />
                                                    <option value="PVC Pipes" />
                                                    {friendshipInventoryUI.map(inv => (
                                                        <option key={inv.id} value={inv.name} />
                                                    ))}
                                                </datalist>
                                                <input type="number" placeholder={language === 'am' ? 'የሚፈለገው ብዛት' : 'Quantity'} value={reqQty} onChange={e => setReqQty(e.target.value)} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#1e293b] text-white border-slate-700' : 'bg-[#F4F7FE] text-slate-800 border-slate-200'}`} />
                                                <button type="submit" disabled={processingItems.has('global-form')} className="w-full bg-[#422AFB] hover:bg-[#331df4] text-white py-3 rounded-xl text-xs font-bold transition disabled:opacity-50">{processingItems.has('global-form') ? 'Processing...' : (language === 'am' ? 'ላክ' : 'Submit Request')} </button>
                                            </form>
                                        </div>
                                    )}

                                    {/* A6: Petty cash drawer */}
                                    {activeOverlay === 'pettycash' && (
                                        <div className="max-w-md mx-auto space-y-4">
                                            <div className="flex justify-between items-center border-b pb-3">
                                                <h3 className="font-extrabold text-base">{language === 'am' ? 'የጥቃቅን ገንዘብ ወጪ መመዝገቢያ' : 'Petty Cash Drawer'}</h3>
                                                <p className={`font-black text-lg ${pettyCashBalance < 3000 ? 'text-red-600' : 'text-blue-950'}`}>{pettyCashBalance.toLocaleString()} ETB</p>
                                            </div>
                                            <form onSubmit={(e) => withProcessing('global-form', async () => handleAddExpense(e))} className="space-y-3">
                                                <input type="text" placeholder={language === 'am' ? 'የወጪው ምክንያት' : 'Description'} value={newExpenseDesc} onChange={e => setNewExpenseDesc(e.target.value)} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#1e293b] text-white border-slate-700' : 'bg-[#F4F7FE] text-slate-800 border-slate-200'}`} />
                                                <input type="number" placeholder={language === 'am' ? 'የወጪ መጠን' : 'Amount'} value={newExpenseAmount} onChange={e => setNewExpenseAmount(e.target.value)} className={`w-full text-xs p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#1e293b] text-white border-slate-700' : 'bg-[#F4F7FE] text-slate-800 border-slate-200'}`} />
                                                <button type="submit" disabled={processingItems.has('global-form')} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-xs font-bold transition disabled:opacity-50">{processingItems.has('global-form') ? 'Processing...' : 'መዝግብ (Log Expense)'}</button>
                                            </form>
                                        </div>
                                    )}

                                    {/* A7b: Manager Wastage Review */}
                                    {activeOverlay === 'manager_wastage' && (
                                        <div className="space-y-4 max-w-3xl mx-auto">
                                            <div className="border-b pb-3 flex justify-between items-center">
                                                {renderText('የብልሽት ሪፖርቶች ማረጋገጫ', 'Wastage Review Queue')}
                                                <span className="text-xs font-bold text-slate-400">{wastageReports.filter(report => report.status === 'pending').length} pending</span>
                                            </div>
                                            {wastageReports.length === 0 ? (
                                                <p className="text-sm text-slate-500 italic py-8 text-center">No wastage reports yet.</p>
                                            ) : (
                                                <div className="space-y-3">
                                                    {wastageReports.map(report => (
                                                        <div key={report.id} className={`p-4 rounded-xl border ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-[#F4F7FE] border-slate-50'}`}>
                                                            <div className="flex flex-wrap justify-between gap-2 text-xs font-bold text-slate-500">
                                                                <span>{report.id}</span>
                                                                <span>{report.site}</span>
                                                                <span>{report.reporterRole}</span>
                                                            </div>
                                                            <h4 className="font-extrabold text-sm mt-2">{report.material} - {report.qty}</h4>
                                                            <p className="text-xs mt-1"><span className="font-bold">Reason:</span> {report.reason}</p>
                                                            <p className="text-xs mt-1"><span className="font-bold">Photo:</span> {report.photoName || 'No photo attached'}</p>
                                                            <div className="mt-3 flex items-center justify-between">
                                                                <span className="text-[10px] uppercase font-black px-2.5 py-1 rounded-full bg-red-100 text-red-700">{report.status}</span>
                                                                <button disabled={processingItems.has(`wastage-${report.id}`)} onClick={() => withProcessing(`wastage-${report.id}`, async () => reviewWastage(report.id))} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold">{processingItems.has(`wastage-${report.id}`) ? 'Processing...' : 'Mark reviewed'}</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* A7c: Engineer Shipment View */}
                                    {activeOverlay === 'engineer_shipments' && (
                                        <div className="space-y-4 max-w-3xl mx-auto">
                                            <div className="border-b pb-3 flex justify-between items-center">
                                                {renderText('የተላኩ እቃዎች', 'Shipped Materials')}
                                                <span className="text-xs font-bold text-slate-400">Engineer notification queue</span>
                                            </div>
                                            {purchases.filter(purchase => purchase.status === 'shipped').length === 0 ? (
                                                <p className="text-sm text-slate-500 italic py-8 text-center">No shipped items yet.</p>
                                            ) : (
                                                <div className="space-y-3">
                                                    {purchases.map(purchase => purchase.status === 'shipped' && (
                                                        <div key={purchase.id} className={`p-4 rounded-xl border ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-[#F4F7FE] border-slate-50'}`}>
                                                            <div className="flex justify-between text-xs font-bold text-slate-500">
                                                                <span>{purchase.id}</span>
                                                                <span>{purchase.site}</span>
                                                            </div>
                                                            <h4 className="font-extrabold text-sm mt-2">{purchase.item} ({purchase.qty})</h4>
                                                            <p className="text-xs mt-1">Status: shipped</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Engineer: SC Material Usage Overview */}
                                    {activeOverlay === 'eng_sc_usage' && (() => {
                                        // Group material_requests by subcontractor
                                        const scRequests = materialRequests.filter(r =>
                                            ['delivered', 'approved_instock'].includes(r.status) && r.requestedBy
                                        );
                                        const grouped: Record<string, { item: string; qty: number; status: string }[]> = {};
                                        scRequests.forEach(r => {
                                            if (!grouped[r.requestedBy]) grouped[r.requestedBy] = [];
                                            grouped[r.requestedBy].push({ item: r.item, qty: r.qty, status: r.status });
                                        });
                                        const scNames = Object.keys(grouped);
                                        return (
                                            <div className="space-y-5 max-w-2xl mx-auto">
                                                <div className="border-b pb-3">
                                                    <h3 className="font-extrabold text-base">{language === 'am' ? 'የሳብ ኮንትራክተሮች የቁሳቁስ አጠቃቀም' : 'Subcontractor Material Usage'}</h3>
                                                    <p className="text-xs text-slate-500 mt-1">{language === 'am' ? 'እያንዳንዱ ሳብ ኮንትራክተር ምን ያህል ቁሳቁስ እንደወሰደ ይመልከቱ' : 'See what materials each subcontractor has received and is holding'}</p>
                                                </div>
                                                {scNames.length === 0 ? (
                                                    <p className="text-sm text-slate-400 italic text-center py-8">{language === 'am' ? 'ምንም ሳብ ኮንትራክተር አልተገኘም' : 'No subcontractor material records found.'}</p>
                                                ) : (
                                                    scNames.map(scName => {
                                                        const items = grouped[scName];
                                                        const holding = items.filter(i => i.status === 'delivered');
                                                        const used = items.filter(i => i.status === 'approved_instock');
                                                        return (
                                                            <div key={scName} className={`rounded-2xl border p-4 space-y-3 ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-[#F4F7FE] border-slate-100'}`}>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center">
                                                                        <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                                                                    </div>
                                                                    <h4 className="font-extrabold text-sm">{scName}</h4>
                                                                </div>
                                                                {holding.length > 0 && (
                                                                    <div>
                                                                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-1">{language === 'am' ? 'በእጁ ያለ (ገና አልተጠቀመም)' : 'Currently Holding'}</p>
                                                                        <div className="space-y-1">
                                                                            {holding.map((i, idx) => (
                                                                                <div key={idx} className="flex justify-between text-xs">
                                                                                    <span className="font-semibold">{i.item}</span>
                                                                                    <span className="text-amber-600 font-bold">{i.qty}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {used.length > 0 && (
                                                                    <div>
                                                                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">{language === 'am' ? 'ጥቅም ላይ ውሏል' : 'Used / Consumed'}</p>
                                                                        <div className="space-y-1">
                                                                            {used.map((i, idx) => (
                                                                                <div key={idx} className="flex justify-between text-xs">
                                                                                    <span className="font-semibold">{i.item}</span>
                                                                                    <span className="text-emerald-600 font-bold">{i.qty}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        );
                                    })()}


                                    {activeOverlay === 'pettycash_replenish' && (
                                        <div className="max-w-md mx-auto space-y-4">
                                            <div className="border-b pb-3 flex justify-between items-center">
                                                <h3 className="font-extrabold text-base">{language === 'am' ? 'ጥቃቅን ገንዘብ ማሳደሻ' : 'Petty Cash Replenishment'}</h3>
                                                <p className={`font-black text-lg ${pettyCashBalance < 3000 ? 'text-red-600' : 'text-blue-950'}`}>{pettyCashBalance.toLocaleString()} ETB</p>
                                            </div>
                                            <p className="text-xs text-slate-500">When the storekeeper balance drops below 3,000 birr, release another 20,000 birr immediately.</p>
                                            <button disabled={processingItems.has('global-form')} onClick={() => withProcessing('global-form', async () => handleReplenishPettyCash())} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-xs font-bold transition">Release 20,000 birr</button>
                                        </div>
                                    )}




                                    {/* C1: Manager Transfer Approvals */}
                                    {activeOverlay === 'manager_transfers' && (
                                        <div className="space-y-4 max-w-2xl mx-auto">
                                            <div className="pt-2 border-t border-slate-200/20 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="font-extrabold text-sm">Transfer Requests</h4>
                                                    <span className="text-[10px] text-slate-400 font-bold">Intra-company goes to finance, inter-company returns back</span>
                                                </div>
                                                {transfers.filter(transfer => transfer.status === 'pending_whole_manager').length === 0 ? (
                                                    <p className="text-xs text-[#A3AED0] italic py-4 text-center">No transfer requests awaiting manager review.</p>
                                                ) : null}
                                                <div className="space-y-3">
                                                    {transfers.map(transfer => transfer.status === 'pending_whole_manager' && (
                                                        <div key={transfer.id} className={`p-4 rounded-xl border ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-[#F4F7FE] border-slate-50'}`}>
                                                            <div className="flex justify-between items-start text-xs font-bold">
                                                                <span>{transfer.id} - {transfer.destination}</span>
                                                                <span>{transfer.transferType === 'intra' ? 'Intra-company' : 'Inter-company'}</span>
                                                            </div>
                                                            <h4 className="font-extrabold text-sm mt-2">{transfer.item} ({transfer.qty} {transfer.unit})</h4>
                                                            <p className="text-[11px] text-slate-500">Balance before transfer: {transfer.currentBalance?.toLocaleString() ?? 'N/A'}</p>
                                                            <div className="flex gap-2 mt-3">
                                                                <button disabled={processingItems.has(`transfer-${transfer.id}`)} onClick={() => withProcessing(`transfer-${transfer.id}`, async () => handleTransferManagerDecision(transfer.id, 'approve'))} className="flex-1 bg-blue-900 hover:bg-blue-950 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold transition">{processingItems.has(`transfer-${transfer.id}`) ? 'Processing...' : 'Approve'}</button>
                                                                <button disabled={processingItems.has(`transfer-${transfer.id}`)} onClick={() => withProcessing(`transfer-${transfer.id}`, async () => handleTransferManagerDecision(transfer.id, 'return'))} className="flex-1 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 text-red-600 px-4 py-2 rounded-xl text-xs font-bold transition">{processingItems.has(`transfer-${transfer.id}`) ? 'Processing...' : 'Return Back'}</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* C2: Manager Attendance Audit */}
                                    {activeOverlay === 'manager_attendance' && (
                                        <div className="space-y-4 max-w-2xl mx-auto">
                                            <div className="border-b pb-3 flex justify-between items-center">
                                                {renderText('የሠራተኞች መገኘት ሪፖርት ማረጋገጫ', 'Review Attendance Sheets')}
                                                <span className="text-xs font-mono">ቀን: {attendanceDate}</span>
                                            </div>
                                            {!attendanceSubmitted ? (
                                                <p className="text-sm text-[#A3AED0] italic py-8 text-center">ከፍሬንድሺፕ ሳይት የተላከ መገኘት ሰነድ የለም.</p>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className={`border p-4 rounded-xl ${isDarkMode ? 'bg-[#1e293b]/50 border-slate-700' : 'bg-[#F4F7FE]/40 border-slate-100'}`}>
                                                        <p className="text-xs font-extrabold text-[#422AFB] border-b pb-2 mb-2">ሳይቱ ላይ የነበሩ ባለሙያዎች</p>
                                                        <div className="space-y-1.5">
                                                            {workers.filter(w => w.type === 'professional').map(w => (
                                                                <div key={w.id} className="text-xs flex justify-between font-medium">
                                                                    <span>{w.name}</span>
                                                                    <span className={`font-bold ${w.present ? 'text-emerald-600' : 'text-red-500'}`}>{w.present ? '✓ ተገኝቷል' : '✗ Absent'}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div className={`border p-4 rounded-xl ${isDarkMode ? 'bg-[#1e293b]/50 border-slate-700' : 'bg-[#F4F7FE]/40 border-slate-100'}`}>
                                                        <p className="text-xs font-extrabold text-[#422AFB] border-b pb-2 mb-2">የእለት ሰራተኞች</p>
                                                        <div className="space-y-1.5">
                                                            {workers.filter(w => w.type === 'labor').map(w => (
                                                                <div key={w.id} className="text-xs flex justify-between font-medium">
                                                                    <span>{w.name}</span>
                                                                    <span className={`font-bold ${w.present ? 'text-emerald-600' : 'text-red-500'}`}>{w.present ? '✓ ተገኝቷል' : '✗ Absent'}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}



                                    {/* D2: Finance Petty Cash Audit */}
                                    {activeOverlay === 'finance_audit' && (
                                        <div className="space-y-4">
                                            <h3 className="font-extrabold text-lg border-b pb-3">የጥቃቅን ወጪዎች መቆጣጠሪያ መዝገብ (Audit Only)</h3>
                                            <div className="overflow-x-auto text-xs">
                                                <table className="w-full text-left border-collapse">
                                                    <thead>
                                                        <tr className="bg-slate-100 border-b text-[#A3AED0]">
                                                            <th className="p-3 font-bold">ቀን</th>
                                                            <th className="p-3 font-bold">ሳይት Location</th>
                                                            <th className="p-3 font-bold">ዝርዝር መግለጫ</th>
                                                            <th className="p-3 font-bold">የወጪ መጠን</th>
                                                            <th className="p-3 font-bold">ደረሰኝ ሁኔታ</th>
                                                            <th className="p-3 font-bold">ማረጋገጫ</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100/10">
                                                        {pettyCashLogsUI.map(log => (
                                                            <tr key={log.id} className="hover:bg-slate-50/5">
                                                                <td className="p-3 text-slate-500 font-semibold">{log.date}</td>
                                                                <td className="p-3 font-extrabold">{log.site}</td>
                                                                <td className="p-3">{log.desc}</td>
                                                                <td className="p-3 font-black text-red-600">{formatAmount(log.amount)} ETB</td>
                                                                <td className="p-3 text-[#422AFB] font-bold underline cursor-pointer">📄 receipt-photo.jpg</td>
                                                                <td className="p-3">
                                                                    {log.audited ? (
                                                                        <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full font-bold text-[10px]">Audited</span>
                                                                    ) : (
                                                                        <button disabled={processingItems.has(`audit-${log.id}`)} onClick={() => withProcessing(`audit-${log.id}`, async () => handleAuditPettyCash(log.id))} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1 rounded-lg font-bold text-[10px]">{processingItems.has(`audit-${log.id}`) ? '...' : 'Verify Receipt'}</button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            <div className="pt-6 border-t border-slate-200/30 space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <h4 className="font-extrabold text-sm">Purchase Release Audit</h4>
                                                    <span className="text-[10px] text-slate-400 font-bold">Release already done by payer, finance only audits</span>
                                                </div>
                                                {purchases.filter(purchase => purchase.status === 'pending_finance' || purchase.status === 'money_released').length === 0 ? (
                                                    <p className="text-xs text-[#A3AED0] italic py-4 text-center">No released purchases waiting for audit.</p>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {purchases.map(purchase => (purchase.status === 'pending_finance' || purchase.status === 'money_released') && (
                                                            <div key={purchase.id} className={`p-4 rounded-xl border ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-[#F4F7FE] border-slate-50'}`}>
                                                                <div className="flex justify-between items-start text-xs font-bold">
                                                                    <span>{purchase.id} - {purchase.site}</span>
                                                                    <span>{purchase.financeAudited ? 'Audited' : 'Pending audit'}</span>
                                                                </div>
                                                                <h4 className="font-extrabold text-sm mt-2">{purchase.item} ({purchase.qty} units)</h4>
                                                                <p className="text-[11px] text-slate-500 mt-1">Bank: {purchase.bankName || 'N/A'}</p>
                                                                <div className="mt-3">
                                                                    {purchase.financeAudited ? (
                                                                        <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full font-bold text-[10px]">Audited</span>
                                                                    ) : (
                                                                        <button onClick={() => handleFinanceVerifyReceipt(purchase.id)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold">Audit release</button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="pt-2 text-xs text-slate-500">Finance only verifies and audits these entries. Release happens at the payer/storekeeper flow.</div>
                                        </div>
                                    )}

                                    {/* ★ PO WORKFLOW */}
                                    {activeOverlay === 'po_workflow' && user && (
                                        <div className="space-y-4 w-full mx-auto">
                                            <div className="border-b pb-3">
                                                <h3 className="font-extrabold text-base">{language === 'am' ? 'የግዢ ሂደት መቆጣጠሪያ' : 'Purchase Order Workflow'}</h3>
                                                <p className="text-xs text-[#A3AED0] mt-1">
                                                {language === 'am'
                                                    ? `${user.nameAm} — ሚና: ${user.role}`
                                                    : `${user.nameEn} — Role: ${user.role}`}
                                                </p>
                                            </div>
                                            <PurchaseOrderWorkflow
                                                user={user}
                                                purchases={purchases}
                                                updateStatus={handleWorkflowStatusUpdate}
                                                language={language}
                                                generateReceipt={generateReceipt}
                                                refresh={refreshOrders}
                                                clearMessages={(actionKey: string, referenceId?: string) => {
                                                    systemMessages
                                                        .filter(m => (m as any).action_key === actionKey && (!referenceId || (m as any).reference_id === referenceId))
                                                        .forEach(m => dismissMsg(m.id));
                                                }}
                                            />
                                        </div>
                                    )}

                                    {/* D2: Finance Transfer Audit */}
                                    {activeOverlay === 'finance_transfers' && (
                                        <div className="space-y-4 max-w-2xl mx-auto">
                                            <div className="border-b pb-3">
                                                <h3 className="font-extrabold text-base">የውስጥ ዝውውር ማረጋገጫ (Intra-company Transfer Audit)</h3>
                                                <p className="text-xs text-slate-400">የሚቀር ክምችትን እና የደረሰኝ ማረጋገጫ ለውስጥ ዝውውሮች ብቻ</p>
                                            </div>
                                            {transfers.filter(transfer => transfer.status === 'pending_finance').length === 0 ? (
                                                <p className="text-xs text-[#A3AED0] italic py-8 text-center">ለማረጋገጥ የሚጠብቅ የውስጥ ዝውውር የለም (No intra-company transfers pending).</p>
                                            ) : null}
                                            <div className="space-y-3">
                                                {transfers.map(transfer => transfer.status === 'pending_finance' && (
                                                    <div key={transfer.id} className={`p-4 border rounded-xl space-y-3 ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-[#F4F7FE] border-slate-50'}`}>
                                                        <div className="flex justify-between items-start text-xs font-bold">
                                                            <span>{transfer.id} - {transfer.destination}</span>
                                                            <span>{transfer.transferType === 'intra' ? 'Intra-company' : 'Inter-company'}</span>
                                                        </div>
                                                        <h4 className="font-extrabold text-sm">{transfer.item} ({transfer.qty} {transfer.unit})</h4>
                                                        <p className="text-[11px] text-slate-500">Current balance before verification: {transfer.currentBalance !== undefined ? formatAmount(transfer.currentBalance) : 'N/A'}</p>
                                                        <button disabled={processingItems.has(`transfer-verify-${transfer.id}`)} onClick={() => withProcessing(`transfer-verify-${transfer.id}`, async () => handleVerifyTransfer(transfer.id))} className="w-full bg-[#422AFB] text-white disabled:opacity-50 py-2.5 rounded-xl text-xs font-bold transition hover:bg-[#331df4]">{processingItems.has(`transfer-verify-${transfer.id}`) ? 'Processing...' : '✓ Verify Receipt and Balance'}</button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* E2: Coordinator Global Site Explorer */}
                                    {activeOverlay === 'coordinator_analytics' && (
                                        <div className="space-y-4">
                                            <div className="border-b pb-3">
                                                <h3 className="font-extrabold text-lg">የግንባታ ሳይቶች መከታተያ (Global Site Explorer)</h3>
                                                <p className="text-xs text-slate-400">ከ 3ቱ ኩባንያዎች ሥር ያሉትን 8 ግንባታ ቦታዎች መከታተያ</p>
                                            </div>
                                            <div className="flex flex-wrap gap-1 bg-[#F4F7FE]/60 p-1 rounded-xl text-xs transition-colors mt-4 max-w-md">
                                                <button onClick={() => setCompanyFilter('all')} className={`flex-1 py-2 rounded-lg font-bold transition-all ${companyFilter === 'all' ? 'bg-white shadow text-[#1B2559]' : 'text-slate-500'}`}>All</button>
                                                <button onClick={() => setCompanyFilter('Cappadocia')} className={`flex-1 py-2 rounded-lg font-bold transition-all ${companyFilter === 'Cappadocia' ? 'bg-white shadow text-[#1B2559]' : 'text-slate-500'}`}>Cappadocia</button>
                                                <button onClick={() => setCompanyFilter('Addisu Habte')} className={`flex-1 py-2 rounded-lg font-bold transition-all ${companyFilter === 'Addisu Habte' ? 'bg-white shadow text-[#1B2559]' : 'text-slate-500'}`}>Addisu</button>
                                                <button onClick={() => setCompanyFilter('Vila Verde')} className={`flex-1 py-2 rounded-lg font-bold transition-all ${companyFilter === 'Vila Verde' ? 'bg-white shadow text-[#1B2559]' : 'text-slate-500'}`}>Vila Verde</button>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                                                {(companyFilter === 'all' || companyFilter === 'Cappadocia') && (
                                                    <>
                                                        <div className={`p-3 border rounded-xl flex justify-between items-center text-xs transition-colors ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                                                            <div>
                                                                <p className="font-extrabold">Friendship Site</p>
                                                                <p className="text-[10px] text-slate-400 font-semibold">Cappadocia Realestate S.C.</p>
                                                            </div>
                                                            <span className="text-blue-500 font-bold bg-blue-500/10 px-2.5 py-1 rounded-full">8 Items</span>
                                                        </div>
                                                        <div className={`p-3 border rounded-xl flex justify-between items-center text-xs transition-colors ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                                                            <div>
                                                                <p className="font-extrabold">JFK Site</p>
                                                                <p className="text-[10px] text-slate-400 font-semibold">Cappadocia Realestate S.C.</p>
                                                            </div>
                                                            <span className="text-blue-500 font-bold bg-blue-500/10 px-2.5 py-1 rounded-full">4 Items</span>
                                                        </div>
                                                        <div className={`p-3 border rounded-xl flex justify-between items-center text-xs transition-colors ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                                                            <div>
                                                                <p className="font-extrabold">Lideta Site</p>
                                                                <p className="text-[10px] text-slate-400 font-semibold">Cappadocia Realestate S.C.</p>
                                                            </div>
                                                            <span className="text-blue-500 font-bold bg-blue-500/10 px-2.5 py-1 rounded-full">12 Items</span>
                                                        </div>
                                                    </>
                                                )}
                                                {(companyFilter === 'all' || companyFilter === 'Addisu Habte') && (
                                                    <>
                                                        <div className={`p-3 border rounded-xl flex justify-between items-center text-xs transition-colors ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                                                            <div>
                                                                <p className="font-extrabold">4 Kilo Site</p>
                                                                <p className="text-[10px] text-slate-400 font-semibold">Addisu Habte Real Estate</p>
                                                            </div>
                                                            <span className="text-blue-500 font-bold bg-blue-500/10 px-2.5 py-1 rounded-full">18 Items</span>
                                                        </div>
                                                        <div className={`p-3 border rounded-xl flex justify-between items-center text-xs transition-colors ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                                                            <div>
                                                                <p className="font-extrabold">Summit Site</p>
                                                                <p className="text-[10px] text-slate-400 font-semibold">Addisu Habte Real Estate</p>
                                                            </div>
                                                            <span className="text-blue-500 font-bold bg-blue-500/10 px-2.5 py-1 rounded-full">11 Items</span>
                                                        </div>
                                                        <div className={`p-3 border rounded-xl flex justify-between items-center text-xs transition-colors ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                                                            <div>
                                                                <p className="font-extrabold">Bole Site</p>
                                                                <p className="text-[10px] text-slate-400 font-semibold">Addisu Habte Real Estate</p>
                                                            </div>
                                                            <span className="text-blue-500 font-bold bg-blue-500/10 px-2.5 py-1 rounded-full">7 Items</span>
                                                        </div>
                                                    </>
                                                )}
                                                {(companyFilter === 'all' || companyFilter === 'Vila Verde') && (
                                                    <>
                                                        <div className={`p-3 border rounded-xl flex justify-between items-center text-xs transition-colors ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                                                            <div>
                                                                <p className="font-extrabold">Meskel Flower Site</p>
                                                                <p className="text-[10px] text-slate-400 font-semibold">Vila Verde Real Estate</p>
                                                            </div>
                                                            <span className="text-blue-500 font-bold bg-blue-500/10 px-2.5 py-1 rounded-full">9 Items</span>
                                                        </div>
                                                        <div className={`p-3 border rounded-xl flex justify-between items-center text-xs transition-colors ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                                                            <div>
                                                                <p className="font-extrabold">Senga Tera Site</p>
                                                                <p className="text-[10px] text-slate-400 font-semibold">Vila Verde Real Estate</p>
                                                            </div>
                                                            <span className="text-blue-500 font-bold bg-blue-500/10 px-2.5 py-1 rounded-full">15 Items</span>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {activeOverlay === 'maintenance_sync' && (
                                        <MaintenanceDashboard user={user} isDarkMode={isDarkMode} />
                                    )}

                                    {/* F1: Subcontractor Request Form */}
                                    {activeOverlay === 'subcon_request' && (
                                        <div className="space-y-4 max-w-2xl mx-auto">
                                            <div className="border-b pb-3">
                                                <h3 className="font-extrabold text-base">Request Materials (Subcontractor)</h3>
                                            </div>
                                            <form onSubmit={(e) => withProcessing('global-form', async () => handleSubconRequest(e))} className="space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-500 mb-1">Material Name</label>
                                                        <input type="text" required value={subconItemName} onChange={e => setSubconItemName(e.target.value)} className={`w-full text-sm p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700 focus:border-blue-500' : 'bg-slate-50 border-slate-200 focus:border-blue-600'}`} placeholder="e.g. Cement" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-500 mb-1">Quantity</label>
                                                        <input type="number" required min="1" value={subconQty} onChange={e => setSubconQty(e.target.value)} className={`w-full text-sm p-3 border rounded-xl outline-none ${isDarkMode ? 'bg-[#0f172a] text-white border-slate-700 focus:border-blue-500' : 'bg-slate-50 border-slate-200 focus:border-blue-600'}`} placeholder="Quantity" />
                                                    </div>
                                                </div>
                                                <button type="submit" disabled={processingItems.has('global-form')} className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-red-500 hover:to-blue-400 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50">{processingItems.has('global-form') ? 'Processing...' : 'Submit Request to Engineer'}</button>
                                            </form>
                                        </div>
                                    )}

                                                                        {/* M1: Maintenance Sync Queue */}
                        
{/* F2: Subcontractor View Requests */}
                                    {activeOverlay === 'subcon_view' && (
                                        <div className="space-y-4 max-w-2xl mx-auto">
                                            <div className="border-b pb-3">
                                                <h3 className="font-extrabold text-base">My Material Requests</h3>
                                            </div>
                                            {materialRequests.filter(r => r.requestedBy === (user?.nameEn || user?.username)).length === 0 ? (
                                                <p className="text-xs text-[#A3AED0] italic py-8 text-center">No requests submitted yet.</p>
                                            ) : (
                                                <div className="space-y-3">
                                                    {materialRequests.filter(r => r.requestedBy === (user?.nameEn || user?.username)).map(req => {
                                                        let statusBg = 'bg-slate-200 text-slate-700';
                                                        if (req.status === 'cancelled') statusBg = 'bg-red-100 text-red-700';
                                                        if (req.status === 'ordered_pending' || req.status === 'ordered') statusBg = 'bg-amber-100 text-amber-700';
                                                        if (req.status === 'approved_instock') statusBg = 'bg-emerald-100 text-emerald-700';
                                                        return (
                                                        <div key={req.id} className={`p-4 border rounded-xl space-y-2 ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-[#F4F7FE] border-slate-50'}`}>
                                                            <div className="flex justify-between font-bold text-xs">
                                                                <span>{formatReqNumber(req.req_number)}</span>
                                                                <span className={`${statusBg} px-2 rounded-full uppercase tracking-wider text-[10px] py-0.5`}>{req.status.replace('_', ' ')}</span>
                                                            </div>
                                                            <h4 className="font-extrabold text-sm">{req.item} ({req.qty} units)</h4>
                                                            {(req.status === 'ordered_pending' || req.status === 'cancelled') && (
                                                                <p className="text-[10px] text-slate-500">
                                                                    {req.status === 'cancelled' ? 'This portion of your request was cancelled due to insufficient stock.' : 'This portion of your request is out of stock and has been ordered.'}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )})}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* F3: Subcontractor Received Items & Returns */}
                                    {activeOverlay === 'subcon_received' && (
                                        <div className="space-y-4 max-w-2xl mx-auto">
                                            <div className="border-b pb-3">
                                                <h3 className="font-extrabold text-base">{renderText('የተቀበልኳቸው እቃዎች', 'Your Received Items')}</h3>
                                                <p className="text-xs text-slate-500 mt-1">{renderText('ያልተጠቀሙባቸውን እቃዎች ለመመለስ "Return Back" የሚለውን ይጫኑ', 'Click "Return Back" to return unused items to the storekeeper')}</p>
                                            </div>
                                            {materialRequests.filter(r => r.requestedBy === (user?.nameEn || user?.username) && r.status === 'delivered').length === 0 ? (
                                                <p className="text-xs text-[#A3AED0] italic py-8 text-center">{renderText('ምንም የተረከቡት እቃ የለም።', 'No received items found.')}</p>
                                            ) : (
                                                <div className="space-y-3">
                                                    {materialRequests.filter(r => r.requestedBy === (user?.nameEn || user?.username) && r.status === 'delivered').map(req => (
                                                        <div key={req.id} className={`p-4 border rounded-xl flex items-center justify-between ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-[#F4F7FE] border-slate-50'}`}>
                                                            <div className="space-y-1">
                                                                <div className="font-bold text-xs text-slate-500">{formatReqNumber(req.req_number)}</div>
                                                                <h4 className="font-extrabold text-sm">{req.item} <span className="text-emerald-500">({req.qty} units received)</span></h4>
                                                            </div>
                                                            <button 
                                                                onClick={() => {
                                                                    setReturningReq(req);
                                                                    setActiveOverlay('subcon_return_form');
                                                                }}
                                                                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors">
                                                                {renderText('ይመልሱ (Return Back)', 'Return Back')}
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* F4: Subcontractor Return Form */}
                                    {activeOverlay === 'subcon_return_form' && returningReq && (
                                        <form onSubmit={handleReturnSubmit} className="space-y-5 max-w-md mx-auto">
                                            <div className="border-b pb-3">
                                                <h3 className="font-extrabold text-base">{renderText('እቃ ይመልሱ', 'Return Material')}</h3>
                                                <p className="text-xs text-slate-500 mt-1">Item: <strong className="text-slate-800 dark:text-white">{returningReq.item}</strong></p>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold mb-1">{renderText('የሚመልሱት ብዛት', 'Quantity to Return')}</label>
                                                <input type="number" min="0.01" step="0.01" max={returningReq.qty} required value={returnQty} onChange={e => setReturnQty(e.target.value)} className="w-full p-2.5 rounded-lg border bg-transparent text-sm" placeholder="E.g. 5" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold mb-1">{renderText('ምክንያት', 'Reason for Return')}</label>
                                                <textarea required value={returnReason} onChange={e => setReturnReason(e.target.value)} className="w-full p-2.5 rounded-lg border bg-transparent text-sm min-h-[80px]" placeholder="E.g. Excess material, wrong size..."></textarea>
                                            </div>
                                            <div className="flex gap-3 pt-2">
                                                <button type="button" onClick={() => { setReturningReq(null); setActiveOverlay('subcon_received'); }} className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold">{renderText('ተመለስ', 'Cancel')}</button>
                                                <button type="submit" disabled={processingItems.has('global-form')} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-600/20 disabled:opacity-50">{processingItems.has('global-form') ? 'Processing...' : (renderText('አረጋግጥ', 'Submit Return'))} </button>
                                            </div>
                                        </form>
                                    )}

                                    {/* G1: Engineer Review Requests */}
                                    {activeOverlay === 'engineer_review' && (
                                        <div className="space-y-4 max-w-2xl mx-auto">
                                            <div className="border-b pb-3">
                                                <h3 className="font-extrabold text-base">Subcontractor Requests Review</h3>
                                            </div>
                                            {materialRequests.filter(r => r.status === 'pending_engineer').length === 0 ? (
                                                <p className="text-xs text-[#A3AED0] italic py-8 text-center">No pending requests from subcontractors.</p>
                                            ) : (
                                                <div className="space-y-3">
                                                    {materialRequests.filter(r => r.status === 'pending_engineer').map(req => {
                                                        const lowerReq = (req.item || '').toLowerCase();
                                                        const similarInventory = friendshipInventoryUI.filter(inv => {
                                                            const invName = (inv.name || '').toLowerCase();
                                                            if (invName.includes(lowerReq) || lowerReq.includes(invName)) return true;
                                                            if (lowerReq.length >= 4 && invName.includes(lowerReq.substring(0, 4))) return true;
                                                            
                                                            // Loose match: at least 3 letters match in any order
                                                            const reqChars = new Set(lowerReq.replace(/\s+/g, '').split(''));
                                                            const invChars = new Set(invName.replace(/\s+/g, '').split(''));
                                                            let matchCount = 0;
                                                            for (const c of reqChars) {
                                                                if (invChars.has(c)) matchCount++;
                                                            }
                                                            if (matchCount >= 3) return true;

                                                            return false;
                                                        });
                                                        return (
                                                            <div key={req.id} className={`p-4 border rounded-xl space-y-3 ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-[#F4F7FE] border-slate-50'}`}>
                                                                <div className="flex justify-between font-bold text-xs">
                                                                    <span>{formatReqNumber(req.req_number)} - from {req.requestedBy}</span>
                                                                </div>
                                                                <h4 className="font-extrabold text-sm">{req.item} ({req.qty} units)</h4>
                                                                
                                                                {showAvailablesId === req.id && similarInventory.length > 0 ? (
                                                                    <div className={`p-2 rounded text-xs space-y-1 ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>
                                                                        {inventorySelectionErrorForReq === req.id ? (
                                                                            <p className="font-bold text-red-500 mb-2">Please select exact item from these available items:</p>
                                                                        ) : (
                                                                            <p className="font-bold opacity-70 mb-2">Available matching inventory:</p>
                                                                        )}
                                                                        {similarInventory.map((inv: any) => {
                                                                            const isSelected = selectedInventoryForReq[req.id] === inv.name;
                                                                            return (
                                                                            <div 
                                                                                key={inv.id} 
                                                                                onClick={() => {
                                                                                    setSelectedInventoryForReq(prev => ({ ...prev, [req.id]: inv.name }));
                                                                                    setInventorySelectionErrorForReq(null);
                                                                                }}
                                                                                className={`flex justify-between items-center p-2 rounded cursor-pointer transition ${isSelected ? 'bg-blue-100 dark:bg-blue-900/40 border-l-4 border-blue-500' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}
                                                                            >
                                                                                <span className={isSelected ? 'font-bold text-blue-700 dark:text-blue-300' : ''}>{inv.name}</span>
                                                                                <span className="font-mono opacity-80">{inv.remained} remaining</span>
                                                                            </div>
                                                                        )})}
                                                                    </div>
                                                                ) : null}
                                                                {showAvailablesId === req.id && similarInventory.length === 0 ? (
                                                                    <div className={`p-2 rounded text-xs space-y-1 ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>
                                                                        <p className="font-bold opacity-70">No matching inventory found. Click "Show All" to browse.</p>
                                                                    </div>
                                                                ) : null}

                                                                {showAllAvailablesId === req.id ? (
                                                                    <div className={`p-2 rounded text-xs space-y-1 max-h-48 overflow-y-auto ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>
                                                                        {inventorySelectionErrorForReq === req.id ? (
                                                                            <p className="font-bold text-red-500 mb-2">Please select exact item from all available items:</p>
                                                                        ) : (
                                                                            <p className="font-bold opacity-70 mb-2">All Storehouse Items:</p>
                                                                        )}
                                                                        {friendshipInventoryUI.map((inv: any) => {
                                                                            const isSelected = selectedInventoryForReq[req.id] === inv.name;
                                                                            return (
                                                                            <div 
                                                                                key={inv.id} 
                                                                                onClick={() => {
                                                                                    setSelectedInventoryForReq(prev => ({ ...prev, [req.id]: inv.name }));
                                                                                    setInventorySelectionErrorForReq(null);
                                                                                }}
                                                                                className={`flex justify-between items-center p-2 rounded cursor-pointer transition ${isSelected ? 'bg-blue-100 dark:bg-blue-900/40 border-l-4 border-blue-500' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}
                                                                            >
                                                                                <span className={isSelected ? 'font-bold text-blue-700 dark:text-blue-300' : ''}>{inv.name}</span>
                                                                                <span className="font-mono opacity-80">{inv.remained} remaining</span>
                                                                            </div>
                                                                        )})}
                                                                    </div>
                                                                ) : null}
                                                                
                                                                {splitApprovalReq?.id === req.id ? (
                                                                    <div className="flex gap-2 mt-2">
                                                                        <button onClick={() => setSplitApprovalReq(null)} className="bg-slate-300 hover:bg-slate-400 text-slate-800 font-bold px-3 py-2 rounded-xl text-[10px] sm:text-xs">Back</button>
                                                                        <button disabled={processingItems.has(`split-${req.id}`)} onClick={() => withProcessing(`split-${req.id}`, async () => handleSplitApproval(req.id, 'cancel_remaining'))} className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-[10px] sm:text-xs">{processingItems.has(`split-${req.id}`) ? 'Processing...' : `Approve ${splitApprovalReq.available} & Cancel Remaining`}</button>
                                                                        <button disabled={processingItems.has(`split-${req.id}`)} onClick={() => withProcessing(`split-${req.id}`, async () => handleSplitApproval(req.id, 'buy_remaining'))} className="flex-1 bg-[#422AFB] hover:bg-[#331df4] disabled:opacity-50 text-white font-bold py-2 rounded-xl text-[10px] sm:text-xs">{processingItems.has(`split-${req.id}`) ? 'Processing...' : `Approve ${splitApprovalReq.available} & Buy Remaining (${splitApprovalReq.remaining})`}</button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex gap-2 mt-2">
                                                                        <button onClick={() => { setShowAvailablesId(showAvailablesId === req.id ? null : req.id); setShowAllAvailablesId(null); }} className="flex-1 bg-slate-600 hover:bg-slate-700 text-white font-bold py-2 rounded-xl text-[10px] sm:text-xs">{showAvailablesId === req.id ? 'Hide Match' : 'Show Match'}</button>
                                                                        <button onClick={() => { setShowAllAvailablesId(showAllAvailablesId === req.id ? null : req.id); setShowAvailablesId(null); }} className="flex-1 bg-slate-500 hover:bg-slate-600 text-white font-bold py-2 rounded-xl text-[10px] sm:text-xs">{showAllAvailablesId === req.id ? 'Hide All' : 'Show All'}</button>
                                                                        <button disabled={processingItems.has(`eng-${req.id}`)} onClick={() => withProcessing(`eng-${req.id}`, async () => handleEngineerReviewDecision(req.id, 'instock'))} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-[10px] sm:text-xs">{processingItems.has(`eng-${req.id}`) ? 'Processing...' : 'Approve (In Stock)'}</button>
                                                                        <button disabled={processingItems.has(`eng-${req.id}`)} onClick={() => withProcessing(`eng-${req.id}`, async () => handleEngineerReviewDecision(req.id, 'outofstock'))} className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-[10px] sm:text-xs">{processingItems.has(`eng-${req.id}`) ? 'Processing...' : 'Order (Out of Stock)'}</button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* H1: Storekeeper Sign-off */}
                                    {activeOverlay === 'sk_quick_tasks' && (
                                        <div className="space-y-4 max-w-2xl mx-auto">
                                            <div className="border-b pb-3">
                                                <h3 className="font-extrabold text-base">{language === 'am' ? 'የእቃ አወጣጥ ማረጋገጫ (Sign-off Material Issues)' : 'Sign-off Material Issues (የእቃ አወጣጥ ማረጋገጫ)'}</h3>
                                            </div>
                                            {materialRequests.filter(r => r.status === 'approved_instock').length === 0 ? (
                                                <p className="text-xs text-[#A3AED0] italic py-8 text-center">{language === 'am' ? 'ለማረጋገጥ የሚጠብቅ እቃ የለም።' : 'No materials waiting for sign-off.'}</p>
                                            ) : (
                                                <div className="space-y-3">
                                                    {materialRequests.filter(r => r.status === 'approved_instock').map(req => (
                                                        <div key={req.id} className={`p-4 border rounded-xl space-y-3 ${isDarkMode ? 'bg-[#1e293b] border-slate-700' : 'bg-[#F4F7FE] border-slate-50'}`}>
                                                            <div className="flex justify-between font-bold text-xs">
                                                                <span>{formatReqNumber(req.req_number)}</span>
                                                                <span>{language === 'am' ? 'ለ:' : 'For:'} {req.requestedBy}</span>
                                                            </div>
                                                            <h4 className="font-extrabold text-sm">{req.item} ({req.qty} {language === 'am' ? 'ብዛት' : 'units'})</h4>
                                                            <button disabled={processingItems.has(`sk-signoff-${req.id}`)} onClick={() => withProcessing(`sk-signoff-${req.id}`, async () => handleStoreKeeperSignoff(req.id))} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-xs">{processingItems.has(`sk-signoff-${req.id}`) ? (language === 'am' ? 'በማስኬድ ላይ...' : 'Processing...') : (language === 'am' ? 'እቃ መረከቡን አረጋግጥ (Confirm Handover)' : 'Confirm Handover (እቃ መረከቡን አረጋግጥ)')}</button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        <div className="space-y-4 max-w-2xl mx-auto pt-6 mt-6 border-t border-slate-200 dark:border-slate-800">
                                            <div className="border-b pb-3">
                                                <h3 className="font-extrabold text-base">{language === 'am' ? 'የተገዙ እቃዎች መቀበያ (Receive Bought Materials)' : 'Receive Bought Materials (የተገዙ እቃዎች መቀበያ)'}</h3>
                                            </div>
                                            <PurchaseOrderWorkflow
                                                user={user}
                                                purchases={purchases}
                                                updateStatus={handleWorkflowStatusUpdate}
                                                language={language}
                                                generateReceipt={generateReceipt}
                                                refresh={refreshOrders}
                                                clearMessages={(actionKey: string, referenceId?: string) => {
                                                    systemMessages
                                                        .filter(m => (m as any).action_key === actionKey && (!referenceId || (m as any).reference_id === referenceId))
                                                        .forEach(m => dismissMsg(m.id));
                                                }}
                                            />
                                        </div>
                                        </div>
                                    )}


                                </div>
                            </div>
                        )}

                    </div>
                )}

            </main>

            {/* ==================== MESSAGE CENTER DRAWER ==================== */}
            {showInstantApprovalPopup && user && (
                <div className="fixed inset-0 bg-slate-950/50 overlay-backdrop flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowInstantApprovalPopup(false); }}>
                    <div className="bg-white dark:bg-[#0c1433] rounded-t-[28px] sm:rounded-[28px] shadow-[0_25px_60px_rgba(0,0,0,0.2)] w-full sm:max-w-xl overflow-hidden animate-scale-in border border-slate-100 dark:border-slate-800/50 max-h-[90vh] sm:max-h-none">
                        <div className="p-6 space-y-4 text-slate-800 dark:text-white">
                            <div className="flex justify-between items-start border-b border-slate-100/10 pb-3">
                                <div>
                                    <span className="text-[9px] font-black bg-red-100 dark:bg-red-900/40 text-red-600 px-3 py-1 rounded-full tracking-wider uppercase">Messages</span>
                                    <h3 className="text-lg font-black text-blue-950 dark:text-white mt-1.5">{language === 'am' ? 'መልዕክት ማዕከል' : 'Message Center'}</h3>
                                </div>
                                <button onClick={() => setShowInstantApprovalPopup(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
                            </div>

                            {visibleSystemMessages.length === 0 ? (
                                <p className="text-xs text-slate-500 py-8 text-center">{language === 'am' ? 'አዲስ መልዕክቶች የሉም።' : 'No new messages.'}</p>
                            ) : (
                                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                                    {visibleSystemMessages.map(message => (
                                        <div
                                            key={message.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setExpandedMessageId(prev => prev === message.id ? null : message.id)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    setExpandedMessageId(prev => prev === message.id ? null : message.id);
                                                }
                                            }}
                                            className="p-4 rounded-xl border border-slate-100 bg-[#F4F7FE] dark:bg-[#1e293b] dark:border-slate-700 cursor-pointer transition hover:border-red-300"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <h4 className="font-extrabold text-sm text-blue-950 dark:text-white">{message.title}</h4>
                                                <span className="h-2.5 w-2.5 rounded-full bg-blue-600 shrink-0" />
                                            </div>
                                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{message.body}</p>
                                            {expandedMessageId === message.id && (
                                                <div className="mt-3 border-t border-slate-200/60 dark:border-slate-700/80 pt-3">
                                                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">{language === 'am' ? 'የተግባር አዝራሮች' : 'Actions'}</p>
                                                    {renderMessageActions(message)}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="pt-4 border-t flex justify-between gap-3">
                                <button onClick={clearSystemMessages} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition">{language === 'am' ? 'ሁሉንም አጥፋ' : 'Clear All'}</button>
                                <button onClick={() => setShowInstantApprovalPopup(false)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors">{language === 'am' ? 'ዝጋ' : 'Close'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MOCK PROFORMA MODAL --- */}
            {showProformaModal && (
                <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden border-t-8 border-red-600">
                        <div className="p-6 space-y-4 text-slate-800">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-lg font-black text-blue-950">የዋጋ ማወዳደሪያ ፕሮፎርማ (Proforma Invoices)</h3>
                                    <p className="text-xs text-slate-400">Attached for: {activeProformaItem}</p>
                                </div>
                                <button onClick={() => setShowProformaModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
                            </div>

                            {/* Fake Proformas Comparison sheet */}
                            <div className="border rounded-xl overflow-hidden text-xs overflow-x-auto mobile-table-wrap">
                                <table className="w-full text-left border-collapse text-slate-800">
                                    <thead>
                                        <tr className="bg-slate-50 border-b">
                                            <th className="p-2.5 font-bold text-slate-700">Supplier Name</th>
                                            <th className="p-2.5 font-bold text-slate-700">Unit Price</th>
                                            <th className="p-2.5 font-bold text-slate-700">Availability</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="border-b">
                                            <td className="p-2.5 font-semibold">Supplier A (Kaki PLC)</td>
                                            <td className="p-2.5">1,500 ETB</td>
                                            <td className="p-2.5 text-red-600">No stock</td>
                                        </tr>
                                        <tr className="border-b bg-emerald-50/50">
                                            <td className="p-2.5 font-semibold text-emerald-800">Supplier B (C&amp;E Brothers) ★</td>
                                            <td className="p-2.5 font-bold text-emerald-800">1,250 ETB</td>
                                            <td className="p-2.5 text-emerald-800 font-bold">In-stock</td>
                                        </tr>
                                        <tr>
                                            <td className="p-2.5 font-semibold">Supplier C (Hona Trading)</td>
                                            <td className="p-2.5">1,400 ETB</td>
                                            <td className="p-2.5 text-emerald-700">In-stock</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-[10px] text-slate-400 italic">★ Recommended best price and availability chosen by Purchaser.</p>

                            <div className="pt-4 border-t flex justify-end">
                                <button onClick={() => setShowProformaModal(false)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors">Close Document Viewer</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* FOOTER */}
            <footer className="text-center text-slate-400 text-xs py-8 mt-12 border-t border-slate-200/20">
                <p>© 2026 Cappadocia Realestate S.C., Addisu Habte &amp; Vila Verde. Unified Store Management System.</p>
            </footer>
        </div>
    );
}

