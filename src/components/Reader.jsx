/**
 * 底部翻页：一章内有多页时翻页；翻到一章的第一页 / 最后一页时，按钮变成上一章 / 下一章。
 * nav = { prev, next, prevLabel, nextLabel, label }，由 ReaderPage 计算
 */
function PageNav({ nav, onPrev, onNext }) {
  if (!nav.prev && !nav.next) return null
  const btn =
    'rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent'
  return (
    <nav className="mt-16 flex items-center justify-between gap-3 border-t border-stone-200/70 pt-6">
      <button type="button" className={btn} disabled={!nav.prev} onClick={onPrev}>
        ‹ {nav.prevLabel}
      </button>
      <span className="text-center text-xs text-stone-400">{nav.label}</span>
      <button type="button" className={btn} disabled={!nav.next} onClick={onNext}>
        {nav.nextLabel} ›
      </button>
    </nav>
  )
}

import { READER_WIDTHS, updateSettings, useSettings } from '../settings'
import { classifyParagraph } from '../utils/paragraphStyle'

/**
 * 一段正文：按分类显示不同样式（小标题、列表、表格行、问答）。
 * 各部分拼起来就是原文，划词 / 原句 / 高亮都不受影响
 */
function Paragraph({ text, pi }) {
  const { kind, marker, label, body } = classifyParagraph(text)
  const strong = 'font-semibold text-stone-900'
  if (kind === 'heading') {
    return <h3 data-pi={pi} className="pt-4 font-sans text-[1.0625rem] leading-snug font-semibold tracking-tight text-stone-900">{body}</h3>
  }
  if (kind === 'question') {
    return (
      <p data-pi={pi} className={`border-l-2 border-stone-300 pl-4 ${strong}`}>
        <span className="text-stone-400">{marker}</span>
        {body}
      </p>
    )
  }
  if (kind === 'numbered' || kind === 'bullet') {
    return (
      // 列表项：缩进，编号 / 圆点挂在左边；开头的“小标题:”加粗
      // 编号：原文里的“1. ”本身挂在左边；圆点：用 CSS 画“•”（伪元素不算文字），原文的“- ”隐藏
      <p data-pi={pi} className={`relative pl-7 ${kind === 'bullet' ? "before:absolute before:left-1 before:text-stone-400 before:content-['•']" : ''}`}>
        <span className={kind === 'bullet' ? 'hidden' : 'absolute left-0 font-sans text-[0.9em] text-stone-400'}>{marker}</span>
        {label && <strong className={strong}>{label}</strong>}
        {body}
      </p>
    )
  }
  if (kind === 'labeled' || kind === 'answer') {
    return (
      <p data-pi={pi}>
        <strong className={strong}>{label}</strong>
        {body}
      </p>
    )
  }
  return <p data-pi={pi}>{text}</p>
}

/** 阅读区宽度切换（窄 / 标准 / 宽），只在电脑 / 平板上显示 */
function WidthSwitch() {
  const { readerWidth } = useSettings()
  return (
    <div className="hidden items-center rounded-full border border-stone-200 bg-white p-0.5 shadow-sm sm:flex" role="group" aria-label="阅读宽度">
      {Object.entries(READER_WIDTHS).map(([id, w]) => (
        <button
          key={id}
          type="button"
          aria-pressed={readerWidth === id}
          title={`阅读宽度：${w.label}`}
          onClick={() => updateSettings({ readerWidth: id })}
          className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
            readerWidth === id ? 'bg-ink text-white' : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          {w.label}
        </button>
      ))}
    </div>
  )
}

/** EPUB 插图：图片还没取出来时显示占位框；原始文件拿不到时显示图片说明 */
function Figure({ item, url, error, pi }) {
  if (url) {
    return (
      <figure data-pi={pi} className="my-2">
        <img src={url} alt={item.alt} className="mx-auto max-h-[70vh] max-w-full rounded" />
        {item.alt && <figcaption className="mt-2 text-center font-sans text-xs text-stone-400">{item.alt}</figcaption>}
      </figure>
    )
  }
  return (
    <figure data-pi={pi} className="my-2 rounded-lg border border-dashed border-stone-300 px-4 py-6 text-center font-sans text-xs text-stone-400">
      {error ? `插图暂时无法显示：${error}` : '正在加载插图…'}
      {item.alt && <div className="mt-1">{item.alt}</div>}
    </figure>
  )
}

