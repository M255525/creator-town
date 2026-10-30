# CLAUDE.md — creator-town（創作者小鎮）

單檔前端「工具導覽地圖」：把 27 個已上線的 **AI 內容創作工具**（提示詞、圖像、影音、聲音、社群、寫作、工作流）放進一座可探索的等角小鎮，9 個地點，每棟建築是一個工具，點了開右側抽屜→「前往工具」新分頁開啟。**本專案不含任何生成邏輯。** 無框架、無建置，`index.html`＋`island3d.js`＋`manual.html`。

2026-10-30 建立。使用者先問「創業島之外，這些線上軟體還能做成哪些主題」，選了建議的第一名「創作者小鎮」。**骨架整份複製自 `互動遊戲/startup-island`**（平面等角地圖、立體 3D、清單、時間軸、導覽、足跡、動物角色、多人同鎮、聊天、房間、測試小幫手、小地圖＋子母畫面、看板），只換資料、文案、建築外型與立體地標。創業島 CLAUDE.md 記錄的實作細節與踩坑（尋路格子、標籤避讓、rAF clamp、卡通描邊、聊天過濾等）**在這裡全部適用**，改程式前先讀那份。兩邊是獨立副本，創業島日後修 bug 不會自動同步過來，需要時手動移植。

## 和創業島的對應（場地 id 刻意沿用）
地形與裝飾程式碼綁死在場地 id（`school` 操場座標、`brand` 中間街道、`ecom` 木棧橋、`fund` 噴水池、`strategy` 山丘、`hub` 不畫拱門…），所以 **id 沒改，只改名稱／顏色／內容**：

| id | 小鎮名稱 | 建築 `STYLE` | 工具 | 立體地標 `MARKS` |
|---|---|---|---|---|
| idea | 靈感草坪 | container | 曼陀羅、SCAMPER、六頂思考帽、創意打版台● | 大燈泡（沿用） |
| strategy | 提示詞看台 | brick（顧問團 observatory） | AI 提示詞●、CRISPE 控制台、AI 技能●、AI 顧問團 | 對話泡泡（新） |
| school | 創作學院 | brick | CRISPE 卡牌、CO-STAR 卡牌、課堂練習存摺 | 鉛筆＋鞦韆（沿用） |
| calc | 影音片場 | warehouse | 短影片提示詞●、AI 影音工坊、影片先生（`url` 指 `video-editor/mrvideo_s/`） | 公布欄（沿用看板機制） |
| fund | 聲音廣場 | brick | AI 快速語音、音樂提示詞● | 音符＋喇叭（新） |
| brand | 社群大街 | shop | 社群規劃、內容行事曆、社群貼文、貼文健診 | 愛心氣球（沿用） |
| ecom | 插畫碼頭 | container | 繪圖提示詞●、漫畫分鏡、LINE 貼圖 | 畫架＋調色盤（新） |
| ops | 寫作巷 | brick | 文字整理、簡報風格 | 攤開的書＋鋼筆（新） |
| hub | 發布塔 | office（spire／warehouse） | 內容工作流●、節點補充包●（Cloudflare 網址） | 光環（沿用） |

●＝`lic:true`（8 個；2026-10-30 掃線上首頁 `LICENSE_CHECK_URL`，skill-prompt-studio 與 CF 兩個是登入閘門）。AI 影音工坊、影片先生只有部分功能要序號，標 `lic:false` 並寫在 `role` 裡（同創業島慣例）。`ai-course-hub` 的 Pages 網址 404，沒收。
- 某些場地工具比創業島少，用 `extra` 把地塊撐回原本大小（school／calc／ops），地標、看板、拱門位置才不會跑掉。河口燈塔（`FREE`）拿掉了。
- `LINKS` 19 條（id `c1`–`c19`）、`DAY_SCRIPT`「創作者的一天」、`MONTH_SCRIPT`「兩年創作之路」、`STORY` 11 步。
- 名字隨機池 `NAME_B` 換成創作者角色（插畫家、剪輯師、配音員…）。

