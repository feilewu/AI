import Dexie from 'dexie'
import type { BookSource, Book, Chapter, ReadingProgress } from '@/types'

export class YueduDB extends Dexie {
  bookSources!: Dexie.Table<BookSource, string>
  books!: Dexie.Table<Book, string>
  chapters!: Dexie.Table<Chapter, string>
  readingProgress!: Dexie.Table<ReadingProgress, string>

  constructor() {
    super('YueduReader')
    this.version(1).stores({
      bookSources: 'bookSourceUrl',
      books: 'id',
      chapters: 'id, [bookId+sourceUrl]',
      readingProgress: 'id, [bookId+sourceUrl]',
    })
  }
}

export const db = new YueduDB()

// Book Sources
export async function getAllSources(): Promise<BookSource[]> {
  return db.bookSources.toArray()
}

export async function getEnabledSources(): Promise<BookSource[]> {
  const all = await db.bookSources.toArray()
  return all.filter(s => s.enabled)
}

export async function upsertSource(source: BookSource): Promise<void> {
  await db.bookSources.put(source)
}

export async function deleteSource(url: string): Promise<void> {
  await db.bookSources.delete(url)
}

export async function toggleSource(url: string, enabled: boolean): Promise<void> {
  await db.bookSources.update(url, { enabled })
}

export async function importSources(sources: BookSource[]): Promise<void> {
  await db.bookSources.bulkPut(sources)
}

export async function getSourceCount(): Promise<number> {
  return db.bookSources.count()
}

// Books
export async function getAllBooks(): Promise<Book[]> {
  return db.books.orderBy('updatedAt').reverse().toArray()
}

export async function getBook(id: string): Promise<Book | undefined> {
  return db.books.get(id)
}

export async function saveBook(book: Book): Promise<void> {
  await db.open()
  const existing = await db.books.get(book.id)
  if (existing) {
    const mergedSources = existing.sources.filter(
      s => s.sourceUrl !== book.activeSourceUrl
    )
    mergedSources.push(...book.sources)
    await db.books.put({ ...existing, ...book, sources: mergedSources })
  } else {
    await db.books.put(book)
  }
}

export async function deleteBook(id: string): Promise<void> {
  await db.books.delete(id)
  await db.chapters.where('bookId').equals(id).delete()
  await db.readingProgress.where('bookId').equals(id).delete()
}

export async function switchBookSource(
  bookId: string,
  newSourceUrl: string
): Promise<void> {
  await db.books.update(bookId, { activeSourceUrl: newSourceUrl })
}

// Chapters
export async function getChapters(
  bookId: string,
  sourceUrl: string
): Promise<Chapter[]> {
  return db.chapters
    .where('[bookId+sourceUrl]')
    .equals([bookId, sourceUrl])
    .sortBy('index')
}

export async function saveChapters(chapters: Chapter[]): Promise<void> {
  await db.chapters.bulkPut(chapters)
}

// Reading Progress
export async function getProgress(
  bookId: string,
  sourceUrl: string
): Promise<ReadingProgress | undefined> {
  return db.readingProgress.get(`${bookId}::${sourceUrl}`)
}

export async function saveProgress(progress: ReadingProgress): Promise<void> {
  await db.readingProgress.put(progress)
}
