import Mark from 'mark.js'
import { useEffect } from 'react'
import { CardState } from '../db'

// 词边界允许出现的标点：保证 "skill." 里的 skill 能匹配，但 "skills" 不会被 "skill" 命中
const LIMITERS = [',', '.', ';', ':', '!', '?', '"', "'", '“', '”', '‘', '’', '(', ')', '—', '-']

/**
 * 根据生词本，在 containerRef 内的文章里用 <mark> 高亮所有已保存的词。
 * 生词本变化时（新增/取消标记）先清掉旧高亮再重新标记。
 *
 * 注意：mark.js 会直接改 DOM（拆分文本节点）。这里的文章段落渲染后不再变化，
 * 所以和 React 共存没问题；以后如果段落内容会动态更新，需要在更新前先 unmark。
 */
export function useHighlights(containerRef, words) {
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const marker = new Mark(el)

    marker.unmark({
      done: () => {
        // 长的先标：避免短词先占位，导致包含它的词组/句子匹配不上
        const sorted = [...words].sort((a, b) => b.word.length - a.word.length)
        for (const w of sorted) {
          marker.mark(w.word, {
            className: w.state === CardState.New ? 'hl-new' : 'hl-review',
            accuracy: { value: 'exactly', limiters: LIMITERS },
            separateWordSearch: false, // 词组/句子整体匹配，不拆成单个词
            caseSensitive: false,
            diacritics: false,
            exclude: ['mark[data-markjs]'], // 已经高亮过的区域不再重复嵌套
          })
        }
      },
    })

    return () => marker.unmark()
  }, [containerRef, words])
}
