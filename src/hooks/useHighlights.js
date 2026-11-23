import Mark from 'mark.js'
import { useEffect } from 'react'
import { CardState } from '../db'
import { isFamiliar } from '../srs'

// 词边界允许出现的标点：保证 "skill." 里的 skill 能匹配，但 "skills" 不会被 "skill" 命中
const LIMITERS = [',', '.', ';', ':', '!', '?', '"', "'", '“', '”', '‘', '’', '(', ')', '—', '-']

/**
 * 根据生词本，在 containerRef 内的文章里用 <mark> 高亮所有已保存的词。
 * 生词本变化时（新增/取消标记）先清掉旧高亮再重新标记。
 *
 * 注意：mark.js 会直接改 DOM（拆分文本节点）。正文段落渲染后不再变化；切换文章 / 章节时，
 * Reader 用 key 让整个 <article> 重新挂载（而不是逐段更新），所以不会和 React 的 DOM 更新冲突。
 */
export function useHighlights(containerRef, words, contentKey) {
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const marker = new Mark(el)

    marker.unmark({
      done: () => {
        // 长的先标：避免短词先占位，导致包含它的词组/句子匹配不上
        // 已熟悉的词（稳定性 ≥ 30 天）不再高亮；长的先标
        const sorted = words.filter((w) => !isFamiliar(w)).sort((a, b) => b.word.length - a.word.length)
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
    // contentKey：切换文章 / 章节时正文会重新渲染，需要重新标记
  }, [containerRef, words, contentKey])
}
