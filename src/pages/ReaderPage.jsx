import { useEffect, useRef } from 'react'
import Reader from '../components/Reader'
import SelectionTooltip from '../components/SelectionTooltip'
import { sampleArticle } from '../data/sampleArticle'
import { toggleWord } from '../db'
import { useHighlights } from '../hooks/useHighlights'
import { useTextSelection } from '../hooks/useTextSelection'
import { preloadDictionary } from '../services/dictionary'
import { useSettings } from '../settings'

export default function ReaderPage({ words }) {
  const articleRef = useRef(null)
  const tooltipRef = useRef(null)
  const { selection } = useTextSelection(articleRef, tooltipRef)
  useHighlights(articleRef, words)

  const { mode } = useSettings()
  useEffect(() => {
    if (mode === 'dictionary') preloadDictionary()
  }, [mode])

  const isMarked = (text) => words.some((w) => w.word.toLowerCase() === text.toLowerCase())

  const handleToggleMark = ({ text, context, translation, phonetic, pos, etymology }) =>
    toggleWord({ word: text, context, translation, phonetic, pos, etymology, source: sampleArticle.title })

  return (
    <>
      <Reader ref={articleRef} article={sampleArticle} />

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
