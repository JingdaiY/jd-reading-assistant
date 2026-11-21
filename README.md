# JD Reading Assistant

本地优先（Local-first）的沉浸式英语阅读辅助工具：划词翻译、生词本、基于上下文的间隔重复（SRS）复习。

- **纯前端，无后端**：所有数据存在浏览器 IndexedDB（Dexie.js）里
- **BYOK（Bring Your Own Key）**：AI 模式下用户自带大模型 API Key（豆包 / OpenAI / Gemini），浏览器直连服务商；也可以用免费的常规辞典模式
- **极简阅读体验**：Notion / Medium 风格单列排版，划词弹出悬浮气泡

## 快速开始

需要 Node.js 20+。

```bash
npm install
npm run dev       # 启动开发服务器，固定 http://localhost:5173 ，改代码自动热更新
```

其他命令：

```bash
npm run lint      # 代码检查（oxlint）
npm run build     # 打包生产版本到 dist/（发布时才需要）
npm run preview   # 本地预览打包结果
```

## 使用方法

> 应用内也有完整的使用说明：点击顶部导航「**帮助**」（`#/help`）。

1. 在正文里**双击单词**或**拖选词组 / 句子**，选区上方会弹出翻译气泡（上方空间不够时自动显示在下方）
   - 选区会**自动吸附到完整单词**：只选了半个词（`perspecti`）会扩展成 `perspectives`；两端多选的空格和标点会被去掉（`skill.` → `skill`）；只选中标点 / 空格时不弹气泡。撇号夹在字母中间时算单词的一部分（`it's`），连字符算边界（`well-chosen` 里可以单独选 `chosen`）
2. 点击气泡里的 **Mark 标记生词**，该词连同所在原句存入本地生词本，正文里所有出现处都会高亮
3. 再次划选已标记的词，按钮显示「已标记 ✓」，再点一次即可取消标记
4. 点击空白处、按 `Esc` 或缩放窗口关闭气泡

高亮颜色：🟨 暖黄 = 新词（还没复习过）；🟪 淡紫 = 已开始复习（学习中 / 复习 / 重新学习）。
高亮只匹配完全相同的词（忽略大小写），不识别词形变化（标记 `atrophy` 不会高亮 `atrophies`）。

### 书架与导入

阅读页左上角「📚 书架 · 导入」按钮（`#/library`）；书架还是空的时候，示例文章末尾也有一张导入提示卡片：

- **粘贴文本**：段落之间空一行；`Chapter 1`、`Part Two` 这类标题开头的段落自动分章
- **上传 TXT**：自动把硬换行接回成段落、识别章节标题；Project Gutenberg 的 TXT 会自动去掉前后的版权声明；没有章节又很长的文本自动按 60 段分成若干部分
- **上传 EPUB**：按 spine 顺序提取各章正文，读取书名和作者；**受 DRM 保护的 EPUB 会提示无法导入**（Kindle 电子书都带 DRM）
- 多章节时右上角可选章节、底部上一章 / 下一章；每本书记住读到的章节和章内位置
- 文件只在浏览器里解析，不上传；EPUB 解析用 JSZip（按需加载）
- 暂不支持导入网页链接（浏览器不能跨域抓取其他网站，需要后端代理），可以复制正文后粘贴

### 在 iPhone / iPad 上使用

- **点按单词**直接查词；**长按拖动**选词组 / 句子，停手约 0.4 秒后弹出。触屏上释义从**底部弹出卡片**（避开 iOS 自带的「拷贝 / 查询」菜单），单词被卡片挡住时页面自动上滚
- 每日复习：点卡片任意位置翻面；触屏设备上不显示键盘快捷键提示
- 支持「**添加到主屏幕**」（PWA）：Safari → 分享 → 添加到主屏幕，之后全屏打开
- iOS 上 **Safari 和主屏幕 App 的数据互相独立**，建议固定从主屏幕图标打开；设备之间用 Google Drive 同步（见下文）

### 查词模式

点击顶部导航「**模式**」切换（旁边小标签显示当前模式）：

