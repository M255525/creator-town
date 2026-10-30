# CLAUDE.md — creator-town（創作者小鎮）

單檔前端「工具導覽地圖」：把 27 個已上線的 **AI 內容創作工具**（提示詞、圖像、影音、聲音、社群、寫作、工作流）放進一座可探索的等角小鎮，9 個地點，每棟建築是一個工具，點了開右側抽屜→「前往工具」新分頁開啟。**本專案不含任何生成邏輯。** 無框架、無建置，`index.html`＋`island3d.js`＋`manual.html`。

2026-10-30 建立。使用者先問「創業島之外，這些線上軟體還能做成哪些主題」，選了建議的第一名「創作者小鎮」。**骨架整份複製自 `互動遊戲/startup-island`**（平面等角地圖、立體 3D、清單、時間軸、導覽、足跡、動物角色、多人同鎮、聊天、房間、測試小幫手、小地圖＋子母畫面、看板），只換資料、文案、建築外型與立體地標。創業島 CLAUDE.md 記錄的實作細節與踩坑（尋路格子、標籤避讓、rAF clamp、卡通描邊、聊天過濾等）**在這裡全部適用**，改程式前先讀那份。兩邊是獨立副本，創業島日後修 bug 不會自動同步過來，需要時手動移植。

## 和創業島的對應（場地 id 刻意沿用）
地形與裝飾程式碼綁死在場地 id（`school` 操場座標、`brand` 中間街道、`ecom` 木棧橋、`fund` 噴水池、`strategy` 山丘、`hub` 不畫拱門…），所以 **id 沒改，只改名稱／顏色／內容**：

| id | 小鎮名稱 | 建築 `STYLE` | 工具 | 立體地標 `MARKS` |
|---|---|---|---|---|
| idea | 靈感公園 | pavilion | 曼陀羅、SCAMPER、六頂思考帽、創意打版台● | 大燈泡（沿用） |
| strategy | 提示詞山丘 | office（顧問團 observatory） | AI 提示詞●、CRISPE 控制台、AI 技能●、AI 顧問團 | 對話泡泡（新） |
| school | 創作學院 | school | CRISPE 卡牌、CO-STAR 卡牌、課堂練習存摺 | 鉛筆＋鞦韆（沿用） |
| calc | 影音片場 | warehouse | 短影片提示詞●、AI 影音工坊、影片先生（`url` 指 `video-editor/mrvideo_s/`） | 創作看板（沿用看板機制） |
| fund | 聲音廣場 | civic | AI 快速語音、音樂提示詞● | 音符＋喇叭（新） |
| brand | 社群大街 | shop | 社群規劃、內容行事曆、社群貼文、貼文健診 | 愛心氣球（沿用） |
| ecom | 插畫港 | house | 繪圖提示詞●、漫畫分鏡、LINE 貼圖 | 畫架＋調色盤（新） |
| ops | 寫作巷 | house | 文字整理、簡報風格 | 攤開的書＋鋼筆（新） |
| hub | 發布塔 | office（spire／warehouse） | 內容工作流●、節點補充包●（Cloudflare 網址） | 光環（沿用） |

●＝`lic:true`（8 個；2026-10-30 掃線上首頁 `LICENSE_CHECK_URL`，skill-prompt-studio 與 CF 兩個是登入閘門）。AI 影音工坊、影片先生只有部分功能要序號，標 `lic:false` 並寫在 `role` 裡（同創業島慣例）。`ai-course-hub` 的 Pages 網址 404，沒收。
- 某些場地工具比創業島少，用 `extra` 把地塊撐回原本大小（school／calc／ops），地標、看板、拱門位置才不會跑掉。河口燈塔（`FREE`）拿掉了。
- `LINKS` 19 條（id `c1`–`c19`）、`DAY_SCRIPT`「創作者的一天」、`MONTH_SCRIPT`「兩年創作之路」、`STORY` 11 步。
- 名字隨機池 `NAME_B` 換成創作者角色（插畫家、剪輯師、配音員…）。

## 多人同鎮：共用創業島的轉播站，靠房間隔開
- `PRESENCE_URL` 仍是 `startup-island-presence` Worker（Origin 白名單已含 `m255525.github.io`），**沒有另外部署 Worker**。
- `netRoom()`：公開小鎮＝房間 `CREATORTOWN`；使用者代碼前面加 `CT`（所以代碼上限 3～10 字，Worker 的 `cleanRoom` 上限 12）。創業島的公開島是 `main`，同名代碼也不會互通。連線與 🤖 小幫手的 `botUrl()` 都走 `netRoom()`。
- 轉播站改協定時（例如動物白名單）兩個專案都要看。

## 看板
`BOARD_SHEET = ''` → `loadBoard()` 直接 return，顯示 `BOARD_DEFAULT`（「今日題目」短內容練習）。要改成管理者可編輯：建一份「知道連結的人可檢視」試算表（格式同創業島 `docs/board-template.csv`），把 ID 填進 `BOARD_SHEET`。

## 配套
- localStorage 全部 `creatorTown*`（與創業島分開）；測試 hook `window.__creatorTown`。
- 跑馬燈（共用端點）、PWA（`creator-town-shell-v1`，圖示 PIL 自畫：紫粉漸層＋等角小島＋播放鍵泡泡）、`manual.html`（PART 2 創作者實用資訊：創作路線圖六階段、提示詞基本功、常用尺寸、版權與 AI 注意、常見的坑、一週練習）、使用警語、創作者資訊、訪客計數器 `page_id=m255525.creatortown`。
- 手冊「常用尺寸」是一般通用規格，已註明以平台官方為準；版權段落註明非法律意見。

## Port／測試
- port **8842**（`.claude/launch.json` 的 `creator-town`；程式牆 `LOCAL_APPS` 有一筆 static，`--launchtest` 通過）。
- 驗證（2026-10-30，Playwright）：1366×800 平面、立體鳥瞰截圖正常；除了刻意連不上的 presence 外無 console 錯誤；375px 清單、抽屜、manual 無橫向溢出；27 個 `toolUrl` 全部 HTTP 200。

## 部署
尚未上線（依使用者偏好，新的實驗性工具上線前先問）。上線時比照創業島：公開 repo `M255525/creator-town`、`.github/workflows/deploy-pages.yml` 已複製好（先 push 再開 Pages、注意 master 分支的環境規則）；上線後程式牆改成 `REPO_META`（github-dashboard 同步）並從 `LOCAL_APPS` 移除。
