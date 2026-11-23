import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PdfViewer from '../components/PdfViewer'
import ReadingStopLine from '../components/ReadingStopLine'
import Reader from '../components/Reader'
import SelectionTooltip from '../components/SelectionTooltip'
import { toggleWord, updateWordNote } from '../db'
import {
  getArticle,
  getArticles,
  getCurrentArticleId,
  getSampleBookmark,
  SAMPLE,
  SAMPLE_CONTENT,
  saveBookmark,
  saveProgress,
  setCurrentArticleId,
} from '../db/articles'
import { useEpubImages } from '../hooks/useEpubImages'
import { useHighlights } from '../hooks/useHighlights'
import { useTextSelection } from '../hooks/useTextSelection'
import { preloadDictionary } from '../services/dictionary'
import { paginate } from '../services/paginate'
import { useSettings } from '../settings'
import { ensureContent, ensureOriginal } from '../sync'

const SAVE_DELAY_MS = 800 // 停止滚动 0.8 秒后保存阅读位置

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

/** 当前页面滚动到的位置（0~1） */
const scrollRatio = () => {
  const max = document.documentElement.scrollHeight - window.innerHeight
  return max > 0 ? Math.min(1, window.scrollY / max) : 0
}

export default function ReaderPage({ words }) {
  const articleRef = useRef(null)
  const tooltipRef = useRef(null)
  const [articleId] = useState(getCurrentArticleId)
  // undefined = 加载中；null = 找不到（比如在另一台设备上删掉了）→ 回到内置示例文章
  const stored = useLiveQuery(() => getArticle(articleId), [articleId])
  const meta = stored === undefined ? undefined : (stored ?? SAMPLE)

  // 书的正文：打开时才读进内存（本机缓存，或从 Google Drive 下载）。只保存在这个页面的 state 里，
  // 离开阅读页 / 换一本书时整个页面卸载，正文随之释放，不会和其他书一起堆在内存里
  const [content, setContent] = useState({ status: 'loading', chapters: null, error: null })
  const [retry, setRetry] = useState(0)
  const metaId = meta?.id
  useEffect(() => {
    if (!metaId) return
    let alive = true
    const load = metaId === SAMPLE.id ? Promise.resolve(SAMPLE_CONTENT.chapters) : ensureContent(metaId)
    load
      .then((chapters) => alive && setContent({ status: 'done', chapters, error: null }))
      .catch((err) => alive && setContent({ status: 'error', chapters: null, error: err.message }))
    return () => {
      alive = false
    }
  }, [metaId, retry])
  const article = useMemo(() => (meta && content.chapters ? { ...meta, chapters: content.chapters } : undefined), [meta, content.chapters])
  // 书架上还没有自己导入的材料时，在示例文章末尾提示去导入
  const libraryCount = useLiveQuery(async () => (await getArticles()).length, [], null)

  // 当前位置（第几章、第几页）：用户翻过就用翻到的位置，否则用保存的阅读进度
  const [posOverride, setPosOverride] = useState(null) // { chapter, page }；page 可以是 Infinity（= 该章最后一页）
  const progress = article?.progress ?? {}
  const chapterCount = article?.chapters.length ?? 1
  const chapter = clamp(posOverride?.chapter ?? progress.chapter ?? 0, 0, chapterCount - 1)
  const pages = useMemo(() => (content.chapters ? paginate(content.chapters[chapter].paragraphs) : [[]]), [content.chapters, chapter])
  // 旧版进度只记了“整章滚到哪里”（ratio），换算成对应的页
  const savedPage = progress.page ?? Math.floor((progress.ratio ?? 0) * pages.length)
  const page = clamp(posOverride?.page ?? savedPage, 0, pages.length - 1)

  // 「在这里结束本次阅读」横线。示例文章不在数据库里，横线放在这个页面的 state + localStorage
  const [sampleBookmark, setSampleBookmark] = useState(getSampleBookmark)
  const bookmark = (meta?.id === SAMPLE.id ? sampleBookmark : meta?.bookmark) ?? null
  const [scrollToBookmark, setScrollToBookmark] = useState(false)
  const setBookmark = (bm) => {
    if (meta.id === SAMPLE.id) setSampleBookmark(bm)
    saveBookmark(meta.id, bm)
  }
  const onBookmarkScrolled = useCallback(() => setScrollToBookmark(false), [])

  const { selection } = useTextSelection(articleRef, tooltipRef)
  const images = useEpubImages(article, pages[page] ?? [])

  // 查看原版 PDF 页面：{ loading } → { blob, startPage }；关闭时设回 null，PdfViewer 卸载时销毁 PDF 文档
  const [viewer, setViewer] = useState(null)
  const firstParagraph = pages.slice(0, page).reduce((n, p) => n + p.length, 0) // 当前页第一段在本章里的下标
  const openOriginal = async () => {
    const startPage = article.chapters[chapter].pages?.[firstParagraph] ?? 0
    setViewer({ loading: true })
    try {
      setViewer({ blob: await ensureOriginal(article.id), startPage })
    } catch (err) {
      setViewer(null)
      window.alert(err.message)
    }
  }
  useHighlights(articleRef, words, article ? `${article.id}:${chapter}:${page}` : null)

  const { mode } = useSettings()
  useEffect(() => {
    if (mode === 'dictionary') preloadDictionary()
  }, [mode])

  useEffect(() => {
    if (stored === null) setCurrentArticleId(SAMPLE.id)
  }, [stored])

  // 打开文章时恢复到上次读到的位置（只在第一次加载时做一次）
  const restored = useRef(false)
  useEffect(() => {
    if (!article || restored.current) return
    restored.current = true
    // 有「结束阅读」横线：直接翻到横线所在的那一页，画出来后滚到横线处
    const bm = meta.id === SAMPLE.id ? sampleBookmark : meta.bookmark
    const chapters = article.chapters
    if (bm && chapters[bm.chapter] && bm.paragraph < chapters[bm.chapter].paragraphs.length) {
      let start = 0
      const bmPages = paginate(chapters[bm.chapter].paragraphs)
      const bmPage = bmPages.findIndex((pg) => (start += pg.length) > bm.paragraph)
      setPosOverride({ chapter: bm.chapter, page: Math.max(0, bmPage) })
      setScrollToBookmark(true)
      return
    }
    // 页内滚动位置只对新版进度有意义（旧版的 ratio 是整章的位置，已经换算成页码了）
    const ratio = article.progress?.page != null ? (article.progress.ratio ?? 0) : 0
    if (ratio > 0) {
      requestAnimationFrame(() => {
        window.scrollTo(0, ratio * (document.documentElement.scrollHeight - window.innerHeight))
      })
    }
  }, [article]) // 只在第一次加载时恢复一次（用当时保存的横线 / 进度）

  // 滚动时（停下来后）保存阅读位置
  useEffect(() => {
    if (!article) return
    let timer
    const onScroll = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const ratio = Math.round(scrollRatio() * 1000) / 1000
        const p = article.progress ?? {}
        if (ratio !== p.ratio || chapter !== p.chapter || page !== p.page) saveProgress(article.id, { chapter, page, ratio })
      }, SAVE_DELAY_MS)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('scroll', onScroll)
    }
  }, [article, chapter, page])

  // 翻到指定章、页（page = Infinity 表示那一章的最后一页）
  const goTo = (nextChapter, nextPage) => {
    const resolved = Number.isFinite(nextPage) ? nextPage : paginate(content.chapters[nextChapter].paragraphs).length - 1
    setPosOverride({ chapter: nextChapter, page: resolved })
    saveProgress(article.id, { chapter: nextChapter, page: resolved, ratio: 0 })
    window.scrollTo(0, 0)
  }

  // 上一页 / 下一页；到了一章的边界就跨到上一章最后一页 / 下一章第一页
  const nav = {
    prev: page > 0 ? [chapter, page - 1] : chapter > 0 ? [chapter - 1, Infinity] : null,
    next: page < pages.length - 1 ? [chapter, page + 1] : chapter < chapterCount - 1 ? [chapter + 1, 0] : null,
    prevLabel: page > 0 ? '上一页' : '上一章',
    nextLabel: page < pages.length - 1 ? '下一页' : '下一章',
    label: [chapterCount > 1 && `第 ${chapter + 1} / ${chapterCount} 章`, pages.length > 1 && `第 ${page + 1} / ${pages.length} 页`]
      .filter(Boolean)
      .join(' · '),
  }
  const goPrev = () => nav.prev && goTo(...nav.prev)
  const goNext = () => nav.next && goTo(...nav.next)

  // 电脑上用键盘 ← → 翻页（正在输入框里打字时不触发）
  const keyNav = useRef(null)
  useEffect(() => {
    keyNav.current = { goPrev, goNext } // 每次渲染后更新为最新的翻页函数
  })
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
      if (e.key === 'ArrowLeft') keyNav.current?.goPrev()
      else if (e.key === 'ArrowRight') keyNav.current?.goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!meta) return null
  if (!article) {
    // 正文还在加载（本机读取通常一瞬间；从 Google Drive 下载可能要几秒）或加载失败
    return (
      <main className="mx-auto max-w-2xl px-5 pt-16 text-center sm:px-6">
        <p className="font-serif text-2xl font-semibold text-stone-900">{meta.title}</p>
        {content.status === 'error' ? (
          <>
            <p className="mx-auto mt-6 max-w-md rounded-lg bg-rose-50 p-4 text-sm leading-relaxed text-rose-600">{content.error}</p>
            <div className="mt-6 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setRetry((n) => n + 1)}
                className="rounded-lg bg-ink px-4 py-2 text-sm text-white hover:bg-stone-700"
              >
                重试
              </button>
              <a href="#/library" className="rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">
                回到书架
              </a>
            </div>
          </>
        ) : (
          <p className="mt-6 text-sm text-stone-400">正在加载正文…（本机没有缓存时会从 Google Drive 下载）</p>
        )}
      </main>
    )
  }

  // 这个词是否已标记（返回生词记录，气泡里要显示它的笔记）
  const findMarked = (text) => words.find((w) => w.word.toLowerCase() === text.toLowerCase()) ?? null
  const markedWord = selection ? findMarked(selection.text) : null

  const handleToggleMark = ({ text, context, translation, phonetic, pos, etymology, note }) => {
    const existing = findMarked(text)
    // 取消标记会连笔记一起删掉：有笔记时先确认
    if (existing?.note && !window.confirm(`取消标记「${existing.word}」？你写的笔记也会一起删除。`)) return
    return toggleWord({ word: text, context, translation, phonetic, pos, etymology, note, source: article.title })
  }

  return (
    <>
      <Reader
        ref={articleRef}
        article={article}
        chapter={chapter}
        page={page}
        paragraphs={pages[page]}
        paragraphOffset={firstParagraph}
        pageCount={pages.length}
        nav={nav}
        onChapterChange={(n) => goTo(n, 0)}
        onPrev={goPrev}
        onNext={goNext}
        images={images}
        onOpenOriginal={article.kind === 'pdf' && article.hasOriginal ? openOriginal : null}
        openingOriginal={!!viewer?.loading}
        showImportHint={article.id === SAMPLE.id && libraryCount === 0}
      />

      <ReadingStopLine
        containerRef={articleRef}
        chapter={chapter}
        pageKey={`${article.id}:${chapter}:${page}`}
        bookmark={bookmark}
        onSave={setBookmark}
        onRemove={() => setBookmark(null)}
        scrollRequest={scrollToBookmark}
        onScrolled={onBookmarkScrolled}
      />

      {viewer?.blob && <PdfViewer blob={viewer.blob} startPage={viewer.startPage} onClose={() => setViewer(null)} />}

      {/* key 让每次新划词都重新挂载气泡，重新播放出现动画 */}
      {selection && (
        <SelectionTooltip
          key={`${selection.text}-${selection.anchor.top}-${selection.anchor.centerX}`}
          ref={tooltipRef}
          selection={selection}
          marked={!!markedWord}
          note={markedWord?.note ?? ''}
          onSaveNote={(note) => markedWord && updateWordNote(markedWord.id, note)}
          onToggleMark={handleToggleMark}
        />
      )}
    </>
  )
}
