import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Meeting, MeetingImportPayload, Folder } from '../lib/api'
import { Search, Calendar, Clock, Users, ChevronRight, Inbox, Mic, Upload, Trash2, FolderPlus, FolderOpen, Folder as FolderIcon, MoreVertical, FolderMinus } from 'lucide-react'

/** Normalize date from list (backend may send date_ist/date_iso) */
function getMeetingDate(m: Meeting): string {
  return m.date || m.date_ist || m.date_iso || ''
}

/** Format for display: "Feb 26, 2025" */
function formatDate(d: string) {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Format time: "10:30 AM" */
function formatTime(d: string) {
  if (!d) return ''
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

/** Relative label when useful: "Today", "Yesterday", or null */
function formatDateRelative(d: string): string | null {
  if (!d) return null
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return null
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return null
}

/** Duration: "45 min" or "1h 30m" */
function formatDuration(secs: number) {
  if (secs == null) return '—'
  const totalMins = Math.floor(secs / 60)
  const m = totalMins % 60
  const h = Math.floor(totalMins / 60)
  if (h > 0) return `${h}h ${m}m`
  return m > 0 ? `${m} min` : `${secs % 60}s`
}

function parseDateInput(s: string): number | null {
  if (!s) return null
  const t = new Date(s).getTime()
  return Number.isNaN(t) ? null : t
}

/** selectedFolderId: null = All, '' = No folder, string = folder id */
export default function Meetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dateFrom, _setDateFrom] = useState('')
  const [dateTo, _setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [_movingId, setMovingId] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [openMoveId, setOpenMoveId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function loadFolders() {
    api.foldersList().then(setFolders).catch(() => setFolders([]))
  }

  useEffect(() => {
    loadFolders()
  }, [])

  useEffect(() => {
    setLoading(true)
    api.meetingsAll(selectedFolderId ?? undefined)
      .then(setMeetings)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedFolderId])

  const filtered = meetings.filter(m => {
    const q = search.toLowerCase()
    const matchesSearch =
      !q ||
      m.title?.toLowerCase().includes(q) ||
      m.host_email?.toLowerCase().includes(q) ||
      m.meeting_id?.toLowerCase().includes(q) ||
      (Array.isArray(m.participants) && m.participants.some((p: string) => p?.toLowerCase().includes(q)))
    const rawDate = getMeetingDate(m)
    const ts = rawDate ? new Date(rawDate).getTime() : null
    const fromTs = parseDateInput(dateFrom)
    const toTs = parseDateInput(dateTo)
    const matchesFrom = !fromTs || (ts != null && ts >= fromTs)
    const matchesTo = !toTs || (ts != null && ts <= toTs)
    return matchesSearch && matchesFrom && matchesTo
  })

  async function handleDeleteMeeting(e: React.MouseEvent, meetingId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this meeting permanently? This cannot be undone.')) return
    setDeletingId(meetingId)
    try {
      await api.deleteMeeting(meetingId)
      setMeetings(prev => prev.filter(m => m.meeting_id !== meetingId))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete meeting'
      setError(msg)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleMoveToFolder(meetingId: string, folderId: string | null) {
    setOpenMoveId(null)
    setMovingId(meetingId)
    try {
      await api.updateMeeting(meetingId, { folder_id: folderId ?? null })
      setMeetings(prev => prev.map(m => m.meeting_id === meetingId ? { ...m, folder_id: folderId ?? undefined } : m))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to move meeting'
      setError(msg)
    } finally {
      setMovingId(null)
    }
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim()
    if (!name) return
    setCreatingFolder(true)
    try {
      const folder = await api.folderCreate(name)
      setFolders(prev => [...prev, folder])
      setNewFolderName('')
      setSelectedFolderId(folder.id)
      api.meetingsAll(folder.id).then(setMeetings)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create folder'
      setError(msg)
    } finally {
      setCreatingFolder(false)
    }
  }

  async function handleDeleteFolder(folderId: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this folder? Meetings inside will be moved to "No folder".')) return
    try {
      await api.folderDelete(folderId)
      setFolders(prev => prev.filter(f => f.id !== folderId))
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null)
        api.meetingsAll().then(setMeetings)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete folder'
      setError(msg)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setUploading(true)
      const text = await file.text()
      const json = JSON.parse(text) as MeetingImportPayload
      if (!json.meeting_id || !json.transcript) {
        throw new Error('JSON must include at least "meeting_id" and "transcript" fields.')
      }
      await api.importMeeting(json)
      // Refresh meetings list so the new one appears
      const fresh = await api.meetings()
      setMeetings(fresh)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to import meeting'
      setError(msg)
    } finally {
      setUploading(false)
      if (e.target) {
        e.target.value = ''
      }
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-3">
        <div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400 font-medium">Loading meetings...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-3">
        <p className="text-base font-semibold text-red-600">Could not load meetings</p>
        <p className="text-sm text-slate-500 max-w-md text-center">{error}</p>
        <button
          type="button"
          onClick={() => { setError(null); setLoading(true); api.meetingsAll(selectedFolderId ?? undefined).then(setMeetings).catch((e: Error) => setError(e.message)).finally(() => setLoading(false)) }}
          className="mt-2 px-4 py-2 rounded-lg bg-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-300"
        >
          Retry
        </button>
      </div>
    )
  }

  function folderNameFor(meeting: Meeting): string {
    if (!meeting.folder_id) return 'No folder'
    const f = folders.find(x => x.id === meeting.folder_id)
    return f?.name ?? 'Unknown'
  }

  // Sidebar counts: when viewing All we have full list; when viewing a folder we show count only for selected
  const noFolderCount = selectedFolderId === null ? meetings.filter(m => !m.folder_id).length : 0
  const folderCount = (fid: string) => selectedFolderId === null ? meetings.filter(m => m.folder_id === fid).length : 0

  return (
    <div className="flex flex-col md:flex-row gap-6 lg:gap-8">
      {/* Left sidebar: Folders - always first so it appears on the left when row layout */}
      <aside className="md:w-52 lg:w-56 flex-shrink-0 order-first">
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden md:sticky md:top-6">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-slate-400" />
              Folders
            </h2>
          </div>
          <nav className="p-2">
            <button
              type="button"
              onClick={() => setSelectedFolderId(null)}
              className={`w-full inline-flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                selectedFolderId === null ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="inline-flex items-center gap-2.5 min-w-0">
                <FolderOpen className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">All meetings</span>
              </span>
              {selectedFolderId === null && <span className="flex-shrink-0 text-slate-400 tabular-nums">{meetings.length}</span>}
            </button>
            <button
              type="button"
              onClick={() => setSelectedFolderId('')}
              className={`w-full inline-flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                selectedFolderId === '' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="inline-flex items-center gap-2.5 min-w-0">
                <FolderMinus className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">No folder</span>
              </span>
              {(selectedFolderId === '' || selectedFolderId === null) && <span className="flex-shrink-0 text-slate-400 tabular-nums">{selectedFolderId === '' ? meetings.length : noFolderCount}</span>}
            </button>
            {folders.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-100">
                <p className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wide">My folders</p>
                {folders.map(f => (
                  <div key={f.id} className="flex items-center group">
                    <button
                      type="button"
                      onClick={() => setSelectedFolderId(f.id)}
                      className={`flex-1 min-w-0 inline-flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors text-left ${
                        selectedFolderId === f.id ? 'bg-amber-50 text-amber-800' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2.5 min-w-0 truncate">
                        <FolderIcon className="w-4 h-4 flex-shrink-0 text-amber-500" />
                        <span className="truncate">{f.name}</span>
                      </span>
                      {(selectedFolderId === f.id || selectedFolderId === null) && <span className="flex-shrink-0 text-slate-400 tabular-nums text-xs">{selectedFolderId === f.id ? meetings.length : folderCount(f.id)}</span>}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteFolder(f.id, e)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete folder"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </nav>
          <div className="p-2 border-t border-slate-100 bg-slate-50/30">
            <div className="flex gap-2 rounded-xl border border-dashed border-slate-200 bg-white px-2 py-2">
              <input
                type="text"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                placeholder="New folder..."
                className="flex-1 min-w-0 text-sm border-0 bg-transparent focus:outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || creatingFolder}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                title="Create folder"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main: Header, Search, Stats, List */}
      <div className="flex-1 min-w-0">
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight">Meetings</h1>
          <p className="text-[15px] text-slate-500 mt-1.5">All recorded meetings from your workspace</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] text-white text-[13px] font-medium px-4 py-2.5 shadow-sm hover:bg-[var(--color-primary-dark)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Import meeting'}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by title or host email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-11 pr-5 py-3 text-[15px] border border-slate-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all placeholder:text-slate-400"
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Meetings', value: meetings.length, color: 'text-slate-800' },
          { label: 'With Transcript', value: meetings.filter(m => m.has_transcript).length, color: 'text-blue-600' },
          { label: 'Showing', value: filtered.length, color: 'text-slate-800' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
            <p className="text-[11px] text-slate-400 uppercase tracking-widest font-bold">{s.label}</p>
            <p className={`text-3xl font-extrabold mt-1.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Meeting List */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-white border border-slate-200/80 rounded-2xl shadow-sm">
          <Inbox className="w-10 h-10 mx-auto text-slate-300 mb-3" />
          <p className="text-base font-semibold text-slate-500">No meetings found</p>
          <p className="text-sm text-slate-400 mt-1">Try a different search term</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(m => (
            <div
              key={m.meeting_id}
              className="flex items-center bg-white border border-slate-200/80 rounded-2xl px-5 py-4 hover:border-blue-300 hover:shadow-md hover:shadow-blue-50 transition-all duration-150 group"
            >
              <Link to={`/meeting/${m.meeting_id}`} className="flex flex-1 min-w-0 items-center">
                {/* Icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mr-4 ${
                  m.has_transcript ? 'bg-blue-50' : 'bg-slate-100'
                }`}>
                  <Mic className={`w-[18px] h-[18px] ${m.has_transcript ? 'text-blue-500' : 'text-slate-400'}`} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-slate-800 truncate group-hover:text-blue-700 transition-colors">
                    {m.title || 'Untitled Meeting'}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[13px] text-slate-500">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {formatDateRelative(getMeetingDate(m)) ?? formatDate(getMeetingDate(m))}
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {formatTime(getMeetingDate(m))}
                      {formatTime(getMeetingDate(m)) && ' · '}
                      {formatDuration(m.duration_seconds ?? m.duration)}
                    </span>
                    {m.participants?.length > 0 && (
                      <span className="flex items-center gap-1.5 text-slate-500">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        {m.participants.length} participants
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <FolderIcon className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-[12px]">{folderNameFor(m)}</span>
                    </span>
                  </div>
                </div>

                {/* Right badges */}
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  {m.source && (
                    <span className="bg-slate-100 text-slate-500 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide">
                      {m.source}
                    </span>
                  )}
                  {m.has_transcript && (
                    <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg tracking-wide">
                      Transcript
                    </span>
                  )}
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                </div>
              </Link>

              {/* Move & Delete */}
              <div className="flex items-center gap-1 ml-2 flex-shrink-0" onClick={e => e.preventDefault()}>
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setOpenMoveId(openMoveId === m.meeting_id ? null : m.meeting_id) }}
                    className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    title="Move to folder"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {openMoveId === m.meeting_id && (
                    <div className="absolute right-0 top-full mt-1 z-20 min-w-[200px] py-1 bg-white border border-slate-200 rounded-xl shadow-lg">
                      <p className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wide">Move to folder</p>
                      <button
                        type="button"
                        onClick={() => handleMoveToFolder(m.meeting_id, null)}
                        className="w-full text-left inline-flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg mx-1"
                      >
                        <FolderMinus className="w-4 h-4 text-slate-400" />
                        No folder
                      </button>
                      {folders.map(f => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => handleMoveToFolder(m.meeting_id, f.id)}
                          className="w-full text-left inline-flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg mx-1"
                        >
                          <FolderIcon className="w-4 h-4 text-amber-500" />
                          {f.name}
                        </button>
                      ))}
                      <div className="border-t border-slate-100 my-1" />
                      <button
                        type="button"
                        onClick={(e) => { handleDeleteMeeting(e, m.meeting_id); setOpenMoveId(null) }}
                        disabled={deletingId === m.meeting_id}
                        className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 font-medium"
                      >
                        Permanently delete meeting
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => handleDeleteMeeting(e, m.meeting_id)}
                  disabled={deletingId === m.meeting_id}
                  className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  title="Permanently delete meeting"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}