| 模式 | 释义来源 | 说明 |
|---|---|---|
| **常规辞典**（默认） | 单词 / 词组：内置 [ECDICT](https://github.com/skywind3000/ECDICT) 英汉词典；词典里没有的词和整句：MyMemory 机器翻译 | 免费，无需配置。词典离线可用、能识别变形词（`atrophies` → `atrophy`），每行一个词性的释义；不结合上下文。MyMemory 匿名每天约 5000 字符额度 |
| **AI Agent** | 豆包 / OpenAI / Gemini | 选中内容 + 所在原句一起发给模型，返回贴合语境的释义、词性、音标、词根（严格 JSON）。需要自己的 API Key |

AI Agent 设置：选服务商 → 填 API Key 和模型 → 「测试连接」。设置自动保存在 localStorage（`jdra.settings`），每家服务商的 Key / 模型分开存。默认模型：OpenAI `gpt-4o-mini`、Gemini `gemini-2.5-flash`；豆包没有默认值，需要填火山方舟的模型 ID 或接入点 ID（`ep-…`）。

划词气泡：查询中显示骨架屏（此时 Mark 按钮不可用），出错时显示原因，底部显示释义来源（辞典 / 豆包 / OpenAI / Gemini）。同一模式下重复查同一个词会命中内存缓存，不重复请求。

### 每日复习

点击顶部导航「**每日复习**」（或访问 `#/review`），黑色角标是当前到期待复习的词数（每 30 秒自动刷新）。

1. **正面**：英文单词 + 它所在的原句（单词在句中高亮），借助语境**回想中文意思**（英译中，练的是阅读理解）。标记的是整句时，正面就是这句英文
2. 按 **空格**（或点「显示答案」）翻开：中文释义、词性、词根（如果有）、出处
3. 按自己的记忆程度评分，每个按钮下面会显示「选它的话，下次多久后复习」：

| 按钮 | 快捷键 | FSRS 评分 | 新词时的下次复习 |
|---|---|---|---|
| 忘记 | `1` | Again | 1 分钟 |
| 模糊 | `2` | Hard | 6 分钟 |
| 认识 | `3` | Good | 10 分钟 |

- 评分后下次到期在 **20 分钟内**（学习阶段的短间隔），这张卡会排到队尾，**本轮再出现一次**；否则本轮完成。所以新词一般要连续「认识」两次，才会进入以「天」为单位的长期复习
- 每次评分都立即写回 IndexedDB，中途离开不会丢进度
- 本轮的复习队列在进入页面时生成，复习过程中新到期的词，下次进入时才会出现

### Google Drive 同步

导航栏右上角的**云朵图标**（或 ⚙️）→「连接 Google Drive」。云朵图标显示同步状态：灰色 = 未连接，绿色带勾 = 已同步，橙色带感叹号 = 授权过期或出错。每个用户用**自己的 Google 账号**授权，生词（含复习进度、删除记录）和文章库存到**他自己 Drive 的应用隐藏文件夹**（`appDataFolder`，文件名 `jd-reading-sync.json`；在 Drive 里看不到，只有本应用能读写）。网站不经手任何人的数据，请求从浏览器直接发给 Google。

- **授权**：Google Identity Services 的 token 模式（纯前端），权限只有 `drive.appdata`。access token 约 1 小时过期，存在 localStorage（`jdra.googleToken`）；过期后 ⚙️ 上出现小圆点，点「重新连接」
- **何时同步**：打开应用时、本地数据变化后 3 秒（连续操作合并为一次）、切回页面时（距上次 30 秒以上）、手动「立即同步」
- **合并规则**（`src/sync/merge.js`，备份导入也用这套）：逐条合并，生词按小写单词匹配、文章按 id 匹配；两边都有时 `updatedAt` 更新的那份胜出；删除是软删除（`deletedAt`），删除记录也会同步
- **不同步**：API Key、查词模式等设置（每台设备单独设置）
- 「断开」会撤销授权，本机和 Drive 上的数据都保留
- Google Cloud 项目目前是**测试模式**：只有在 Google Cloud 后台「测试用户」名单里的账号能授权（最多 100 个）。要开放给所有人，需要发布应用并完成基础验证（隐私政策、首页、域名验证）
- OAuth Client ID 写在 `src/sync/google.js`（Client ID 是公开信息）；已授权的 JavaScript 来源：线上域名和 `http://localhost:5173`

### 手动备份（JSON）

点击右上角 ⚙️：

- **导出备份**：下载 `jd-reading-words-YYYY-MM-DD.json`，包含全部生词（含复习进度）和文章库
- **从备份导入**：按和 Drive 同步相同的规则逐条合并（较新的胜出），文件里缺失的字段自动补默认值；兼容旧版（v1，只有生词）的备份文件

**备份提醒**（只在没连接 Google Drive 时显示）：有未备份的生词，并且满足下面任一条件时，⚙️ 右上角会出现橙色小圆点，菜单里也会显示「有 N 个生词还没备份」：

- 距离上次备份已满 **7 天**（从未备份过时，从最早那个生词的创建时间算起）
- 未备份的生词达到 **20 个**

「未备份的生词」指上次备份之后新加的词。导出后提醒立即消失。导入备份时，也会把备份文件的导出时间记为"上次备份"，所以在新浏览器里恢复备份后不会马上被提醒。上次备份时间存在 localStorage（`jdra.lastBackupAt`）。阈值可在 `src/db/backupReminder.js` 里修改。

### 数据存在哪？会丢吗？

日常数据存在浏览器 IndexedDB 中，刷新、重启 dev server、关闭浏览器、重启电脑都**不会丢**。IndexedDB 存在磁盘上、异步读写，几千上万个生词也只有几 MB，不会影响浏览器性能。

以下情况会丢失或"看不到"，建议连接 Google Drive 同步，或定期导出备份：

- 清除浏览器数据 / 站点数据、使用无痕模式
- 换浏览器（每个浏览器各存各的）
- **端口变了**：数据按「域名 + 端口」隔离，`localhost:5173` 和 `localhost:5174` 是两个独立的数据库。为此 `vite.config.js` 已把开发端口固定为 **5173**（`strictPort`）：端口被占用时 `npm run dev` 会直接报错，而不是悄悄换端口。遇到报错先关掉占用 5173 的旧进程（通常是另一个没关的 dev server）
- Safari 会清理 7 天未访问网站的存储

## 部署（Vercel）

纯静态网站，可以免费部署到 Vercel：用 GitHub 账号登录 [vercel.com](https://vercel.com) → Add New Project → 导入 `jd-reading-assistant` 仓库 → Deploy。Vercel 会自动识别 Vite（构建命令 `npm run build`，输出目录 `dist`），无需任何配置；页面切换用 hash 路由（`#/review`），不需要配置重写规则。之后每次推送到 GitHub 都会自动重新部署。

> 项目根目录的 `.npmrc` 把 npm 源固定为公共源 `registry.npmjs.org`（覆盖本机的全局配置），保证 `package-lock.json` 里只有公共地址——lockfile 里如果出现私有镜像源的地址，Vercel 安装依赖时会报 `E401 Incorrect or missing password`。

部署只上传网页文件，**生词本和 API Key 仍然只保存在各自设备的浏览器里**。注意：`*.vercel.app` 默认域名在中国大陆访问不稳定，OpenAI / Gemini 接口在中国大陆也无法访问。

## 开发进度

按架构设计文档 V3 的 MVP 路线图推进：

**阶段一：查词与翻译**
- [x] 基础阅读页面（硬编码文本）
- [x] 鼠标划词捕获（Selection API）+ 悬浮气泡
- [x] API Key 设置（放在顶部「模式」菜单里，存 localStorage）
- [x] 调用 AI API 获取语境翻译（豆包 / OpenAI / Gemini，严格 JSON）
- [x] 常规辞典模式：免费词典 + 翻译接口（设计文档外新增）

**阶段二：本地记忆与高亮**
- [x] 气泡 [Mark] 按钮（支持取消标记）
- [x] Dexie.js 持久化生词（含上下文原句）
- [x] mark.js 高亮已保存词汇，新词 / 复习中词区分颜色
- [x] 生词本 JSON 导出 / 导入备份（设计文档外新增）
- [x] 备份提醒：超过 7 天或 20 个新词未备份时提示（设计文档外新增）

**阶段三：每日复习室**
- [x] 独立复习页面（hash 路由 `#/review`）+ 导航栏待复习角标
- [x] 查询 `due <= 现在` 的单词
- [x] 复习卡片：英文单词 + 原句语境 → 回想中文意思（设计文档写的是「原句挖空或提示卡片」，改为英译中，更贴合阅读场景）
- [x] 接入 ts-fsrs，根据反馈（忘记 / 模糊 / 认识）更新调度参数并回写数据库
- [x] 应用内「帮助」页：使用说明、高亮颜色含义、复习按钮逻辑、备份、快捷键（设计文档外新增）
- [x] iPhone / iPad 适配：PWA（manifest、图标、全屏）、点按查词、触屏长按选词、底部释义卡片、窄屏导航栏、触屏复习（设计文档外新增，**尚未在真机上测试**）
- [x] 书架与导入：粘贴文本、TXT、EPUB（检测 DRM）、按章节阅读、阅读进度（设计文档外新增）
- [x] Google Drive 同步：每个用户存到自己 Drive 的应用隐藏文件夹，逐条合并（设计文档外新增，**尚未用真实 Google 账号测试**）
- [ ] 导入网页链接（需要后端代理，暂不做）
- [ ] 复习记录（review log）：暂未保存，以后要用 FSRS 优化器训练个人参数、或做复习统计时再加

## 技术栈

| 模块 | 技术 |
|---|---|
| 框架 / 构建 | React 19 + Vite |
| 样式 | TailwindCSS v4（无 `tailwind.config.js`，主题写在 `src/index.css` 的 `@theme` 中） |
| 本地数据库 | Dexie.js（IndexedDB）+ dexie-react-hooks |
| 高亮 | mark.js |
| 间隔重复 | ts-fsrs v5（FSRS 算法，开启 fuzz） |
| 电子书解析 | JSZip（EPUB 解压，按需加载）+ 浏览器自带 DOMParser |
| 云同步 | Google Identity Services（token 模式）+ Google Drive API v3（appDataFolder） |
| 路由 | 自写的 hash 路由（无依赖，静态托管无需配置重写） |
| AI 翻译 | 豆包（火山方舟）/ OpenAI / Gemini，BYOK，浏览器直连 |
| 免费词典 | ECDICT 常用词版（内置，MIT）+ MyMemory 机器翻译（兜底） |

## 项目结构

```
src/
├── App.jsx                      # 页面组装：导航栏 + 路由；订阅生词本和待复习数
├── main.jsx                     # 入口
├── index.css                    # Tailwind 入口、主题（字体/配色/动画）、高亮样式
├── components/
│   ├── Navbar.jsx               # 吸顶导航栏：Logo、帮助 / 阅读 / 每日复习（角标）/ 模式、☁️ 同步状态、⚙️ 菜单（Drive 同步、备份）
│   ├── ModeMenu.jsx             # 「模式」菜单：常规辞典 / AI Agent、服务商、API Key、模型、测试连接
│   ├── Reader.jsx               # max-w-2xl 居中的衬线排版阅读区；章节选择、上一章 / 下一章
│   └── SelectionTooltip.jsx     # 划词气泡：鼠标用浮动气泡（定位计算），触屏用底部弹出卡片
├── pages/
│   ├── ReaderPage.jsx           # 阅读页：当前文章 / 章节 + 划词气泡 + 高亮 + 阅读进度
│   ├── LibraryPage.jsx          # 书架：文章列表、粘贴 / 上传导入、删除
│   ├── ReviewPage.jsx           # 复习室：复习队列、英译中卡片、评分、快捷键
│   └── HelpPage.jsx             # 帮助文档（阈值数字直接引用代码常量，避免与实际行为不一致）
├── hooks/
│   ├── useTextSelection.js      # 划词：鼠标 mouseup / 触屏 selectionchange + 点按查词；吸附完整单词、坐标、原句
│   ├── useHighlights.js         # 根据生词本用 mark.js 高亮正文
│   ├── usePopover.js            # 下拉浮层：点外部 / Esc 关闭
│   ├── useHashRoute.js          # 极简 hash 路由
│   └── useNow.js                # 定时刷新的当前时间
├── srs/
│   └── index.js                 # ts-fsrs 封装：记录 ↔ Card 转换、评分、间隔预览
├── db/
│   ├── index.js                 # Dexie 数据库（v2）、生词增删（软删除）、查询到期词、写回复习结果
│   ├── articles.js              # 文章库：增删、阅读进度、当前文章、内置示例文章
│   ├── backup.js                # JSON 导出 / 导入（生词 + 文章库，逐条合并）
│   └── backupReminder.js        # 备份提醒：上次备份时间、是否需要提醒
├── services/
│   ├── importer.js              # 导入解析：粘贴文本 / TXT / EPUB → 章节和段落
│   ├── translate.js             # 查词入口：按模式分发、结果缓存、useLookup hook
│   ├── dictionary.js            # 常规辞典：ECDICT 内置词典（懒加载 + 词形还原）+ MyMemory 兜底（候选筛选）
│   └── ai.js                    # AI Agent：豆包 / OpenAI / Gemini 请求、JSON 解析、错误提示
├── sync/
│   ├── index.js                 # 同步流程（下载 → 合并 → 写本地 → 上传）、自动同步、状态
│   ├── google.js                # Google 授权（GIS）+ Drive 接口；OAuth Client ID
│   ├── merge.js                 # 逐条合并规则（Drive 同步和备份导入共用）
│   └── events.js                # 本地数据变化通知（触发自动同步）
├── settings/
│   └── index.js                 # 查词模式设置（localStorage）+ useSettings
└── data/
    └── sampleArticle.js         # 硬编码测试文章

public/
├── manifest.webmanifest         # PWA 清单（添加到主屏幕后的名称、图标、全屏）
├── favicon.svg
└── icons/                       # 主屏幕图标（apple-touch-icon 180、192、512、maskable 512）

public/dict/
├── ecdict-common.json           # 内置英汉词典（4.7 MB，gzip 后约 1.7 MB），由 scripts/build-dict.py 生成
└── LICENSE-ECDICT.txt           # ECDICT 的 MIT 许可

scripts/
└── build-dict.py                # 从 ECDICT 完整版生成常用词词典（用法见文件头注释）
```

### 内置词典

数据来自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT 许可，作者 Linwei）。收录规则：有中文释义，并且带考试标签（中考 / 高考 / 四六级 / 考研 / 托福 / 雅思 / GRE）或 BNC / 当代语料库词频前 5 万，共 57,841 词，另有 32,499 个变形词（复数、过去式、比较级等）映射到原形。阅读页打开时在后台预加载，之后由浏览器缓存。

重新生成：

```bash
curl -L -o ecdict.csv https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv   # 约 66 MB
python3 scripts/build-dict.py ecdict.csv public/dict/ecdict-common.json
```

## 数据结构

IndexedDB 数据库 `jd-reading-assistant`（Dexie schema v2），两张表：`words`（索引：`id, word, due, state, createdAt, updatedAt`）和 `articles`（索引：`id, updatedAt`）。

生词 `words`：

```js
{
  id: "uuid",
  word: "ubiquitous",
  translation: "无处不在的",
  context: "Smartphones have become ubiquitous in our daily lives, ...", // 所在原句
  phonetic: "/juːˈbɪk.wə.təs/",  // 音标（查词时拿到才有）
  pos: "adj.",
  etymology: null,
  source: "The Quiet Power of Deep Reading",  // 文章标题
  createdAt: "2026-11-19T07:03:09.281Z",

  // ts-fsrs 调度参数（设计文档定义的 5 个）
  due: "2026-11-19T07:03:09.281Z",  // 下次到期时间；新词保存即到期
  state: 0,        // 0 New, 1 Learning, 2 Review, 3 Relearning
  repetition: 0,   // 复习次数（对应 FSRS 的 reps）
  stability: 0,
  difficulty: 0,

  // 阶段三补充：FSRS 准确调度还需要的字段（设计文档外新增）
  lapses: 0,          // 遗忘次数
  lastReview: null,   // 上次复习时间
  learningSteps: 0,   // 当前处于第几个学习步骤
  scheduledDays: 0,
  elapsedDays: 0,

  // v2：多设备同步
  updatedAt: "2026-11-19T07:03:09.281Z", // 最后修改时间（标记、复习、删除都会更新），同步时较新的胜出
  deletedAt: null,                        // 取消标记时设为删除时间（软删除），所有查询都会过滤掉
}
```

文章 `articles`：

```js
{
  id: "uuid",
  title: "The Little Test Book",
  author: "Jane Author",            // EPUB 才有
  kind: "epub",                     // paste / txt / epub
  chapters: [{ title: "Chapter One", paragraphs: ["...", "..."] }],
  progress: { chapter: 1, ratio: 0.42 }, // 读到第几章（从 0 开始）、章内滚动位置
  createdAt, updatedAt, deletedAt,  // 删除时清空 chapters，只留删除记录
}
```

内置示例文章不存数据库（id 为 `sample`），不参与同步。当前打开的文章存在 localStorage（`jdra.currentArticle`），每台设备各自记。

阶段三之前创建的旧记录没有这 5 个补充字段，读取时会自动补默认值，可以正常复习。v1 数据库升级到 v2 时，会给旧记录补上 `updatedAt`（取上次复习时间或创建时间）和 `deletedAt: null`。

同一个词忽略大小写去重。调试时可在浏览器 DevTools → Application → IndexedDB 中查看 / 删除数据。

备份文件格式：

```js
{
  "app": "jd-reading-assistant",
  "version": 2,                       // v1 只有 words
  "exportedAt": "2026-11-18T23:10:00.000Z",
  "count": 2,
  "words": [ /* 生词记录（不含已删除的） */ ],
  "articles": [ /* 文章记录 */ ]
}
```

导入时也接受直接是生词数组的 JSON。

## 已知限制

- mark.js 会直接修改 DOM；切换文章 / 章节时用 key 让整个 `<article>` 重新挂载，避免和 React 冲突
- 不连接 Google Drive 时只能手动导出备份（纯前端无法在后台写本地文件），只能靠提醒
- Google Drive 同步只用模拟的 Google 接口测过（两台设备合并、删除同步、授权过期、401），还没用真实 Google 账号验证；iPhone 主屏幕 App 里 Google 授权弹窗能否正常工作需要真机确认
- 同步是“最后修改的胜出”：同一个词在两台设备上离线各复习了一次，只会保留后同步的那次；同步文件是一个完整 JSON，书很多时上传会变慢
- 生词出处只记录文章标题，删除文章后生词仍保留
- 备份提醒只统计"新增"的词；取消标记（删除）不算作需要备份的变更
- 高亮不识别词形变化；生词很多时，每次增删都要重新全文匹配一遍，是潜在的性能瓶颈
- 常规辞典不结合上下文，会列出所有词性的释义，需要自己判断是哪个意思（例如 `atrophies` 在原句里是动词，ECDICT 只收了名词义）
- 内置词典只有 5.8 万常用词；之外的词走 MyMemory，它的单词翻译来自网友提交的翻译记忆，质量不稳定（已过滤掉整句、乱码等明显错误的候选），气泡里会标注「机器翻译」；MyMemory 免费额度用完后当天无法翻译
- 豆包（火山方舟）出错时的响应不带跨域头，浏览器读不到错误详情，只能提示「无法读取豆包的返回」
- AI 模式的默认模型名（`gpt-4o-mini`、`gemini-2.5-flash`）没有用真实 Key 验证过，服务商下线模型后需要手动改
- API Key 明文存在 localStorage，页面里任何脚本都能读到。个人本地使用风险低；公开部署时请用设置了额度上限的 Key
- 这次更新前标记的词，释义仍是演示用的「Mock Translation」，需要取消标记后重新标记
- iPhone / iPad 适配只在 Chrome 的设备模拟里测过，还没在真机 Safari 上验证（长按选词、iOS 菜单与卡片的配合、导出 / 导入文件）
- 还没有 Service Worker：添加到主屏幕后仍需联网才能打开（内置词典加载过一次后由浏览器缓存）
