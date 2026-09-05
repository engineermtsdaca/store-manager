import React from 'react';
import { Receipt } from '@/hooks/useReceipts';
import { useState } from 'react';
import domtoimage from 'dom-to-image-more';
import jsPDF from 'jspdf';

const actionTranslations: Record<string, string> = {
  'PO Request Approval': 'የግዢ ጥያቄ ማጽደቅ',
  'PO Request Rejected': 'የግዢ ጥያቄ ውድቅ ተደርጓል',
  'PO Proforma Attached': 'ፕሮፎርማ ተያይዟል',
  'PO Proforma Approved': 'ፕሮፎርማ ጸድቋል',
  'PO Proforma Rejected - Back to Purchaser': 'ፕሮፎርማ ውድቅ ተደርጓል - ወደ ገዢ ተመልሷል',
  'PO Formal Paper - PA Signed': 'ፎርማል ወረቀት - በረዳት ጸድቋል',
  'PO Formal Paper - Purchaser Signed': 'ፎርማል ወረቀት - በገዢ ጸድቋል',
  'PO Formal Paper - CEO Signed': 'ፎርማል ወረቀት - በዋና ስራ አስኪያጅ ጸድቋል',
  'PO Payment Approved by Whole Manager': 'ክፍያ በዋና ስራ አስኪያጅ ጸድቋል',
  'PO Payment Released by Payer': 'ክፍያ ተፈጽሟል',
  'PO Goods Shipped to Site': 'እቃዎች ወደ ሳይት ተልከዋል',
  'SK Confirmed Receipt of Bought Material': 'የተገዛ እቃ ርክክብ ማረጋገጫ',
  'SK Issued Bought Material to Subcontractor': 'የተገዛ እቃ ለንዑስ ተቋራጭ ተሰጥቷል',
  'Petty Cash Expense': 'የጥቃቅን ወጪ',
  'Inventory Addition': 'የእቃ ገቢ',
  'Material Transfer Request': 'የእቃ ዝውውር ጥያቄ',
  'Transfer Approved': 'የዝውውር ማጽደቅ',
  'Transfer Rejected': 'የዝውውር ውድቅ ማረጋገጫ',
  'Transfer Verification': 'የዝውውር ማረጋገጫ',
  'Subcontractor Request': 'የንዑስ ተቋራጭ ጥያቄ',
  'Engineer Material Review': 'የመሃንዲስ እቃ ግምገማ',
  'Engineer Material Review Partial': 'የመሃንዲስ እቃ ግምገማ (በከፊል)',
  'Storekeeper Material Handover': 'የእቃ ርክክብ',
  'Wastage Report': 'የብክነት ሪፖርት',
  'Material Usage': 'የእቃ አጠቃቀም',
  'Material Return Request': 'የእቃ ምላሽ ጥያቄ',
  'Material Return Approved': 'የእቃ ምላሽ ጸድቋል',
  'PO Payment Proof Attached': 'የክፍያ ማረጋገጫ ተያይዟል',
  'Finance PO Verification': 'የፋይናንስ ግዢ ማረጋገጫ',
  'Petty Cash Replenishment': 'የጥቃቅን ገንዘብ ምትክ',
  'Petty Cash Audit': 'የጥቃቅን ገንዘብ ኦዲት',
};

interface ReceiptModalProps {
  receipt: Receipt | null;
  onClose: () => void;
  language: 'en' | 'am';
}

