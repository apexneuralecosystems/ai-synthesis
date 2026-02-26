import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Mic, FileText, GitCompare, FlaskConical, PanelLeftClose, PanelLeft, Zap } from 'lucide-react'

const NAV = [
  { to: '/', label: 'Meetings', icon: Mic, desc: 'View all calls' },
  { to: '/synthesis', label: 'Synthesis', icon: FlaskConical, desc: 'Generate reports' },
  { to: '/reports', label: 'Reports', icon: FileText, desc: 'Pain report cards' },
  { to: '/delta', label: 'Delta Analysis', icon: GitCompare, desc: 'Compare sessions' },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(true)

  return (
    <div className="h-screen flex overflow-hidden bg-slate-100">
      {/* Sidebar */}
      <aside
        className={`bg-white border-r border-slate-200/80 flex flex-col fixed h-full z-30 transition-all duration-300 ease-in-out shadow-sm ${
          open ? 'w-64' : 'w-[68px]'
        }`}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-100 flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-200">
            <Zap className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
          </div>
          {open && (
            <div className="overflow-hidden">
              <p className="text-[15px] font-extrabold text-slate-900 leading-tight tracking-tight">ApexNeural</p>
              <p className="text-[11px] text-slate-400 font-medium leading-tight tracking-wide">Agent Factory &middot; AI Synthesis</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon, desc }) => {
            const active = to === '/' ? pathname === '/' || pathname.startsWith('/meeting/') : pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                title={label}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm transition-all duration-150 ${
                  active
                    ? 'bg-blue-50 text-blue-700 font-bold shadow-sm shadow-blue-100'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 font-medium'
                } ${!open ? 'justify-center px-0' : ''}`}
              >
                <Icon className={`flex-shrink-0 ${active ? 'w-5 h-5' : 'w-[18px] h-[18px]'}`} strokeWidth={active ? 2.5 : 2} />
                {open && (
                  <div className="min-w-0">
                    <span className="block leading-tight">{label}</span>
                    {active && <span className="block text-[10px] text-blue-500 font-medium mt-0.5">{desc}</span>}
                  </div>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Toggle button */}
        <button
          onClick={() => setOpen(!open)}
          className="px-4 py-3.5 border-t border-slate-100 text-slate-400 hover:text-blue-600 hover:bg-slate-50 transition-all flex items-center gap-2.5 justify-center"
        >
          {open ? (
            <>
              <PanelLeftClose className="w-4 h-4" />
              <span className="text-xs font-medium">Collapse</span>
            </>
          ) : (
            <PanelLeft className="w-4 h-4" />
          )}
        </button>
      </aside>

      {/* Main content area */}
      <main className={`flex-1 overflow-y-auto transition-all duration-300 ease-in-out ${open ? 'ml-64' : 'ml-[68px]'}`}>
        <div className="max-w-[1200px] mx-auto px-8 py-8 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  )
}
