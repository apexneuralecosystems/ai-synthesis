import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import {
  ArrowLeft, CheckCircle2, XCircle, Target, Quote,
  Sparkles, DollarSign, BarChart3, Eye, MessageCircle, ShieldAlert,
} from 'lucide-react'

function SeverityBar({ score, max = 10 }: { score: number; max?: number }) {
  const pct = Math.min((score / max) * 100, 100)
  const c = score >= 8 ? 'bg-red-500' : score >= 6 ? 'bg-orange-500' : score >= 4 ? 'bg-amber-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${c}`} style={{ width: `${pct}%` }} /></div>
      <span className="text-[13px] font-bold text-slate-700 tabular-nums">{score}</span>
    </div>
  )
}

export default function DeltaDetail() {
  const { id } = useParams<{ id: string }>()
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    api.delta(id).then(setDoc).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex flex-col items-center justify-center py-40 gap-3"><div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" /><p className="text-sm text-slate-400 font-medium">Loading...</p></div>
  if (error || !doc) return <div className="text-center py-20"><p className="text-red-500 text-base font-semibold">{error || 'Not found'}</p><Link to="/delta" className="text-blue-600 text-sm mt-3 inline-block hover:underline">&larr; Back</Link></div>

  const dr = (doc.delta_report || {}) as Record<string, unknown>
  const meta = (dr.meta || {}) as Record<string, unknown>
  const agreements = (dr.agreements || []) as Record<string, unknown>[]
  const contradictions = (dr.contradictions || []) as Record<string, unknown>[]
  const unique = (dr.unique_insights || []) as Record<string, unknown>[]
  const costRecon = (dr.cost_reconciliation || []) as Record<string, unknown>[]
  const updatedScores = (dr.updated_pain_validity_scores || []) as Record<string, unknown>[]
  const focus = (dr.recommended_focus || []) as Record<string, unknown>[]
  const overall = (dr.overall_assessment || {}) as Record<string, unknown>
  const usage = (doc.usage || {}) as Record<string, unknown>

  return (
    <div>
      <Link to="/delta" className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-500 hover:text-blue-600 mb-6 transition-colors"><ArrowLeft className="w-4 h-4" />All Delta Analyses</Link>

      {/* HEADER */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-7 mb-6 shadow-sm">
        <h1 className="text-[24px] font-extrabold text-slate-900 tracking-tight mb-3">Cross-Session Delta Report</h1>
        <div className="flex flex-wrap gap-4 text-[14px] text-slate-500 font-medium">
          {Array.isArray(meta.source_call_types) && <span>Lenses: <strong className="text-slate-700">{(meta.source_call_types as string[]).join(' + ')}</strong></span>}
          {Array.isArray(meta.source_calls) && <span>Calls: <strong className="text-slate-700 font-mono text-[13px]">{(meta.source_calls as string[]).join(', ')}</strong></span>}
        </div>
        {Array.isArray(meta.source_participants) && (
          <div className="flex flex-wrap gap-2 mt-3">{(meta.source_participants as string[]).map((p, i) => <span key={i} className="text-[12px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg font-medium">{p}</span>)}</div>
        )}
        {meta.analyst_note && <p className="text-[13px] text-slate-400 italic mt-3">{meta.analyst_note as string}</p>}
        {dr.executive_summary && <div className="mt-5 pt-5 border-t border-slate-100"><p className="text-[11px] text-blue-500 uppercase font-bold tracking-widest mb-2 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />Summary</p><p className="text-[15px] text-slate-700 leading-[1.75]">{dr.executive_summary as string}</p></div>}
      </div>

      {/* OVERALL ASSESSMENT */}
      {Object.keys(overall).length > 0 && (
        <div className="mb-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {[
              { key: 'signal_strength', label: 'Signal Strength', color: 'from-blue-50 to-indigo-50 border-blue-200/60' },
              { key: 'readiness_for_proposal', label: 'Readiness', color: 'from-blue-50 to-indigo-50 border-blue-200/60' },
              { key: 'composite_confidence_score', label: 'Confidence', color: 'from-blue-50 to-indigo-50 border-blue-200/60' },
              { key: 'deal_risk_level', label: 'Risk Level', color: 'from-blue-50 to-indigo-50 border-blue-200/60' },
            ].filter(m => overall[m.key] != null).map(m => (
              <div key={m.key} className={`bg-gradient-to-br ${m.color} border rounded-2xl p-5 text-center shadow-sm`}>
                <p className="text-[20px] font-extrabold text-blue-700 leading-none capitalize">{String(overall[m.key]).replace(/_/g, ' ')}</p>
                <p className="text-[10px] text-blue-500 uppercase font-bold tracking-widest mt-2">{m.label}</p>
              </div>
            ))}
          </div>
          {/* Rationales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {overall.signal_strength_rationale && <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm"><p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Signal Rationale</p><p className="text-[14px] text-slate-700 leading-relaxed">{overall.signal_strength_rationale as string}</p></div>}
            {overall.readiness_rationale && <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm"><p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Readiness Rationale</p><p className="text-[14px] text-slate-700 leading-relaxed">{overall.readiness_rationale as string}</p></div>}
          </div>
          {/* Critical gaps & next call focus */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {Array.isArray(overall.critical_gaps) && (overall.critical_gaps as string[]).length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-5 shadow-sm">
                <p className="text-[11px] text-red-600 uppercase font-bold tracking-widest flex items-center gap-1.5 mb-3"><ShieldAlert className="w-3.5 h-3.5" />Critical Gaps</p>
                <div className="space-y-2">{(overall.critical_gaps as string[]).map((g, i) => <div key={i} className="flex items-start gap-2"><span className="text-red-400 font-bold text-[14px]">&bull;</span><p className="text-[14px] text-red-800">{g}</p></div>)}</div>
              </div>
            )}
            {Array.isArray(overall.recommended_next_call_focus) && (overall.recommended_next_call_focus as string[]).length > 0 && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 shadow-sm">
                <p className="text-[11px] text-blue-600 uppercase font-bold tracking-widest flex items-center gap-1.5 mb-3"><MessageCircle className="w-3.5 h-3.5" />Next Call Focus</p>
                <div className="space-y-2">{(overall.recommended_next_call_focus as string[]).map((f, i) => <div key={i} className="flex items-start gap-2"><span className="text-blue-400 font-bold text-[14px]">&bull;</span><p className="text-[14px] text-blue-800">{f}</p></div>)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AGREEMENTS */}
      {agreements.length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm mb-6">
          <div className="px-7 py-4 border-b border-slate-100 flex items-center gap-2.5 text-emerald-700"><CheckCircle2 className="w-5 h-5" /><h2 className="text-[16px] font-bold">Agreements ({agreements.length})</h2></div>
          <div className="p-6 space-y-4">
            {agreements.map((a, i) => {
              const sevScores = (a.severity_scores || {}) as Record<string, number>
              const quotes = (a.matching_quotes || []) as Record<string, unknown>[]
              return (
                <div key={i} className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[16px] font-bold text-emerald-900">{a.pain_theme as string}</h3>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ${a.validation_status === 'validated' ? 'bg-emerald-200 text-emerald-800' : 'bg-emerald-100 text-emerald-700'}`}>{(a.validation_status as string || '').replace(/_/g, ' ')}</span>
                  </div>
                  {a.severity_alignment_note && <p className="text-[14px] text-emerald-800 mt-2 leading-relaxed">{a.severity_alignment_note as string}</p>}
                  {a.synthesis && <p className="text-[14px] text-emerald-700 mt-2 leading-relaxed">{a.synthesis as string}</p>}
                  {/* Severity scores */}
                  {Object.keys(sevScores).length > 0 && (
                    <div className="flex items-center gap-4 mt-3">{Object.entries(sevScores).map(([callId, score]) => (
                      <div key={callId} className="bg-white/60 rounded-lg px-3 py-1.5"><span className="text-[11px] text-emerald-600 font-mono">{callId}</span><span className="text-[14px] font-bold text-emerald-800 ml-2">{score}/10</span></div>
                    ))}</div>
                  )}
                  {/* Matching quotes */}
                  {quotes.length > 0 && (
                    <div className="mt-4 space-y-2">{quotes.map((q, qi) => (
                      <div key={qi} className="flex items-start gap-3 bg-white/50 rounded-xl p-3.5 border border-emerald-100">
                        <Quote className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-400" />
                        <div><p className="text-[11px] text-emerald-500 font-bold">{q.call_id as string} &mdash; {q.stakeholder as string}</p><p className="text-[13px] italic text-emerald-700 mt-1 leading-relaxed">&ldquo;{q.quote as string}&rdquo;</p></div>
                      </div>
                    ))}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* CONTRADICTIONS */}
      {contradictions.length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm mb-6">
          <div className="px-7 py-4 border-b border-slate-100 flex items-center gap-2.5 text-red-700"><XCircle className="w-5 h-5" /><h2 className="text-[16px] font-bold">Contradictions ({contradictions.length})</h2></div>
          <div className="p-6 space-y-4">
            {contradictions.map((c, i) => {
              const pa = (c.perspective_a || {}) as Record<string, unknown>
              const pb = (c.perspective_b || {}) as Record<string, unknown>
              return (
                <div key={i} className="bg-red-50 border border-red-100 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="text-[16px] font-bold text-red-900">{c.pain_theme as string}</h3>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-red-100 text-red-700 flex-shrink-0">{(c.contradiction_type as string || 'conflict').replace(/_/g, ' ')}</span>
                  </div>
                  {/* Two perspectives */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[{ label: 'Perspective A', p: pa }, { label: 'Perspective B', p: pb }].filter(x => Object.keys(x.p).length > 0).map(({ label, p }) => (
                      <div key={label} className="bg-white/60 rounded-xl p-4 border border-red-100">
                        <p className="text-[10px] text-red-500 uppercase font-bold tracking-widest mb-2">{label} &mdash; <span className="font-mono">{p.call_id as string}</span></p>
                        <p className="text-[14px] text-red-800 leading-relaxed">{p.position as string}</p>
                        {typeof p.severity === 'number' && <div className="mt-2 w-24"><SeverityBar score={p.severity as number} /></div>}
                        {p.supporting_quote && <div className="flex items-start gap-2 mt-2 bg-white/50 rounded-lg p-2.5"><Quote className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-red-400" /><p className="text-[12px] italic text-red-600">&ldquo;{p.supporting_quote as string}&rdquo;</p></div>}
                      </div>
                    ))}
                  </div>
                  {c.impact_of_contradiction && <p className="text-[14px] text-red-700 mt-3 leading-relaxed"><strong>Impact:</strong> {c.impact_of_contradiction as string}</p>}
                  {c.follow_up_required && <p className="text-[13px] text-red-600 mt-2 italic"><strong>Follow-up:</strong> {c.follow_up_required as string}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* UNIQUE INSIGHTS */}
      {unique.length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm mb-6">
          <div className="px-7 py-4 border-b border-slate-100 flex items-center gap-2.5 text-purple-700"><Eye className="w-5 h-5" /><h2 className="text-[16px] font-bold">Unique Insights ({unique.length})</h2></div>
          <div className="p-6 space-y-4">
            {unique.map((u, i) => (
              <div key={i} className="bg-purple-50 border border-purple-100 rounded-2xl p-5">
                <h3 className="text-[15px] font-bold text-purple-900">{u.pain_theme as string}</h3>
                <div className="flex items-center gap-3 mt-2 text-[12px] text-purple-600 font-medium">
                  <span>By: {u.mentioned_by as string}</span>
                  <span className="font-mono">{u.call_id as string}</span>
                  {typeof u.severity_claimed === 'number' && <span>Severity: {u.severity_claimed as number}/10</span>}
                </div>
                {u.supporting_quote && <div className="flex items-start gap-2 mt-3 bg-white/50 rounded-xl p-3.5 border border-purple-100"><Quote className="w-4 h-4 mt-0.5 flex-shrink-0 text-purple-400" /><p className="text-[13px] italic text-purple-700">&ldquo;{u.supporting_quote as string}&rdquo;</p></div>}
                <span className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-lg bg-purple-100 text-purple-700 mt-3">{(u.validation_status as string || '').replace(/_/g, ' ')}</span>
                {u.validation_path && <p className="text-[13px] text-purple-600 mt-2"><strong>Validation path:</strong> {u.validation_path as string}</p>}
                {u.risk_if_ignored && <p className="text-[13px] text-purple-600 mt-1"><strong>Risk if ignored:</strong> {u.risk_if_ignored as string}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* COST RECONCILIATION */}
      {costRecon.length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm mb-6">
          <div className="px-7 py-4 border-b border-slate-100 flex items-center gap-2.5 text-slate-800"><DollarSign className="w-5 h-5 text-blue-500" /><h2 className="text-[16px] font-bold">Cost Reconciliation ({costRecon.length})</h2></div>
          <div className="p-6 space-y-4">
            {costRecon.map((cr, i) => {
              const estimates = (cr.estimates || []) as Record<string, unknown>[]
              return (
                <div key={i} className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                  <h3 className="text-[15px] font-bold text-slate-900 mb-3">{cr.pain_theme as string}</h3>
                  <div className="space-y-2 mb-3">{estimates.map((e, ei) => (
                    <div key={ei} className="bg-white rounded-xl p-3.5 border border-slate-100 flex items-center justify-between">
                      <div><p className="text-[12px] text-slate-500 font-mono">{e.call_id as string}</p><p className="text-[11px] text-slate-400">{e.stakeholder as string}</p></div>
                      <div className="text-right"><p className="text-[15px] font-bold text-slate-800">{e.amount as string}</p><span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg ${e.confidence === 'high' ? 'bg-green-100 text-green-700' : e.confidence === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{e.confidence as string}</span></div>
                    </div>
                  ))}</div>
                  <div className="grid grid-cols-3 gap-3">
                    {cr.range && <div className="bg-white rounded-lg p-3 border border-slate-100"><p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Range</p><p className="text-[14px] font-bold text-slate-800 mt-1">{cr.range as string}</p></div>}
                    {cr.recommended_figure && <div className="bg-white rounded-lg p-3 border border-slate-100"><p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Recommended</p><p className="text-[14px] font-bold text-blue-700 mt-1">{cr.recommended_figure as string}</p></div>}
                    {cr.divergence_percentage && <div className="bg-white rounded-lg p-3 border border-slate-100"><p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Divergence</p><p className="text-[14px] font-bold text-slate-800 mt-1">{cr.divergence_percentage as string}</p></div>}
                  </div>
                  {cr.recommended_figure_rationale && <p className="text-[13px] text-slate-500 mt-3 italic">{cr.recommended_figure_rationale as string}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* UPDATED VALIDITY SCORES */}
      {updatedScores.length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm mb-6">
          <div className="px-7 py-4 border-b border-slate-100 flex items-center gap-2.5 text-slate-800"><BarChart3 className="w-5 h-5 text-blue-500" /><h2 className="text-[16px] font-bold">Updated Pain Validity Scores ({updatedScores.length})</h2></div>
          <div className="p-6 space-y-3">
            {updatedScores.map((s, i) => {
              const orig = (s.original_scores || {}) as Record<string, number>
              return (
                <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex items-center gap-6">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[15px] font-bold text-slate-900">{s.pain_theme as string}</h3>
                    <div className="flex items-center gap-3 mt-2">{Object.entries(orig).map(([callId, score]) => (
                      <span key={callId} className="text-[12px] bg-white px-2.5 py-1 rounded-lg border border-slate-100"><span className="text-slate-400 font-mono">{callId}:</span> <span className="font-bold text-slate-700">{score}</span></span>
                    ))}</div>
                    {s.rationale && <p className="text-[13px] text-slate-500 mt-2">{s.rationale as string}</p>}
                  </div>
                  <div className="flex-shrink-0 text-center">
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/60 rounded-xl px-5 py-3">
                      <p className="text-[24px] font-extrabold text-blue-700 leading-none">{String(s.updated_score)}</p>
                      <p className="text-[10px] text-blue-500 uppercase font-bold tracking-widest mt-1">Updated</p>
                    </div>
                    {s.score_change && <p className="text-[12px] font-bold text-emerald-600 mt-1">{s.score_change as string}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* RECOMMENDED FOCUS */}
      {focus.length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm mb-6">
          <div className="px-7 py-4 border-b border-slate-100 flex items-center gap-2.5 text-blue-700"><Target className="w-5 h-5" /><h2 className="text-[16px] font-bold">Recommended Focus ({focus.length})</h2></div>
          <div className="p-6 space-y-4">
            {focus.map((f, i) => (
              <div key={i} className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[20px] font-extrabold text-blue-700">#{f.rank as number || i + 1}</span>
                    <h3 className="text-[16px] font-bold text-blue-900">{f.pain_theme as string || f.area as string}</h3>
                  </div>
                  {f.composite_score != null && (
                    <div className="bg-blue-100 rounded-lg px-3 py-1.5 text-center">
                      <p className="text-[16px] font-extrabold text-blue-700">{typeof f.composite_score === 'number' ? (f.composite_score as number).toFixed(1) : String(f.composite_score)}</p>
                      <p className="text-[9px] text-blue-500 uppercase font-bold">Composite</p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {f.validated_severity != null && <div className="bg-white/60 rounded-lg p-3 text-center"><p className="text-[18px] font-bold text-slate-800">{String(f.validated_severity)}</p><p className="text-[9px] text-slate-400 uppercase font-bold">Severity</p></div>}
                  {f.cost_impact_score != null && <div className="bg-white/60 rounded-lg p-3 text-center"><p className="text-[18px] font-bold text-slate-800">{String(f.cost_impact_score)}</p><p className="text-[9px] text-slate-400 uppercase font-bold">Cost Impact</p></div>}
                  {f.agent_feasibility_score != null && <div className="bg-white/60 rounded-lg p-3 text-center"><p className="text-[18px] font-bold text-slate-800">{String(f.agent_feasibility_score)}</p><p className="text-[9px] text-slate-400 uppercase font-bold">Agent Feasibility</p></div>}
                </div>
                {f.composite_calculation && <p className="text-[12px] text-blue-600 font-mono bg-white/50 rounded-lg px-3 py-1.5 inline-block">{f.composite_calculation as string}</p>}
                {f.why_this_ranks_here && <p className="text-[14px] text-blue-800 mt-3 leading-relaxed">{f.why_this_ranks_here as string}</p>}
                {f.key_risk && <p className="text-[13px] text-blue-600 mt-2"><strong>Key risk:</strong> {f.key_risk as string}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* USAGE */}
      <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-6 text-[13px] text-slate-500 font-medium flex-wrap">
          <span>Model: <strong className="text-slate-700">{usage.model as string}</strong></span>
          <span>Tokens: <strong className="text-slate-700">{String(usage.input_tokens).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} in</strong> / <strong className="text-slate-700">{String(usage.output_tokens).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} out</strong></span>
          <span>Time: <strong className="text-slate-700">{usage.elapsed_seconds as number}s</strong></span>
        </div>
      </div>
    </div>
  )
}
