import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { api } from '../lib/api'
import type { Folder } from '../lib/api'

type MeetingsContextValue = {
  folders: Folder[]
  selectedFolderId: string | null
  setSelectedFolderId: (id: string | null) => void
  loadFolders: () => Promise<void>
  createFolder: (name: string) => Promise<Folder>
  deleteFolder: (id: string) => Promise<void>
}

const MeetingsContext = createContext<MeetingsContextValue | null>(null)

export function MeetingsProvider({ children }: { children: ReactNode }) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  const loadFolders = useCallback(async () => {
    try {
      const list = await api.foldersList()
      setFolders(list)
    } catch {
      setFolders([])
    }
  }, [])

  const createFolder = useCallback(async (name: string) => {
    const trimmed = (name || '').trim() || 'Unnamed'
    const folder = await api.folderCreate(trimmed)
    setFolders(prev => [...prev, folder])
    setSelectedFolderId(folder.id)
    return folder
  }, [])

  const deleteFolder = useCallback(async (id: string) => {
    await api.folderDelete(id)
    setFolders(prev => prev.filter(f => f.id !== id))
    setSelectedFolderId(prev => (prev === id ? null : prev))
  }, [])

  useEffect(() => {
    loadFolders()
  }, [loadFolders])

  return (
    <MeetingsContext.Provider
      value={{
        folders,
        selectedFolderId,
        setSelectedFolderId,
        loadFolders,
        createFolder,
        deleteFolder,
      }}
    >
      {children}
    </MeetingsContext.Provider>
  )
}

export function useMeetings() {
  const ctx = useContext(MeetingsContext)
  if (!ctx) return null
  return ctx
}
