"use client";
import React from 'react';

/**
 * PurchaseOrderWorkflow — Full out-of-stock purchase workflow component.
 *
 * STATUS FLOW:
 * pending_site_manager_req       → Site Manager (Addis) approves
 * pending_whole_manager_req      → Whole Manager (Abel) approves or rejects
 * pending_ceo_req                → CEO approves or rejects (final purchase auth)
 * pending_purchaser_proforma     → Purchaser (Alemu) attaches proforma
 * pending_site_manager_prof      → Site Manager (Addis) reviews proforma
 * pending_whole_manager_prof     → Whole Manager (Abel) reviews proforma
 * pending_ceo_prof               → CEO reviews proforma
 * pending_pa_formal_paper        → Purchase Assistant (Bisrat) prepares + signs formal paper
 * pending_purchaser_sign         → Purchaser (Alemu) reviews + signs formal paper
 * pending_ceo_formal_paper       → CEO signs formal paper (paper stays with CEO, copy to finance)
 * pending_whole_manager_payment  → Abel approves payment routing (Cappadocia ONLY)
 * pending_payer                  → Payer pays: Seble (Cappadocia) or Kidist (others)
 * shipped                        → Purchaser marks as shipped (SK gets notified)
 * sk_received                    → SK confirms receipt → inventory++ → SC auto-notified if from_sc_request
 * completed_sc_notified          → Fully complete
 */

