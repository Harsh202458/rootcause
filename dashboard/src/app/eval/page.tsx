'use client';
import { useEffect, useState } from 'react';
import Card from '@/components/Card';
import Badge from '@/components/Badge';

export default function EvalPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const res = await fetch('/api/eval/reports');
        if (res.ok) {
          const data = await res.json();
          setReports(data);
        }
      } catch (error) {
        console.error('Error fetching eval reports:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, []);

  if (loading) return <div className="p-8 text-slate-400">Loading evaluation data...</div>;

  if (!reports || reports.length === 0) {
    return (
      <div className="max-w-4xl mx-auto mt-12 text-center">
        <h2 className="text-2xl font-bold mb-4">No Evaluation Data Found</h2>
        <p className="text-slate-400 mb-8">Run the evaluation script to generate reports.</p>
        <div className="bg-slate-800 p-6 rounded-lg text-left font-mono text-sm inline-block">
          <code>npm run eval</code>
        </div>
      </div>
    );
  }

  // Use the latest report for summary
  const latestReport = reports[0];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-4">
        Evaluation Results
        <span className="text-sm font-normal text-slate-400">
          Last run: {new Date(latestReport.timestamp).toLocaleString()}
        </span>
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="text-slate-400 text-sm mb-1">Total Scenarios</div>
          <div className="text-3xl font-bold">{latestReport.summary.total}</div>
        </Card>
        <Card>
          <div className="text-slate-400 text-sm mb-1">Overall Accuracy</div>
          <div className="text-3xl font-bold text-emerald-400">
            {((latestReport.summary.correct / latestReport.summary.total) * 100).toFixed(1)}%
          </div>
        </Card>
        <Card>
          <div className="text-slate-400 text-sm mb-1">Partial Matches</div>
          <div className="text-3xl font-bold text-amber-400">
            {((latestReport.summary.partial / latestReport.summary.total) * 100).toFixed(1)}%
          </div>
        </Card>
        <Card>
          <div className="text-slate-400 text-sm mb-1">Avg Tokens/Run</div>
          <div className="text-3xl font-bold text-blue-400">
            {Math.round(latestReport.summary.avgTokens).toLocaleString()}
          </div>
        </Card>
      </div>

      <Card title="Accuracy by Category">
        <div className="space-y-4 max-w-2xl">
          {Object.entries(latestReport.byCategory).map(([category, stats]: [string, any]) => {
            const percentage = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
            return (
              <div key={category}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-slate-300">{category}</span>
                  <span className="text-slate-400">{stats.correct}/{stats.total} ({percentage.toFixed(0)}%)</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2.5 border border-slate-700">
                  <div 
                    className="bg-blue-500 h-2.5 rounded-full" 
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
