'use client';
import { useState } from 'react';

type Step = {
  id: string;
  step_number: number;
  reasoning?: string;
  tool_name?: string;
  tool_args?: any;
  tool_result?: string;
  tokens_used: number;
  duration_ms: number;
  is_error?: boolean;
};

export default function Timeline({ steps }: { steps: Step[] }) {
  return (
    <div className="flow-root">
      <ul role="list" className="-mb-8">
        {steps.map((step, stepIdx) => (
          <li key={step.id}>
            <div className="relative pb-8">
              {stepIdx !== steps.length - 1 ? (
                <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-slate-700" aria-hidden="true" />
              ) : null}
              <div className="relative flex space-x-3">
                <div>
                  <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-slate-900 ${step.is_error ? 'bg-red-500' : (step.tool_name === 'report' ? 'bg-emerald-500' : (step.tool_name ? 'bg-blue-500' : 'bg-slate-500'))}`}>
                    <span className="text-white text-xs">{step.step_number}</span>
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                  <div className="w-full">
                    {step.reasoning && (
                      <p className="text-sm text-slate-300 mb-2">{step.reasoning}</p>
                    )}
                    {step.tool_name && (
                      <div className="mt-2 bg-slate-950 rounded-md p-3 border border-slate-800">
                        <div className="text-sm font-mono text-blue-400 mb-1">
                          {step.tool_name}(<span className="text-slate-400">{JSON.stringify(step.tool_args)}</span>)
                        </div>
                        {step.tool_result && <ExpandableResult result={step.tool_result} isError={step.is_error} />}
                      </div>
                    )}
                    <div className="mt-2 text-xs text-slate-500 flex gap-4">
                      <span>{step.tokens_used} tokens</span>
                      <span>{step.duration_ms} ms</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExpandableResult({ result, isError }: { result: string, isError?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="mt-2">
      <button 
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-slate-400 hover:text-slate-300 underline mb-1"
      >
        {expanded ? 'Hide Result' : 'Show Result'}
      </button>
      {expanded && (
        <pre className={`text-xs overflow-x-auto p-2 rounded bg-slate-900 border ${isError ? 'border-red-800 text-red-200' : 'border-slate-700 text-slate-300'}`}>
          {result}
        </pre>
      )}
    </div>
  )
}
