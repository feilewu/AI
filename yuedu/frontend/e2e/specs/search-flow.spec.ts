import { test, expect } from '@playwright/test'
import { setupProxyMocks } from '../fixtures/mock-data'

test.describe('搜索流程', () => {
  test.beforeEach(async ({ page }) => {
    await setupProxyMocks(page)
  })

  test('导航到搜索页面', async ({ page }) => {
    await page.goto('/')
    await page.click('text=搜索')
    await expect(page).toHaveURL(/\/search/)
  })

  test('输入关键词搜索展示结果', async ({ page }) => {
    await page.goto('/search')
    await page.waitForTimeout(1500)
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item', { timeout: 10000 })
    const items = page.locator('.book-item')
    await expect(items.first()).toBeVisible()
    await expect(items.first()).toContainText('测试书籍')
    await expect(items.first()).toContainText('测试作者')
    await expect(items.first()).toContainText('示例书源')
  })

  test('搜索结果包含来源标签', async ({ page }) => {
    await page.goto('/search')
    await page.waitForTimeout(1500)
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item', { timeout: 10000 })
    await expect(page.locator('.book-item').first()).toContainText('来源')
  })

  test('空搜索不触发搜索请求', async ({ page }) => {
    let proxyRequestCount = 0
    await page.route('**/api/proxy', async (route) => {
      const postData = route.request().postDataJSON()
      const url = postData?.url || ''
      if (!url.includes('jsdmirror') && !url.includes('shuyuan')) {
        proxyRequestCount++
      }
      await route.fallback()
    })

    await page.goto('/search')
    await page.waitForTimeout(500)
    await page.click('button:has-text("搜索")')
    await page.waitForTimeout(500)
    expect(proxyRequestCount).toBe(0)
  })
})
