const BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export interface Meeting {
  meeting_id: string
  title: string
  date: string
  date_end?: string
  duration: number
  participants: string[]
  source: string
  host_email: string
  language: string
  has_transcript: boolean
  /** Backend list may return date_ist / date_iso instead of date */
  date_ist?: string
  date_iso?: string
  duration_seconds?: number
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

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface MeetingImportPayload {
  meeting_id: string
  title?: string | null
  transcript: string
  transcript_sentences?: TranscriptSentence[] | null
  participants?: string[] | null
  source?: string | null
  host_email?: string | null
  language?: string | null
  date?: string | null
  duration_seconds?: number | null
}

/** Normalize /meetings: backend returns { meetings, total, page, page_size, total_pages } */
async function meetingsList(): Promise<Meeting[]> {
  const r = await req<Meeting[] | { meetings?: Meeting[] }>('/meetings')
  return Array.isArray(r) ? r : (r?.meetings ?? [])
}

/** Get all meetings (no pagination) for client-side search/filter. Backend max 5000. */
async function meetingsAll(): Promise<Meeting[]> {
  const r = await req<{ meetings?: Meeting[] }>('/meetings/all')
  return r?.meetings ?? []
}

export const api = {
  health: () => req<{ status: string }>('/health'),
  meetings: meetingsList,
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
  meetingChat: (meetingId: string, messages: ChatMessage[]) =>
    req<{ reply: string; usage: Record<string, unknown> }>(`/meetings/${meetingId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ messages }),
    }),
  importMeeting: (payload: MeetingImportPayload) =>
    req<MeetingDetail>('/meetings/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  clearTranscript: (meetingId: string) =>
    req<MeetingDetail>(`/meetings/${meetingId}/transcript`, {
      method: 'DELETE',
    }),
  deleteMeeting: (meetingId: string) =>
    req<void>(`/meetings/${meetingId}`, { method: 'DELETE' }),
  updateMeeting: (meetingId: string, body: { title?: string | null }) =>
    req<MeetingDetail>(`/meetings/${meetingId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  meetingsAll,
}
