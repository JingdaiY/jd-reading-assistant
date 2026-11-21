import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import Reader from '../components/Reader'
import SelectionTooltip from '../components/SelectionTooltip'
import { toggleWord } from '../db'
import { getArticle, getArticles, getCurrentArticleId, SAMPLE, saveProgress, setCurrentArticleId } from '../db/articles'
import { useHighlights } from '../hooks/useHighlights'
import { useTextSelection } from '../hooks/useTextSelection'
import { preloadDictionary } from '../services/dictionary'
import { paginate } from '../services/paginate'
import { useSettings } from '../settings'

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
  const article = stored === undefined ? undefined : (stored ?? SAMPLE)
  // 书架上还没有自己导入的材料时，在示例文章末尾提示去导入
  const libraryCount = useLiveQuery(async () => (await getArticles()).length, [], null)

  // 当前位置（第几章、第几页）：用户翻过就用翻到的位置，否则用保存的阅读进度
  const [posOverride, setPosOverride] = useState(null) // { chapter, page }；page 可以是 Infinity（= 该章最后一页）
  const progress = article?.progress ?? {}
  const chapterCount = article?.chapters.length ?? 1
  const chapter = clamp(posOverride?.chapter ?? progress.chapter ?? 0, 0, chapterCount - 1)
  const pages = useMemo(() => (article ? paginate(article.chapters[chapter].paragraphs) : [[]]), [article, chapter])
  // 旧版进度只记了“整章滚到哪里”（ratio），换算成对应的页
  const savedPage = progress.page ?? Math.floor((progress.ratio ?? 0) * pages.length)
  const page = clamp(posOverride?.page ?? savedPage, 0, pages.length - 1)

  const { selection } = useTextSelection(articleRef, tooltipRef)
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
    // 页内滚动位置只对新版进度有意义（旧版的 ratio 是整章的位置，已经换算成页码了）
    const ratio = article.progress?.page != null ? (article.progress.ratio ?? 0) : 0
    if (ratio > 0) {
      requestAnimationFrame(() => {
        window.scrollTo(0, ratio * (document.documentElement.scrollHeight - window.innerHeight))
      })
    }
  }, [article])

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
    const resolved = Number.isFinite(nextPage) ? nextPage : paginate(article.chapters[nextChapter].paragraphs).length - 1
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

  if (!article) return null

  const isMarked = (text) => words.some((w) => w.word.toLowerCase() === text.toLowerCase())

  const handleToggleMark = ({ text, context, translation, phonetic, pos, etymology }) =>
    toggleWord({ word: text, context, translation, phonetic, pos, etymology, source: article.title })

  return (
    <>
      <Reader
        ref={articleRef}
        article={article}
        chapter={chapter}
        page={page}
        paragraphs={pages[page]}
        pageCount={pages.length}
        nav={nav}
        onChapterChange={(n) => goTo(n, 0)}
        onPrev={goPrev}
        onNext={goNext}
        showImportHint={article.id === SAMPLE.id && libraryCount === 0}
      />

      {/* key 让每次新划词都重新挂载气泡，重新播放出现动画 */}
      {selection && (
        <SelectionTooltip
          key={`${selection.text}-${selection.anchor.top}-${selection.anchor.centerX}`}
          ref={tooltipRef}
          selection={selection}
          marked={isMarked(selection.text)}
          onToggleMark={handleToggleMark}
        />
      )}
    </>
  )
}
