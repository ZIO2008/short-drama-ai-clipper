const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'design', 'open-design', 'v2026-07-29-r5-merged', 'short-drama-material-studio.html');
const output = path.join(root, 'design', 'open-design', 'v2026-07-29-r5-merged', 'screens');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function inspect(viewport, label) {
  console.log(`START ${label}`);
  const browser = await chromium.launch({ headless: true, executablePath: chrome });
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(10000);
  await page.goto(pathToFileURL(source).href, { waitUntil: 'load' });
  console.log(`LOADED ${label}`);
  await page.locator('#screen-library .drama-card').first().click();
  await page.locator('#screen-assets [data-drama-screen="production"]').click();
  await page.locator('#screen-production [data-open="clip"]').click();
  await page.waitForTimeout(80);
  const workbench = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    sourceTimeline: Boolean(document.querySelector('.r5-timeline')) && document.body.innerText.includes('源分集时间线'),
    candidateTimeline: document.body.innerText.includes('当前候选片段时间线'),
    mediaFrame: Boolean(document.querySelector('.r5-monitor .r5-frame')),
    subtitleTab: Boolean(document.querySelector('[data-r5-open="subtitles"]')),
    hasCrossEpisodeSequence: document.body.innerText.includes('成片切片序列')
  }));
  await page.screenshot({ path: path.join(output, `${label}-workbench.png`) });
  await page.click('[data-r5-open="pool"]');
  const pool = await page.evaluate(() => ({ open: document.querySelector('#r5CandidatePool')?.classList.contains('open'), pressure: document.body.innerText.includes('5,000 候选基线') }));
  await page.screenshot({ path: path.join(output, `${label}-candidate-pool.png`) });
  await page.click('[data-r5-close="r5CandidatePool"]');
  await page.click('[data-r5-open="export"]');
  const exportCheck = await page.evaluate(() => ({ open: document.querySelector('#r5ExportDrawer')?.classList.contains('open'), hasNoOverwrite: document.body.innerText.includes('新建不覆盖') }));
  await page.screenshot({ path: path.join(output, `${label}-export.png`) });
  await page.locator('#screen-clip [data-r5-open="subtitles"]').first().click();
  const subtitles = await page.evaluate(() => ({ active: document.querySelector('#screen-subtitles')?.classList.contains('active'), asr: document.body.innerText.includes('音频实录轨'), ocr: document.body.innerText.includes('画面字幕证据轨') }));
  await page.screenshot({ path: path.join(output, `${label}-subtitle-assets.png`) });
  await browser.close();
  console.log(`DONE ${label}`);
  return { workbench, pool, export: exportCheck, subtitles };
}

(async () => {
  console.log('PREPARE');
  await fs.mkdir(output, { recursive: true });
  const report = { source, desktop1440: await inspect({ width: 1440, height: 900 }, '1440x900'), desktop1280: await inspect({ width: 1280, height: 720 }, '1280x720') };
  await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2), 'utf8');
  process.stdout.write(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