## 多人同鎮：共用創業島的轉播站，靠房間隔開
- `PRESENCE_URL` 仍是 `startup-island-presence` Worker（Origin 白名單已含 `m255525.github.io`），**沒有另外部署 Worker**。
- `netRoom()`：公開小鎮＝房間 `CREATORTOWN`；使用者代碼前面加 `CT`（所以代碼上限 3～10 字，Worker 的 `cleanRoom` 上限 12）。創業島的公開島是 `main`，同名代碼也不會互通。連線與 🤖 小幫手的 `botUrl()` 都走 `netRoom()`。
- 轉播站改協定時（例如動物白名單）兩個專案都要看。

## 公布欄（2026-10-30 使用者要求「與創業島使用同一份表單資料」）
`BOARD_SHEET` 與創業島相同：試算表「board-template」`1reL32KcSUL-YNh4ICVxm-fROcjBzRiKVLjy05t7q_bs`（A 欄欄位名稱、B 欄內容，格式見創業島 CLAUDE.md），**改一次兩邊一起換**；`BOARD_DEFAULT` 也是從創業島複製的同一份。介面名稱叫「📋 公布欄」（創業島叫看板）。localStorage 快取 `creatorTownBoard` 與創業島分開。創業島若改 `BOARD_FIELDS`／`cleanBoard()`，這邊要一起改。

## 港邊倉庫外觀（2026-10-30 改版）
使用者看了初版說「架構/UI 可以類似，但畫面太接近創業島」，要求**以高雄駁二藝術特區的景緻為主題，並注意智財權**。只借「港邊舊倉庫群改建藝術區」的一般性氛圍：
- **智財權界線**：不用「駁二」名稱當品牌、不放官方標誌／照片、不仿任何真實公共藝術作品、輕軌不照搬真實塗裝、倉庫只用自己的流水號（工具序號 01–27），不用真實倉庫名稱或編號；頁尾警語與 manual 都有非官方聲明。**日後加景物也照這個原則**，地標一律原創。
- **地形**：`islandR()` 改成圓角方形（superellipse n=8、半寬 11.6）＋前方 `gx+gy=32.6` 的筆直岸壁；`onQuay()` 判斷前方岸壁畫繫船柱；`inLand()` 把運河截在岸邊（2D 與小地圖）。立體 `landY()` 岸壁是直牆、運河石砌直壁、看台每一階是直角；`terrainColor()` 岸邊混凝土、道床色。
- **新外型**：`brick`（紅磚倉庫：灰藍浪板山牆屋頂＋場地色飾條、場地色大鐵門、側牆原創抽象彩繪 `muralTex()`、山牆流水號）、`container`（兩個錯開疊起的貨櫃，`drawContainer()`）、`warehouse` 改鐵皮浪板；`shop` 牆面改紅磚。立體材質 `patternTex('brick'|'steel')`。
- **港區景物**：`TRACK`／`TRACK_SUM=31.2` 輕軌鐵道（在畫面上是水平線；`trackDist()`），`tram` 兩節輕軌來回開（狀態在 index.html，立體只讀）；`CRANES` 三座碼頭起重機（吊臂收起朝天，`walkableAt` 擋路）；`boats` 改成沿岸壁外側航道 `lane` 直線航行的貨櫃輪＋拖船（立體讀同一份狀態）；鐵道過運河處有鋼梁橋；運河上的橋改白色鋼拱橋；學院操場改露天舞台；樹 `isPalm()` 3/4 是棕櫚樹。
- **海邊生物**（使用者要求「海邊要有活力，有魚類、鳥類」）：`FISH` 8 個點不定時跳出水面＋水花（`stepFish`，立體 `buildFish3`），`GULLS` 9 隻海鷗在港口上空盤旋（立體 12 隻），起重機與繫船柱上停著會啄一下的海鷗（`perchBird`／`perch3`）。
- 場地改名：靈感草坪、提示詞看台、插畫碼頭；運河草坪、觀景台、倉庫運河、港邊輕軌。配色 CSS 變數與立體 `PAL` 都換成港區色。

