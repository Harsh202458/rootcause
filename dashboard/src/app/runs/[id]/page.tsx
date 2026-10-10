'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Card from '@/components/Card';
import Timeline from '@/components/Timeline';
import Badge from '@/components/Badge';

export default function RunDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [run, setRun] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRun = async () => {
      try {
        const res = await fetch(`/api/runs/${id}`);
        if (res.ok) {
          const data = await res.json();
          setRun(data);
        }
      } catch (error) {
        console.error('Error fetching run details:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRun();
  }, [id]);

  if (loading) return <div className="p-8 text-slate-400">Loading run details...</div>;
  if (!run) return <div className="p-8 text-red-400">Run not found.</div>;

  const report = run.final_report;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          Run <span className="font-mono text-blue-400 text-lg">{id.substring(0, 8)}...</span>
        </h1>
        {run.verdict && (
          <Badge variant={run.verdict === 'correct' ? 'success' : run.verdict === 'partial' ? 'warning' : 'danger'}>
            {run.verdict.toUpperCase()}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Alert Info">
          <div className="space-y-4">
            <div>
              <span className="text-slate-500 text-sm block">Alert ID</span>
              <span className="font-mono text-sm">{run.alert_id}</span>
            </div>
            <div>
              <span className="text-slate-500 text-sm block">Model</span>
              <span>{run.model} <span className="text-slate-500 text-sm">({run.provider})</span></span>
            </div>
            <div className="grid grid-cols-3 gap-4 border-t border-slate-700 pt-4 mt-4">
              <div>
                <span className="text-slate-500 text-xs block">Steps</span>
                <span className="font-mono">{run.total_steps}</span>
              </div>
              <div>
                <span className="text-slate-500 text-xs block">Tokens</span>
                <span className="font-mono">{run.total_tokens.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-500 text-xs block">Duration</span>
                <span className="font-mono">{(run.duration_ms / 1000).toFixed(1)}s</span>
              </div>
            </div>
          </div>
        </Card>

        {report && (
          <Card title="Final Report">
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-slate-500 text-sm block">Component</span>
                  <span className="font-semibold text-blue-400">{report.component}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 text-sm block">Confidence</span>
                  <span className="font-mono font-semibold">{report.confidence}%</span>
                </div>
              </div>
              <div>
                <span className="text-slate-500 text-sm block">Category</span>
                <Badge variant="default">{report.category}</Badge>
              </div>
              <div>
                <span className="text-slate-500 text-sm block mb-1">Explanation</span>
                <p className="text-sm text-slate-300">{report.explanation}</p>
              </div>
              
              {run.ground_truth && (
                <div className="mt-4 pt-4 border-t border-slate-700 bg-slate-900/50 -mx-4 px-4 pb-4">
                  <span className="text-slate-500 text-sm block mb-2">Ground Truth Comparison</span>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-20">Component:</span>
                      <span className={`text-sm ${run.ground_truth.component === report.component ? 'text-emerald-400' : 'text-red-400'}`}>
                        {run.ground_truth.component}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-20">Category:</span>
                      <span className={`text-sm ${run.ground_truth.category === report.category ? 'text-emerald-400' : 'text-red-400'}`}>
                        {run.ground_truth.category}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      <Card title="Investigation Timeline">
        {run.steps && run.steps.length > 0 ? (
          <Timeline steps={run.steps} />
        ) : (
          <div className="text-slate-400 text-center py-8">No steps recorded for this run.</div>
        )}
      </Card>
    </div>
  );
}
