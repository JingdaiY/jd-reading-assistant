import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import Reader from '../components/Reader'
import SelectionTooltip from '../components/SelectionTooltip'
import { toggleWord } from '../db'
import { getArticle, getArticles, getCurrentArticleId, SAMPLE, saveProgress, setCurrentArticleId } from '../db/articles'
import { useHighlights } from '../hooks/useHighlights'
import { useTextSelection } from '../hooks/useTextSelection'
import { preloadDictionary } from '../services/dictionary'
import { useSettings } from '../settings'

const SAVE_DELAY_MS = 800 // 停止滚动 0.8 秒后保存阅读位置

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

  // 当前章节：用户切换过就用切换后的，否则用保存的阅读进度
  const [chapterOverride, setChapterOverride] = useState(null)
  const chapter = Math.min(chapterOverride ?? article?.progress?.chapter ?? 0, (article?.chapters.length ?? 1) - 1)

  const { selection } = useTextSelection(articleRef, tooltipRef)
  useHighlights(articleRef, words, article ? `${article.id}:${chapter}` : null)

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
    const ratio = article.progress?.ratio ?? 0
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
        if (ratio !== article.progress?.ratio || chapter !== article.progress?.chapter) {
          saveProgress(article.id, { chapter, ratio })
        }
      }, SAVE_DELAY_MS)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('scroll', onScroll)
    }
  }, [article, chapter])

  if (!article) return null

  const changeChapter = (next) => {
    setChapterOverride(next)
    saveProgress(article.id, { chapter: next, ratio: 0 })
    window.scrollTo(0, 0)
  }

  const isMarked = (text) => words.some((w) => w.word.toLowerCase() === text.toLowerCase())

  const handleToggleMark = ({ text, context, translation, phonetic, pos, etymology }) =>
    toggleWord({ word: text, context, translation, phonetic, pos, etymology, source: article.title })

  return (
    <>
      <Reader
        ref={articleRef}
        article={article}
        chapter={chapter}
        onChapterChange={changeChapter}
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
