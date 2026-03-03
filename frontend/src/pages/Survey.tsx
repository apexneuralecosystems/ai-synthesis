import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { SynthResult } from '../lib/api'
import { FileSpreadsheet, Loader2, MessageCircle, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react'

export default function Survey() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewLines, setPreviewLines] = useState<string[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewNote, setPreviewNote] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const progressRef = useRef<number | null>(null)
  const [result, setResult] = useState<SynthResult | null>(null)
  const [error, setError] = useState('')

  const canRun = file != null && file.size > 0

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    setFile(f ?? null)
    setResult(null)
    setPreviewLines([])
    setPreviewNote(null)
    if (!f) {
      setPreviewOpen(false)
      return
    }
    api.surveyPreview(f)
      .then(text => {
        const lines = text.split('\n').slice(0, 80)
        const filtered = lines.filter(l => l.trim().length > 0)
        setPreviewLines(filtered)
        setPreviewNote(null)
        if (filtered.length > 0) {
          setPreviewOpen(true)
        }
      })
      .catch((err: Error) => {
        setPreviewLines([])
        setPreviewNote(err.message || 'Could not generate preview, but the file will still be processed when you click Synthesize.')
        setPreviewOpen(true)
      })
  }

  function handleSynthesize() {
    if (!canRun) return
    if (progressRef.current != null) {
      window.clearInterval(progressRef.current)
    }
    setProgress(0)
    setRunning(true)
    setError('')
    setResult(null)
    const id = window.setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev
        return prev + 2
      })
    }, 400)
    progressRef.current = id
    api
      .surveySynthesize(file ?? undefined, undefined)
      .then(setResult)
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        setRunning(false)
        if (progressRef.current != null) {
          window.clearInterval(progressRef.current)
          progressRef.current = null
        }
        setProgress(100)
        window.setTimeout(() => setProgress(0), 800)
      })
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          <MessageCircle className="w-8 h-8 text-emerald-600" />
          WhatsApp Survey Synthesis
        </h1>
        <p className="text-[15px] text-slate-500 mt-1.5">
          Upload WhatsApp survey CSV or Excel to generate one Pain Report Card from survey data. The file name is used as the report title.
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

          {progress > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>Survey synthesis progress</span>
                <span>{Math.min(progress, 100)}%</span>
              </div>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>
          )}
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
              <p className="text-[14px] text-slate-400">Upload your WhatsApp survey file and click Synthesize.</p>
            )}
          </div>
        </div>
      </div>

      {/* Full-screen preview modal */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[80vh] mx-4 overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <p className="text-[13px] font-semibold text-slate-500 uppercase tracking-widest">Survey preview</p>
                {file && (
                  <p className="text-[13px] text-slate-700 mt-0.5 font-mono truncate">
                    {file.name}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="text-[13px] font-medium text-slate-500 hover:text-slate-800"
              >
                Cancel
              </button>
            </div>
            <div className="px-6 py-4 flex-1 overflow-auto">
              {previewNote && (
                <p className="text-[13px] text-slate-500 mb-3">
                  {previewNote}
                </p>
              )}
              {previewLines.length > 0 && (
                <div className="border border-slate-200 rounded-xl bg-slate-50 max-h-[64vh] overflow-auto">
                  <pre className="px-4 py-3 text-[12px] text-slate-800 font-mono whitespace-pre-wrap">
                    {previewLines.join('\n')}
                  </pre>
                </div>
              )}
              {!previewNote && previewLines.length === 0 && (
                <p className="text-[13px] text-slate-400">
                  No preview available for this file.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