## 配套
- localStorage 全部 `creatorTown*`（與創業島分開）；測試 hook `window.__creatorTown`。
- 跑馬燈（共用端點）、PWA（`creator-town-shell-v2`，圖示 PIL 自畫：紫粉漸層＋等角小島＋播放鍵泡泡）、`manual.html`（PART 2 創作者實用資訊：創作路線圖六階段、提示詞基本功、常用尺寸、版權與 AI 注意、常見的坑、一週練習）、使用警語、創作者資訊、訪客計數器 `page_id=m255525.creatortown`。
- 手冊「常用尺寸」是一般通用規格，已註明以平台官方為準；版權段落註明非法律意見。

## Port／測試
- port **8842**（`.claude/launch.json` 的 `creator-town`；上線前程式牆 `LOCAL_APPS` 有一筆 static 並通過 `--launchtest`，上線後已移除）。
- 驗證（2026-10-30，Playwright）：1366×800 平面、立體鳥瞰截圖正常；除了刻意連不上的 presence 外無 console 錯誤；375px 清單、抽屜、manual 無橫向溢出；27 個 `toolUrl` 全部 HTTP 200。

## 部署（2026-10-30 使用者同意上線）
- 網頁：公開 repo <https://github.com/M255525/creator-town>，GitHub Pages <https://m255525.github.io/creator-town/>（`master`、`.github/workflows/deploy-pages.yml`）。建公開 repo 被權限擋下，由使用者自己執行 `gh repo create ... --push` 加 `gh api .../pages -X POST -f build_type=workflow`；第一次 push 觸發的 Actions run 成功。
- 已用正式網址驗證：兩個小鎮分頁進房間 `ZZCT7Q` 互相看到（2 人）、聊天互通；同一時間創業島用同代碼進房只有 1 人（隔離正確）。
- 程式牆：從 `LOCAL_APPS` 移除、改加 `REPO_META`；github-dashboard `REPO_META` 同步補一行。

## 海的另一端：姊妹地圖互連（2026-10-30）
使用者要求「把創業島放到這個畫面，在海的另一端新增，點擊就切到創業島的網域；創業島也一樣新增一個創作者小鎮」。兩邊各有 `FAR = {sign, at, r, url, name, host, emoji}`：
- 平面：`drawFar()` 畫在 `L.far`（在 `L.boats` 之後、陸地之前，海上不會被蓋到），招牌 `farSign()` 畫在最上層 `L.farTop`（**放在陸地層會被蓋住**；外層 g 負責定位、內層 `.board-flag` 負責浮動，**CSS 動畫的 transform 會蓋掉 SVG transform 屬性**，踩過）。`farRoute()` 是從岸邊到小島的虛線航線；`islandBox()` 取景有把小島算進去。點擊／Enter → `goFar()`（寫足跡後同一分頁 `location.href` 切過去），滑過 `showFarTip()`。
- 立體：`buildFar()`（在 `buildLabels()` 之後）把小島網格標 `userData.id='__far'` 加進 `O.pick`，`farLabel()` 加一顆 `.tag3.board3` 名牌；pointermove／點擊判斷 `'__far'`。
- 兩邊的 `FAR.url` 寫死對方的 GitHub Pages 網址；改網址要兩個 repo 一起改。
- 創作者小鎮這邊：`FAR.at=[24.6,6.4]` 迷你創業島（沙灘、草地、兩棟小屋、燈塔、尖頂樹、小帆船），航線從 `[20.9,9.4]` 岸邊出發。

