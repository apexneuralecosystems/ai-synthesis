import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import {
  ArrowLeft, AlertTriangle, Users, Database, ShieldCheck, Quote, Download,
  Server, HelpCircle, Lightbulb, ListChecks, Clock, User,
  DollarSign, TrendingUp, BarChart3, CheckCircle2, XCircle, Sparkles,
} from 'lucide-react'

function SeverityBar({ score, max = 10 }: { score: number; max?: number }) {
  const pct = Math.min((score / max) * 100, 100)
  const color = score >= 8 ? 'bg-red-500' : score >= 6 ? 'bg-orange-500' : score >= 4 ? 'bg-amber-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[14px] font-bold text-slate-700 tabular-nums w-8 text-right">{score}/{max}</span>
    </div>
  )
}

const TYPE_BADGE: Record<string, string> = {
  CEO: 'bg-blue-100 text-blue-700',
  Operations: 'bg-emerald-100 text-emerald-700',
  Tech: 'bg-purple-100 text-purple-700',
}

function getSevClass(score: number): string {
  if (score >= 8) return 'border-red-300 bg-red-50'
  if (score >= 6) return 'border-orange-300 bg-orange-50'
  if (score >= 4) return 'border-amber-300 bg-amber-50'
  return 'border-green-300 bg-green-50'
}

