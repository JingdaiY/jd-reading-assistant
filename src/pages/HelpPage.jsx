import { REMIND_AFTER_DAYS, REMIND_AFTER_WORDS } from '../db/backupReminder'
import { FAMILIAR_STABILITY_DAYS, LEARN_AHEAD_MS } from '../srs'

const LEARN_AHEAD_MIN = LEARN_AHEAD_MS / 60000

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="font-serif text-xl font-semibold tracking-tight text-stone-900">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-stone-600">{children}</div>
    </section>
  )
}

function Table({ head, rows }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200/80 bg-white">
      <table className="w-full min-w-[28rem] text-left text-sm">
        <thead className="bg-stone-50 text-xs text-stone-400">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((c, j) => (
                <td key={j} className="px-4 py-3 align-top text-stone-600">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Kbd({ children }) {
  return (
    <kbd className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-sans text-xs text-stone-500">
      {children}
    </kbd>
  )
}

function Note({ children }) {
  return <p className="rounded-lg bg-stone-100/70 px-4 py-3 text-sm text-stone-600">{children}</p>
}

const TOC = [
  ['library', '书架与导入'],
  ['reading', '划词与标记'],
  ['mode', '查词模式'],
  ['highlights', '高亮颜色'],
  ['review', '每日复习'],
  ['vocab', '词汇库'],
  ['backup', '同步与备份'],
  ['mobile', 'iPhone / iPad'],
  ['shortcuts', '快捷键'],
]

export default function HelpPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 pt-10 pb-32 sm:px-6 sm:pt-16">
      <p className="text-xs font-medium tracking-widest text-stone-400 uppercase">Help</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-stone-900">帮助</h1>

      {/* 目录：用 scrollIntoView 而不是 #锚点，避免和 hash 路由冲突 */}
      <nav className="mt-6 flex flex-wrap gap-2">
        {TOC.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })}
            className="rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-12 space-y-14">
        <Section id="library" title="书架与导入">
          <p>
            阅读页左上角点「📚 书架 · 导入」进入书架，可以导入自己的阅读材料，点书名打开：
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-stone-800">粘贴文本</strong>：段落之间空一行；以 Chapter 1、Part Two 这类标题开头的段落会自动分章
            </li>
            <li>
              <strong className="text-stone-800">上传 TXT</strong>：自动把硬换行接回成段落，识别章节标题；Project Gutenberg 的 TXT 会自动去掉前后的版权声明
            </li>
            <li>
              <strong className="text-stone-800">上传 EPUB</strong>：支持 EPUB 2 和 EPUB 3，按章节阅读，读取书名和作者，书里的插图会显示在原来的位置（Kindle 的 AZW / MOBI 格式不支持）
            </li>
            <li>
              <strong className="text-stone-800">上传 PDF</strong>（最大 200 MB）：自动把 PDF 的文字整理成段落和章节（有书签目录时按书签分章），去掉页眉页脚和页码。阅读时点右上角「📄 原版页面」，可以看到当前这页对应的原始 PDF 页面（图片、图表、原始排版都在）。扫描版 PDF（内容是图片）暂不支持；双栏论文等复杂排版的整理效果可能不理想
            </li>
          </ul>
          <p>
            阅读页右上角可以切换<strong className="text-stone-800">阅读宽度</strong>（窄 / 标准 / 宽，手机上不显示）。小标题、列表、表格行、问答会自动用不同样式显示（粗体、缩进），方便一眼分清层次。有多个章节时，阅读页右上角可以选择章节。很长的章节会自动分页（每页约 1800 词），底部显示「第 x / n 页」，点「下一页」翻页，翻到最后一页时变成「下一章」；电脑上也可以按键盘
            <Kbd>←</Kbd> <Kbd>→</Kbd> 翻页。每本书会记住读到的章节、页码和位置。
          </p>
          <Note>
            文件在浏览器里解析，不经过任何服务器；PDF 和 EPUB 的原始文件会保存在本机（连接了 Google Drive 时也会存一份到你自己的 Drive）。Kindle 等受 DRM 保护的电子书无法导入；只支持没有 DRM 的 EPUB（例如 Project Gutenberg 的公版书），也可以复制段落后粘贴。暂不支持导入网页链接，可以复制网页正文后粘贴。
          </Note>
        </Section>

        <Section id="reading" title="划词与标记">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              在正文里<strong className="text-stone-800">双击单词</strong>，或<strong className="text-stone-800">拖选词组 / 句子</strong>
              ，选区上方会弹出翻译气泡。
            </li>
            <li>
              选区会<strong className="text-stone-800">自动吸附到完整单词</strong>：只选了半个词（如 <code>perspecti</code>
              ）会自动扩展成 <code>perspectives</code>，两端多选的空格和标点会被去掉，页面上的选中范围也会同步更新。只选中标点或空格时不会弹出气泡。
            </li>
            <li>
              点击气泡里的 <strong className="text-stone-800">Mark 标记生词</strong>
              ，这个词连同它所在的原句会存进生词本，正文里所有出现的地方都会高亮。
            </li>
            <li>
              <strong className="text-stone-800">单击已高亮的词</strong>直接弹出意思，不用重新划选。高亮的是词组（如 <code>a wealth of</code>
              ）时，单击其中任意位置查的是整个词组；想只查其中某个词，<strong className="text-stone-800">双击</strong>那个词或拖选它。
            </li>
            <li>
              <strong className="text-stone-800">在这里结束本次阅读</strong>：按住鼠标左键在正文上横着来回划两下以上（像涂掉一行字），会在最近的那一行下面画线，并问「在这里结束本次阅读？」。点「是」记下位置，下次打开这本书会自动跳到横线处。在横线那一行上<strong className="text-stone-800">双击</strong>取消横线（不查词）；其他地方双击照旧查词。每本书只有一条横线，调整阅读宽度、换设备后仍在同一句话那里。
            </li>
            <li>再次选中（或单击）已标记的词，按钮显示「已标记 ✓」，再点一次即可取消标记（有笔记时会先确认）。</li>
            <li>
              <strong className="text-stone-800">笔记</strong>：气泡里点「📝 添加笔记」，写这个词在这里的意思、例句、联想。还没标记的词，点 Mark 时和单词一起保存（Mark 就是保存）；已标记的词再次选中会显示「📝 我的笔记」，点「编辑」修改，改完点「保存」，点「取消」放弃修改。笔记会同步到其他设备，复习时卡片背面也会显示。
            </li>
            <li>
              点击空白处或按 <Kbd>Esc</Kbd> 关闭气泡。
            </li>
          </ol>
          <Note>释义来自哪里，取决于顶部「模式」的设置，见下一节。</Note>
        </Section>

        <Section id="mode" title="查词模式">
          <p>点击顶部导航的「模式」切换查词方式，旁边的小标签显示当前用的是哪种。</p>
          <Table
            head={['模式', '释义来源', '特点']}
            rows={[
              [
                <strong key="d" className="text-stone-800">常规辞典</strong>,
                '单词 / 词组：内置 ECDICT 英汉词典（5.8 万常用词）；词典里没有的词和整句：MyMemory 机器翻译',
                '免费、无需配置（默认）。查词典离线可用，能识别变形词（atrophies → 显示 atrophy 的释义）；不结合上下文，会列出所有词性的释义。机器翻译每天约 5000 字符免费额度',
              ],
              [
                <strong key="a" className="text-stone-800">AI Agent</strong>,
                '豆包 / OpenAI / Gemini（你自己选）',
                '把选中的词连同所在原句一起发给大模型，释义贴合语境，还会给出词根拆解。需要你自己的 API Key，按用量计费',
              ],
            ]}
          />
          <p>
            选择 AI Agent 后：选服务商 → 填 <strong className="text-stone-800">API Key</strong> 和{' '}
            <strong className="text-stone-800">模型</strong> → 点「测试连接」确认可用。设置自动保存，每家服务商的 Key 分开保存，切换时不会丢。没填完时「模式」上会有橙色小圆点。
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-stone-800">豆包</strong>：在火山方舟控制台创建 API Key，模型填控制台里的模型 ID 或推理接入点 ID（ep-…）。豆包出错时不允许浏览器读取错误详情，所以 Key 或模型填错时只会提示「无法读取豆包的返回」
            </li>
            <li>
              <strong className="text-stone-800">OpenAI</strong>：在 platform.openai.com 创建 Key，模型默认 gpt-4o-mini
            </li>
            <li>
              <strong className="text-stone-800">Gemini</strong>：在 Google AI Studio 创建 Key，模型默认 gemini-2.5-flash
            </li>
          </ul>
          <Note>
            API Key 只保存在当前浏览器（localStorage），请求从浏览器直接发给服务商，不经过任何服务器。建议使用单独的、设置了额度上限的 Key。
          </Note>
          <p className="text-sm text-stone-500">
            标记生词时会保存当时查到的释义；之后切换模式不会改变已保存的释义。在这次更新之前标记的词，释义是演示用的「Mock Translation」。
          </p>
        </Section>

        <Section id="highlights" title="高亮颜色">
          <p>正文里已标记的词会用两种颜色高亮，颜色代表这个词的复习状态：</p>
          <Table
            head={['高亮', '含义', '包含的状态']}
            rows={[
              [
                <mark key="n" className="hl-new">
                  ubiquitous
                </mark>,
                '新词：标记了，但还没复习过',
                '新词',
              ],
              [
                <mark key="r" className="hl-review">
                  ubiquitous
                </mark>,
                '已开始复习：复习进度由 FSRS 算法安排',
                '学习中 · 复习 · 重新学习',
              ],
            ]}
          />
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-stone-800">学习中</strong>：复习过，但还在短期学习步骤里（几分钟后会再考一次）
            </li>
            <li>
              <strong className="text-stone-800">复习</strong>：已进入长期复习，按天安排间隔
            </li>
            <li>
              <strong className="text-stone-800">重新学习</strong>：长期复习中某次按了「忘记」，正在重新学
            </li>
          </ul>
          <Note>
            紫色<strong>不代表已经掌握</strong>：一个刚忘掉、正在重新学习的词也是紫色。黄色的词说明还没开始复习，可以去「每日复习」过一遍。
          </Note>
          <p>
            <strong className="text-stone-800">记熟的词不再高亮</strong>：复习时连续记住、记忆稳定性达到 {FAMILIAR_STABILITY_DAYS}{' '}
            天的词（一路按「认识」大约在第 4 次复习后），正文里就不再高亮，避免满屏都是标记。它仍然在生词本里、仍然会按计划出现在每日复习里；如果之后复习时按了「忘记」，高亮会自动恢复。在词汇库里可以用「已熟悉」筛选查看这些词。
          </p>
          <p className="text-sm text-stone-500">
            高亮只匹配完全相同的词（忽略大小写），不识别词形变化：标记 <code>atrophy</code> 不会高亮 <code>atrophies</code>。
          </p>
        </Section>

        <Section id="review" title="每日复习">
          <p>
            点击顶部「每日复习」进入。角标数字是当前到期、待复习的词数。复习时间由 <strong className="text-stone-800">FSRS</strong>{' '}
            算法安排：在你快要忘、但还没忘的时候让你复习（目标是到期时有约 90% 的把握想起来）。
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>卡片正面：英文单词，以及它所在的原句（单词在句中高亮）。借助语境，回想它的中文意思（标记的是整句时，正面就是这句英文）。</li>
            <li>
              按 <Kbd>空格</Kbd> 翻开答案：中文释义、词性（有词根时也会显示）。
            </li>
            <li>按记忆程度评分，每个按钮下方会显示「选它的话，下次多久后复习」。</li>
          </ol>
          <Table
            head={['按钮', '意思', '效果']}
            rows={[
              [<span key="1" className="font-medium text-rose-700">忘记 <Kbd>1</Kbd></span>, '没想起来', '间隔重置为几分钟，本轮马上再考；长期复习中的词会进入「重新学习」，之后间隔从短重新开始涨'],
              [<span key="2" className="font-medium text-amber-700">模糊 <Kbd>2</Kbd></span>, '想起来了但很吃力', '算记住，间隔变长但比「认识」短，这个词被视为更难'],
              [<span key="3" className="font-medium text-emerald-700">认识 <Kbd>3</Kbd></span>, '顺利想起来', '正常推进，间隔明显拉长'],
            ]}
          />

          <h3 className="pt-2 text-sm font-semibold text-stone-800">为什么新词按了「认识」还会再出现一次？</h3>
          <p>
            新词要先走完短期学习步骤（1 分钟 → 10 分钟）。第一次按「认识」只通过了第一步，下次安排在 10 分钟后；因为不到{' '}
            {LEARN_AHEAD_MIN} 分钟，这张卡会排到本轮队尾再考一次。第二次按「认识」后，才进入长期复习（约 2 天后再见）。
          </p>

          <h3 className="pt-2 text-sm font-semibold text-stone-800">一直按「认识」，间隔会怎么变？</h3>
          <p>
            大约是 2 天 → 11 天 → 46 天 → 163 天 → 498 天，每次都比上次长很多。实际会有 ±几天的随机浮动，避免同一天加的词总是同时到期。
          </p>

          <h3 className="pt-2 text-sm font-semibold text-stone-800">晚了几天才来复习怎么办？</h3>
          <p>没关系。到期的词会一直等你；晚来了仍然记得，说明记得比预期牢，下次间隔反而会更长。</p>

          <Note>每次评分都会立即保存，中途离开不会丢进度。本轮队列在进入页面时生成，复习中途新到期的词下次进入时才会出现。</Note>
        </Section>

        <Section id="vocab" title="词汇库">
          <p>点击顶部导航「词汇库」（手机上是「词汇」），或 ⚙️ 里的「生词本 · N 个」，查看所有生词：</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-stone-800">搜索</strong>单词、释义或原句；按状态<strong className="text-stone-800">筛选</strong>
              （新词、学习中、复习、已到期、缺释义、疑似残缺）；按最近添加、字母顺序或下次复习时间<strong className="text-stone-800">排序</strong>
            </li>
            <li>点一个词展开详情：完整释义、词根、你的笔记（可以直接修改）、原句、出处、复习次数和遗忘次数；列表里也会显示笔记的第一行，搜索会搜笔记</li>
            <li>
              <strong className="text-stone-800">删除</strong>：复习进度会一起删除；连接了 Google Drive 时，其他设备上也会同步删除
            </li>
            <li>
              <strong className="text-stone-800">重新查询释义</strong>：用当前的查词模式重新查一次，只更新释义、音标、词性和词根，不影响复习进度
            </li>
            <li>
              <strong className="text-stone-800">疑似残缺</strong>：原句里找不到这个完整的单词（例如早期只选中了半个词就标记了 perspecti），建议删除后重新标记
            </li>
          </ul>
          <p>
            <strong className="text-stone-800">批量补全释义</strong>：有词没有释义，或者还是早期的演示数据「Mock Translation」时，页面顶部会出现提示，点「补全释义」用当前查词模式逐个重新查询，可以随时停止。AI 模式下每个词会调用一次 API，按用量计费。
          </p>
        </Section>

        <Section id="backup" title="同步与备份">
          <p>
            所有数据默认保存在<strong className="text-stone-800">当前浏览器</strong>
            里，刷新、关闭浏览器、重启电脑都不会丢；但换一台设备、换一个浏览器，或者清除浏览器数据后就看不到了。
          </p>
          <p>
            <strong className="text-stone-800">Google Drive 同步（推荐）</strong>：点右上角的云朵图标（或 ⚙️）→「连接 Google Drive」，用你自己的 Google 账号授权。云朵是绿色带勾表示已同步，橙色表示需要重新连接。生词本、复习进度和文章库会存到
            <strong className="text-stone-800">你自己 Drive 里的隐藏应用文件夹</strong>
            （在 Drive 里看不到，只有本应用能读写），在每台设备上连接同一个 Google 账号就会自动同步：打开应用时、标记 / 复习后约 3 秒、切回页面时。
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>按单词逐条合并：同一个词在两台设备上都改过时，最后修改的那份生效</li>
            <li>
              书按需下载：新设备上书架会列出所有书，标着「☁️ 云端」，打开哪本才下载哪本；本机只保留最近打开的 3 本书，更早的会自动清掉（云端还有，再打开时重新下载）。还没上传到云端的书不会被清掉
            </li>
            <li>在书架上删除一本书，云端的那份也会一起删除</li>
            <li>API Key 和查词模式不同步，每台设备单独设置</li>
            <li>授权约 1 小时过期，过期后 ⚙️ 上会出现小圆点，点「重新连接」即可</li>
            <li>「断开」只是停止同步，本机和 Drive 上的数据都会保留</li>
            <li>
              「查看云端数据」：显示云端和本机各有多少生词、文章，以及云端最后更新的时间，可以确认两边是否一致；也可以下载云端的原始文件。同步文件存在 Drive 的隐藏文件夹里，在 Google Drive 网页上看不到
            </li>
          </ul>
          <p>
            <strong className="text-stone-800">手动备份</strong>：⚙️ 里也可以「导出备份」（JSON 文件，包含生词、书架和本机上的书的正文；PDF / EPUB 原始文件太大，不放进备份）或「从备份导入」（同样按最后修改时间逐条合并）。没有连接 Google Drive 时，如果有未备份的生词，且距上次备份满{' '}
            {REMIND_AFTER_DAYS} 天、或未备份的词达到 {REMIND_AFTER_WORDS} 个，⚙️ 上会出现橙色小圆点提醒你备份。
          </p>
        </Section>

        <Section id="mobile" title="在 iPhone / iPad 上使用">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-stone-800">点按单词</strong>：直接查词，释义从屏幕底部弹出
            </li>
            <li>
              <strong className="text-stone-800">点按高亮</strong>：查整个高亮的词或词组；想查词组里的单个词，长按选中它
            </li>
            <li>
              <strong className="text-stone-800">长按并拖动选区</strong>：查词组或整句，松手约半秒后弹出
            </li>
            <li>
              <strong className="text-stone-800">手指横着来回划两下以上</strong>：画「结束阅读」横线；双击横线那一行取消
            </li>
            <li>点击正文空白处关闭释义卡片；如果单词被卡片挡住，页面会自动往上滚</li>
            <li>每日复习：点卡片任意位置翻开答案，再点「忘记 / 模糊 / 认识」</li>
          </ul>
          <p>
            <strong className="text-stone-800">添加到主屏幕</strong>：用 Safari 打开本网站 → 点底部的「分享」按钮 → 「添加到主屏幕」。之后从桌面图标打开，会像 App 一样全屏显示。
          </p>
          <Note>
            iOS 上 Safari 和主屏幕 App 的数据是分开的：在 Safari 里标记的词，从主屏幕图标打开时看不到。建议一开始就固定从主屏幕图标打开使用。要在电脑和手机之间同步，在每台设备上都连接同一个 Google Drive 即可（见上一节）。
          </Note>
        </Section>

        <Section id="shortcuts" title="快捷键">
          <Table
            head={['位置', '按键', '作用']}
            rows={[
              ['阅读', <Kbd key="a">Esc</Kbd>, '关闭翻译气泡'],
              [
                '阅读',
                <span key="p" className="space-x-1">
                  <Kbd>←</Kbd>
                  <Kbd>→</Kbd>
                </span>,
                '上一页 / 下一页（到章节边界时跨到上一章 / 下一章）',
              ],
              ['每日复习', <Kbd key="b">空格</Kbd>, '显示答案（回车也可以）'],
              [
                '每日复习',
                <span key="c" className="space-x-1">
                  <Kbd>1</Kbd>
                  <Kbd>2</Kbd>
                  <Kbd>3</Kbd>
                </span>,
                '忘记 / 模糊 / 认识',
              ],
              ['⚙️ 菜单', <Kbd key="d">Esc</Kbd>, '关闭菜单'],
            ]}
          />
        </Section>
      </div>
    </main>
  )
}
