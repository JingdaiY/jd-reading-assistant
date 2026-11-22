import { useEffect, useRef, useState } from 'react'
import { ensureOriginal } from '../sync'

/**
 * EPUB 插图：正文里只记了图片在 EPUB 包里的路径，显示时再从原始 EPUB 里取出来。
 * - 只处理当前页用到的图片；翻页 / 离开时释放（revokeObjectURL），不会越积越多
 * - 解压后的 EPUB（JSZip 对象）只保留在当前这本书里；离开这本书时整个丢弃，交给浏览器回收内存
 * - 原始 EPUB 不在本机时，从 Google Drive 下载（见 ensureOriginal）
 * 返回 { urls: Map(src → objectURL), error }
 */
export function useEpubImages(article, paragraphs) {
  const zipRef = useRef(null) // { id, zip }
  const [urls, setUrls] = useState(() => new Map())
  const [error, setError] = useState(null)
  const srcs = paragraphs.filter((p) => typeof p !== 'string' && p?.type === 'img').map((p) => p.src)
  const key = srcs.join('|')

  // 离开这本书：丢弃解压后的 EPUB
  useEffect(() => () => (zipRef.current = null), [article?.id])

  useEffect(() => {
    if (!article || article.kind !== 'epub' || !article.hasOriginal || !key) return
    let alive = true
    const created = []
    ;(async () => {
      try {
        if (zipRef.current?.id !== article.id) {
          const [{ default: JSZip }, blob] = await Promise.all([import('jszip'), ensureOriginal(article.id)])
          zipRef.current = { id: article.id, zip: await JSZip.loadAsync(blob) }
        }
        const map = new Map()
        for (const src of key.split('|')) {
          const file = zipRef.current.zip.file(src)
          if (!file) continue
          const url = URL.createObjectURL(await file.async('blob'))
          created.push(url)
          map.set(src, url)
        }
        if (alive) {
          setUrls(map)
          setError(null)
        } else created.forEach(URL.revokeObjectURL)
      } catch (err) {
        if (alive) setError(err.message)
      }
    })()
    return () => {
      alive = false
      created.forEach(URL.revokeObjectURL) // 翻页 / 离开时释放这一页的图片
    }
  }, [article, key])

  return { urls, error }
}
