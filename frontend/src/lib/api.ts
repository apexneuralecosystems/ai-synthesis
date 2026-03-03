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
  duration_display?: string
  folder_id?: string | null
}

export interface Folder {
  id: string
  name: string
  created_at_ist?: string | null
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
  quote_check?: { quote: string; found: boolean }[]
  usage?: { model: string; input_tokens: number; output_tokens: number; elapsed_seconds: number }
  /** When status is "already_exists" */
  message?: string
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
  /** Optional: if omitted, backend generates a unique id (so you can import same document multiple times, e.g. daily). */
  meeting_id?: string | null
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

/** Get all meetings (no pagination) for client-side search/filter. Backend max 5000. Optional folder_id: '' = no folder. */
async function meetingsAll(folderId?: string | null): Promise<Meeting[]> {
  const params = folderId !== undefined && folderId !== null ? `?folder_id=${encodeURIComponent(folderId)}` : ''
  const r = await req<{ meetings?: Meeting[] }>(`/meetings/all${params}`)
  return r?.meetings ?? []
}

async function foldersList(): Promise<Folder[]> {
  const r = await req<{ folders?: Folder[] }>('/folders')
  return r?.folders ?? []
}

function folderCreate(name: string) {
  return req<Folder>('/folders', { method: 'POST', body: JSON.stringify({ name }) })
}

/** Move folder to bin (soft delete). */
function folderDelete(folderId: string) {
  return req<void>(`/folders/${folderId}`, { method: 'DELETE' })
}

/** List folders in bin. */
function foldersTrash() {
  return req<{ folders: Folder[] }>('/folders/trash').then(r => r.folders ?? [])
}

/** Restore a folder from bin. */
function restoreFolder(folderId: string) {
  return req<{ status: string; folder_id: string }>(`/folders/${folderId}/restore`, { method: 'POST' })
}

/** Permanently delete a folder (meetings in it move to no folder). */
function deleteFolderPermanent(folderId: string) {
  return req<void>(`/folders/${folderId}/permanent`, { method: 'DELETE' })
}

export const api = {
  health: () => req<{ status: string }>('/health'),
  meetings: meetingsList,
  meeting: (id: string) => req<MeetingDetail>(`/meetings/${id}`),
  reports: (folderId?: string | null) => {
    const q = folderId !== undefined && folderId !== null ? `?folder_id=${encodeURIComponent(folderId)}` : ''
    return req<PainReportItem[]>(`/reports${q}`)
  },
  report: (id: string) => req<Record<string, unknown>>(`/reports/${id}`),
  deleteReport: (id: string) => req<{ status: string }>(`/reports/${id}`, { method: 'DELETE' }),
  reportsTrash: () => req<PainReportItem[]>('/reports/trash'),
  restoreReport: (id: string) => req<{ status: string; report_id: string }>(`/reports/${id}/restore`, { method: 'POST' }),
  deleteReportPermanent: (id: string) => req<{ status: string }>(`/reports/${id}/permanent`, { method: 'DELETE' }),
  synthesize: (meetingId: string, callType: string, interviewer: string) =>
    req<SynthResult>('/synthesize', {
      method: 'POST',
      body: JSON.stringify({ meeting_id: meetingId, call_type: callType, interviewer }),
    }),
  deltas: () => req<DeltaItem[]>('/deltas'),
  delta: (id: string) => req<Record<string, unknown>>(`/deltas/${id}`),
  deleteDelta: (id: string) => req<{ status: string }>(`/deltas/${id}`, { method: 'DELETE' }),
  deltasTrash: () => req<DeltaItem[]>('/deltas/trash'),
  restoreDelta: (id: string) => req<{ status: string; delta_id: string }>(`/deltas/${id}/restore`, { method: 'POST' }),
  deleteDeltaPermanent: (id: string) => req<{ status: string }>(`/deltas/${id}/permanent`, { method: 'DELETE' }),
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
  /** Move meeting to bin (soft delete). */
  deleteMeeting: (meetingId: string) =>
    req<void>(`/meetings/${meetingId}`, { method: 'DELETE' }),
  /** List meetings in bin. */
  meetingsTrash: () =>
    req<{ meetings: Meeting[] }>('/meetings/trash').then(r => r.meetings ?? []),
  /** Restore a meeting from bin. */
  restoreMeeting: (meetingId: string) =>
    req<{ status: string; meeting_id: string }>(`/meetings/${meetingId}/restore`, { method: 'POST' }),
  /** Permanently delete a meeting (only from bin). */
  deleteMeetingPermanent: (meetingId: string) =>
    req<void>(`/meetings/${meetingId}/permanent`, { method: 'DELETE' }),
  updateMeeting: (meetingId: string, body: { title?: string | null; folder_id?: string | null }) =>
    req<MeetingDetail>(`/meetings/${meetingId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  meetingsAll,
  foldersList,
  folderCreate,
  folderDelete,
  foldersTrash,
  restoreFolder,
  deleteFolderPermanent,
}
