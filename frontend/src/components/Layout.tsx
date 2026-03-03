import type { ReactNode } from 'react'
import { useState, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Mic, FileText, GitCompare, FlaskConical, PanelLeftClose, PanelLeft, Zap, FolderOpen, FolderMinus, Folder as FolderIcon, FolderPlus, Trash2, Search } from 'lucide-react'
import { useMeetings } from '../context/MeetingsContext'

const NAV = [
  { to: '/', label: 'Meetings', icon: Mic, desc: 'View all calls' },
  { to: '/synthesis', label: 'Synthesis', icon: FlaskConical, desc: 'Generate reports' },
  { to: '/reports', label: 'Reports', icon: FileText, desc: 'Pain report cards' },
  { to: '/delta', label: 'Delta Analysis', icon: GitCompare, desc: 'Compare sessions' },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(true)
  const ctx = useMeetings()
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folderSearch, setFolderSearch] = useState('')
  const newFolderInputRef = useRef<HTMLInputElement>(null)

  const filteredFolders = (ctx?.folders ?? []).filter(f =>
    !folderSearch.trim() || f.name.toLowerCase().includes(folderSearch.trim().toLowerCase())
  )

  async function handleCreateFolder() {
    if (!ctx || !newFolderName.trim() || creatingFolder) return
    setCreatingFolder(true)
    try {
      await ctx.createFolder(newFolderName)
      setNewFolderName('')
    } finally {
      setCreatingFolder(false)
      newFolderInputRef.current?.focus()
    }
  }

  async function handleDeleteFolder(e: React.MouseEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!ctx || !window.confirm('Move this folder to Bin? Meetings stay linked. Restore or permanently delete from Bin.')) return
    try {
      await ctx.deleteFolder(id)
    } catch {}
  }

  return (
    <div className="h-screen flex overflow-hidden app-shell">
      {/* Sidebar */}
      <aside
        className={`bg-[var(--color-secondary-light)] border-r border-slate-200/70 backdrop-blur-md flex flex-col fixed h-full z-30 transition-all duration-300 ease-in-out shadow-sm ${
          open ? 'w-64' : 'w-[68px]'
        }`}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-100/80 flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--sidebar-accent)] to-[var(--sidebar-accent-dark)] flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-200/60">
            <Zap className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
          </div>
          {open && (
            <div className="overflow-hidden">
              <p className="text-[15px] font-extrabold text-slate-900 leading-tight tracking-tight">ApexNeural</p>
              <p className="text-[11px] text-slate-400 font-medium leading-tight tracking-wide">Agent Factory &middot; AI Synthesis</p>
            </div>
          )}
        </div>

        {/* Nav: Meetings, Synthesis, Reports, Delta Analysis */}
        <nav className="flex-shrink-0 px-3 py-4 space-y-1 overflow-y-auto min-h-0">
          {NAV.map(({ to, label, icon: Icon, desc }) => {
            const active = to === '/' ? pathname === '/' || pathname.startsWith('/meeting/') : pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                title={label}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm transition-all duration-150 ${
                  active
                    ? 'bg-[var(--sidebar-accent-soft)] text-[var(--sidebar-accent-dark)] font-bold shadow-sm shadow-blue-100 border-l-2 border-[var(--sidebar-accent-dark)]'
                    : 'text-slate-500 hover:bg-slate-50/80 hover:text-slate-700 font-medium'
                } ${!open ? 'justify-center px-0' : ''}`}
              >
                <Icon className={`flex-shrink-0 ${active ? 'w-5 h-5' : 'w-[18px] h-[18px]'}`} strokeWidth={active ? 2.5 : 2} />
                {open && (
                  <div className="min-w-0">
                    <span className="block leading-tight">{label}</span>
                    {active && <span className="block text-[10px] text-[var(--sidebar-accent)] font-medium mt-0.5">{desc}</span>}
                  </div>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Folders: after main nav, ~half of sidebar with scroll; folder rows with different colors */}
        {open && ctx && (
          <div className="px-3 pt-2 pb-2 border-b border-slate-100/80 flex flex-col gap-2 flex-1 min-h-0 flex-shrink overflow-hidden">
            <p className="px-2 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 flex-shrink-0">
              <FolderOpen className="w-3.5 h-3.5" />
              Folders
            </p>
            <div className="relative flex-shrink-0">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={folderSearch}
                onChange={e => setFolderSearch(e.target.value)}
                placeholder="Search folders..."
                className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-400"
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-scroll overflow-x-hidden flex flex-col gap-0.5 pr-0.5" style={{ scrollbarGutter: 'stable' }}>
              <button
                type="button"
                onClick={() => ctx.setSelectedFolderId(null)}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors w-full text-left flex-shrink-0 ${
                  ctx.selectedFolderId === null ? 'bg-[var(--sidebar-accent-soft)] text-[var(--sidebar-accent-dark)]' : 'text-slate-600 hover:bg-slate-50/80 bg-slate-50/60'
                }`}
              >
                <FolderOpen className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">All meetings</span>
              </button>
              <button
                type="button"
                onClick={() => ctx.setSelectedFolderId('')}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors w-full text-left flex-shrink-0 ${
                  ctx.selectedFolderId === '' ? 'bg-[var(--sidebar-accent-soft)] text-[var(--sidebar-accent-dark)]' : 'text-slate-600 hover:bg-slate-50/80 bg-slate-100/60'
                }`}
              >
                <FolderMinus className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">No folder</span>
              </button>
              {filteredFolders.map((f, i) => {
                const colorClasses = [
                  'bg-amber-50/80 hover:bg-amber-100/80',
                  'bg-blue-50/80 hover:bg-blue-100/80',
                  'bg-emerald-50/80 hover:bg-emerald-100/80',
                  'bg-violet-50/80 hover:bg-violet-100/80',
                  'bg-rose-50/80 hover:bg-rose-100/80',
                  'bg-cyan-50/80 hover:bg-cyan-100/80',
                ]
                const activeColors = [
                  'bg-amber-100 text-amber-900',
                  'bg-blue-100 text-blue-900',
                  'bg-emerald-100 text-emerald-900',
                  'bg-violet-100 text-violet-900',
                  'bg-rose-100 text-rose-900',
                  'bg-cyan-100 text-cyan-900',
                ]
                const idx = i % colorClasses.length
                const baseClass = colorClasses[idx]
                const activeClass = activeColors[idx]
                return (
                  <div key={f.id} className={`flex items-center group flex-shrink-0 rounded-lg ${ctx.selectedFolderId === f.id ? activeClass : baseClass}`}>
                    <button
                      type="button"
                      onClick={() => ctx.setSelectedFolderId(f.id)}
                      className="flex-1 min-w-0 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors text-left truncate"
                    >
                      <FolderIcon className="w-4 h-4 flex-shrink-0 text-current opacity-80" />
                      <span className="truncate">{f.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteFolder(e, f.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      title="Delete folder"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-1.5 pt-0.5 flex-shrink-0">
              <input
                ref={newFolderInputRef}
                type="text"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                placeholder="New folder..."
                className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || creatingFolder}
                className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex-shrink-0"
                title="Create folder"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Bin: last, after Folders */}
        <div className="flex-shrink-0 px-3 pb-2">
          <Link
            to="/bin"
            title="Bin"
            className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm transition-all duration-150 ${
              pathname === '/bin'
                ? 'bg-[var(--sidebar-accent-soft)] text-[var(--sidebar-accent-dark)] font-bold shadow-sm shadow-blue-100 border-l-2 border-[var(--sidebar-accent-dark)]'
                : 'text-slate-500 hover:bg-slate-50/80 hover:text-slate-700 font-medium'
            } ${!open ? 'justify-center px-0' : ''}`}
          >
            <Trash2 className={`flex-shrink-0 ${pathname === '/bin' ? 'w-5 h-5' : 'w-[18px] h-[18px]'}`} strokeWidth={pathname === '/bin' ? 2.5 : 2} />
            {open && (
              <div className="min-w-0">
                <span className="block leading-tight">Bin</span>
                {pathname === '/bin' && <span className="block text-[10px] text-[var(--sidebar-accent)] font-medium mt-0.5">Recover or delete</span>}
              </div>
            )}
          </Link>
        </div>

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
        <div className="max-w-[1200px] 2xl:max-w-[var(--container-max)] mx-auto px-8 py-8 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  )
}
