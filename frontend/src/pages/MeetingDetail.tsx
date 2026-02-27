import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { MeetingDetail as MD, TranscriptSentence, ChatMessage } from '../lib/api'
import {
  ArrowLeft,
  Calendar,
  Clock,
  Globe,
  Users,
  Mail,
  MessageSquare,
  ChevronUp,
  Sparkles,
  ChevronDown,
  Bot,
  Send,
} from 'lucide-react'

const SPEAKER_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700', ring: 'ring-blue-200', dot: 'bg-blue-400' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700', ring: 'ring-emerald-200', dot: 'bg-emerald-400' },
  { bg: 'bg-purple-100', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700', ring: 'ring-purple-200', dot: 'bg-purple-400' },
  { bg: 'bg-amber-100', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', ring: 'ring-amber-200', dot: 'bg-amber-400' },
  { bg: 'bg-pink-100', text: 'text-pink-700', badge: 'bg-pink-100 text-pink-700', ring: 'ring-pink-200', dot: 'bg-pink-400' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700', badge: 'bg-cyan-100 text-cyan-700', ring: 'ring-cyan-200', dot: 'bg-cyan-400' },
]

function getSpeakerColor(speaker: string, map: Map<string, number>) {
  if (!map.has(speaker)) map.set(speaker, map.size)
  return SPEAKER_COLORS[map.get(speaker)! % SPEAKER_COLORS.length]
}

function formatTimestamp(ts: string) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatFullDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatDuration(secs: number) {
  if (!secs) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>()
  const [meeting, setMeeting] = useState<MD | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [transcriptExpanded, setTranscriptExpanded] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [clearingTranscript, setClearingTranscript] = useState(false)

  useEffect(() => {
    if (!id) return
    api.meeting(id).then(setMeeting).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [id])

  function handleScroll() {
    if (transcriptExpanded) return
    if (scrollRef.current) setShowScrollTop(scrollRef.current.scrollTop > 400)
  }

  async function handleClearTranscript() {
    if (!id || !meeting || clearingTranscript) return
    // Simple confirm to avoid accidental wipes
    const ok = window.confirm('Delete this meeting transcript? The meeting stays, but transcript and AI insights will be cleared.')
    if (!ok) return
    setClearingTranscript(true)
    try {
      const updated = await api.clearTranscript(id)
      setMeeting(updated)
      setChatMessages([])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to delete transcript'
      alert(msg)
    } finally {
      setClearingTranscript(false)
    }
  }

  async function handleSendChat() {
    if (!id || !chatInput.trim() || !meeting) return
    const nextMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: chatInput.trim() }]
    setChatMessages(nextMessages)
    setChatInput('')
    setChatLoading(true)
    try {
      const res = await api.meetingChat(id, nextMessages)
      setChatMessages(prev => [...prev, { role: 'assistant', content: res.reply }])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Chat failed'
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Sorry, I could not answer that: ${msg}` }])
    } finally {
      setChatLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-3">
        <div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400 font-medium">Loading meeting...</p>
      </div>
    )
  }

  if (error || !meeting) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500 text-base font-semibold">{error || 'Meeting not found'}</p>
        <Link to="/" className="text-blue-600 text-sm font-medium mt-3 inline-block hover:underline">
          &larr; Back to Meetings
        </Link>
      </div>
    )
  }

  const sentences = meeting.transcript_sentences || []
  const speakerMap = new Map<string, number>()
  const speakers = [...new Set(sentences.map(s => s.speaker))]

  return (
    <div>
      {/* Back button */}
      <Link to="/" className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-500 hover:text-blue-600 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        All Meetings
      </Link>

      {/* Meeting Header */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-7 mb-6 shadow-sm">
        <h1 className="text-[22px] font-extrabold text-slate-900 tracking-tight leading-tight">
          {meeting.title || 'Untitled Meeting'}
        </h1>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-[13px] text-slate-500 font-medium">
          <span className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            {formatFullDate(meeting.date)}
          </span>
          <span className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" />
            {formatDuration(meeting.duration)}
          </span>
          {meeting.host_email && (
            <span className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-500" />
              {meeting.host_email}
            </span>
          )}
          {meeting.language && (
            <span className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-500" />
              {meeting.language.toUpperCase()}
            </span>
          )}
          {meeting.source && (
            <span className="bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide">
              {meeting.source}
            </span>
          )}
        </div>

        {/* Speakers */}
        {speakers.length > 0 && (
          <div className="mt-5 pt-5 border-t border-slate-100">
            <p className="text-[11px] text-slate-400 uppercase tracking-widest font-bold mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Speakers ({speakers.length})
            </p>
            <div className="flex flex-wrap gap-2.5">
              {speakers.map(s => {
                const clr = getSpeakerColor(s, speakerMap)
                const count = sentences.filter(x => x.speaker === s).length
                return (
                  <span key={s} className={`inline-flex items-center gap-2 text-[13px] font-semibold px-3 py-1.5 rounded-full ${clr.badge}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${clr.bg} ${clr.text}`}>
                      {getInitials(s)}
                    </span>
                    {s}
                    <span className="opacity-50 font-normal">({count})</span>
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* AI Summary */}
      {meeting.ai_analysis && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/60 rounded-2xl p-6 mb-6 shadow-sm">
          <p className="text-[11px] font-bold text-blue-600 uppercase tracking-widest mb-2.5 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            AI Summary
          </p>
          <p className="text-[15px] text-slate-700 leading-relaxed">{meeting.ai_analysis}</p>
        </div>
      )}

      {/* Transcript */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
        {/* Sticky header */}
        <div className="px-7 py-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2.5">
              <MessageSquare className="w-5 h-5 text-blue-500" />
              Transcript
            </h2>
            <span className="text-[13px] text-slate-400 font-medium">
              {sentences.length > 0 ? `${sentences.length} segments` : meeting.transcript ? 'Raw transcript' : 'No transcript'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTranscriptExpanded(v => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-[12px] font-medium text-slate-500 hover:border-blue-300 hover:text-blue-600 bg-white transition-colors"
            >
              {transcriptExpanded ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  Expand
                </>
              )}
            </button>
            {(sentences.length > 0 || meeting.transcript) && (
              <button
                type="button"
                onClick={handleClearTranscript}
                disabled={clearingTranscript}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-red-200 text-[12px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                Delete transcript
              </button>
            )}
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={
            transcriptExpanded
              ? 'max-h-none overflow-visible'
              : 'max-h-[calc(100vh-420px)] overflow-y-auto scroll-smooth'
          }
        >
          {sentences.length === 0 ? (
            <div className="p-7">
              {meeting.transcript ? (
                <pre className="text-[15px] text-slate-600 whitespace-pre-wrap leading-relaxed font-sans">{meeting.transcript}</pre>
              ) : (
                <p className="text-base text-slate-400 text-center py-12 font-medium">No transcript available</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-50/80">
              {sentences.map((s: TranscriptSentence, i: number) => {
                const clr = getSpeakerColor(s.speaker, speakerMap)
                const prevSpeaker = i > 0 ? sentences[i - 1].speaker : null
                const isNewSpeaker = s.speaker !== prevSpeaker

                return (
                  <div
                    key={i}
                    className={`flex gap-4 px-7 py-3 hover:bg-blue-50/30 transition-colors ${isNewSpeaker ? 'pt-5' : ''}`}
                  >
                    {/* Timestamp */}
                    <div className="w-[76px] flex-shrink-0 text-right pt-0.5">
                      <span className="text-[12px] text-slate-400 font-mono tabular-nums tracking-tight">
                        {formatTimestamp(s.timestamp)}
                      </span>
                    </div>

                    {/* Speaker avatar / continuation line */}
                    <div className="w-9 flex-shrink-0 flex justify-center">
                      {isNewSpeaker ? (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold ring-2 shadow-sm ${clr.bg} ${clr.text} ${clr.ring}`}>
                          {getInitials(s.speaker)}
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <div className={`w-[3px] h-full rounded-full ${clr.dot} opacity-20`} />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pb-0.5">
                      {isNewSpeaker && (
                        <p className={`text-[13px] font-bold mb-1 ${clr.text}`}>{s.speaker}</p>
                      )}
                      <p className="text-[15px] text-slate-700 leading-[1.7]">{s.text}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Scroll to top button */}
        {!transcriptExpanded && showScrollTop && (
          <button
            onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-6 right-6 z-20 w-10 h-10 bg-blue-600 text-white rounded-full shadow-lg shadow-blue-200 hover:bg-blue-700 flex items-center justify-center transition-all"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Chat with this meeting */}
      <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-3">
        {chatOpen && (
          <div className="w-[420px] max-w-[90vw] bg-white border border-slate-200/80 rounded-2xl shadow-xl card-elevated">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-slate-400 uppercase tracking-[0.18em] font-semibold flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-[var(--accent)]" />
                  AI Assistant
                </p>
                <p className="text-[13px] text-slate-600 font-medium truncate">
                  {meeting.title || meeting.meeting_id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-medium"
              >
                Close
              </button>
            </div>
            <div className="px-4 py-3 max-h-[360px] overflow-y-auto space-y-2 text-[13px] text-slate-700">
              {chatMessages.length === 0 && (
                <p className="text-slate-400 text-[13px]">
                  Ask questions about this meeting. The assistant will only use this transcript as context.
                </p>
              )}
              {chatMessages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`px-3 py-2 rounded-2xl max-w-[80%] leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-slate-50 text-slate-700 border border-slate-200'
                    }`}
                  >
                    <p className="text-[11px] font-semibold mb-0.5 opacity-80">
                      {m.role === 'user' ? 'You' : 'Assistant'}
                    </p>
                    <p>{m.content}</p>
                  </div>
                </div>
              ))}
              {chatLoading && (
                <p className="text-[12px] text-slate-400 italic">Thinking...</p>
              )}
            </div>
            <div className="px-3 pb-3 pt-1 border-t border-slate-100">
              <form
                onSubmit={e => {
                  e.preventDefault()
                  handleSendChat()
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Ask about this meeting..."
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[var(--accent)] text-white disabled:opacity-60 disabled:cursor-not-allowed hover:bg-[var(--color-primary-dark)] transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setChatOpen(o => !o)}
          className="w-12 h-12 rounded-full bg-[var(--accent)] text-white shadow-lg shadow-rose-200 flex items-center justify-center hover:bg-[var(--color-primary-dark)] transition-colors"
        >
          <Bot className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
