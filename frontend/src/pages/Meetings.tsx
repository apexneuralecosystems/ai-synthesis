import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Meeting, MeetingImportPayload } from '../lib/api'
import { useMeetings } from '../context/MeetingsContext'
import { Search, Calendar, Clock, Users, ChevronRight, Inbox, Mic, Upload, Trash2, Folder as FolderIcon, MoreVertical, FolderMinus } from 'lucide-react'

/** Prefer ISO for parsing; backend sends date_ist (e.g. "26 Feb 2025, 10:30 AM IST") and date_iso (parseable) */
function getMeetingDateForParse(m: Meeting): string {
  return (m.date_iso || m.date || m.date_ist || '') as string
}

/** Human-readable date from backend when available (date_ist); else we format from date_iso/date */
function getMeetingDateDisplay(m: Meeting): string {
  const raw = m.date_ist || m.date_iso || m.date || ''
  return raw
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

export default function Meetings() {
  const ctx = useMeetings()
  const selectedFolderId = ctx?.selectedFolderId ?? null
  const folders = ctx?.folders ?? []
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [search, setSearch] = useState('')
  const [dateFrom, _setDateFrom] = useState('')
  const [dateTo, _setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [_movingId, setMovingId] = useState<string | null>(null)
  const [openMoveId, setOpenMoveId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const docxInputRef = useRef<HTMLInputElement | null>(null)
  const [importType, setImportType] = useState<'json' | 'docx'>('json')
  const [docName, setDocName] = useState('')
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [docxFile, setDocxFile] = useState<File | null>(null)

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
    const rawDate = getMeetingDateForParse(m)
    const ts = rawDate ? new Date(rawDate).getTime() : null
    const fromTs = parseDateInput(dateFrom)
    const toTs = parseDateInput(dateTo)
    const matchesFrom = !fromTs || (ts != null && ts >= fromTs)
    const matchesTo = !toTs || (ts != null && ts <= toTs)
    return matchesSearch && matchesFrom && matchesTo
  })

  async function handleMoveToBin(e: React.MouseEvent, meetingId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Move this meeting to Bin? You can restore or permanently delete it from Bin.')) return
    setDeletingId(meetingId)
    try {
      await api.deleteMeeting(meetingId)
      setMeetings(prev => prev.filter(m => m.meeting_id !== meetingId))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to move to bin'
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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setUploading(true)
      const text = await file.text()
      const json = JSON.parse(text) as MeetingImportPayload
      if (!json.transcript) {
        throw new Error('JSON must include at least "transcript". Optionally include "meeting_id", "title", "date" (omit meeting_id to create a new meeting each time, e.g. same-name daily).')
      }
      await api.importMeeting(json)
      const fresh = await api.meetingsAll(selectedFolderId ?? undefined)
      setMeetings(fresh)
      setImportDialogOpen(false)
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

  async function handleDocxImport() {
    if (!docxFile || !docName.trim()) return
    try {
      setUploading(true)
      await api.importMeetingDoc(docxFile, docName.trim())
      const fresh = await api.meetingsAll(selectedFolderId ?? undefined)
      setMeetings(fresh)
      setImportDialogOpen(false)
      setDocxFile(null)
      setDocName('')
      if (docxInputRef.current) docxInputRef.current.value = ''
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to import document'
      setError(msg)
    } finally {
      setUploading(false)
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

  return (
    <div>
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
          <input
            ref={docxInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              setDocxFile(f ?? null)
            }}
          />
          <button
            type="button"
            onClick={() => setImportDialogOpen(true)}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] text-white text-[13px] font-medium px-4 py-2.5 shadow-sm hover:bg-[var(--color-primary-dark)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Import meeting'}
          </button>
        </div>
      </div>

      {/* Import dialog: JSON or DOCX */}
      {importDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !uploading && setImportDialogOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-4">Import meeting</h3>
            <p className="text-[13px] text-slate-500 mb-4">Choose format: JSON (transcript payload) or DOCX (document).</p>
            <div className="flex gap-4 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="importType" checked={importType === 'json'} onChange={() => setImportType('json')} className="rounded-full" />
                <span className="text-[14px] font-medium text-slate-700">JSON</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="importType" checked={importType === 'docx'} onChange={() => setImportType('docx')} className="rounded-full" />
                <span className="text-[14px] font-medium text-slate-700">DOCX</span>
              </label>
            </div>

            {importType === 'json' && (
              <div className="mb-4">
                <p className="text-[12px] text-slate-500 mb-2">Upload a JSON file with at least <code className="bg-slate-100 px-1 rounded">transcript</code>.</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 text-[13px] font-medium px-3 py-2 hover:bg-slate-100 disabled:opacity-60"
                >
                  <Upload className="w-4 h-4" />
                  Choose JSON file
                </button>
              </div>
            )}

            {importType === 'docx' && (
              <div className="space-y-4 mb-4">
                <div>
                  <p className="text-[12px] text-slate-500 mb-2">Document name (saved as meeting title)</p>
                  <input
                    type="text"
                    value={docName}
                    onChange={e => setDocName(e.target.value)}
                    placeholder="e.g. Q1 Strategy Doc"
                    className="w-full px-3 py-2.5 text-[14px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                  />
                </div>
                <div>
                  <p className="text-[12px] text-slate-500 mb-2">.docx file</p>
                  <button
                    type="button"
                    onClick={() => docxInputRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 text-[13px] font-medium px-3 py-2 hover:bg-slate-100 disabled:opacity-60"
                  >
                    <Upload className="w-4 h-4" />
                    {docxFile ? docxFile.name : 'Choose .docx file'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleDocxImport}
                  disabled={uploading || !docxFile || !docName.trim()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-white text-[13px] font-medium py-2.5 hover:bg-[var(--color-primary-dark)] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {uploading ? 'Importing...' : 'Import document'}
                </button>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => !uploading && setImportDialogOpen(false)}
                className="text-[13px] font-medium text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
                      {(() => {
                        const parseable = getMeetingDateForParse(m)
                        const relative = formatDateRelative(parseable)
                        const formatted = formatDate(parseable)
                        const display = getMeetingDateDisplay(m)
                        if (relative) return relative
                        if (formatted !== '—') return formatted
                        if (display) return display
                        return '—'
                      })()}
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {(() => {
                        const parseable = getMeetingDateForParse(m)
                        const t = formatTime(parseable)
                        if (t) return t
                        const display = getMeetingDateDisplay(m)
                        if (display && display.includes(',')) return display.split(',')[1]?.trim() || '—'
                        return '—'
                      })()}
                      {' · '}
                      {m.duration_display || formatDuration(m.duration_seconds ?? m.duration)}
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
                        onClick={(e) => { handleMoveToBin(e, m.meeting_id); setOpenMoveId(null) }}
                        disabled={deletingId === m.meeting_id}
                        className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 font-medium"
                      >
                        Move to bin
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => handleMoveToBin(e, m.meeting_id)}
                  disabled={deletingId === m.meeting_id}
                  className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  title="Move to bin"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
