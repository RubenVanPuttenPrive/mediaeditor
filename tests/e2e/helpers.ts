import { expect, type Page } from '@playwright/test';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { readFile } from 'node:fs/promises';

export const SAMPLE = 'tests/fixtures/sample.mp4';
export const SAMPLE_SECONDS = 6;

export async function freshStart(page: Page, query = '') {
  await page.goto(query);
  await page.waitForSelector('.empty-state, .clip');
  if (await page.locator('.clip').count()) {
    // Leftover project from an earlier test in this context: start over.
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'About' }).click();
    await page.getByRole('button', { name: 'New project' }).click();
  }
  await expect(page.locator('.empty-state')).toBeVisible();
}

export async function importSample(page: Page) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import videos or photos' }).click(),
  ]);
  await chooser.setFiles(SAMPLE);
  await expect(page.locator('.clip')).toHaveCount(1);
}

export async function seek(page: Page, seconds: number) {
  // Arrow keys on the focused timeline step one frame; Shift steps one second.
  await page.getByTestId('timeline').focus();
  for (let i = 0; i < seconds; i++) await page.keyboard.press('Shift+ArrowRight');
}

export async function exportAndDownload(page: Page, quality: '720p' | '1080p', dest: string) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.locator('.quality-option', { hasText: quality }).click();
  await page.getByTestId('start-export').click();
  await expect(page.getByTestId('result-video')).toBeVisible({ timeout: 150_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download').click()]);
  await download.saveAs(dest);
  return dest;
}

/** Opens the MP4 with Mediabunny (in Node) and returns what a player would see. */
export async function inspectMp4(path: string) {
  const data = await readFile(path);
  const input = new Input({ source: new BufferSource(data), formats: ALL_FORMATS });
  const format = await input.getFormat();
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  const result = {
    container: format.name,
    duration: await input.computeDuration(),
    videoCodec: video?.codec ?? null,
    width: video?.displayWidth ?? 0,
    height: video?.displayHeight ?? 0,
    audioCodec: audio?.codec ?? null,
    audioChannels: audio?.numberOfChannels ?? 0,
  };
  input.dispose();
  return result;
}
