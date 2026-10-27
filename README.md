# 東分局新聞稿與警廣路況資料

交通部公路局東區養護工程分局新聞網（https://thbu4.thb.gov.tw/News.aspx?n=5066&sms=13366）
最近 7 天「重大新聞／交通管制」公告的自動整理，供「東分局資訊整合平台」讀取。

- 資料檔：[`data/news.json`](data/news.json)
- 更新：GitHub Actions 於台灣時間 06:00～23:30 每 30 分鐘爬取一次，內容有變才更新
- 平台讀取網址：`https://raw.githubusercontent.com/trance-Git/thb-east-news/main/data/news.json`

內容均為東分局官網已公開的公告。

## 欄位

| 欄位 | 說明 |
|---|---|
| 日期 | 公告日期（民國年，例 `115-10-20 16:26`） |
| 類別 | 訊息分類（重大新聞／交通管制） |
| 標題 | 公告標題 |
| 內容 | 公告內文，已移除結尾「呼籲用路人…」宣導語，保留承辦單位 |
| 單位 | 公告單位 |
| 網址 | 原始公告網址 |

## 失敗時

東分局網站有 Incapsula 防爬蟲，所以要用無頭 Chrome 才抓得到。
如果一筆都沒抓到，爬蟲會以失敗結束（Actions 亮紅燈、GitHub 寄通知信），
並保留上一版 `news.json`，平台會繼續顯示舊資料。

---

## 警廣路況 `data/traffic.json`

警察廣播電台即時路況開放資料（PBS opendata）中，東部地區、公路局東區養護工程分局通報、
非道路施工、最後更新在 8 小時內的事件。

- 由分局內電腦每 5 分鐘抓取上傳（PBS 擋海外連線，GitHub Actions 抓不到），內容有變或每 30 分鐘更新一次
- 平台讀取網址：`https://raw.githubusercontent.com/trance-Git/thb-east-news/main/data/traffic.json`
- 格式：`{checkedAt, changedAt, count, items:[PBS 原始欄位]}`，`checkedAt` 超過 60 分鐘沒變代表中繼電腦停了