/** 示例文章末尾的提示：还没导入过自己的材料时，引导去书架导入 */
function ImportHint() {
  return (
    <a
      href="#/library"
      className="mt-16 block rounded-xl border border-dashed border-stone-300 bg-white/60 p-5 transition-colors hover:border-stone-400 hover:bg-white"
    >
      <p className="font-medium text-stone-800">想读自己的文章或电子书？</p>
      <p className="mt-1 text-sm leading-relaxed text-stone-500">
        去书架粘贴英文文本，或上传 TXT / EPUB 文件（没有 DRM 的电子书）。导入后同样可以划词查询、标记生词。
      </p>
      <p className="mt-3 text-sm font-medium text-stone-700">打开书架 ›</p>
    </a>
  )
}

export default function Reader({
  article,
  chapter,
  page,
  paragraphs,
  paragraphOffset = 0,
  pageCount,
  nav,
  onChapterChange,
  onPrev,
  onNext,
  showImportHint,
  images,
  onOpenOriginal,
  openingOriginal,
  ref,
}) {
  const { readerWidth } = useSettings()
  const widthClass = (READER_WIDTHS[readerWidth] ?? READER_WIDTHS.standard).className
  const current = article.chapters[chapter] ?? article.chapters[0]
  const total = article.chapters.length
  const isBook = total > 1
  // 书：大标题显示章节名，上方小字显示书名；单篇文章：大标题就是文章标题
  const heading = isBook ? current.title || `第 ${chapter + 1} 节` : article.title
  const meta = article.meta ?? [article.author, isBook && article.title].filter(Boolean).join(' · ')

  return (
    <main className={`mx-auto px-5 pt-6 pb-40 sm:px-6 sm:pt-10 sm:pb-32 ${widthClass}`}>
      <div className="mb-8 flex flex-wrap items-center gap-2 sm:mb-12 sm:gap-3">
        <a
          href="#/library"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 shadow-sm transition-colors hover:bg-stone-100 hover:text-stone-900"
        >
          <span aria-hidden>📚</span> 书架 · 导入
        </a>
        {onOpenOriginal && (
          // PDF：查看当前这一页正文对应的原版页面（图片、图表、原始排版）
          <button
            type="button"
            onClick={onOpenOriginal}
            disabled={openingOriginal}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 shadow-sm transition-colors hover:bg-stone-100 disabled:opacity-50"
          >
            <span aria-hidden>📄</span> {openingOriginal ? '正在打开…' : '原版页面'}
          </button>
        )}
        {/* 右侧：宽度切换 + 章节选择；min-w-0 让章节下拉框在空间不够时缩短，而不是把整行挤到下一行 */}
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <WidthSwitch />
        {isBook && (
          <select
            aria-label="选择章节"
            value={chapter}
            onChange={(e) => onChapterChange(Number(e.target.value))}
            className="w-full max-w-[14rem] min-w-0 truncate rounded-md border border-stone-200 bg-white px-2 py-1 text-base text-stone-600 sm:w-auto sm:max-w-[18rem] sm:text-sm"
          >
            {article.chapters.map((c, i) => (
              <option key={i} value={i}>
                {i + 1}. {c.title || `第 ${i + 1} 节`}
              </option>
            ))}
          </select>
        )}
        </div>
      </div>

      {meta && <p className="text-xs font-medium tracking-widest text-stone-400 uppercase">{meta}</p>}
      {pageCount > 1 && page > 0 && (
        // 翻到第 2 页以后，标题上方提示当前页码
        <p className="mt-1 text-xs text-stone-400">
          第 {page + 1} / {pageCount} 页
        </p>
      )}
      <h1 className="mt-3 font-serif text-3xl leading-tight font-semibold tracking-tight text-stone-900 sm:text-4xl">
        {heading}
      </h1>

      {/* key：切换文章 / 章节 / 页时整个 <article> 重新挂载，避免和 mark.js 改过的 DOM 冲突 */}
      <article
        key={`${article.id}:${chapter}:${page}`}
        ref={ref}
        // 触屏：竖向照常滚动、双指缩放，横向的手指移动交给「划横线」手势
        className="mt-10 space-y-6 font-serif [touch-action:pan-y_pinch-zoom] text-[1.1875rem] leading-[1.8] text-stone-800"
      >
        {paragraphs.map((p, i) =>
          typeof p === 'string' ? (
            <Paragraph key={i} text={p} pi={paragraphOffset + i} />
          ) : (
            <Figure key={i} pi={paragraphOffset + i} item={p} url={images?.urls.get(p.src)} error={images?.error} />
          ),
        )}
      </article>

      <PageNav nav={nav} onPrev={onPrev} onNext={onNext} />
      {showImportHint && <ImportHint />}
    </main>
  )
}
