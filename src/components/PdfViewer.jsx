import { useEffect, useRef, useState } from 'react'

/**
 * 查看原版 PDF 页面：全屏浮层，用 pdf.js 把原 PDF 的某一页按原样画出来（图片、图表、版式都在）。
 * - 一次只画一页；翻页时取消上一页的渲染、释放页面资源
 * - 关闭时销毁整个 PDF 文档（task.destroy），释放 pdf.js 占用的内存和 worker
 * props：blob（原始 PDF）、startPage（从 0 开始）、onClose
 */
export default function PdfViewer({ blob, startPage = 0, onClose }) {
  const canvasRef = useRef(null)
  const boxRef = useRef(null)
  const docRef = useRef(null)
  const [pageCount, setPageCount] = useState(0)
  const [page, setPage] = useState(startPage)
  const [status, setStatus] = useState({ type: 'loading' })

  // 打开文档；关闭浮层时销毁
  useEffect(() => {
    let task = null
    let alive = true
    ;(async () => {
      try {
        const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), verbosity: 0 })
        const doc = await task.promise
        if (!alive) return
        docRef.current = doc
        setPageCount(doc.numPages)
      } catch (err) {
        if (alive) setStatus({ type: 'error', text: `无法打开原版 PDF：${err.message}` })
      }
    })()
    return () => {
      alive = false
      docRef.current = null
      task?.destroy() // 释放 pdf.js 的文档、字体缓存和 worker
    }
  }, [blob])

  // 画当前页：宽度撑满浮层，按屏幕像素密度提高清晰度
  useEffect(() => {
    const doc = docRef.current
    if (!doc || !pageCount) return
    let renderTask = null
    let pdfPage = null
    let cancelled = false
    ;(async () => {
      try {
        setStatus({ type: 'loading' })
        pdfPage = await doc.getPage(page + 1)
        if (cancelled) return
        // 页面宽度：浮层可用宽度（去掉左右留白），最宽 900px，和工具栏对齐
        const style = getComputedStyle(boxRef.current)
        const width = Math.min(boxRef.current.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), 900)
        const base = pdfPage.getViewport({ scale: 1 })
        const scale = width / base.width
        const dpr = window.devicePixelRatio || 1
        const viewport = pdfPage.getViewport({ scale: scale * dpr })
        const canvas = canvasRef.current
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.width = `${viewport.width / dpr}px`
        canvas.style.height = `${viewport.height / dpr}px`
        renderTask = pdfPage.render({ canvas, viewport })
        await renderTask.promise
        if (!cancelled) setStatus({ type: 'done' })
      } catch (err) {
        if (!cancelled && err?.name !== 'RenderingCancelledException') setStatus({ type: 'error', text: err.message })
      }
    })()
    return () => {
      cancelled = true
      renderTask?.cancel()
      pdfPage?.cleanup()
    }
  }, [page, pageCount])

  // Esc 关闭；← → 翻页（不传给阅读页，避免同时翻正文）
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1))
      else if (e.key === 'ArrowRight') setPage((p) => Math.min(pageCount - 1, p + 1))
      else return
      e.stopImmediatePropagation()
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, pageCount])

  const btn =
    'rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-30'
  return (
    <div role="dialog" aria-label="原版页面" className="fixed inset-0 z-[60] flex flex-col bg-stone-100/95 backdrop-blur">
      {/* 工具栏：内容和下面的 PDF 页面一样居中、同宽（最宽 900px），关闭按钮紧挨页面右边缘，宽屏上也不会跑到屏幕最右边 */}
      <div className="border-b border-stone-200 bg-paper px-3 py-2.5 sm:px-6">
        <div className="mx-auto flex w-full max-w-[900px] items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" className={btn} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ‹
          </button>
          <span className="min-w-20 text-center text-sm text-stone-500">{pageCount ? `第 ${page + 1} / ${pageCount} 页` : '…'}</span>
          <button type="button" className={btn} disabled={!pageCount || page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
            ›
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-stone-700 active:scale-95"
        >
          <span aria-hidden>✕</span> 关闭
        </button>
        </div>
      </div>
      <div ref={boxRef} className="flex-1 overflow-auto p-3 sm:p-6">
        {status.type === 'error' && <p className="mx-auto max-w-md rounded-lg bg-rose-50 p-4 text-sm text-rose-600">{status.text}</p>}
        {status.type === 'loading' && <p className="text-center text-sm text-stone-400">正在加载…</p>}
        <canvas ref={canvasRef} className={`mx-auto bg-white shadow-sm ${status.type === 'error' ? 'hidden' : ''}`} />
      </div>
    </div>
  )
}
