import { expect, type Page } from '@playwright/test'

/**
 * scrollBody tables (guests, gifts): only the list scrolls. With more rows than fit, the page itself
 * stays within the viewport (one scrollbar), the region scrolls with the wheel without moving the page,
 * the pagination stays on screen, and on wide screens the header row stays visible and on top (above the
 * rows and the sticky actions column) after scrolling.
 */
export async function expectOnlyListScrolls(page: Page, regionName: string, { header }: { header?: string } = {}) {
  const region = page.getByRole('region', { name: regionName })
  await expect(region).toBeVisible()

  // the page fits the viewport (the region's cap is measured after hydration)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight))
    .toBeLessThanOrEqual(1)
  const sizes = await region.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }))
  expect(sizes.scroll, 'the list should be taller than its region').toBeGreaterThan(sizes.client + 100)
  expect(sizes.client, 'the region keeps a usable height').toBeGreaterThanOrEqual(300)
  await expect(page.getByText(/^Mostrando \d+–\d+ de \d+$/)).toBeInViewport()

  // the wheel scrolls the list, not the page
  const box = (await region.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 500)
  await expect.poll(() => region.evaluate((el) => el.scrollTop)).toBeGreaterThan(100)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  if (header) {
    const th = region.getByRole('columnheader', { name: header })
    await expect(th).toBeInViewport()
    const thBox = (await th.boundingBox())!
    expect(Math.abs(thBox.y - box.y), 'the header row sticks to the top of the region').toBeLessThanOrEqual(2)
    // on top of the rows scrolled under it, including the sticky actions cells at the right end
    const covered = await region.evaluate((el) => {
      const cells = [...el.querySelectorAll('thead th')].filter((c) => c.getBoundingClientRect().width > 0)
      if (cells.length === 0) return ['no header cells']
      return cells.flatMap((cell) => {
        const r = cell.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        // the sticky actions header may overlap a header cell scrolled sideways under it: only rows count
        return hit && hit.closest('thead')
          ? []
          : [`${cell.textContent?.trim() || '(empty)'} covered by <${hit?.tagName.toLowerCase()} class="${hit?.getAttribute('class') ?? ''}">`]
      })
    })
    expect(covered, 'header cells covered by a row').toEqual([])
    const bg = await th.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg, 'the header background stays opaque').toBe('rgb(247, 222, 219)')
  }

  // keyboard: the region is still focusable
  await region.evaluate((el) => (el as HTMLElement).focus())
  await expect(region).toBeFocused()
}