export default function ReceiptModal({ receipt, onClose, language }: ReceiptModalProps) {
  if (!receipt) return null;

  const [isDownloading, setIsDownloading] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    const element = document.getElementById('printable-receipt-content');
    if (!element) return;
    
    setIsDownloading(true);
    try {
      // Use dom-to-image-more which correctly passes CSS to browser rendering engine
      const scale = 2;
      const imgData = await domtoimage.toPng(element, {
        bgcolor: '#ffffff',
        width: element.clientWidth * scale,
        height: element.clientHeight * scale,
        style: {
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }
      });
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (element.clientHeight * scale * pdfWidth) / (element.clientWidth * scale);
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`receipt-${receipt.receipt_number}.pdf`);
    } catch (error) {
      console.error('Error generating PDF', error);
      alert(language === 'am' ? 'ፒዲኤፍ ማውረድ አልተቻለም' : 'Failed to download PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div id="printable-receipt-container" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 print:static print:bg-white print:p-0">
      {/* Modal Container */}
      <div className="bg-white text-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl flex flex-col max-h-[90vh] print:shadow-none print:max-w-none">
        
        {/* Printable Area */}
        <div id="printable-receipt-content" className="p-4 sm:p-8 overflow-y-auto print:p-0 print:text-black bg-white rounded-t-2xl">
          <div className="text-center border-b-2 border-slate-200 pb-6 mb-6 print:border-black">
            <h1 className="text-2xl font-black uppercase tracking-widest text-slate-900 print:text-black">
              Cappadocia Realestate
            </h1>
            <p className="text-sm font-bold text-slate-500 mt-1 print:text-black">Official System Receipt / ህጋዊ የስርዓት ደረሰኝ</p>
          </div>

          <div className="flex justify-between items-center mb-8">
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold print:text-black">Receipt No. / የደረሰኝ ቁጥር</p>
              <p className="text-lg font-extrabold font-mono">{receipt.receipt_number}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 uppercase font-bold print:text-black">Date / ቀን</p>
              <p className="text-sm font-bold">{new Date(receipt.created_at).toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-5 mb-8 print:bg-transparent print:border print:border-black">
            <h3 className="text-xs text-slate-500 uppercase font-bold mb-3 print:text-black">Action Details / የድርጊት ዝርዝሮች</h3>
            <p className="text-lg font-black text-blue-600 mb-4 print:text-black">
              {receipt.action_type}
              {actionTranslations[receipt.action_type] ? ` / ${actionTranslations[receipt.action_type]}` : ''}
            </p>
            
            <div className="space-y-2 text-sm">
              {Object.entries(receipt.details).map(([key, value]) => (
                <div key={key} className="flex justify-between border-b border-slate-100 pb-2 print:border-black">
                  <span className="font-bold capitalize text-slate-600 print:text-black">{key.replace(/_/g, ' ')}</span>
                  <span className="font-medium text-right max-w-[60%] break-words">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-end border-t-2 border-slate-200 pt-6 mt-6 print:border-black">
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold print:text-black">Authorized By / አረጋጋጭ</p>
              {receipt.user_profiles?.signature_url && (
                <img src={receipt.user_profiles.signature_url} alt="Signature" className="h-10 my-1 object-contain mix-blend-multiply print:grayscale" />
              )}
              <p className="text-sm font-bold">{receipt.user_profiles?.name_en || 'System User (የስርዓት ተጠቃሚ)'}</p>
              <p className="text-xs text-slate-500 capitalize">{receipt.user_profiles?.role || 'User'}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 uppercase font-bold print:text-black">Site / Location / ቦታ</p>
              <p className="text-sm font-bold">{receipt.sites?.name || 'Head Office (ዋና መስሪያ ቤት)'}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons (Hidden when printing) */}
        <div className="p-4 border-t bg-slate-50 rounded-b-2xl flex gap-2 print:hidden">
          <button 
            onClick={onClose}
            className="flex-1 py-3 px-2 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition text-sm"
          >
            {language === 'am' ? 'ዝለል (Skip)' : 'Skip'}
          </button>
          <button 
            onClick={handleDownloadPdf}
            disabled={isDownloading}
            className="flex-1 py-3 px-2 rounded-xl font-bold text-slate-700 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 transition text-sm flex justify-center items-center gap-1"
          >
            {isDownloading ? (
              <span className="animate-pulse">{language === 'am' ? 'እያወረደ...' : 'Downloading...'}</span>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                {language === 'am' ? 'አውርድ (Download)' : 'Download'}
              </>
            )}
          </button>
          <button 
            onClick={handlePrint}
            className="flex-1 py-3 px-2 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-lg shadow-blue-600/30 text-sm flex justify-center items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            {language === 'am' ? 'አትም (Print)' : 'Print'}
          </button>
        </div>
      </div>
    </div>
  );
}
