import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { SynthResult } from '../lib/api'
import { FileSpreadsheet, Loader2, MessageCircle, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react'

export default function Survey() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [csvText, setCsvText] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SynthResult | null>(null)
  const [error, setError] = useState('')

  const canRun = (file != null && file.size > 0) || (csvText.trim().length > 0)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    setFile(f ?? null)
    if (!f) setResult(null)
  }

  function handleSynthesize() {
    if (!canRun) return
    setRunning(true)
    setError('')
    setResult(null)
    api
      .surveySynthesize(file ?? undefined, csvText.trim() || undefined)
      .then(setResult)
      .catch((e: Error) => setError(e.message))
      .finally(() => setRunning(false))
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          <MessageCircle className="w-8 h-8 text-emerald-600" />
          WhatsApp Survey Synthesis
        </h1>
        <p className="text-[15px] text-slate-500 mt-1.5">
          Upload CSV or Excel (or paste CSV) to generate one Pain Report Card from survey data. Use it in Delta Analysis alongside meeting reports.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mb-3">Upload file (CSV or Excel)</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-3 py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700 transition-all"
            >
              <FileSpreadsheet className="w-6 h-6" />
              <span className="text-[14px] font-medium">
                {file ? file.name : 'Choose CSV or Excel file'}
              </span>
            </button>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mb-3">Or paste CSV here</p>
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder="Paste survey export (e.g. question, respondent, answer)..."
              rows={8}
              className="w-full px-4 py-3 text-[14px] border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-all placeholder:text-slate-400 font-mono"
            />
          </div>

          <button
            onClick={handleSynthesize}
            disabled={!canRun || running}
            className="w-full py-3.5 bg-emerald-600 text-white text-[15px] font-bold rounded-2xl hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-md shadow-emerald-200 disabled:shadow-none flex items-center justify-center gap-2.5"
          >
            {running ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Synthesizing survey...
              </>
            ) : (
              <>
                <MessageCircle className="w-5 h-5" />
                Synthesize Survey
              </>
            )}
          </button>
        </div>

        {/* Result */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm sticky top-4">
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mb-4">Result</p>
            {error && (
              <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-[14px]">{error}</p>
              </div>
            )}
            {result && !error && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-[14px] font-semibold">
                    {result.status === 'already_exists' ? 'Report already existed' : 'Report created'}
                  </span>
                </div>
                <p className="text-[13px] text-slate-600">
                  {result.status === 'already_exists' && result.message ? result.message : null}
                  {result.status === 'ok' && 'Pain Report Card generated from survey data. Use it in Delta Analysis with meeting reports.'}
                </p>
                <Link
                  to={`/reports/${result.report_id}`}
                  className="inline-flex items-center gap-2 text-[14px] font-semibold text-emerald-600 hover:text-emerald-700"
                >
                  View report
                  <ArrowRight className="w-4 h-4" />
                </Link>
                {result.usage && (
                  <div className="pt-3 border-t border-slate-100 text-[12px] text-slate-400">
                    Tokens: in {result.usage.input_tokens}, out {result.usage.output_tokens}
                    {result.usage.elapsed_seconds != null && ` · ${result.usage.elapsed_seconds.toFixed(1)}s`}
                  </div>
                )}
              </div>
            )}
            {!result && !error && (
              <p className="text-[14px] text-slate-400">Upload or paste survey data and click Synthesize.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
