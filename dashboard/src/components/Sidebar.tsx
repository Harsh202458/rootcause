import Link from 'next/link';

export default function Sidebar() {
  return (
    <div className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col">
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <h1 className="text-xl font-bold text-white tracking-tight">RootCause</h1>
      </div>
      <nav className="flex-1 py-4 space-y-1 px-3">
        <Link href="/" className="block px-3 py-2 rounded-md text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800">
          Runs
        </Link>
        <Link href="/eval" className="block px-3 py-2 rounded-md text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800">
          Eval
        </Link>
        <Link href="/approvals" className="block px-3 py-2 rounded-md text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800">
          Approvals
        </Link>
      </nav>
    </div>
  )
}