function notEmpty(v: unknown): boolean {
  if (!v) return false
  if (typeof v === 'string') return v !== '' && v !== 'Not mentioned' && v !== 'Not mentioned in this call' && v !== 'Not identified'
  return true
}

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>()
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    api.report(id).then(setDoc).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-3">
        <div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400 font-medium">Loading report...</p>
      </div>
    )
  }

  if (error || !doc) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500 text-base font-semibold">{error || 'Not found'}</p>
        <Link to="/reports" className="text-blue-600 text-sm mt-3 inline-block hover:underline">
          &larr; Back
        </Link>
      </div>
    )
  }

  const card = (doc.report_card || {}) as Record<string, unknown>
  const meta = (card.meta || {}) as Record<string, unknown>
  const painPoints = (card.pain_points || []) as Record<string, unknown>[]
  const ds = (card.data_signals || card.data_signals_identified || {}) as Record<string, unknown>
  const sa = (card.stakeholder_assessment || {}) as Record<string, unknown>
  const keyNums = (card.key_numbers || {}) as Record<string, unknown>
  const openQ = (card.open_questions || []) as string[]
  const hyp = (card.hypothesis_updates || {}) as Record<string, unknown>
  const nextSteps = (card.recommended_next_steps || []) as string[]
  const quoteCheck = (doc.quote_check || []) as { quote: string; found: boolean }[]
  const callType = (doc.call_type || meta.call_type || '') as string
  const usage = (doc.usage || {}) as Record<string, unknown>

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/reports"
          className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-500 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          All Reports
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white text-[12px] font-semibold px-3.5 py-2 shadow-sm hover:bg-slate-800"
        >
          <Download className="w-4 h-4" />
          Download PDF
        </button>
      </div>

      {/* HEADER */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.22em] mb-2">
              Pain Report Card
            </p>
            <h1 className="text-[26px] font-extrabold text-slate-900 tracking-tight leading-tight">
              {String(doc.meeting_title ?? meta.call_id ?? '')}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-3 text-[13px]">
              <span className={`px-3 py-1 rounded-lg text-[12px] font-bold uppercase tracking-wide ${TYPE_BADGE[callType] || 'bg-slate-100'}`}>{callType}</span>
              <span className="text-[13px] text-slate-400 font-mono">{String(meta.call_id ?? '')}</span>
              {meta.date != null && <span className="text-[13px] text-slate-400 flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{String(meta.date)}</span>}
              {meta.duration_minutes != null && <span className="text-[13px] text-slate-400">{Number(meta.duration_minutes)}min</span>}
            </div>
            {Array.isArray(meta.participants) && (meta.participants as string[]).length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                {(meta.participants as string[]).map((p: string, i: number) => <span key={i} className="text-[12px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg font-medium">{p}</span>)}
              </div>
            )}
          </div>
          {card.pain_validity_score != null && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/60 rounded-2xl px-7 py-4 text-center flex-shrink-0">
              <p className="hero-metric text-[32px] font-extrabold text-blue-700 leading-none">
                {String(card.pain_validity_score)}
              </p>
              <p className="text-[10px] text-blue-500 uppercase font-bold tracking-widest mt-1.5">Pain Validity</p>
            </div>
          )}
        </div>
        {notEmpty(card.pain_validity_rationale) ? <p className="text-[13px] text-slate-400 mt-2 italic">{String(card.pain_validity_rationale)}</p> : null}
        {card.executive_summary != null && String(card.executive_summary) !== '' ? (
          <div className="mt-5 pt-5 border-t border-slate-100">
            <p className="text-[11px] text-blue-500 uppercase font-bold tracking-widest mb-2 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />Executive Summary</p>
            <p className="text-[15px] text-slate-700 leading-[1.75]">{String(card.executive_summary)}</p>
          </div>
        ) : null}
      </div>

      {/* PAIN POINTS */}
      <div className="mb-8">
        <h2 className="text-[18px] font-extrabold text-slate-900 flex items-center gap-2.5 mb-5">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          Pain Points
          <span className="text-[14px] font-semibold text-slate-400">({painPoints.length})</span>
        </h2>
        <div className="space-y-5">
          {painPoints.map((pp, i) => {
            const sev = typeof pp.severity === 'number' ? pp.severity : 5
            const cost = (pp.cost_estimate || {}) as Record<string, unknown>
            const aff = (pp.affected_stakeholders || []) as string[]
            const quotes = (pp.source_quotes || []) as string[]
            return (
              <div key={i} className={`border-2 rounded-3xl overflow-hidden ${getSevClass(sev)}`}>
                <div className="px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 mb-1">
                        <span className="text-[11px] font-semibold bg-white/70 text-slate-600 px-2 py-0.5 rounded-full">
                          {String(pp.id ?? `P${i + 1}`)}
                        </span>
                        <h3 className="text-[17px] font-extrabold text-slate-900">{String(pp.title ?? pp.pain_label ?? '')}</h3>
                      </div>
                      {notEmpty(pp.pain_category) && <p className="text-[13px] text-slate-500 font-medium">{String(pp.pain_category)}</p>}
                    </div>
                    <div className="flex-shrink-0 w-32">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Severity</p>
                      <SeverityBar score={sev} />
                    </div>
                  </div>
                  {pp.description != null && <p className="text-[15px] text-slate-700 leading-[1.7] mt-3">{String(pp.description)}</p>}
                  {notEmpty(pp.severity_rationale) && <p className="text-[13px] text-slate-500 italic mt-2">{String(pp.severity_rationale)}</p>}
                </div>

                <div className="bg-white/50 px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/80">
                  {notEmpty(cost.amount) && (
                    <div className="bg-white rounded-xl p-4 border border-slate-100">
                      <p className="text-[11px] text-slate-400 uppercase font-bold tracking-widest flex items-center gap-1.5 mb-2"><DollarSign className="w-3.5 h-3.5" />Cost Estimate</p>
                      <p className="text-[16px] font-bold text-slate-800">{String(cost.amount ?? '')}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg ${cost.confidence === 'high' ? 'bg-green-100 text-green-700' : cost.confidence === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{String(cost.confidence ?? '')}</span>
                        <span className="text-[11px] text-slate-400">{String(cost.method ?? '')}</span>
                      </div>
                      {notEmpty(cost.basis) && <p className="text-[12px] text-slate-500 mt-1.5">{String(cost.basis)}</p>}
                    </div>
                  )}
                  {notEmpty(pp.current_workaround) && (
                    <div className="bg-white rounded-xl p-4 border border-slate-100">
                      <p className="text-[11px] text-slate-400 uppercase font-bold tracking-widest mb-2">Current Workaround</p>
                      <p className="text-[14px] text-slate-700 leading-relaxed">{String(pp.current_workaround)}</p>
                    </div>
                  )}
                  {notEmpty(pp.agent_opportunity) && (
                    <div className="bg-blue-50/80 rounded-xl p-4 border border-blue-100 md:col-span-2">
                      <p className="text-[11px] text-blue-500 uppercase font-bold tracking-widest flex items-center gap-1.5 mb-2"><Lightbulb className="w-3.5 h-3.5" />Agent Opportunity</p>
                      <p className="text-[14px] text-blue-800 leading-relaxed font-medium">{String(pp.agent_opportunity)}</p>
                    </div>
                  )}
                  {aff.length > 0 && (
                    <div className="bg-white rounded-xl p-4 border border-slate-100">
                      <p className="text-[11px] text-slate-400 uppercase font-bold tracking-widest mb-2">Affected Stakeholders</p>
                      <div className="flex flex-wrap gap-1.5">{aff.map((s, si) => <span key={si} className="text-[12px] bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg font-medium">{s}</span>)}</div>
                    </div>
                  )}
                  {notEmpty(pp.business_impact) && (
                    <div className="bg-white rounded-xl p-4 border border-slate-100">
                      <p className="text-[11px] text-slate-400 uppercase font-bold tracking-widest flex items-center gap-1.5 mb-2"><TrendingUp className="w-3.5 h-3.5" />Business Impact</p>
                      <p className="text-[14px] text-slate-700 leading-relaxed">{String(pp.business_impact)}</p>
                    </div>
                  )}
                </div>

                {quotes.length > 0 && (
                  <div className="bg-white/40 px-6 py-4 border-t border-white/80">
                    <p className="text-[11px] text-slate-500 uppercase font-bold tracking-widest mb-3 flex items-center gap-1.5"><Quote className="w-3.5 h-3.5" />Source Quotes ({quotes.length})</p>
                    <div className="space-y-2">{quotes.map((q, qi) => (
                      <div key={qi} className="flex items-start gap-3 bg-white/70 rounded-xl p-4 border border-slate-100">
                        <Quote className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-400" />
                        <p className="text-[14px] italic text-slate-600 leading-relaxed">&ldquo;{q}&rdquo;</p>
                      </div>
                    ))}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* DATA SIGNALS */}
      {ds && Object.keys(ds).length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 mb-6 shadow-sm">
          <h2 className="text-[16px] font-bold text-slate-900 flex items-center gap-2.5 mb-5"><Database className="w-5 h-5 text-blue-500" />Data Signals</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.isArray(ds.systems_mentioned) && (ds.systems_mentioned as string[]).length > 0 && (
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-[11px] text-slate-400 uppercase font-bold tracking-widest flex items-center gap-1.5 mb-2"><Server className="w-3.5 h-3.5" />Systems Mentioned</p>
                {(ds.systems_mentioned as string[]).map((s: string, i: number) => <p key={i} className="text-[14px] text-slate-700 font-medium">{s}</p>)}
              </div>
            )}
            {Array.isArray(ds.data_sources_identified) && (ds.data_sources_identified as string[]).length > 0 && (
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-[11px] text-slate-400 uppercase font-bold tracking-widest mb-2">Data Sources</p>
                {(ds.data_sources_identified as string[]).map((s: string, i: number) => <p key={i} className="text-[14px] text-slate-700 font-medium">{s}</p>)}
              </div>
            )}
            {ds.access_feasibility != null && (
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-[11px] text-slate-400 uppercase font-bold tracking-widest mb-2">Access Feasibility</p>
                <span className={`text-[13px] font-bold px-3 py-1 rounded-lg ${ds.access_feasibility === 'easy' ? 'bg-green-100 text-green-700' : ds.access_feasibility === 'moderate' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{String(ds.access_feasibility)}</span>
                {notEmpty(ds.access_notes) && <p className="text-[13px] text-slate-600 mt-2">{String(ds.access_notes)}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STAKEHOLDER */}
      {sa && Object.keys(sa).length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 mb-6 shadow-sm">
          <h2 className="text-[16px] font-bold text-slate-900 flex items-center gap-2.5 mb-5"><Users className="w-5 h-5 text-blue-500" />Stakeholder Assessment</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {typeof sa.enthusiasm_level === 'number' && <div className="bg-slate-50 rounded-xl p-4"><p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-2">Enthusiasm</p><SeverityBar score={sa.enthusiasm_level} />{notEmpty(sa.enthusiasm_rationale) && <p className="text-[11px] text-slate-500 mt-2">{String(sa.enthusiasm_rationale)}</p>}</div>}
            {typeof sa.trust_level === 'number' && <div className="bg-slate-50 rounded-xl p-4"><p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-2">Trust</p><SeverityBar score={sa.trust_level} />{notEmpty(sa.trust_rationale) && <p className="text-[11px] text-slate-500 mt-2">{String(sa.trust_rationale)}</p>}</div>}
            {notEmpty(sa.decision_authority) && <div className="bg-slate-50 rounded-xl p-4"><p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-2">Decision Authority</p><p className="text-[14px] font-bold text-slate-700 capitalize">{String(sa.decision_authority)}</p></div>}
            {notEmpty(sa.champion_identified) && <div className="bg-slate-50 rounded-xl p-4"><p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-2">Champion</p><p className="text-[14px] font-bold text-slate-700">{String(sa.champion_identified)}</p></div>}
          </div>
          {notEmpty(sa.resistance_risks) && <div className="bg-amber-50 border border-amber-100 rounded-xl p-4"><p className="text-[11px] text-amber-600 uppercase font-bold tracking-widest mb-1.5">Resistance Risks</p><p className="text-[14px] text-amber-800">{String(sa.resistance_risks)}</p></div>}
        </div>
      )}

      {/* KEY NUMBERS */}
      {keyNums && Object.entries(keyNums).filter(([, v]) => notEmpty(v)).length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 mb-6 shadow-sm">
          <h2 className="text-[16px] font-bold text-slate-900 flex items-center gap-2.5 mb-4"><BarChart3 className="w-5 h-5 text-blue-500" />Key Numbers</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(keyNums).filter(([, v]) => notEmpty(v)).map(([k, v]) => <div key={k} className="bg-slate-50 rounded-xl p-4"><p className="text-[11px] text-slate-400 uppercase font-bold tracking-widest">{k.replace(/_/g, ' ')}</p><p className="text-[14px] text-slate-700 font-semibold mt-1">{String(v)}</p></div>)}
          </div>
        </div>
      )}

      {/* HYPOTHESIS */}
      {hyp && Object.keys(hyp).length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 mb-6 shadow-sm">
          <h2 className="text-[16px] font-bold text-slate-900 flex items-center gap-2.5 mb-5"><Lightbulb className="w-5 h-5 text-blue-500" />Hypothesis Updates</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.isArray(hyp.confirmed) && (hyp.confirmed as string[]).filter(h => notEmpty(h)).length > 0 && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                <p className="text-[11px] text-emerald-600 uppercase font-bold tracking-widest flex items-center gap-1.5 mb-3"><CheckCircle2 className="w-3.5 h-3.5" />Confirmed</p>
                {(hyp.confirmed as string[]).filter(h => notEmpty(h)).map((h, i) => <p key={i} className="text-[13px] text-emerald-800 leading-relaxed mb-1.5">{h}</p>)}
              </div>
            )}
            {Array.isArray(hyp.invalidated) && (hyp.invalidated as string[]).filter(h => notEmpty(h)).length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                <p className="text-[11px] text-red-600 uppercase font-bold tracking-widest flex items-center gap-1.5 mb-3"><XCircle className="w-3.5 h-3.5" />Invalidated</p>
                {(hyp.invalidated as string[]).filter(h => notEmpty(h)).map((h, i) => <p key={i} className="text-[13px] text-red-800 leading-relaxed mb-1.5">{h}</p>)}
              </div>
            )}
            {Array.isArray(hyp.new) && (hyp.new as string[]).filter(h => notEmpty(h)).length > 0 && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-[11px] text-blue-600 uppercase font-bold tracking-widest flex items-center gap-1.5 mb-3"><Sparkles className="w-3.5 h-3.5" />New</p>
                {(hyp.new as string[]).filter(h => notEmpty(h)).map((h, i) => <p key={i} className="text-[13px] text-blue-800 leading-relaxed mb-1.5">{h}</p>)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* OPEN QUESTIONS */}
      {openQ.length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 mb-6 shadow-sm">
          <h2 className="text-[16px] font-bold text-slate-900 flex items-center gap-2.5 mb-4"><HelpCircle className="w-5 h-5 text-amber-500" />Open Questions</h2>
          <div className="space-y-2">{openQ.map((q, i) => <div key={i} className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4"><span className="text-[12px] font-bold text-amber-600 bg-amber-100 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">{i + 1}</span><p className="text-[14px] text-amber-800 leading-relaxed">{q}</p></div>)}</div>
        </div>
      )}

      {/* NEXT STEPS */}
      {nextSteps.length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 mb-6 shadow-sm">
          <h2 className="text-[16px] font-bold text-slate-900 flex items-center gap-2.5 mb-4"><ListChecks className="w-5 h-5 text-blue-500" />Recommended Next Steps</h2>
          <div className="space-y-2">{nextSteps.map((s, i) => <div key={i} className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4"><span className="text-[12px] font-bold text-blue-600 bg-blue-100 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">{i + 1}</span><p className="text-[14px] text-blue-800 leading-relaxed">{s}</p></div>)}</div>
        </div>
      )}

      {/* QUOTE VERIFICATION */}
      {quoteCheck.length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 mb-6 shadow-sm">
          <h2 className="text-[16px] font-bold text-slate-900 flex items-center gap-2.5 mb-4"><ShieldCheck className="w-5 h-5 text-blue-500" />Quote Verification</h2>
          <div className="space-y-2">{quoteCheck.map((q, i) => <div key={i} className="flex items-start gap-3 py-1.5"><span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ${q.found ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{q.found ? 'FOUND' : 'MISS'}</span><span className="text-[13px] text-slate-600 leading-relaxed">{q.quote}</span></div>)}</div>
        </div>
      )}

      {/* USAGE */}
      <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-6 text-[13px] text-slate-500 font-medium flex-wrap">
          <span>Model: <strong className="text-slate-700">{String(usage.model ?? '')}</strong></span>
          <span>Tokens: <strong className="text-slate-700">{String(usage.input_tokens).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} in</strong> / <strong className="text-slate-700">{String(usage.output_tokens).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} out</strong></span>
          <span>Time: <strong className="text-slate-700">{Number(usage.elapsed_seconds)}s</strong></span>
        </div>
      </div>
    </div>
  )
}
