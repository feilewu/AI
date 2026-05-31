import { test, expect } from '@playwright/test'
import { setupProxyMocks } from '../fixtures/mock-data'

test.describe('阅读流程', () => {
  test.beforeEach(async ({ page }) => {
    await setupProxyMocks(page)
  })

  test('从详情进入阅读页', async ({ page }) => {
    await page.goto('/search')
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item')
    await page.click('.book-item:first-child')
    await page.waitForSelector('.btn-add')
    await page.click('.btn-add')
    await page.click('.btn-read')
    await expect(page).toHaveURL(/\/read\//)
  })

  test('阅读页展示正文', async ({ page }) => {
    await page.goto('/search')
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item')
    await page.click('.book-item:first-child')
    await page.waitForSelector('.btn-add')
    await page.click('.btn-add')
    await page.click('.btn-read')
    await page.waitForSelector('.reader-content')
    const content = page.locator('.reader-content')
    await expect(content).toContainText('第一章的正文内容')
  })

  test('阅读设置 — 调整字号', async ({ page }) => {
    await page.goto('/search')
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item')
    await page.click('.book-item:first-child')
    await page.waitForSelector('.btn-add')
    await page.click('.btn-add')
    await page.click('.btn-read')
    await page.waitForSelector('.reader-content')

    await page.click('button:has-text("设置")')
    await page.waitForSelector('.reader-settings')
    await page.click('button:has-text("A+")')
  })

  test('切换章节', async ({ page }) => {
    await page.goto('/search')
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item')
    await page.click('.book-item:first-child')
    await page.waitForSelector('.btn-add')
    await page.click('.btn-add')
    await page.click('.btn-read')
    await page.waitForSelector('.reader-nav')

    await page.click('button:has-text("下一章")')
    await page.waitForTimeout(500)
    const content = page.locator('.reader-content')
    await expect(content).toContainText('正文内容')
  })
})
