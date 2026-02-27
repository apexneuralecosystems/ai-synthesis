import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Meeting, MeetingImportPayload } from '../lib/api'
import { Search, Calendar, Clock, Users, ChevronRight, Inbox, Mic, Upload } from 'lucide-react'

function formatDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(d: string) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(secs: number) {
  if (!secs) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export default function Meetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    api.meetings()
      .then(setMeetings)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = meetings.filter(m =>
    m.title?.toLowerCase().includes(search.toLowerCase()) ||
    m.host_email?.toLowerCase().includes(search.toLowerCase())
  )

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
          onClick={() => { setError(null); setLoading(true); api.meetings().then(setMeetings).catch((e: Error) => setError(e.message)).finally(() => setLoading(false)) }}
          className="mt-2 px-4 py-2 rounded-lg bg-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-300"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8 flex items-center justify-between gap-4">
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
            className="inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] text-white text-[13px] font-medium px-4 py-2 shadow-sm hover:bg-[var(--color-primary-dark)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Import JSON Meeting'}
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
          className="w-full pl-11 pr-5 py-3 text-[15px] border border-slate-200 rounded-2xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all placeholder:text-slate-400"
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
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
            <Link
              key={m.meeting_id}
              to={`/meeting/${m.meeting_id}`}
              className="flex items-center bg-white border border-slate-200/80 rounded-2xl px-5 py-4 hover:border-blue-300 hover:shadow-md hover:shadow-blue-50 transition-all duration-150 group"
            >
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
                <div className="flex items-center gap-4 mt-1.5 text-[13px] text-slate-400 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(m.date)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {formatTime(m.date)} &middot; {formatDuration(m.duration)}
                  </span>
                  {m.participants?.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      {m.participants.length} participants
                    </span>
                  )}
                </div>
              </div>

              {/* Right badges */}
              <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                {m.source && (
                  <span className="bg-slate-100 text-slate-500 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide">
                    {m.source}
                  </span>
                )}
                {m.has_transcript && (
                  <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg tracking-wide">
                    TRANSCRIPT
                  </span>
                )}
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
