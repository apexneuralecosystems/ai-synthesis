import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { PainReportItem, DeltaItem } from '../lib/api'
import { useMeetings } from '../context/MeetingsContext'
import { GitCompare, Loader2, CheckCircle, AlertCircle, Trash2, Clock, Check, ArrowRight, FileText, FolderOpen } from 'lucide-react'

const TYPE_BADGE: Record<string, string> = {
  CEO: 'bg-blue-100 text-blue-700',
  Operations: 'bg-emerald-100 text-emerald-700',
  Tech: 'bg-purple-100 text-purple-700',
}

export default function DeltaAnalysis() {
  const navigate = useNavigate()
  const meetingsCtx = useMeetings()
  const [reports, setReports] = useState<PainReportItem[]>([])
  const [deltas, setDeltas] = useState<DeltaItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ delta_id: string; usage: Record<string, unknown> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [deletingDelta, setDeletingDelta] = useState<string | null>(null)

  const selectedFolderId = meetingsCtx?.selectedFolderId ?? null

  useEffect(() => {
    Promise.all([api.reports(selectedFolderId ?? undefined), api.deltas()])
      .then(([r, d]) => { setReports(r); setDeltas(d) })
      .finally(() => setLoading(false))
  }, [selectedFolderId])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleRun() {
    if (selected.size < 2) return
    setRunning(true)
    setError('')
    setResult(null)
    api.runDelta(Array.from(selected))
      .then(r => {
        setResult({ delta_id: r.delta_id, usage: r.usage })
        api.deltas().then(setDeltas)
      })
      .catch(e => setError(e.message))
      .finally(() => setRunning(false))
  }

  async function handleDeleteDelta(id: string) {
    if (!confirm('Delete this delta report?')) return
    setDeletingDelta(id)
    try {
      await api.deleteDelta(id)
      setDeltas(prev => prev.filter(d => d._id !== id))
    } finally {
      setDeletingDelta(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-3">
        <div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400 font-medium">Loading data...</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight">Delta Analysis</h1>
        <p className="text-[15px] text-slate-500 mt-1.5">Select a folder, then 2 or more Pain Report Cards to compare across sessions</p>
      </div>

      {/* Folder selector */}
      {meetingsCtx && (
        <div className="mb-6 flex items-center gap-3 flex-wrap">
          <FolderOpen className="w-5 h-5 text-slate-500" />
          <span className="text-[13px] font-semibold text-slate-600">Folder:</span>
          <select
            value={selectedFolderId ?? ''}
            onChange={e => meetingsCtx.setSelectedFolderId(e.target.value || null)}
            className="text-[14px] border border-slate-200 rounded-xl bg-white px-4 py-2.5 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
          >
            <option value="">All reports</option>
            {meetingsCtx.folders.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Report selection */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <p className="text-base font-bold text-slate-800">Select Reports to Compare</p>
              <span className={`text-[13px] font-bold px-3 py-1 rounded-lg ${
                selected.size >= 2 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {selected.size} selected
              </span>
            </div>

            {reports.length === 0 ? (
              <div className="text-center py-16">
                <FileText className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <p className="text-[15px] font-semibold text-slate-500">No reports available</p>
                <Link to="/synthesis" className="text-[14px] text-blue-600 hover:underline mt-2 inline-block font-medium">
                  Run synthesis first &rarr;
                </Link>
              </div>
            ) : (
              <div className="max-h-[460px] overflow-y-auto">
                {reports.map((r, i) => {
                  const isSelected = selected.has(r._id)
                  return (
                    <button
                      key={r._id}
                      onClick={() => toggle(r._id)}
                      className={`w-full text-left px-6 py-4 flex items-center gap-4 transition-all hover:bg-blue-50/30 ${
                        isSelected ? 'bg-blue-50/60' : ''
                      } ${i > 0 ? 'border-t border-slate-50' : ''}`}
                    >
                      {/* Checkbox */}
                      <div className={`w-5.5 h-5.5 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        isSelected ? 'bg-blue-600 border-blue-600 shadow-sm shadow-blue-200' : 'border-slate-300'
                      }`}>
                        {isSelected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                      </div>

                      {/* Report icon */}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-blue-100' : 'bg-slate-100'
                      }`}>
                        <FileText className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-[14px] font-semibold truncate ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                          {r.meeting_title || r.call_id}
                        </p>
                        <div className="flex items-center gap-2.5 mt-1">
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide ${TYPE_BADGE[r.call_type] || 'bg-slate-100'}`}>
                            {r.call_type}
                          </span>
                          <span className="text-[12px] text-slate-400 font-medium">{r.pain_count} pains</span>
                          <span className="text-[12px] text-slate-400 font-medium">{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Action row */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleRun}
              disabled={selected.size < 2 || running}
              className="px-7 py-3.5 bg-blue-600 text-white text-[15px] font-bold rounded-2xl hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-md shadow-blue-200 disabled:shadow-none flex items-center gap-2.5"
            >
              {running ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Running Delta Analysis...
                </>
              ) : (
                <>
                  <GitCompare className="w-5 h-5" />
                  Run Delta ({selected.size})
                </>
              )}
            </button>
            {selected.size === 1 && (
              <span className="text-[13px] text-amber-600 flex items-center gap-1.5 font-medium">
                <AlertCircle className="w-4 h-4" />
                Select at least 2 reports
              </span>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-[14px] text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Success result */}
          {result && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 flex items-center gap-5 animate-fade-in shadow-sm">
              <CheckCircle className="w-7 h-7 text-emerald-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-[16px] font-bold text-slate-900">Delta Analysis Complete</p>
                <p className="text-[13px] text-slate-400 mt-1 font-medium">
                  Tokens: {String(result.usage.input_tokens).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} in &middot; {String(result.usage.output_tokens).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} out
                </p>
              </div>
              <button
                onClick={() => navigate(`/delta/${result.delta_id}`)}
                className="px-5 py-2.5 bg-blue-50 text-blue-700 text-[14px] font-bold rounded-xl hover:bg-blue-100 transition-all flex items-center gap-2"
              >
                View Report
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Past delta analyses */}
        <div>
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm sticky top-8">
            <div className="px-6 py-4 border-b border-slate-100">
              <p className="text-base font-bold text-slate-800">Past Analyses</p>
            </div>
            {deltas.length === 0 ? (
              <div className="text-center py-12">
                <GitCompare className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-[14px] text-slate-400 font-medium">No analyses yet</p>
              </div>
            ) : (
              <div className="max-h-[500px] overflow-y-auto">
                {deltas.map((d, i) => (
                  <div key={d._id} className={`px-6 py-4 flex items-center gap-3 group hover:bg-slate-50 transition-colors ${
                    i > 0 ? 'border-t border-slate-50' : ''
                  }`}>
                    <Link to={`/delta/${d._id}`} className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-slate-700 truncate group-hover:text-blue-600 transition-colors">
                        {d.source_call_types?.join(' + ') || 'Delta Report'}
                      </p>
                      <div className="flex items-center gap-2.5 mt-1 text-[12px] text-slate-400 font-medium">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        <span className="text-emerald-500 font-semibold">{d.agreements_count}A</span>
                        <span className="text-red-400 font-semibold">{d.contradictions_count}C</span>
                        <span className="text-blue-400 font-semibold">{d.focus_count}F</span>
                      </div>
                    </Link>
                    <button
                      onClick={() => handleDeleteDelta(d._id)}
                      disabled={deletingDelta === d._id}
                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
