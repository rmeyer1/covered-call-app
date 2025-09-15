import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test('capture home page screenshot', async ({ page }) => {
  const outDir = path.join(process.cwd(), 'docs', 'screenshots');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'home.png');

  await page.goto('/');
  await expect(page).toHaveTitle(/Create Next App/i);
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('Saved screenshot to', outPath);
});

