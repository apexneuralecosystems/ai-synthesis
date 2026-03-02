import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Meeting } from '../lib/api'
import { Trash2, RotateCcw, AlertCircle, Calendar, Clock, Mic } from 'lucide-react'

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
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function loadTrash() {
    setLoading(true)
    api.meetingsTrash()
      .then(setMeetings)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadTrash()
  }, [])

  async function handleRestore(meetingId: string) {
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

  async function handlePermanentDelete(meetingId: string) {
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
          Restore meetings back to the list or permanently delete them.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 font-medium">{error}</p>
        </div>
      )}

      {meetings.length === 0 ? (
        <div className="text-center py-20 rounded-2xl bg-slate-50 border border-slate-200/80">
          <Trash2 className="w-12 h-12 mx-auto text-slate-300 mb-4" />
          <p className="text-[16px] font-semibold text-slate-600">Bin is empty</p>
          <p className="text-[14px] text-slate-500 mt-1">Meetings you delete will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {meetings.map(m => (
            <div
              key={m.meeting_id}
              className="flex items-center gap-4 p-4 rounded-xl bg-white border border-slate-200/80 hover:border-slate-300 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                <Mic className="w-5 h-5 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-slate-800 truncate">
                  {m.title || 'Untitled Meeting'}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[13px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {formatDate(m.date_iso || m.date || '')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {m.duration_display || formatDuration(m.duration_seconds ?? m.duration ?? 0)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleRestore(m.meeting_id)}
                  disabled={restoringId === m.meeting_id}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  {restoringId === m.meeting_id ? 'Restoring...' : 'Recover'}
                </button>
                <button
                  type="button"
                  onClick={() => handlePermanentDelete(m.meeting_id)}
                  disabled={deletingId === m.meeting_id}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  {deletingId === m.meeting_id ? 'Deleting...' : 'Permanent delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
