const BASE = '/api'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export interface Meeting {
  meeting_id: string
  title: string
  date: string
  date_end: string
  duration: number
  participants: string[]
  source: string
  host_email: string
  language: string
  has_transcript: boolean
}

export interface TranscriptSentence {
  speaker: string
  text: string
  timestamp: string
}

export interface MeetingDetail extends Meeting {
  transcript: string
  transcript_text: string
  transcript_sentences: TranscriptSentence[]
  summary: string | null
  highlights: string | null
  ai_analysis: string | null
}

export interface PainReportItem {
  _id: string
  call_id: string
  meeting_id: string
  meeting_title: string
  call_type: string
  created_at: string
  pain_count: number
  validity_score: number | null
  summary: string
}

export interface DeltaItem {
  _id: string
  source_calls: string[]
  source_call_types: string[]
  readiness: string
  signal_strength: string
  agreements_count: number
  contradictions_count: number
  focus_count: number
  created_at: string
}

export interface SynthResult {
  status: string
  report_id: string
  call_id: string
  report: Record<string, unknown>
  quote_check: { quote: string; found: boolean }[]
  usage: { model: string; input_tokens: number; output_tokens: number; elapsed_seconds: number }
}

export interface DeltaResult {
  status: string
  delta_id: string
  report: Record<string, unknown>
  usage: { model: string; input_tokens: number; output_tokens: number; elapsed_seconds: number }
}

export const api = {
  health: () => req<{ status: string }>('/health'),
  meetings: () => req<Meeting[]>('/meetings'),
  meeting: (id: string) => req<MeetingDetail>(`/meetings/${id}`),
  reports: () => req<PainReportItem[]>('/reports'),
  report: (id: string) => req<Record<string, unknown>>(`/reports/${id}`),
  deleteReport: (id: string) => req<{ status: string }>(`/reports/${id}`, { method: 'DELETE' }),
  synthesize: (meetingId: string, callType: string, interviewer: string) =>
    req<SynthResult>('/synthesize', {
      method: 'POST',
      body: JSON.stringify({ meeting_id: meetingId, call_type: callType, interviewer }),
    }),
  deltas: () => req<DeltaItem[]>('/deltas'),
  delta: (id: string) => req<Record<string, unknown>>(`/deltas/${id}`),
  deleteDelta: (id: string) => req<{ status: string }>(`/deltas/${id}`, { method: 'DELETE' }),
  runDelta: (reportIds: string[]) =>
    req<DeltaResult>('/delta', { method: 'POST', body: JSON.stringify({ report_ids: reportIds }) }),
}
