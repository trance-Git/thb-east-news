// 東分局新聞稿爬蟲：由 GitHub Actions 排程執行，結果寫到 data/news.json，平台直接讀這個檔。
// 取代原本 Zeabur 上的 n8n（newthb）＋ Browserless。
//
// 東分局網站有 Imperva Incapsula 防爬蟲，一般 HTTP 請求只會拿到驗證頁，
// 一定要用真的瀏覽器（無頭 Chrome）開，跑完它的 JavaScript 驗證才看得到內容。
//
// 規則照原 n8n workflow：
//   · 列表頁逐頁往下翻（最多 15 頁），遇到 7 天前的公告就停
//   · 只收分類含「重大新聞」「交通管制」者
//   · 內文從「呼籲／提醒用路人」那段起切掉，但保留「承辦單位」那一行
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = 'https://thbu4.thb.gov.tw';
const LIST = BASE + '/News.aspx?n=5066&sms=13366';
const KEYWORDS = ['重大新聞', '交通管制'];
const KEEP_DAYS = 7;
const MAX_PAGES = 15;
const OUT = new URL('../data/news.json', import.meta.url);
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';

const rocToDate = s => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y + 1911, m - 1, d);
};

const ADVICE = ['公路局東區養護工程分局呼籲請用路人', '公路局呼籲用路人', '公路局提醒用路人', '公路局籲請用路人', '呼籲用路人'];
function removeAdvice(text){
  let cut = text.length;
  for (const p of ADVICE) { const i = text.indexOf(p); if (i !== -1 && i < cut) cut = i; }
  const u = text.indexOf('承辦單位');
  const unit = u !== -1 ? '\n' + text.substring(u).split('\n')[0].trim() : '';
  return text.substring(0, cut).trim().replace(/\n{2,}/g, '\n') + unit;
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=zh-TW']
});
const page = await browser.newPage();
await page.setExtraHTTPHeaders({'Accept-Language': 'zh-TW,zh;q=0.9'});

/** 開頁並等到 Incapsula 驗證跑完、真正的表格出現 */
async function open(url, selector){
  await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 45000});
  await page.waitForSelector(selector, {timeout: 30000});
}

const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0); cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
const items = [];
let pageNum = 1, keepGoing = true;
try {
  while (keepGoing && pageNum <= MAX_PAGES) {
    // 2026-10 網站改版後表格已無 #table_0（原 n8n 選擇器失效），改用每格的 data-title 欄位名稱定位
    await open(LIST + '&page=' + pageNum + '&PageSize=10', 'td[data-title="公告日期"]');
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('tr')].filter(tr => tr.querySelector('td[data-title="公告日期"]')).map(tr => {
        const cell = k => tr.querySelector('td[data-title="' + k + '"]');
        const txt = el => (el && el.innerText || '').trim();
        const a = cell('標題') && cell('標題').querySelector('a');
        return {
          date: txt(cell('公告日期')),
          category: txt(cell('訊息分類')),
          title: a ? (a.getAttribute('title') || a.innerText).trim() : '',
          href: a ? (a.getAttribute('href') || '').replace(/&amp;/g, '&').replace(/^\//, '') : ''
        };
      }));
    for (const row of rows) {
      if (!row.date) continue;
      if (rocToDate(row.date) < cutoff) { keepGoing = false; break; }
      if (!row.href || !KEYWORDS.some(k => row.category.includes(k))) continue;
      const url = BASE + '/' + row.href;
      await open(url, 'td[data-title="內容"]');
      const d = await page.evaluate(() => {
        const get = k => { const el = document.querySelector('td[data-title="' + k + '"]'); return el ? el.innerText.trim() : ''; };
        return {content: get('內容'), category: get('分類'), date: get('公告日期'), unit: get('公告單位')};
      });
      items.push({
        日期: d.date || row.date,
        類別: d.category || row.category,
        標題: row.title,
        內容: removeAdvice(d.content || ''),
        單位: d.unit || '',
        網址: url
      });
    }
    if (rows.length < 10) keepGoing = false;
    pageNum++;
  }
} finally {
  await browser.close();
}

// 一筆都沒抓到多半是網站擋掉或改版：保留上一次的檔案，讓平台繼續顯示舊資料，並以失敗結束讓 Actions 亮紅燈
if (!items.length) {
  console.error('沒有抓到任何新聞稿（可能被防爬蟲擋下或網站改版），保留上一版 news.json');
  process.exit(1);
}

// 內容沒變就不改檔：git 不必每 30 分鐘提交一次、Netlify 也不必每次重新部署。
// 所以 changedAt 是「內容最後變動的時間」，不是爬蟲最後執行的時間；爬蟲是否在跑看 GitHub Actions 紀錄。
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const same = prev && JSON.stringify(prev.items) === JSON.stringify(items);
if (same) {
  console.log('內容與上一版相同（' + items.length + ' 則），不更新');
} else {
  mkdirSync(new URL('../data/', import.meta.url), {recursive: true});
  writeFileSync(OUT, JSON.stringify({changedAt: new Date().toISOString(), items}, null, 1));
  console.log('已更新 news.json：' + items.length + ' 則');
}
