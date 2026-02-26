import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Meeting } from '../lib/api'
import { Search, FlaskConical, Loader2, CheckCircle, AlertCircle, Mic, Calendar, ArrowRight } from 'lucide-react'

const CALL_TYPES = ['CEO', 'Operations', 'Tech'] as const
const CALL_DESCRIPTIONS: Record<string, string> = {
  CEO: 'Strategic pain, market fit, ROI',
  Operations: 'Workflow, process, efficiency',
  Tech: 'Stack, integration, scalability',
}

export default function Synthesis() {
  const navigate = useNavigate()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Meeting | null>(null)
  const [callType, setCallType] = useState<string>('CEO')
  const [interviewer, setInterviewer] = useState('Anshul Jain')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ status: string; report_id: string; call_id: string; usage: Record<string, unknown>; quote_check: { quote: string; found: boolean }[] } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.meetings().then(setMeetings).finally(() => setLoading(false))
  }, [])

  const filtered = meetings
    .filter(m => m.has_transcript)
    .filter(m => m.title?.toLowerCase().includes(search.toLowerCase()))

  function handleSynthesize() {
    if (!selected) return
    setRunning(true)
    setError('')
    setResult(null)
    api.synthesize(selected.meeting_id, callType, interviewer)
      .then(r => setResult(r))
      .catch(e => setError(e.message))
      .finally(() => setRunning(false))
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-3">
        <div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400 font-medium">Loading meetings...</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight">Synthesis Engine</h1>
        <p className="text-[15px] text-slate-500 mt-1.5">Select a meeting and generate a Pain Report Card using GPT-4o</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left panel: Meeting selection */}
        <div className="lg:col-span-3 bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm flex flex-col">
          <div className="px-6 py-5 border-b border-slate-100">
            <p className="text-base font-bold text-slate-800 mb-3">Select Meeting</p>
            <div className="relative">
              <Search className="w-[18px] h-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search meetings by name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 text-[14px] border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="flex-1 max-h-[420px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <Mic className="w-8 h-8 mx-auto text-slate-300 mb-3" />
                <p className="text-[15px] font-semibold text-slate-500">No meetings with transcripts</p>
                <p className="text-[13px] text-slate-400 mt-1">Record a meeting first</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filtered.map(m => {
                  const isActive = selected?.meeting_id === m.meeting_id
                  return (
                    <button
                      key={m.meeting_id}
                      onClick={() => setSelected(m)}
                      className={`w-full text-left px-6 py-4 flex items-center gap-4 hover:bg-blue-50/40 transition-all ${
                        isActive ? 'bg-blue-50 border-l-[3px] border-blue-500' : 'border-l-[3px] border-transparent'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isActive ? 'bg-blue-100' : 'bg-slate-100'
                      }`}>
                        <Mic className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[14px] font-semibold truncate ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>
                          {m.title}
                        </p>
                        <p className="text-[12px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <Calendar className="w-3 h-3" />
                          {new Date(m.date).toLocaleDateString()} &middot; {Math.floor(m.duration / 60)}m
                        </p>
                      </div>
                      {isActive && (
                        <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right panel: Config & Run */}
        <div className="lg:col-span-2 space-y-5">
          {/* Selected meeting display */}
          {selected ? (
            <div className="bg-blue-50 border border-blue-200/60 rounded-2xl p-5">
              <p className="text-[11px] text-blue-500 font-bold uppercase tracking-widest">Selected Meeting</p>
              <p className="text-[15px] font-bold text-slate-900 mt-1.5 leading-tight">{selected.title}</p>
              <p className="text-[13px] text-slate-500 mt-1">{new Date(selected.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          ) : (
            <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-5 text-center">
              <p className="text-[14px] text-slate-400 font-medium">Select a meeting from the list</p>
            </div>
          )}

          {/* Call Type selector */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
            <label className="text-[11px] text-slate-400 font-bold uppercase tracking-widest block mb-3">
              Analysis Lens
            </label>
            <div className="space-y-2">
              {CALL_TYPES.map(ct => (
                <button
                  key={ct}
                  onClick={() => setCallType(ct)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-[14px] transition-all flex items-center justify-between ${
                    callType === ct
                      ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-200'
                      : 'bg-slate-50 text-slate-600 font-medium hover:bg-slate-100'
                  }`}
                >
                  <div>
                    <span className="block">{ct}</span>
                    <span className={`block text-[11px] mt-0.5 ${callType === ct ? 'text-blue-200' : 'text-slate-400'}`}>
                      {CALL_DESCRIPTIONS[ct]}
                    </span>
                  </div>
                  {callType === ct && <div className="w-2 h-2 rounded-full bg-white flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Interviewer */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
            <label className="text-[11px] text-slate-400 font-bold uppercase tracking-widest block mb-2.5">
              Interviewer
            </label>
            <input
              type="text"
              value={interviewer}
              onChange={e => setInterviewer(e.target.value)}
              className="w-full px-4 py-2.5 text-[14px] border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all"
            />
          </div>

          {/* Run button */}
          <button
            onClick={handleSynthesize}
            disabled={!selected || running}
            className="w-full py-3.5 bg-blue-600 text-white text-[15px] font-bold rounded-2xl hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-md shadow-blue-200 disabled:shadow-none flex items-center justify-center gap-2.5"
          >
            {running ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Analyzing with GPT-4o...
              </>
            ) : (
              <>
                <FlaskConical className="w-5 h-5" />
                Run Synthesis
              </>
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-[14px] text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-5 animate-fade-in shadow-sm">
              <div className="flex items-center gap-2.5">
                <CheckCircle className="w-6 h-6 text-emerald-500" />
                <p className="text-[16px] font-bold text-slate-900">Synthesis Complete</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Report ID', value: result.call_id },
                  { label: 'Model', value: String((result.usage as Record<string, unknown>).model) },
                  { label: 'Tokens In', value: String((result.usage as Record<string, unknown>).input_tokens).replace(/\B(?=(\d{3})+(?!\d))/g, ',') },
                  { label: 'Tokens Out', value: String((result.usage as Record<string, unknown>).output_tokens).replace(/\B(?=(\d{3})+(?!\d))/g, ',') },
                ].map(item => (
                  <div key={item.label} className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">{item.label}</p>
                    <p className="text-[13px] text-slate-700 font-semibold mt-1 font-mono">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Quote check */}
              {result.quote_check?.length > 0 && (
                <div>
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mb-2.5">Quote Verification</p>
                  <div className="space-y-2">
                    {result.quote_check.map((q, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded mt-0.5 ${q.found ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {q.found ? 'FOUND' : 'MISS'}
                        </span>
                        <span className="text-[13px] text-slate-600 leading-relaxed">{q.quote}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => navigate(`/reports/${result.report_id}`)}
                className="w-full py-3 bg-blue-50 text-blue-700 text-[14px] font-bold rounded-xl hover:bg-blue-100 transition-all flex items-center justify-center gap-2"
              >
                View Full Report
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
