import type { Figure, Report } from './analysis/types'

export type PassRecord = {
  id: string
  name: string
  at: number
  report: Report
}

const dbName = 'listening-pass'
const storeName = 'passes'
const listKey = 'list'
const legacyKey = 'listening-pass.passes'
const kept = ['Integrated', 'Range', 'True peak', 'Correlation']

export function fourFigures(figures: Figure[]): Figure[] {
  return kept.flatMap((label) => {
    const figure = figures.find((item) => item.label === label)
    return figure ? [figure] : []
  })
}

export function remember(existing: PassRecord[], next: PassRecord, limit = 24): PassRecord[] {
  return [next, ...existing.filter((item) => item.id !== next.id)].slice(0, limit)
}

export async function loadPasses(): Promise<PassRecord[]> {
  try {
    localStorage.removeItem(legacyKey)
  } catch {
    /* The older list can stay unread. */
  }
  try {
    const db = await openDb()
    const stored = await requestToPromise(readList(db))
    db.close()
    return Array.isArray(stored) ? stored.filter(isPass).slice(0, 24) : []
  } catch {
    return []
  }
}

export async function storePasses(passes: PassRecord[]) {
  try {
    const db = await openDb()
    await requestToPromise(writeList(db, passes))
    db.close()
  } catch {
    /* Storage can be full or blocked. The pass on screen still stands. */
  }
}

export function formatPassDate(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function readList(db: IDBDatabase): IDBRequest<PassRecord[] | undefined> {
  return db.transaction(storeName, 'readonly').objectStore(storeName).get(listKey)
}

function writeList(db: IDBDatabase, passes: PassRecord[]): IDBRequest<IDBValidKey> {
  return db.transaction(storeName, 'readwrite').objectStore(storeName).put(passes, listKey)
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function isPass(value: unknown): value is PassRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as PassRecord
  const report = record.report
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.at === 'number' &&
    !!report &&
    typeof report.opening === 'string' &&
    Array.isArray(report.figures) &&
    Array.isArray(report.chapters) &&
    !!report.metrics
  )
}
