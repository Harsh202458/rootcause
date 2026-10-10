export default function Card({ title, children }: { title?: React.ReactNode, children: React.ReactNode }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-sm overflow-hidden">
      {title && (
        <div className="px-4 py-4 border-b border-slate-700 bg-slate-800/50">
          <h3 className="text-lg font-medium text-white">{title}</h3>
        </div>
      )}
      <div className="p-4">
        {children}
      </div>
    </div>
  )
}