export default function PurchaseOrderWorkflow({
    user,
    purchases,
    updateStatus,
    language,
    generateReceipt,
    clearMessages,
    refresh,
}: {
    user: any;
    purchases: any[];
    updateStatus: (id: string, status: string, extra?: any) => Promise<void>;
    language?: string;
    generateReceipt?: (type: string, data: any, siteId: any) => Promise<void>;
    // actionKey narrows to a role's queue; optional referenceId further narrows to one specific item
    clearMessages?: (actionKey: string, referenceId?: string) => void;
    refresh?: () => Promise<void>;
}) {
    const [processingIds, setProcessingIds] = React.useState<Set<string>>(new Set());

    if (!user) return null;

    const role = user.role;
    const lang = language === 'am';

    // Filter out processing IDs to prevent double submissions
    const visiblePurchases = purchases;

    // ── PHASE 1: Request Approval Chain ──────────────────────────────────────
    // Site Manager (Addis) = role 'manager'
    // Whole Manager (Abel) = role 'whole_manager'
    // CEO = role 'ceo'
    const reqApproval = visiblePurchases.filter((p: any) =>
        (role === 'manager' && p.status === 'pending_site_manager_req') ||
        (role === 'whole_manager' && p.status === 'pending_whole_manager_req') ||
        (role === 'ceo' && p.status === 'pending_ceo_req')
    );

    // ── PHASE 2: Purchaser attaches proforma ─────────────────────────────────
    const proformaUpload = visiblePurchases.filter(
        (p: any) => role === 'purchaser' && p.status === 'pending_purchaser_proforma'
    );

    // ── PHASE 3: Proforma approval chain ────────────────────────────────────
    const profApproval = visiblePurchases.filter((p: any) =>
        (role === 'manager' && p.status === 'pending_site_manager_prof') ||
        (role === 'whole_manager' && p.status === 'pending_whole_manager_prof') ||
        (role === 'ceo' && p.status === 'pending_ceo_prof')
    );

    // ── PHASE 4: Formal paper — Bisrat (PA) prepares + signs ─────────────────
    const formalPaperPA = visiblePurchases.filter(
        (p: any) => role === 'purchase_assistant' && p.status === 'pending_pa_formal_paper'
    );

    // ── PHASE 5: Alemu (Purchaser) reviews + signs formal paper ──────────────
    const formalPaperPurchaser = visiblePurchases.filter(
        (p: any) => role === 'purchaser' && p.status === 'pending_purchaser_sign'
    );

    // ── PHASE 6: CEO signs formal paper ─────────────────────────────────────
    const formalPaperCEO = visiblePurchases.filter(
        (p: any) => role === 'ceo' && p.status === 'pending_ceo_formal_paper'
    );

    // ── PHASE 7: Abel approves payment routing (Cappadocia only) ─────────────
    const paymentApproval = visiblePurchases.filter(
        (p: any) => role === 'whole_manager' && p.status === 'pending_whole_manager_payment'
    );

    // ── PHASE 8: Payer releases payment ─────────────────────────────────────
    // Seble = payer for Cappadocia (company === 'Cappadocia')
    // Kidist = payer for VillaVerde + Addisu Habte (company !== 'Cappadocia')
    const payerRelease = visiblePurchases.filter(
        (p: any) => role === 'payer' && p.status === 'pending_payer' &&
            (
                (user.company === 'Cappadocia' && p.company === 'Cappadocia') ||
                (user.company !== 'Cappadocia' && p.company !== 'Cappadocia')
            )
    );

    // ── PHASE 9: Purchaser marks as shipped ──────────────────────────────────
    const purchaserShip = visiblePurchases.filter(
        (p: any) => role === 'purchaser' && p.status === 'money_released'
    );

    // ── PHASE 10: SK confirms receipt of goods ───────────────────────────────
    // SK sees POs with status 'shipped' that belong to their site
    const skReceive = visiblePurchases.filter(
        (p: any) => role === 'storekeeper' && p.status === 'shipped' &&
            (p.site === user.site || p.site_id === user.site_id)
    );

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    const cardClass = "bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4";

    const PurchaseCard = ({
        p,
        actionLabel,
        actionLabelAm,
        onApprove,
        onReject,
        isUpload = false,
        isSign = false,
        rejectLabel = 'Reject',
        rejectLabelAm = 'ሰርዝ',
        uploadLabel = 'Proforma Files (0 to 10 max)',
        uploadLabelAm = 'ፕሮፎርማ ፋይሎች (ከ 0 እስከ 10)',
        isProcessing = false
    }: {
        p: any;
        actionLabel: string;
        actionLabelAm: string;
        onApprove: () => void;
        onReject?: () => void;
        isUpload?: boolean;
        isSign?: boolean;
        rejectLabel?: string;
        rejectLabelAm?: string;
        uploadLabel?: string;
        uploadLabelAm?: string;
        isProcessing?: boolean;
    }) => (
        <div className={cardClass}>
            <div className="flex-1">
                <p className="text-sm text-slate-400 font-mono mb-1">{p.po_number}</p>
                <p className="text-white font-bold text-lg">{p.qty}x {p.item}</p>
                <p className="text-sm text-slate-300">Site: {p.sites?.name || p.site_id}</p>
                <p className="text-xs text-slate-400 mt-1">Company: {p.company}</p>
                {p.bank_name && (
                    <p className="text-xs text-blue-300 mt-2 font-semibold">Bank: {p.bank_name}</p>
                )}
                {p.payment_screenshot_url && (
                    <a href={p.payment_screenshot_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 underline block mt-1">
                        {lang ? 'የክፍያ ማረጋገጫ ይመልከቱ' : 'View Payment Proof'}
                    </a>
                )}
                {isUpload && (
                    <div className="mt-3 bg-slate-900/50 p-3 rounded-xl border border-slate-700/50">
                        <label className="block text-xs font-semibold text-slate-300 mb-2">{lang ? uploadLabelAm : uploadLabel}</label>
                        <input 
                            type="file" 
                            multiple 
                            accept="image/*,application/pdf"
                            capture="environment"
                            onChange={(e) => {
                                if (e.target.files && e.target.files.length > 10) {
                                    alert(lang ? 'ከ 10 ፋይሎች በላይ አይፈቀድም' : 'Max 10 photos/files allowed.');
                                    e.target.value = '';
                                }
                            }}
                            className="block w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-500/20 file:text-blue-400 hover:file:bg-blue-500/30 transition-all cursor-pointer"
                        />
                    </div>
                )}
            </div>
            <div className="flex gap-2 w-full md:w-auto flex-wrap">
                <button
                    disabled={isProcessing}
                    onClick={onApprove}
                    className={`flex-1 ${isUpload || isSign ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'} disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all`}
                >
                    {isProcessing ? 'Processing...' : (
                        <>{isUpload ? '📁 ' : isSign ? '✍️ ' : '✅ '} {lang ? actionLabelAm : actionLabel}</>
                    )}
                </button>
                {onReject && (
                    <button
                        disabled={isProcessing}
                        onClick={onReject}
                        className="flex-1 bg-red-600/20 hover:bg-red-600/30 disabled:opacity-50 text-red-400 px-5 py-2.5 rounded-xl text-sm font-bold transition-all border border-red-600/30"
                    >
                        {isProcessing ? '...' : `✗ ${lang ? rejectLabelAm : rejectLabel}`}
                    </button>
                )}
            </div>
        </div>
    );

    const SectionHeader = ({ title, titleAm }: { title: string; titleAm: string }) => (
        <div className="flex items-center gap-3 mb-3">
            <div className="w-1 h-8 rounded-full bg-blue-500" />
            <h3 className="text-white font-bold text-lg">{lang ? titleAm : title}</h3>
        </div>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE LOGIC
    // ─────────────────────────────────────────────────────────────────────────

    const withProcessing = (id: string, actionFn: () => Promise<void>) => async () => {
        if (processingIds.has(id)) return;
        setProcessingIds(prev => new Set(prev).add(id));
        try {
            await actionFn();
            if (refresh) await refresh();
        } catch (err: any) {
            console.error('Error processing request:', err);
            alert(`Error processing request: ${err.message || 'Unknown error'}`);
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const handleReqApprove = async (p: any) => {
        let nextStatus = '';
        if (role === 'manager') nextStatus = 'pending_whole_manager_req';
        else if (role === 'whole_manager') nextStatus = 'pending_ceo_req';
        else if (role === 'ceo') nextStatus = 'pending_purchaser_proforma';

        await updateStatus(p.id, nextStatus);
        if (generateReceipt) await generateReceipt('PO Request Approval', { poNumber: p.po_number, by: role, nextStatus }, p.site_id);
        
        if (clearMessages) {
            if (role === 'manager' || role === 'whole_manager') clearMessages('manager_approvals');
            if (role === 'ceo') clearMessages('ceo_approvals');
        }
    };

    const handleReqReject = async (p: any) => {
        // Rejection cancels the PO — mark as 'blocked_mismatch' (existing terminal status)
        await updateStatus(p.id, 'blocked_mismatch');
        if (generateReceipt) await generateReceipt('PO Request Rejected', { poNumber: p.po_number, by: role }, p.site_id);
        
        if (clearMessages) {
            if (role === 'manager' || role === 'whole_manager') clearMessages('manager_approvals');
            if (role === 'ceo') clearMessages('ceo_approvals');
        }
    };

    const handleProformaAttach = async (p: any) => {
        await updateStatus(p.id, 'pending_site_manager_prof', { proforma_attached: true });
        if (generateReceipt) await generateReceipt('PO Proforma Attached', { poNumber: p.po_number }, p.site_id);
        if (clearMessages) clearMessages('purchaser_request');
    };

    const handleProfApprove = async (p: any) => {
        let nextStatus = '';
        if (role === 'manager') nextStatus = 'pending_whole_manager_prof';
        else if (role === 'whole_manager') nextStatus = 'pending_ceo_prof';
        else if (role === 'ceo') nextStatus = 'pending_pa_formal_paper';

        await updateStatus(p.id, nextStatus);
        if (generateReceipt) await generateReceipt('PO Proforma Approved', { poNumber: p.po_number, by: role, nextStatus }, p.site_id);
        if (clearMessages) {
            if (role === 'manager' || role === 'whole_manager') clearMessages('manager_approvals');
            if (role === 'ceo') clearMessages('ceo_approvals');
        }
    };

    const handleProfReject = async (p: any) => {
        // Return to purchaser for new proforma
        await updateStatus(p.id, 'pending_purchaser_proforma', { action: 'reject' });
        if (generateReceipt) await generateReceipt('PO Proforma Rejected - Back to Purchaser', { poNumber: p.po_number, by: role }, p.site_id);
        if (clearMessages) {
            if (role === 'manager' || role === 'whole_manager') clearMessages('manager_approvals');
            if (role === 'ceo') clearMessages('ceo_approvals');
        }
    };

    const handlePASign = async (p: any) => {
        // Bisrat prepares + signs → goes to Alemu to sign
        await updateStatus(p.id, 'pending_purchaser_sign', { pa_signed: true });
        if (generateReceipt) await generateReceipt('PO Formal Paper - PA Signed', { poNumber: p.po_number, by: 'Bisrat (PA)' }, p.site_id);
        if (clearMessages) clearMessages('pa_formal_paper');
    };

    const handlePurchaserSign = async (p: any) => {
        // Alemu signs → goes to CEO for final signature
        await updateStatus(p.id, 'pending_ceo_formal_paper', { purchaser_signed: true });
        if (generateReceipt) await generateReceipt('PO Formal Paper - Purchaser Signed', { poNumber: p.po_number, by: 'Alemu (Purchaser)' }, p.site_id);
    };

    const handleCEOSign = async (p: any) => {
        // CEO signs → paper stays with CEO, copy to finance
        // Payment routing: Cappadocia → Abel → Seble; Others → Kidist directly
        const nextStatus = p.company === 'Cappadocia'
            ? 'pending_whole_manager_payment'
            : 'pending_payer';

        await updateStatus(p.id, nextStatus, { ceo_signed: true });
        if (generateReceipt) await generateReceipt('PO Formal Paper - CEO Signed', { poNumber: p.po_number, by: 'CEO', nextStatus }, p.site_id);
        if (clearMessages) clearMessages('ceo_approvals');
    };

    const handlePaymentApprove = async (p: any) => {
        // Abel approves → Seble (payer) gets notified
        await updateStatus(p.id, 'pending_payer');
        if (generateReceipt) await generateReceipt('PO Payment Approved by Whole Manager', { poNumber: p.po_number }, p.site_id);
        if (clearMessages) clearMessages('manager_approvals');
    };

    const handlePayerPay = async (p: any) => {
        // Payer marks payment done → simultaneously:
        // 1. Purchaser notified "it is paid" → they ship
        // 2. Finance notified for receipt/audit
        await updateStatus(p.id, 'money_released');
        if (generateReceipt) await generateReceipt('PO Payment Released by Payer', { poNumber: p.po_number, payer: user.nameEn }, p.site_id);
        if (clearMessages) clearMessages('payer_release');
    };

    const handlePurchaserShip = async (p: any) => {
        // Purchaser ships goods → SK notified
        await updateStatus(p.id, 'shipped');
        if (generateReceipt) await generateReceipt('PO Goods Shipped to Site', { poNumber: p.po_number, by: 'Alemu (Purchaser)' }, p.site_id);
        if (clearMessages) clearMessages('purchaser_ship_notice');
    };

    const handleSKReceive = async (p: any) => {
        // SK confirms physical receipt of goods
        // API will: increment inventory.received, update PO to sk_received,
        // notify SC (if from_sc_request), notify engineer + CEO
        await updateStatus(p.id, 'sk_received', {
            action: 'sk_confirm_receipt',
            site_id: p.site_id || user.site_id,
            item: p.item,
            qty: p.qty,
            from_sc_request: p.from_sc_request,
            sc_request_id: p.sc_request_id,
            company: p.company,
        });
        
        if (generateReceipt) await generateReceipt('SK Confirmed Receipt of Bought Material', {
            poNumber: p.po_number,
            item: p.item,
            qty: p.qty,
            site: p.sites?.name || p.site_id,
        }, user.site_id);

        if (p.from_sc_request && generateReceipt) {
            await generateReceipt('SK Issued Bought Material to Subcontractor', {
                poNumber: p.po_number,
                item: p.item,
                qty: p.qty,
                site: p.sites?.name || p.site_id,
            }, user.site_id);
        }
        
        if (clearMessages) clearMessages('storekeeper_delivery', p.id);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────

    const hasAnything =
        reqApproval.length > 0 ||
        proformaUpload.length > 0 ||
        profApproval.length > 0 ||
        formalPaperPA.length > 0 ||
        formalPaperPurchaser.length > 0 ||
        formalPaperCEO.length > 0 ||
        paymentApproval.length > 0 ||
        payerRelease.length > 0 ||
        skReceive.length > 0;

    return (
        <div className="space-y-10 mt-4">
            {!hasAnything && (
                <p className="text-slate-400 text-center py-10 italic text-sm">
                    {lang ? 'ምንም ተግባር አልተበደለዎትም።' : 'No pending tasks for your role at this time.'}
                </p>
            )}

            {/* ── PHASE 1: Request Approval ── */}
            {reqApproval.length > 0 && (
                <div className="space-y-4">
                    <SectionHeader
                        title={
                            role === 'manager'
                                ? 'Step 1 of 3 — Addis: Authorize Buy Request'
                                : role === 'whole_manager'
                                ? 'Step 2 of 3 — Abel: Authorize Buy Request'
                                : 'Step 3 of 3 — CEO: Final Purchase Authorization'
                        }
                        titleAm={
                            role === 'manager'
                                ? 'ደረጃ 1 / 3 — አዲስ: የግዢ ጥያቄ ፍቃድ'
                                : role === 'whole_manager'
                                ? 'ደረጃ 2 / 3 — አቤል: የግዢ ጥያቄ ፍቃድ'
                                : 'ደረጃ 3 / 3 — ሲኢኦ: የመጨረሻ ፍቃድ'
                        }
                    />
                    {reqApproval.map((p: any) => (
                        <PurchaseCard
                            isProcessing={processingIds.has(p.id)}
                            key={p.id}
                            p={p}
                            actionLabel="Authorize Purchase"
                            actionLabelAm="ግዢ ፍቀድ"
                            rejectLabel="Reject Request"
                            rejectLabelAm="ጥያቄ ሰርዝ"
                            onApprove={withProcessing(p.id, () => handleReqApprove(p))}
                            onReject={withProcessing(p.id, () => handleReqReject(p))}
                        />
                    ))}
                </div>
            )}

            {/* ── PHASE 2: Proforma Upload (Purchaser / Alemu) ── */}
            {proformaUpload.length > 0 && (
                <div className="space-y-4">
                    <SectionHeader
                        title="Alemu — Attach Proforma Invoice"
                        titleAm="አለሙ — ፕሮፎርማ ያያይዙ"
                    />
                    {proformaUpload.map((p: any) => (
                        <PurchaseCard
                            isProcessing={processingIds.has(p.id)}
                            key={p.id}
                            p={p}
                            actionLabel="Attach Proforma"
                            actionLabelAm="ፕሮፎርማ አያይዝ"
                            isUpload={true}
                            onApprove={withProcessing(p.id, () => handleProformaAttach(p))}
                        />
                    ))}
                </div>
            )}

            {/* ── PHASE 3: Proforma Approval Chain ── */}
            {profApproval.length > 0 && (
                <div className="space-y-4">
                    <SectionHeader
                        title={
                            role === 'manager'
                                ? 'Addis — Review Proforma'
                                : role === 'whole_manager'
                                ? 'Abel — Review Proforma'
                                : 'CEO — Approve Proforma'
                        }
                        titleAm={
                            role === 'manager'
                                ? 'አዲስ — ፕሮፎርማ ያረጋግጡ'
                                : role === 'whole_manager'
                                ? 'አቤል — ፕሮፎርማ ያረጋግጡ'
                                : 'ሲኢኦ — ፕሮፎርማ ያጸድቁ'
                        }
                    />
                    {profApproval.map((p: any) => (
                        <PurchaseCard
                            isProcessing={processingIds.has(p.id)}
                            key={p.id}
                            p={p}
                            actionLabel="Approve Proforma"
                            actionLabelAm="ፕሮፎርማ ፍቀድ"
                            rejectLabel="Send Back for New Proforma"
                            rejectLabelAm="ወደ ፕሮፎርማ ይላኩ"
                            onApprove={withProcessing(p.id, () => handleProfApprove(p))}
                            onReject={withProcessing(p.id, () => handleProfReject(p))}
                        />
                    ))}
                </div>
            )}

            {/* ── PHASE 4: Bisrat (PA) Prepares + Signs Formal Paper ── */}
            {formalPaperPA.length > 0 && (
                <div className="space-y-4">
                    <SectionHeader
                        title="Bisrat (PA) — Prepare & Sign Formal Paper"
                        titleAm="ብስራት (ረዳት) — መደበኛ ፎርም ዝግጅት እና ፊርማ"
                    />
                    <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3 text-xs text-blue-300 mb-2">
                        {lang
                            ? '📋 ብስራት፡ ይህን ፎርም ያዘጋጁ፣ ፊርማ ያድርጉ፣ ከዚያ ወደ አለሙ (ፐርቸዘር) ይላኩ።'
                            : '📋 Bisrat: Prepare the formal purchase paper, sign it, then it goes to Alemu (Purchaser) to countersign.'}
                    </div>
                    {formalPaperPA.map((p: any) => (
                        <PurchaseCard
                            isProcessing={processingIds.has(p.id)}
                            key={p.id}
                            p={p}
                            actionLabel="Prepare & Sign Formal Paper"
                            actionLabelAm="ፎርም ዝጋጅ እና ፈርም"
                            isSign={true}
                            onApprove={withProcessing(p.id, () => handlePASign(p))}
                        />
                    ))}
                </div>
            )}

            {/* ── PHASE 5: Alemu (Purchaser) Signs Formal Paper ── */}
            {formalPaperPurchaser.length > 0 && (
                <div className="space-y-4">
                    <SectionHeader
                        title="Alemu (Purchaser) — Sign Formal Paper"
                        titleAm="አለሙ (ፐርቸዘር) — ፎርም ፈርም"
                    />
                    <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 text-xs text-amber-300 mb-2">
                        {lang
                            ? '✍️ አለሙ፡ ብስራት ያዘጋጀውን ፎርም ያረጋግጡ፣ ፊርማ ያድርጉ፣ ከዚያ ወደ ሲኢኦ ይላኩ።'
                            : '✍️ Alemu: Review the formal paper Bisrat prepared, countersign it, then it goes to the CEO.'}
                    </div>
                    {formalPaperPurchaser.map((p: any) => (
                        <PurchaseCard
                            isProcessing={processingIds.has(p.id)}
                            key={p.id}
                            p={p}
                            actionLabel="Countersign Formal Paper"
                            actionLabelAm="ፎርም ፈርም"
                            isSign={true}
                            onApprove={withProcessing(p.id, () => handlePurchaserSign(p))}
                        />
                    ))}
                </div>
            )}

            {/* ── PHASE 6: CEO Signs Formal Paper ── */}
            {formalPaperCEO.length > 0 && (
                <div className="space-y-4">
                    <SectionHeader
                        title="CEO — Final Signature on Formal Paper"
                        titleAm="ሲኢኦ — የመጨረሻ ፊርማ ፎርም ላይ"
                    />
                    <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-3 text-xs text-purple-300 mb-2">
                        {lang
                            ? '🔏 ሲኢኦ፡ ፎርም ላይ ፊርማ ያድርጉ። ወረቀቱ ከሲኢኦ ዘንድ ይቆያል። ፋይናንስ ቅጂ ይቀበላሉ። ክፍያ ወደ ፔይ ይሂዳል።'
                            : '🔏 CEO: Sign the formal paper. The original stays with CEO. Finance receives a copy. Payment is then routed to the payer.'}
                    </div>
                    {formalPaperCEO.map((p: any) => (
                        <PurchaseCard
                            isProcessing={processingIds.has(p.id)}
                            key={p.id}
                            p={p}
                            actionLabel="Sign & Finalize"
                            actionLabelAm="ፈርም እና አጠናቀቅ"
                            isSign={true}
                            onApprove={withProcessing(p.id, () => handleCEOSign(p))}
                        />
                    ))}
                </div>
            )}

            {/* ── PHASE 7: Abel Approves Payment Routing (Cappadocia only) ── */}
            {paymentApproval.length > 0 && (
                <div className="space-y-4">
                    <SectionHeader
                        title="Abel — Approve Payment (Cappadocia)"
                        titleAm="አቤል — ክፍያ ያጸድቁ (ካፓዶሺያ)"
                    />
                    <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3 text-xs text-green-300 mb-2">
                        {lang
                            ? '💰 አቤል፡ ሲኢኦ ፎርሙ ፈርሟል። ለሰብለ (ፔይ1) ክፍያ ጸድቃ። ሰብለ ክፍያ ትፈጽማለች።'
                            : '💰 Abel: CEO has signed. Approve to release funds. Seble (Pay1) will execute the bank payment.'}
                    </div>
                    {paymentApproval.map((p: any) => (
                        <PurchaseCard
                            isProcessing={processingIds.has(p.id)}
                            key={p.id}
                            p={p}
                            actionLabel="Approve Payment to Seble"
                            actionLabelAm="ሰብለ ትክፈል"
                            onApprove={withProcessing(p.id, () => handlePaymentApprove(p))}
                        />
                    ))}
                </div>
            )}

            {/* ── PHASE 8: Payer Releases Payment ── */}
            {payerRelease.length > 0 && (
                <div className="space-y-4">
                    <SectionHeader
                        title={user.company === 'Cappadocia'
                            ? 'Seble (Pay1) — Release Bank Payment'
                            : 'Kidist (Pay2) — Release Bank Payment'}
                        titleAm={user.company === 'Cappadocia'
                            ? 'ሰብለ (ፔይ1) — ክፍያ ፈጸሚ'
                            : 'ቅድስት (ፔይ2) — ክፍያ ፈጸሚ'}
                    />
                    <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-3 text-xs text-emerald-300 mb-2">
                        {lang
                            ? '🏦 ሲከፍሉ፡ ደረሰኝ ወደ ፋይናንስ ይሄዳል። አለሙ (ፐርቸዘር) "ተከፍሏል" ማሳወቂያ ያገኛሉ።'
                            : '🏦 On payment: receipt goes to Finance simultaneously. Alemu (Purchaser) is notified "It is paid".'}
                    </div>
                    {payerRelease.map((p: any) => (
                        <PurchaseCard
                            isProcessing={processingIds.has(p.id)}
                            key={p.id}
                            p={p}
                            actionLabel="Confirm Payment Transfer"
                            actionLabelAm="ክፍያ ማስተላለፍ አረጋግጥ"
                            isUpload={true}
                            uploadLabel="Bank Receipt/Screenshot (0 to 10 max)"
                            uploadLabelAm="የባንክ ደረሰኝ/ፎቶ (ከ 0 እስከ 10)"
                            onApprove={withProcessing(p.id, () => handlePayerPay(p))}
                        />
                    ))}
                </div>
            )}

            {/* ── PHASE 9: Purchaser marks as shipped ── */}
            {purchaserShip.length > 0 && (
                <div className="space-y-4">
                    <SectionHeader
                        title="Alemu — Mark Goods as Shipped"
                        titleAm="አለሙ — ዕቃዎች መጫናቸውን አረጋግጥ"
                    />
                    <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3 text-xs text-blue-300 mb-2">
                        {lang
                            ? '✅ ክፍያው ተፈጽሟል! እባክዎ ዕቃውን ገዝተው ወደ ሳይት ስቶር ኪፐር ይላኩ።'
                            : '✅ Payment confirmed! Please purchase and ship the goods to the site SK.'}
                    </div>
                    {purchaserShip.map((p: any) => (
                        <PurchaseCard
                            isProcessing={processingIds.has(p.id)}
                            key={p.id}
                            p={p}
                            actionLabel="Confirm Shipping to Site"
                            actionLabelAm="ወደ ሳይት መጫኑን አረጋግጥ"
                            onApprove={withProcessing(p.id, () => handlePurchaserShip(p))}
                        />
                    ))}
                </div>
            )}

            {/* ── PHASE 10: SK Confirms Receipt ── */}
            {skReceive.length > 0 && (
                <div className="space-y-4">
                    <SectionHeader
                        title="SK — Confirm Receipt of Arrived Goods"
                        titleAm="ስኬ — የደረሱ ዕቃዎችን ቆጥሮ ይቀበሉ"
                    />
                    <div className="bg-teal-900/20 border border-teal-700/30 rounded-xl p-3 text-xs text-teal-300 mb-2">
                        {lang
                            ? '📦 ስኬ፡ ዕቃው ደርሷል? ቆጥረው ያረጋግጡ። ክምችቱ ይዘምናል። ሳብ ኮንትራክተሩ ካዘዘ ይነገረዋል።'
                            : '📦 SK: Goods arrived? Count and confirm. Inventory will be updated. SC will be auto-notified if this was their order.'}
                    </div>
                    {skReceive.map((p: any) => (
                        <div key={p.id} className={cardClass}>
                            <div className="flex-1">
                                <p className="text-sm text-slate-400 font-mono mb-1">{p.po_number}</p>
                                <p className="text-white font-bold text-lg">{p.qty}x {p.item}</p>
                                <p className="text-sm text-slate-300">Site: {p.sites?.name || p.site_id}</p>
                                {p.from_sc_request && (
                                    <p className="text-xs text-amber-400 mt-1">
                                        ⚡ SC order — SC will be auto-notified to collect remaining qty
                                    </p>
                                )}
                            </div>
                            <button
                                disabled={processingIds.has(p.id)}
                                onClick={withProcessing(p.id, () => handleSKReceive(p))}
                                className="flex-1 md:flex-none bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
                            >
                                {processingIds.has(p.id) ? 'Processing...' : (`✅ ${lang ? 'ቁጥር አረጋግጥ እና ተቀበል' : 'Count & Confirm Receipt'}`)}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