## 跨海大橋：走過去才換島（2026-10-30）
使用者要求「兩個島中間用橋連接，要到另一座島要透過橋走過去」「橋要有 3D」「走過去的角色與名字一樣」。
- `FAR` 多了 `self`（creator／startup）、`shape`（circle／square）、`bridge`（兩端格子座標）。虛線航線改成 `drawFarBridge()`（畫在 `L.far`，陸地端被岸邊蓋住）；立體 `buildFarBridge()`（橋面、欄杆、橋墩；小鎮版加兩道拱）。
- 走路：`walkableAt()` 開頭讓 `farBridgeDist()<.24` 的橋面與 `onFarIsland()` 的小島可以走；尋路格子 `WG.n` 120→136、碰撞格子 `FG.n` 376→426（涵蓋到 x、y≈30）。樹避開橋（`treeOK`）。立體 `standY()` 在橋面與小島回傳 `LAND+.1` 左右。
- 點小島／招牌／立體名牌 → `farGoClick()`：角色沿橋走過去（顯示「正在走過橋去…［直接前往］×」），走不過去才直接切換；鍵盤 Enter 仍直接 `goFar()`。`farTick()`（掛在 tick）偵測走進小島中心 → 顯示「到了…，切換中…」並立刻 `goFar()`（使用者要求「走到另外一個島時畫面就自動切換」，不倒數、不提供留下）。人物跟隨開著時，滑鼠停在小島上角色也會自己走過去。
- **角色延續**：`goFar()` 把 `{n, a, s}`（名字、動物、衣服色）放進網址 `?from=<self>&me=<JSON>`，同時寫進對面的角色存檔（兩站同網域 `m255525.github.io`）；對面載入時 `me=` 經 `cleanName`／`hasBadWord`／動物白名單／色碼檢查後套用，`from=` 讓角色出現在自己這邊橋頭（橋的陸地端往內 0.7 格），兩個參數用 `history.replaceState` 從網址拿掉。
- 驗證（Playwright，目標暫改本機）：小鎮起點規劃路線經過橋面直達小島、沿途每 0.05 格都可走；抵達後自動切到創業島，名字／熊貓／衣服色相同、角色在創業島橋頭、網址已清乾淨；創業島橋頭到迷你小鎮路線也全程可走。
- 已知：轉播站把座標夾在 -5..25，創業島那座迷你小鎮 x 最大約 27.9，站在小鎮島上時別人看到的位置會被夾在 25（反正幾秒內就會切站）。

## 一個瀏覽器只有一個角色在線上（2026-10-30）
使用者要求「系統之中不會同時出現兩個角色與名稱都一樣的角色，不會因為跨島產生同一個角色」。
- 同一分頁走橋換島：舊頁面 `pagehide` 立刻 `net.open=false`＋關連線，舊地圖上的角色馬上消失；從上一頁回來（bfcache `pageshow.persisted`）重新接手。
- 多分頁（同一島或兩座島各開一個）：兩站同網域，共用 localStorage `m255525IslandClaim`；每個分頁載入時寫入 `{tab, site, t}` 宣告「角色在我這」，其他分頁收到 `storage` 事件 → `pauseAvatar()`：`net.paused=true`、`net.open=false`、清掉其他人、關連線（`onclose` 見 `net.paused` 不重連）、請小幫手離開，畫面下方 `#dupCard`「你的角色正在另一個分頁（某島）上，這裡先暫停…［在這裡繼續］」；按下 `claimAvatar()` 搶回來，換對方暫停。`renderOnline()` 顯示「（已暫停：角色在另一個分頁）」。
- 驗證：本機兩分頁（小鎮＋創業島）互相暫停／接手；正式轉播站兩個小鎮分頁進房間 ZZDUP7，後開的分頁連上且人數 1、先開的自動斷線，無 console 錯誤（先前暫停時還在送位置，報「WebSocket is already in CLOSING」，已改成暫停當下先 `net.open=false`）。
- 範圍：只管同一個瀏覽器。不同裝置／瀏覽器的人剛好抽到同名同動物不在此限（轉播站各房間是獨立 Durable Object，跨島做不到全域唯一）。
