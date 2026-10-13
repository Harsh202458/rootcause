'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Badge from '@/components/Badge';
import Card from '@/components/Card';

type Run = {
  id: string;
  alert_id: string;
  provider: string;
  model: string;
  verdict: 'correct' | 'partial' | 'wrong' | null;
  total_steps: number;
  total_tokens: number;
  duration_ms: number;
  created_at: string;
};

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerFilter, setProviderFilter] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('');

  useEffect(() => {
    const fetchRuns = async () => {
      try {
        let url = '/api/runs';
        const params = new URLSearchParams();
        if (providerFilter) params.append('provider', providerFilter);
        if (verdictFilter) params.append('verdict', verdictFilter);
        if (params.toString()) url += `?${params.toString()}`;

        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setRuns(data);
        }
      } catch (error) {
        console.error('Error fetching runs:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRuns();
  }, [providerFilter, verdictFilter]);

  const getVerdictBadgeVariant = (verdict: string | null) => {
    if (verdict === 'correct') return 'success';
    if (verdict === 'partial') return 'warning';
    if (verdict === 'wrong') return 'danger';
    return 'default';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Investigation Runs</h1>
        <div className="flex gap-4">
          <select 
            value={providerFilter} 
            onChange={(e) => setProviderFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Providers</option>
            <option value="gemini">Gemini</option>
            <option value="groq">Groq</option>
          </select>
          <select 
            value={verdictFilter} 
            onChange={(e) => setVerdictFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Verdicts</option>
            <option value="correct">Correct</option>
            <option value="partial">Partial</option>
            <option value="wrong">Wrong</option>
          </select>
        </div>
      </div>

      <Card>
        {loading ? (
          <div className="p-4 text-center text-slate-400">Loading runs...</div>
        ) : runs.length === 0 ? (
          <div className="p-4 text-center text-slate-400">No runs found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-400 uppercase bg-slate-800/50 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3">ID / Alert</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Verdict</th>
                  <th className="px-4 py-3 text-right">Steps</th>
                  <th className="px-4 py-3 text-right">Tokens</th>
                  <th className="px-4 py-3 text-right">Duration</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-slate-700 hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/runs/${run.id}`} className="block">
                        <div className="font-mono text-blue-400 truncate w-32" title={run.id}>{run.id.substring(0, 8)}...</div>
                        <div className="text-slate-400 text-xs mt-1 truncate w-48" title={run.alert_id}>{run.alert_id}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-200">{run.model}</div>
                      <div className="text-slate-500 text-xs">{run.provider}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={getVerdictBadgeVariant(run.verdict)}>
                        {run.verdict ? run.verdict.toUpperCase() : 'N/A'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">{run.total_steps}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">{run.total_tokens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">{(run.duration_ms / 1000).toFixed(1)}s</td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {new Date(run.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
