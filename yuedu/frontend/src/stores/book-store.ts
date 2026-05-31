import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Book } from '@/types'
import * as db from '@/db'

export const useBookStore = defineStore('book', () => {
  const books = ref<Book[]>([])

  async function loadBooks() {
    books.value = await db.getAllBooks()
  }

  async function addBook(book: Book) {
    await db.saveBook(book)
    await loadBooks()
  }

  async function removeBook(id: string) {
    await db.deleteBook(id)
    await loadBooks()
  }

  async function switchSource(bookId: string, newSourceUrl: string) {
    await db.switchBookSource(bookId, newSourceUrl)
    await loadBooks()
  }

  return { books, loadBooks, addBook, removeBook, switchSource }
})
