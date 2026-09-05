import React, { useState } from 'react';
import { Receipt } from '@/hooks/useReceipts';

interface ReceiptsStoreProps {
  receipts: Receipt[];
  language: 'en' | 'am';
  isDarkMode: boolean;
  onClose: () => void;
  onPrint: (receipt: Receipt) => void;
  userRole: string;
}

export default function ReceiptsStore({ receipts, language, isDarkMode, onClose, onPrint, userRole }: ReceiptsStoreProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUser, setFilterUser] = useState('All');

  // unique users
  const uniqueUsers = Array.from(new Set(receipts.map(r => r.user_profiles?.name_en).filter(Boolean)));

  const filteredReceipts = receipts.filter(r => {
    if (filterUser !== 'All' && r.user_profiles?.name_en !== filterUser) return false;
    if (searchTerm && !r.receipt_number.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !r.action_type.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 bg-slate-950/50 overlay-backdrop flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
      <div className={`w-full max-w-5xl max-h-[90vh] flex flex-col rounded-t-[32px] sm:rounded-3xl shadow-2xl overflow-hidden ${isDarkMode ? 'bg-slate-900 text-white border border-slate-700' : 'bg-white text-slate-800'}`}>
        
        {/* HEADER */}
        <div className={`flex justify-between items-center p-4 sm:p-6 border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
          <div>
            <h2 className="text-xl font-black">
              {language === 'am' ? 'የስርዓት ደረሰኞች (System Receipts)' : 'System Receipts'}
            </h2>
            <p className={`text-xs font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {language === 'am' ? 'ሁሉንም የተመዘገቡ ደረሰኞች ይመልከቱ' : 'View and print past action receipts'}
            </p>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* FILTERS */}
        <div className={`p-4 sm:p-6 border-b flex flex-col sm:flex-row gap-3 sm:gap-4 ${isDarkMode ? 'border-slate-800 bg-[#1e293b]/30' : 'border-slate-100 bg-slate-50'}`}>
          <input 
            type="text" 
            placeholder={language === 'am' ? 'በደረሰኝ ቁጥር ይፈልጉ...' : 'Search by receipt number or type...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`flex-1 p-3 rounded-xl text-sm border outline-none ${isDarkMode ? 'bg-[#0f172a] border-slate-700 text-white' : 'bg-white border-slate-200'}`}
          />
          
          <select 
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className={`w-full sm:w-64 p-3 rounded-xl text-sm border outline-none ${isDarkMode ? 'bg-[#0f172a] border-slate-700 text-white' : 'bg-white border-slate-200'}`}
          >
            <option value="All">All Users</option>
            {uniqueUsers.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        {/* TABLE */}
        <div className="flex-1 overflow-auto p-3 sm:p-6">
          {filteredReceipts.length === 0 ? (
            <div className="text-center py-12 text-slate-500 font-bold">No receipts found.</div>
          ) : (
            <div className="overflow-x-auto mobile-table-wrap">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`text-xs uppercase font-extrabold ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  <th className="p-4 border-b">Receipt No.</th>
                  <th className="p-4 border-b">Date</th>
                  <th className="p-4 border-b">Action</th>
                  <th className="p-4 border-b">User</th>
                  <th className="p-4 border-b">Site</th>
                  <th className="p-4 border-b text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {filteredReceipts.map(receipt => (
                  <tr key={receipt.id} className={`group ${isDarkMode ? 'hover:bg-[#1e293b]/50 border-slate-800/50' : 'hover:bg-slate-50 border-slate-100'} border-b last:border-0`}>
                    <td className="p-4 font-mono font-bold">{receipt.receipt_number}</td>
                    <td className="p-4 font-medium text-slate-500">{new Date(receipt.created_at).toLocaleString()}</td>
                    <td className="p-4 font-bold text-blue-500">{receipt.action_type}</td>
                    <td className="p-4 font-bold">{receipt.user_profiles?.name_en}</td>
                    <td className="p-4 text-slate-500">{receipt.sites?.name || 'Head Office'}</td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => onPrint(receipt)}
                        className={`px-4 py-2 rounded-lg font-bold text-xs transition-colors ${isDarkMode ? 'bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white' : 'bg-slate-100 hover:bg-blue-600 text-slate-600 hover:text-white'}`}
                      >
                        Print
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
