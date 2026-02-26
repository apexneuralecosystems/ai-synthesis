import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { PainReportItem } from '../lib/api'
import { FileText, Trash2, Clock, Hash, ChevronRight, FlaskConical, ShieldAlert } from 'lucide-react'

const TYPE_COLORS: Record<string, string> = {
  CEO: 'bg-blue-100 text-blue-700',
  Operations: 'bg-emerald-100 text-emerald-700',
  Tech: 'bg-purple-100 text-purple-700',
}

export default function Reports() {
  const [reports, setReports] = useState<PainReportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    api.reports().then(setReports).finally(() => setLoading(false))
  }, [])

  async function handleDelete(id: string) {
    if (!confirm('Delete this report permanently?')) return
    setDeleting(id)
    try {
      await api.deleteReport(id)
      setReports(prev => prev.filter(r => r._id !== id))
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-3">
        <div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400 font-medium">Loading reports...</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight">Pain Reports</h1>
          <p className="text-[15px] text-slate-500 mt-1.5">All generated Pain Report Cards from your analyses</p>
        </div>
        {reports.length > 0 && (
          <span className="text-[13px] text-slate-400 font-medium">{reports.length} report{reports.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-20 bg-white border border-slate-200/80 rounded-2xl shadow-sm">
          <FileText className="w-12 h-12 mx-auto text-slate-300 mb-4" />
          <p className="text-[16px] font-bold text-slate-600">No reports generated yet</p>
          <p className="text-[14px] text-slate-400 mt-1 mb-4">Run synthesis on a meeting to create your first report</p>
          <Link
            to="/synthesis"
            className="inline-flex items-center gap-2 text-[14px] text-blue-600 font-semibold hover:text-blue-700 transition-colors"
          >
            <FlaskConical className="w-4 h-4" />
            Go to Synthesis
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <div
              key={r._id}
              className="flex items-center bg-white border border-slate-200/80 rounded-2xl px-5 py-4 hover:border-blue-200 hover:shadow-md hover:shadow-blue-50 transition-all duration-150 group"
            >
              <Link to={`/reports/${r._id}`} className="flex-1 min-w-0 flex items-center gap-4">
                {/* Icon */}
                <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-blue-500" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-slate-800 truncate group-hover:text-blue-700 transition-colors">
                    {r.meeting_title || r.call_id}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[13px] text-slate-400 font-medium">
                    <span className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold uppercase tracking-wide ${TYPE_COLORS[r.call_type] || 'bg-slate-100 text-slate-600'}`}>
                      {r.call_type}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5" />
                      {r.pain_count} pain{r.pain_count !== 1 ? 's' : ''}
                    </span>
                    {r.validity_score != null && (
                      <span className="flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Score: <strong className="text-slate-600">{r.validity_score}</strong>
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  {r.summary && (
                    <p className="text-[13px] text-slate-400 mt-1.5 truncate leading-relaxed">{r.summary}</p>
                  )}
                </div>

                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors ml-3 flex-shrink-0" />
              </Link>

              <button
                onClick={() => handleDelete(r._id)}
                disabled={deleting === r._id}
                className="ml-2 p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
