import { test, expect } from '@playwright/test'
import { setupProxyMocks } from '../fixtures/mock-data'

test.describe('书籍详情流程', () => {
  test.beforeEach(async ({ page }) => {
    await setupProxyMocks(page)
  })

  test('从搜索结果点击进入详情页', async ({ page }) => {
    await page.goto('/search')
    await page.waitForTimeout(1500)
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item', { timeout: 10000 })
    await page.click('.book-item:first-child')
    await expect(page).toHaveURL(/\/book\//)
  })

  test('详情页展示书籍信息', async ({ page }) => {
    await page.goto('/search')
    await page.waitForTimeout(1500)
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item', { timeout: 10000 })
    await page.click('.book-item:first-child')
    await page.waitForSelector('.book-info')

    await expect(page.locator('.name')).toContainText('测试书籍')
    await expect(page.locator('.author')).toContainText('测试作者')
  })

  test('详情页展示目录列表', async ({ page }) => {
    await page.goto('/search')
    await page.waitForTimeout(1500)
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item', { timeout: 10000 })
    await page.click('.book-item:first-child')
    await page.waitForSelector('.chapter-list')

    const chapters = page.locator('.chapter-item')
    await expect(chapters).toHaveCount(3)
    await expect(chapters.first()).toContainText('第一章')
  })

  test('点击加入书架按钮', async ({ page }) => {
    const errorDetails: string[] = []
    page.on('pageerror', err => {
      errorDetails.push(`${err.message}\n${err.stack?.substring(0, 300) || ''}`)
    })

    await page.goto('/search')
    await page.waitForTimeout(1500)
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item', { timeout: 10000 })
    await page.click('.book-item:first-child')
    await page.waitForSelector('.btn-add', { state: 'visible' })
    await page.click('.btn-add')

    await page.waitForTimeout(2000)

    if (errorDetails.length > 0) {
      console.log('=== Page errors ===')
      errorDetails.forEach(e => console.log(e))
    }

    await expect(page.locator('.btn-read')).toBeVisible({ timeout: 5000 })
  })
})
