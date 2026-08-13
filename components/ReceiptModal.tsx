import React from 'react';
import { Receipt } from '@/hooks/useReceipts';

interface ReceiptModalProps {
  receipt: Receipt | null;
  onClose: () => void;
  language: 'en' | 'am';
}

export default function ReceiptModal({ receipt, onClose, language }: ReceiptModalProps) {
  if (!receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div id="printable-receipt-container" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 print:static print:bg-white print:p-0">
      {/* Modal Container */}
      <div className="bg-white text-slate-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] print:shadow-none print:max-w-none">
        
        {/* Printable Area */}
        <div className="p-8 overflow-y-auto print:p-0 print:text-black">
          <div className="text-center border-b-2 border-slate-200 pb-6 mb-6 print:border-black">
            <h1 className="text-2xl font-black uppercase tracking-widest text-slate-900 print:text-black">
              Cappadocia Realestate
            </h1>
            <p className="text-sm font-bold text-slate-500 mt-1 print:text-black">Official System Receipt</p>
          </div>

          <div className="flex justify-between items-center mb-8">
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold print:text-black">Receipt No.</p>
              <p className="text-lg font-extrabold font-mono">{receipt.receipt_number}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 uppercase font-bold print:text-black">Date</p>
              <p className="text-sm font-bold">{new Date(receipt.created_at).toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-5 mb-8 print:bg-transparent print:border print:border-black">
            <h3 className="text-xs text-slate-500 uppercase font-bold mb-3 print:text-black">Action Details</h3>
            <p className="text-lg font-black text-blue-600 mb-4 print:text-black">{receipt.action_type}</p>
            
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
              <p className="text-[10px] text-slate-400 uppercase font-bold print:text-black">Authorized By</p>
              {receipt.user_profiles?.signature_url && (
                <img src={receipt.user_profiles.signature_url} alt="Signature" className="h-10 my-1 object-contain mix-blend-multiply print:grayscale" />
              )}
              <p className="text-sm font-bold">{receipt.user_profiles?.name_en || 'System User'}</p>
              <p className="text-xs text-slate-500 capitalize">{receipt.user_profiles?.role || 'User'}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 uppercase font-bold print:text-black">Site / Location</p>
              <p className="text-sm font-bold">{receipt.sites?.name || 'Head Office'}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons (Hidden when printing) */}
        <div className="p-4 border-t bg-slate-50 rounded-b-2xl flex gap-3 print:hidden">
          <button 
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition"
          >
            {language === 'am' ? 'ዝለል (Skip for now)' : 'Skip for now'}
          </button>
          <button 
            onClick={handlePrint}
            className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-lg shadow-blue-600/30"
          >
            {language === 'am' ? 'አትም (Print Receipt)' : 'Print Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}
