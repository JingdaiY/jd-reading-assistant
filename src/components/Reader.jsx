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

export default function Reader({ article, chapter, page, paragraphs, pageCount, nav, onChapterChange, onPrev, onNext, showImportHint, ref }) {
  const current = article.chapters[chapter] ?? article.chapters[0]
  const total = article.chapters.length
  const isBook = total > 1
  // 书：大标题显示章节名，上方小字显示书名；单篇文章：大标题就是文章标题
  const heading = isBook ? current.title || `第 ${chapter + 1} 节` : article.title
  const meta = article.meta ?? [article.author, isBook && article.title].filter(Boolean).join(' · ')

  return (
    <main className="mx-auto max-w-2xl px-5 pt-6 pb-40 sm:px-6 sm:pt-10 sm:pb-32">
      <div className="mb-8 flex items-center justify-between gap-3 sm:mb-12">
        <a
          href="#/library"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 shadow-sm transition-colors hover:bg-stone-100 hover:text-stone-900"
        >
          <span aria-hidden>📚</span> 书架 · 导入
        </a>
        {isBook && (
          <select
            aria-label="选择章节"
            value={chapter}
            onChange={(e) => onChapterChange(Number(e.target.value))}
            className="max-w-[60%] truncate rounded-md border border-stone-200 bg-white px-2 py-1 text-base text-stone-600 sm:text-sm"
          >
            {article.chapters.map((c, i) => (
              <option key={i} value={i}>
                {i + 1}. {c.title || `第 ${i + 1} 节`}
              </option>
            ))}
          </select>
        )}
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
        className="mt-10 space-y-6 font-serif text-[1.1875rem] leading-[1.8] text-stone-800"
      >
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </article>

      <PageNav nav={nav} onPrev={onPrev} onNext={onNext} />
      {showImportHint && <ImportHint />}
    </main>
  )
}
