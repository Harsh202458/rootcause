'use client';
import { useEffect, useState } from 'react';
import Card from '@/components/Card';
import Badge from '@/components/Badge';

type Proposal = {
  id: string;
  run_id: string;
  action: string;
  target: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
};

export default function ApprovalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchProposals();
  }, []);

  const fetchProposals = async () => {
    try {
      const res = await fetch('/api/approvals');
      if (res.ok) {
        const data = await res.json();
        setProposals(data);
      }
    } catch (error) {
      console.error('Error fetching proposals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`/api/approvals/${id}/approve`, { method: 'POST' });
      if (res.ok) fetchProposals();
    } catch (error) {
      console.error('Error approving:', error);
    }
  };

  const handleReject = async (id: string) => {
    const reason = rejectReason[id] || 'No reason provided';
    try {
      const res = await fetch(`/api/approvals/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      if (res.ok) fetchProposals();
    } catch (error) {
      console.error('Error rejecting:', error);
    }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading proposals...</div>;

  const pending = proposals.filter(p => p.status === 'pending');
  const history = proposals.filter(p => p.status !== 'pending');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-6">Pending Approvals</h1>
        {pending.length === 0 ? (
          <div className="text-slate-400 bg-slate-800/50 rounded-lg p-8 text-center border border-slate-700">
            No pending proposals.
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map(p => (
              <Card key={p.id}>
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="warning">PENDING</Badge>
                      <span className="text-sm text-slate-500">{new Date(p.created_at).toLocaleString()}</span>
                      <span className="text-xs font-mono text-slate-500">Run: {p.run_id.substring(0,8)}</span>
                    </div>
                    
                    <div>
                      <div className="text-sm font-medium text-slate-300">Action</div>
                      <div className="font-mono text-sm bg-slate-900 p-2 rounded mt-1 border border-slate-800">
                        {p.action} <span className="text-blue-400">{p.target}</span>
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-sm font-medium text-slate-300">Reasoning</div>
                      <p className="text-sm text-slate-400 mt-1">{p.reason}</p>
                    </div>
                  </div>
                  
                  <div className="w-full md:w-64 flex flex-col gap-2 border-t md:border-t-0 md:border-l border-slate-700 pt-4 md:pt-0 md:pl-4">
                    <button 
                      onClick={() => handleApprove(p.id)}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 px-4 rounded transition-colors"
                    >
                      Approve
                    </button>
                    <div className="mt-2 space-y-2">
                      <input 
                        type="text" 
                        placeholder="Rejection reason..." 
                        value={rejectReason[p.id] || ''}
                        onChange={(e) => setRejectReason({...rejectReason, [p.id]: e.target.value})}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                      />
                      <button 
                        onClick={() => handleReject(p.id)}
                        className="w-full bg-red-900 hover:bg-red-800 text-red-100 font-medium py-2 px-4 rounded transition-colors border border-red-700"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4 text-slate-300">History</h2>
          <div className="space-y-3">
            {history.map(p => (
              <div key={p.id} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <Badge variant={p.status === 'approved' ? 'success' : 'danger'}>
                      {p.status.toUpperCase()}
                    </Badge>
                    <span className="font-mono text-sm text-slate-300">{p.action} {p.target}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Decided at {new Date(p.updated_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
