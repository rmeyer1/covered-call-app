import { test, expect } from '@playwright/test';

test('renders home page and strategy cards', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Options Strategy Builder')).toBeVisible();
  await expect(page.getByRole('link', { name: /Long Call/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Covered Call/i })).toBeVisible();
});
