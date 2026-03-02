import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import type { Meeting, PainReportItem, DeltaItem, Folder } from '../lib/api'
import { useMeetings } from '../context/MeetingsContext'
import { Trash2, RotateCcw, AlertCircle, Calendar, Clock, Mic, FileText, GitCompare, Check, Folder as FolderIcon } from 'lucide-react'

const TABS = ['folders', 'meetings', 'reports', 'deltas'] as const
type TabId = (typeof TABS)[number]

function formatDate(d: string) {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDuration(secs: number) {
  if (secs == null) return '—'
  const totalMins = Math.floor(secs / 60)
  const m = totalMins % 60
  const h = Math.floor(totalMins / 60)
  if (h > 0) return `${h}h ${m}m`
  return m > 0 ? `${m} min` : `${secs % 60}s`
}

export default function Bin() {
  const ctx = useMeetings()
  const [tab, setTab] = useState<TabId>('folders')
  const [folders, setFolders] = useState<Folder[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [reports, setReports] = useState<PainReportItem[]>([])
  const [deltas, setDeltas] = useState<DeltaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteAlling, setDeleteAlling] = useState(false)
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set())
  const [selectedMeetings, setSelectedMeetings] = useState<Set<string>>(new Set())
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set())
  const [selectedDeltas, setSelectedDeltas] = useState<Set<string>>(new Set())

  const loadAll = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      api.foldersTrash().then(r => (Array.isArray(r) ? r : [])),
      api.meetingsTrash().then(r => (Array.isArray(r) ? r : [])),
      api.reportsTrash().then(r => (Array.isArray(r) ? r : [])),
      api.deltasTrash().then(r => (Array.isArray(r) ? r : [])),
    ])
      .then(([f, m, r, d]) => {
        setFolders(f)
        setMeetings(m)
        setReports(r)
        setDeltas(d)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  function toggleFolder(id: string) {
    setSelectedFolders(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleMeeting(id: string) {
    setSelectedMeetings(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleReport(id: string) {
    setSelectedReports(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleDelta(id: string) {
    setSelectedDeltas(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleRestoreFolder(folderId: string) {
    setRestoringId(folderId)
    try {
      await api.restoreFolder(folderId)
      setFolders(prev => prev.filter(f => f.id !== folderId))
      ctx?.loadFolders()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to restore folder')
    } finally {
      setRestoringId(null)
    }
  }
  async function handlePermanentDeleteFolder(folderId: string) {
    if (!window.confirm('Permanently delete this folder? Meetings inside will move to "No folder".')) return
    setDeletingId(folderId)
    try {
      await api.deleteFolderPermanent(folderId)
      setFolders(prev => prev.filter(f => f.id !== folderId))
      setSelectedFolders(prev => { const n = new Set(prev); n.delete(folderId); return n })
      ctx?.loadFolders()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete folder')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleRestoreMeeting(meetingId: string) {
    setRestoringId(meetingId)
    try {
      await api.restoreMeeting(meetingId)
      setMeetings(prev => prev.filter(m => m.meeting_id !== meetingId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to restore')
    } finally {
      setRestoringId(null)
    }
  }
  async function handlePermanentDeleteMeeting(meetingId: string) {
    if (!window.confirm('Permanently delete this meeting? This cannot be undone.')) return
    setDeletingId(meetingId)
    try {
      await api.deleteMeetingPermanent(meetingId)
      setMeetings(prev => prev.filter(m => m.meeting_id !== meetingId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleRestoreReport(id: string) {
    setRestoringId(id)
    try {
      await api.restoreReport(id)
      setReports(prev => prev.filter(r => r._id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to restore')
    } finally {
      setRestoringId(null)
    }
  }
  async function handlePermanentDeleteReport(id: string) {
    if (!window.confirm('Permanently delete this report? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await api.deleteReportPermanent(id)
      setReports(prev => prev.filter(r => r._id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleRestoreDelta(id: string) {
    setRestoringId(id)
    try {
      await api.restoreDelta(id)
      setDeltas(prev => prev.filter(d => d._id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to restore')
    } finally {
      setRestoringId(null)
    }
  }
  async function handlePermanentDeleteDelta(id: string) {
    if (!window.confirm('Permanently delete this delta report? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await api.deleteDeltaPermanent(id)
      setDeltas(prev => prev.filter(d => d._id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleDeleteAllFolders() {
    if (folders.length === 0) return
    if (!window.confirm(`Permanently delete all ${folders.length} folder(s)? Meetings in them will move to "No folder".`)) return
    setDeleteAlling(true)
    try {
      await Promise.all(folders.map(f => api.deleteFolderPermanent(f.id)))
      setFolders([])
      setSelectedFolders(new Set())
      ctx?.loadFolders()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete all folders')
    } finally {
      setDeleteAlling(false)
    }
  }
  async function handleDeleteSelectedFolders() {
    if (selectedFolders.size === 0) return
    if (!window.confirm(`Permanently delete ${selectedFolders.size} selected folder(s)? Meetings in them will move to "No folder".`)) return
    setDeleteAlling(true)
    try {
      await Promise.all(Array.from(selectedFolders).map(id => api.deleteFolderPermanent(id)))
      setFolders(prev => prev.filter(f => !selectedFolders.has(f.id)))
      setSelectedFolders(new Set())
      ctx?.loadFolders()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete selected folders')
    } finally {
      setDeleteAlling(false)
    }
  }

  async function handleDeleteAllMeetings() {
    if (meetings.length === 0) return
    if (!window.confirm(`Permanently delete all ${meetings.length} meeting(s) in bin? This cannot be undone.`)) return
    setDeleteAlling(true)
    try {
      await Promise.all(meetings.map(m => api.deleteMeetingPermanent(m.meeting_id)))
      setMeetings([])
      setSelectedMeetings(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete all')
    } finally {
      setDeleteAlling(false)
    }
  }
  async function handleDeleteAllReports() {
    if (reports.length === 0) return
    if (!window.confirm(`Permanently delete all ${reports.length} report(s) in bin? This cannot be undone.`)) return
    setDeleteAlling(true)
    try {
      await Promise.all(reports.map(r => api.deleteReportPermanent(r._id)))
      setReports([])
      setSelectedReports(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete all')
    } finally {
      setDeleteAlling(false)
    }
  }
  async function handleDeleteAllDeltas() {
    if (deltas.length === 0) return
    if (!window.confirm(`Permanently delete all ${deltas.length} delta(s) in bin? This cannot be undone.`)) return
    setDeleteAlling(true)
    try {
      await Promise.all(deltas.map(d => api.deleteDeltaPermanent(d._id)))
      setDeltas([])
      setSelectedDeltas(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete all')
    } finally {
      setDeleteAlling(false)
    }
  }

  async function handleDeleteSelectedMeetings() {
    if (selectedMeetings.size === 0) return
    if (!window.confirm(`Permanently delete ${selectedMeetings.size} selected meeting(s)? This cannot be undone.`)) return
    setDeleteAlling(true)
    try {
      await Promise.all(Array.from(selectedMeetings).map(id => api.deleteMeetingPermanent(id)))
      setMeetings(prev => prev.filter(m => !selectedMeetings.has(m.meeting_id)))
      setSelectedMeetings(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete selected')
    } finally {
      setDeleteAlling(false)
    }
  }
  async function handleDeleteSelectedReports() {
    if (selectedReports.size === 0) return
    if (!window.confirm(`Permanently delete ${selectedReports.size} selected report(s)? This cannot be undone.`)) return
    setDeleteAlling(true)
    try {
      await Promise.all(Array.from(selectedReports).map(id => api.deleteReportPermanent(id)))
      setReports(prev => prev.filter(r => !selectedReports.has(r._id)))
      setSelectedReports(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete selected')
    } finally {
      setDeleteAlling(false)
    }
  }
  async function handleDeleteSelectedDeltas() {
    if (selectedDeltas.size === 0) return
    if (!window.confirm(`Permanently delete ${selectedDeltas.size} selected delta(s)? This cannot be undone.`)) return
    setDeleteAlling(true)
    try {
      await Promise.all(Array.from(selectedDeltas).map(id => api.deleteDeltaPermanent(id)))
      setDeltas(prev => prev.filter(d => !selectedDeltas.has(d._id)))
      setSelectedDeltas(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete selected')
    } finally {
      setDeleteAlling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-3">
        <div className="w-8 h-8 border-[3px] border-slate-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Loading bin...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          <Trash2 className="w-8 h-8 text-slate-500" />
          Bin
        </h1>
        <p className="text-[15px] text-slate-500 mt-1.5">
          Restore or permanently delete meetings, reports, and delta analyses.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 font-medium">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200 pb-2">
        {[
          { id: 'folders' as TabId, label: 'Folders', count: folders.length, icon: FolderIcon },
          { id: 'meetings' as TabId, label: 'Meetings', count: meetings.length, icon: Mic },
          { id: 'reports' as TabId, label: 'Reports', count: reports.length, icon: FileText },
          { id: 'deltas' as TabId, label: 'Delta', count: deltas.length, icon: GitCompare },
        ].map(({ id, label, count, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              tab === id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            <span className={`text-xs px-1.5 py-0.5 rounded ${tab === id ? 'bg-white/20' : 'bg-slate-200'}`}>{count}</span>
          </button>
        ))}
      </div>

      {/* Actions: Delete all + Delete selected */}
      {tab === 'folders' && folders.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            onClick={handleDeleteAllFolders}
            disabled={deleteAlling}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
          >
            Delete all ({folders.length})
          </button>
          {selectedFolders.size > 0 && (
            <button
              type="button"
              onClick={handleDeleteSelectedFolders}
              disabled={deleteAlling}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50"
            >
              Delete selected ({selectedFolders.size})
            </button>
          )}
        </div>
      )}
      {tab === 'meetings' && meetings.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            onClick={handleDeleteAllMeetings}
            disabled={deleteAlling}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
          >
            Delete all ({meetings.length})
          </button>
          {selectedMeetings.size > 0 && (
            <button
              type="button"
              onClick={handleDeleteSelectedMeetings}
              disabled={deleteAlling}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50"
            >
              Delete selected ({selectedMeetings.size})
            </button>
          )}
        </div>
      )}
      {tab === 'reports' && reports.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            onClick={handleDeleteAllReports}
            disabled={deleteAlling}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
          >
            Delete all ({reports.length})
          </button>
          {selectedReports.size > 0 && (
            <button
              type="button"
              onClick={handleDeleteSelectedReports}
              disabled={deleteAlling}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50"
            >
              Delete selected ({selectedReports.size})
            </button>
          )}
        </div>
      )}
      {tab === 'deltas' && deltas.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            onClick={handleDeleteAllDeltas}
            disabled={deleteAlling}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
          >
            Delete all ({deltas.length})
          </button>
          {selectedDeltas.size > 0 && (
            <button
              type="button"
              onClick={handleDeleteSelectedDeltas}
              disabled={deleteAlling}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50"
            >
              Delete selected ({selectedDeltas.size})
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {tab === 'folders' && (
        folders.length === 0 ? (
          <div className="text-center py-20 rounded-2xl bg-slate-50 border border-slate-200/80">
            <FolderIcon className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <p className="text-[16px] font-semibold text-slate-600">No folders in bin</p>
            <p className="text-[14px] text-slate-500 mt-1">Deleted folders appear here. Meetings in them stay linked until you restore or permanently delete the folder.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {folders.map(f => (
              <div
                key={f.id}
                className="flex items-center gap-4 p-4 rounded-xl bg-white border border-slate-200/80 hover:border-slate-300 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => toggleFolder(f.id)}
                  className="w-5.5 h-5.5 rounded border-2 border-slate-300 flex items-center justify-center flex-shrink-0 hover:border-slate-500"
                >
                  {selectedFolders.has(f.id) && <Check className="w-3.5 h-3.5 text-slate-700" strokeWidth={3} />}
                </button>
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <FolderIcon className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-slate-800 truncate">{f.name}</p>
                  <p className="text-[13px] text-slate-500 mt-0.5">Folder</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button type="button" onClick={() => handleRestoreFolder(f.id)} disabled={restoringId === f.id}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                    <RotateCcw className="w-4 h-4" />{restoringId === f.id ? 'Restoring...' : 'Recover'}
                  </button>
                  <button type="button" onClick={() => handlePermanentDeleteFolder(f.id)} disabled={deletingId === f.id}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50">
                    <Trash2 className="w-4 h-4" />{deletingId === f.id ? 'Deleting...' : 'Permanent delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'meetings' && (
        meetings.length === 0 ? (
          <div className="text-center py-20 rounded-2xl bg-slate-50 border border-slate-200/80">
            <Mic className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <p className="text-[16px] font-semibold text-slate-600">No meetings in bin</p>
          </div>
        ) : (
          <div className="space-y-2">
            {meetings.map(m => (
              <div
                key={m.meeting_id}
                className="flex items-center gap-4 p-4 rounded-xl bg-white border border-slate-200/80 hover:border-slate-300 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => toggleMeeting(m.meeting_id)}
                  className="w-5.5 h-5.5 rounded border-2 border-slate-300 flex items-center justify-center flex-shrink-0 hover:border-slate-500"
                >
                  {selectedMeetings.has(m.meeting_id) && <Check className="w-3.5 h-3.5 text-slate-700" strokeWidth={3} />}
                </button>
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Mic className="w-5 h-5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-slate-800 truncate">{m.title || 'Untitled Meeting'}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[13px] text-slate-500">
                    <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{formatDate(m.date_iso || m.date || '')}</span>
                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{m.duration_display || formatDuration(m.duration_seconds ?? m.duration ?? 0)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button type="button" onClick={() => handleRestoreMeeting(m.meeting_id)} disabled={restoringId === m.meeting_id}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                    <RotateCcw className="w-4 h-4" />{restoringId === m.meeting_id ? 'Restoring...' : 'Recover'}
                  </button>
                  <button type="button" onClick={() => handlePermanentDeleteMeeting(m.meeting_id)} disabled={deletingId === m.meeting_id}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50">
                    <Trash2 className="w-4 h-4" />{deletingId === m.meeting_id ? 'Deleting...' : 'Permanent delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'reports' && (
        reports.length === 0 ? (
          <div className="text-center py-20 rounded-2xl bg-slate-50 border border-slate-200/80">
            <FileText className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <p className="text-[16px] font-semibold text-slate-600">No reports in bin</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map(r => (
              <div
                key={r._id}
                className="flex items-center gap-4 p-4 rounded-xl bg-white border border-slate-200/80 hover:border-slate-300 transition-colors"
              >
                <button type="button" onClick={() => toggleReport(r._id)}
                  className="w-5.5 h-5.5 rounded border-2 border-slate-300 flex items-center justify-center flex-shrink-0 hover:border-slate-500">
                  {selectedReports.has(r._id) && <Check className="w-3.5 h-3.5 text-slate-700" strokeWidth={3} />}
                </button>
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-slate-800 truncate">{r.meeting_title || r.call_id}</p>
                  <div className="flex items-center gap-2 mt-1 text-[13px] text-slate-500">
                    <span className="font-medium">{r.call_type}</span>
                    <span>{r.pain_count} pains</span>
                    <span>{formatDate(r.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button type="button" onClick={() => handleRestoreReport(r._id)} disabled={restoringId === r._id}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                    <RotateCcw className="w-4 h-4" />{restoringId === r._id ? 'Restoring...' : 'Recover'}
                  </button>
                  <button type="button" onClick={() => handlePermanentDeleteReport(r._id)} disabled={deletingId === r._id}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50">
                    <Trash2 className="w-4 h-4" />{deletingId === r._id ? 'Deleting...' : 'Permanent delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'deltas' && (
        deltas.length === 0 ? (
          <div className="text-center py-20 rounded-2xl bg-slate-50 border border-slate-200/80">
            <GitCompare className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <p className="text-[16px] font-semibold text-slate-600">No delta analyses in bin</p>
          </div>
        ) : (
          <div className="space-y-2">
            {deltas.map(d => (
              <div
                key={d._id}
                className="flex items-center gap-4 p-4 rounded-xl bg-white border border-slate-200/80 hover:border-slate-300 transition-colors"
              >
                <button type="button" onClick={() => toggleDelta(d._id)}
                  className="w-5.5 h-5.5 rounded border-2 border-slate-300 flex items-center justify-center flex-shrink-0 hover:border-slate-500">
                  {selectedDeltas.has(d._id) && <Check className="w-3.5 h-3.5 text-slate-700" strokeWidth={3} />}
                </button>
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <GitCompare className="w-5 h-5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-slate-800 truncate">{d.source_call_types?.join(' + ') || 'Delta'}</p>
                  <div className="flex items-center gap-2 mt-1 text-[13px] text-slate-500">
                    <span>{formatDate(d.created_at)}</span>
                    <span className="text-emerald-500 font-semibold">{d.agreements_count}A</span>
                    <span className="text-red-400 font-semibold">{d.contradictions_count}C</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button type="button" onClick={() => handleRestoreDelta(d._id)} disabled={restoringId === d._id}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                    <RotateCcw className="w-4 h-4" />{restoringId === d._id ? 'Restoring...' : 'Recover'}
                  </button>
                  <button type="button" onClick={() => handlePermanentDeleteDelta(d._id)} disabled={deletingId === d._id}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50">
                    <Trash2 className="w-4 h-4" />{deletingId === d._id ? 'Deleting...' : 'Permanent delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

    </div>
  )
}
