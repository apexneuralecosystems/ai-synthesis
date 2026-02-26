import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Loader2, CheckCircle, Mic, Play } from 'lucide-react'
import { api } from '../lib/api'
import type { MeetingDetail, SynthResult } from '../lib/api'

const CALL_TYPES = [
  { value: 'CEO', label: 'CEO', desc: 'Strategic pain, financial losses, growth blockers' },
  { value: 'Operations', label: 'Operations', desc: 'Manual processes, compliance rates, data quality' },
  { value: 'Tech', label: 'Tech', desc: 'System inventory, data availability, infrastructure' },
] as const

export default function MeetingSynthesize() {
  const { meetingId } = useParams<{ meetingId: string }>()
  const navigate = useNavigate()
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [callType, setCallType] = useState<string>('')
  const [interviewer, setInterviewer] = useState('Anshul Jain')
  const [synthesizing, setSynthesizing] = useState(false)
  const [result, setResult] = useState<SynthResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!meetingId) return
    api.meeting(meetingId)
      .then(setMeeting)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [meetingId])

  const handleSynthesize = async () => {
    if (!callType || !meetingId) return
    setSynthesizing(true)
    setError('')
    try {
      const res = await api.synthesize(meetingId, callType, interviewer)
      setResult(res)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Synthesis failed')
    } finally {
      setSynthesizing(false)
    }
  }

  if (loading) return <div className="text-center py-20 text-[var(--slate-400)]">Loading meeting...</div>
  if (!meeting) return <div className="text-center py-20 text-[var(--slate-500)]">{error || 'Meeting not found'}</div>

  const wordCount = (meeting.transcript_text || '').split(/\s+/).length
  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
      })
    } catch { return d }
  }

  return (
    <div className="max-w-3xl">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-[var(--slate-500)] hover:text-[var(--blue-600)] transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Meetings
      </Link>

      {/* Meeting info */}
      <div className="p-6 rounded-xl bg-white border border-[var(--slate-200)] mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[var(--blue-50)] flex items-center justify-center">
            <Mic className="w-6 h-6 text-[var(--blue-600)]" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-[var(--slate-900)]">{meeting.title || 'Untitled'}</h2>
            <p className="text-sm text-[var(--slate-500)] mt-1">
              {meeting.date && formatDate(meeting.date)}
              {meeting.duration > 0 && ` · ${meeting.duration} min`}
            </p>
            <p className="text-xs text-[var(--slate-400)] mt-1">
              Transcript: {wordCount.toLocaleString()} words
            </p>
          </div>
        </div>
      </div>

      {result ? (
        <div className="animate-fade-in">
          <div className="p-6 rounded-xl bg-[var(--blue-50)] border border-[var(--blue-200)] mb-6">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle className="w-5 h-5 text-[var(--blue-600)]" />
              <h3 className="font-semibold text-[var(--blue-800)]">Synthesis Complete</h3>
            </div>
            <p className="text-sm text-[var(--slate-600)]">
              Report: <span className="font-mono text-[var(--blue-700)]">report_{result.call_id}.json</span>
            </p>
            <p className="text-xs text-[var(--slate-500)] mt-1">
              {result.usage.model} · {result.usage.input_tokens} in / {result.usage.output_tokens} out · {result.usage.elapsed_seconds}s
            </p>
          </div>

          {result.quote_check.length > 0 && (
            <div className="p-4 rounded-xl bg-white border border-[var(--slate-200)] mb-6">
              <h4 className="text-xs font-semibold text-[var(--slate-500)] uppercase tracking-wider mb-2">Quote Spot Check</h4>
              {result.quote_check.map((q: { quote: string; found: boolean }, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1">
                  <span className={q.found ? 'text-green-600' : 'text-red-500'}>{q.found ? '✓' : '✗'}</span>
                  <span className="text-[var(--slate-600)] truncate">{q.quote}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => navigate(`/report/report_${result.call_id}.json`)}
              className="px-5 py-2.5 text-sm rounded-lg bg-[var(--blue-600)] text-white font-medium hover:bg-[var(--blue-700)] transition-colors"
            >
              View Report
            </button>
            <button
              onClick={() => { setResult(null); setCallType('') }}
              className="px-5 py-2.5 text-sm rounded-lg bg-white border border-[var(--slate-200)] text-[var(--slate-600)] font-medium hover:bg-[var(--slate-50)] transition-colors"
            >
              Run Another Type
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-5 py-2.5 text-sm rounded-lg bg-white border border-[var(--slate-200)] text-[var(--slate-600)] font-medium hover:bg-[var(--slate-50)] transition-colors"
            >
              Back to Meetings
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {error && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
          )}

          {/* Call Type Selection */}
          <div>
            <label className="block text-sm font-semibold text-[var(--slate-700)] mb-3">Select Call Type</label>
            <div className="grid grid-cols-3 gap-3">
              {CALL_TYPES.map(ct => (
                <button
                  key={ct.value}
                  onClick={() => setCallType(ct.value)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    callType === ct.value
                      ? 'border-[var(--blue-500)] bg-[var(--blue-50)]'
                      : 'border-[var(--slate-200)] bg-white hover:border-[var(--blue-200)]'
                  }`}
                >
                  <p className={`text-sm font-bold ${callType === ct.value ? 'text-[var(--blue-700)]' : 'text-[var(--slate-800)]'}`}>
                    {ct.label}
                  </p>
                  <p className="text-[11px] text-[var(--slate-500)] mt-1 leading-snug">{ct.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Interviewer */}
          <div>
            <label className="block text-sm font-semibold text-[var(--slate-700)] mb-1.5">Interviewer</label>
            <input
              value={interviewer}
              onChange={e => setInterviewer(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-[var(--slate-200)] bg-white text-sm text-[var(--slate-800)] focus:outline-none focus:ring-2 focus:ring-[var(--blue-500)] focus:border-transparent transition"
            />
          </div>

          {/* Run Button */}
          <button
            onClick={handleSynthesize}
            disabled={!callType || synthesizing}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--blue-600)] text-white font-semibold hover:bg-[var(--blue-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {synthesizing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing with GPT-4o...</>
            ) : (
              <><Play className="w-4 h-4" /> Run Synthesis</>
            )}
          </button>

          {synthesizing && (
            <p className="text-xs text-center text-[var(--slate-400)]">
              This takes 30–90 seconds depending on transcript length
            </p>
          )}

          {/* Transcript preview */}
          {meeting.transcript_text && (
            <div>
              <label className="block text-xs font-semibold text-[var(--slate-500)] uppercase tracking-wider mb-2">
                Transcript Preview
              </label>
              <div className="p-4 rounded-xl bg-white border border-[var(--slate-200)] max-h-48 overflow-y-auto">
                <pre className="text-xs text-[var(--slate-600)] whitespace-pre-wrap font-mono leading-relaxed">
                  {meeting.transcript_text.slice(0, 2000)}
                  {meeting.transcript_text.length > 2000 && '\n\n... (truncated)'}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
