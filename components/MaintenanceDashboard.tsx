"use client";
import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { ErrorLog } from '@/lib/database.types';

export default function MaintenanceDashboard({ user, isDarkMode }: { user: any, isDarkMode: boolean }) {
    const supabase = createClient();
    const [logs, setLogs] = useState<ErrorLog[]>([]);
    const [loading, setLoading] = useState(true);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [newType, setNewType] = useState<'syntax' | 'logic' | 'security' | 'other'>('logic');
    const [newContent, setNewContent] = useState('');

    const fetchLogs = async () => {
        setLoading(true);
        const { data, error } = await (supabase as any).from('error_logs').select('*').order('created_at', { ascending: false });
        if (!error && data) setLogs(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newContent.trim()) return;
        setIsSubmitting(true);
        const { error } = await (supabase as any).from('error_logs').insert({
            error_type: newType,
            error_content: newContent,
            reported_by: user.id
        });
        setIsSubmitting(false);
        if (error) {
            alert('Failed to log error: ' + error.message);
        } else {
            setNewContent('');
            fetchLogs();
        }
    };

    const updateStatus = async (id: string, newStatus: string) => {
        await (supabase as any).from('error_logs').update({ status: newStatus } as any).eq('id', id);
        fetchLogs();
    };

    const bgClass = isDarkMode ? 'bg-[#1e293b] text-white' : 'bg-white text-slate-800';
    const borderClass = isDarkMode ? 'border-slate-700/50' : 'border-slate-200';
    const inputClass = isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900';

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-10">
            <div className="border-b pb-4 mb-4">
                <h3 className="font-extrabold text-xl">System Maintenance - Error Logs</h3>
                <p className="text-sm text-slate-500 mt-1">Log code errors (syntax, logic, security) manually by copy-pasting, and track resolution.</p>
            </div>

            {/* New Error Form */}
            <form onSubmit={handleSubmit} className={`p-5 rounded-2xl border shadow-sm ${bgClass} ${borderClass}`}>
                <h4 className="font-bold mb-4">Report New System Error</h4>
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-semibold mb-2">Error Category</label>
                        <select 
                            value={newType} 
                            onChange={(e) => setNewType(e.target.value as any)}
                            className={`w-full p-3 rounded-xl border focus:ring-2 focus:ring-blue-500 ${inputClass}`}
                        >
                            <option value="syntax">Syntax Error (Code Crash)</option>
                            <option value="logic">Logic Handling Error (Wrong Workflow)</option>
                            <option value="security">Security Error (Access Denied / RLS)</option>
                            <option value="other">Other / Unknown</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold mb-2">Error Details (Copy/Paste Log)</label>
                        <textarea
                            value={newContent}
                            onChange={(e) => setNewContent(e.target.value)}
                            required
                            rows={6}
                            placeholder="Paste the raw error message, stack trace, or description here..."
                            className={`w-full p-3 rounded-xl border focus:ring-2 focus:ring-blue-500 font-mono text-sm ${inputClass}`}
                        />
                    </div>
                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl self-end transition-colors"
                    >
                        {isSubmitting ? 'Logging...' : 'Submit Error Log'}
                    </button>
                </div>
            </form>

            {/* Log List */}
            <div className="space-y-4">
                <h4 className="font-bold text-lg">Active & Resolved Errors</h4>
                {loading ? <p>Loading logs...</p> : logs.length === 0 ? <p className="text-slate-500 italic">No errors logged yet.</p> : (
                    logs.map(log => (
                        <div key={log.id} className={`p-4 rounded-xl border flex flex-col gap-3 ${bgClass} ${borderClass}`}>
                            <div className="flex justify-between items-start">
                                <div>
                                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2
                                        ${log.error_type === 'security' ? 'bg-red-100 text-red-700' : 
                                          log.error_type === 'syntax' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                                        {log.error_type}
                                    </span>
                                    <p className="text-xs text-slate-400 font-mono">{new Date(log.created_at).toLocaleString()}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs font-bold uppercase ${log.status === 'resolved' ? 'text-green-500' : log.status === 'investigating' ? 'text-amber-500' : 'text-red-500'}`}>
                                        {log.status}
                                    </span>
                                </div>
                            </div>
                            
                            <pre className={`p-3 rounded-lg overflow-x-auto text-xs font-mono border ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                                {log.error_content}
                            </pre>

                            {log.status !== 'resolved' && (
                                <div className="flex gap-2 justify-end mt-2">
                                    {log.status === 'open' && (
                                        <button onClick={() => updateStatus(log.id, 'investigating')} className="px-4 py-2 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 font-bold text-xs rounded-lg transition-colors">
                                            Mark Investigating
                                        </button>
                                    )}
                                    <button onClick={() => updateStatus(log.id, 'resolved')} className="px-4 py-2 bg-green-500 text-white hover:bg-green-600 font-bold text-xs rounded-lg transition-colors">
                                        Mark Resolved
                                    </button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
