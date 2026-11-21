import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { addArticle, deleteArticle, getArticles, SAMPLE, setCurrentArticleId } from '../db/articles'
import { parseFile, parseText } from '../services/importer'

const KIND_LABEL = { sample: '示例', paste: '粘贴', txt: 'TXT', epub: 'EPUB' }

function open(id) {
  setCurrentArticleId(id)
  window.location.hash = '#/'
}

function ArticleRow({ article, onDelete }) {
  const total = article.chapters.length
  const chapter = (article.progress?.chapter ?? 0) + 1
  const words = article.chapters.reduce((n, c) => n + c.paragraphs.join(' ').split(/\s+/).length, 0)
  return (
    <li className="flex items-center gap-3 py-4">
      <button type="button" onClick={() => open(article.id)} className="min-w-0 flex-1 text-left">
        <p className="truncate font-serif text-lg font-semibold text-stone-900">{article.title}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-400">
          <span className="rounded bg-stone-100 px-1.5 py-px text-stone-500">{KIND_LABEL[article.kind] ?? article.kind}</span>
          {article.author && <span>{article.author}</span>}
          <span>{words.toLocaleString()} 词</span>
          {total > 1 && (
            <span>
              读到第 {chapter} / {total} 章
            </span>
          )}
        </p>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(article)}
          className="shrink-0 rounded-md px-2 py-1 text-xs text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
        >
          删除
        </button>
      )}
    </li>
  )
}

export default function LibraryPage() {
  const articles = useLiveQuery(getArticles, [], [])
  const [pasting, setPasting] = useState(false)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [status, setStatus] = useState(null) // { type: 'loading' | 'error', text }
  const fileRef = useRef(null)

  const importParsed = async (parsed, kind) => {
    const id = await addArticle({ ...parsed, kind })
    open(id)
  }

  const handlePaste = async () => {
    try {
      await importParsed(parseText(text, title), 'paste')
    } catch (err) {
      setStatus({ type: 'error', text: err.message })
    }
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 清空，保证同一个文件可以重复选择
    if (!file) return
    setStatus({ type: 'loading', text: `正在解析《${file.name}》…` })
    try {
      const parsed = await parseFile(file)
      await importParsed(parsed, parsed.kind)
    } catch (err) {
      setStatus({ type: 'error', text: err.message })
    }
  }

  const handleDelete = async (article) => {
    if (!window.confirm(`删除《${article.title}》？已标记的生词不会被删除。`)) return
    await deleteArticle(article.id)
  }

  const primary = 'rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700 active:scale-[0.98]'
  const secondary =
    'rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100 active:scale-[0.98]'

  return (
    <main className="mx-auto max-w-2xl px-4 pt-10 pb-32 sm:px-6 sm:pt-16">
      <p className="text-xs font-medium tracking-widest text-stone-400 uppercase">Library</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-stone-900">书架</h1>

      <div className="mt-8 flex flex-wrap gap-2">
        <button type="button" className={pasting ? secondary : primary} onClick={() => setPasting((v) => !v)}>
          {pasting ? '收起' : '粘贴文本'}
        </button>
        <button type="button" className={secondary} onClick={() => fileRef.current?.click()}>
          上传文件（.txt / .epub）
        </button>
        <input ref={fileRef} type="file" accept=".txt,.md,.epub,text/plain,application/epub+zip" hidden onChange={handleFile} />
      </div>

      {pasting && (
        <div className="mt-4 space-y-3 rounded-xl border border-stone-200/80 bg-white p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题（可选，不填就用第一句话）"
            className="w-full rounded-md border border-stone-200 px-3 py-2 text-base outline-none focus:border-stone-400 sm:text-sm"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="把英文文章粘贴到这里。段落之间空一行；以 Chapter 1、Part Two 这类标题开头的段落会自动分章。"
            rows={10}
            className="w-full rounded-md border border-stone-200 px-3 py-2 font-serif text-base leading-relaxed outline-none focus:border-stone-400"
          />
          <button type="button" className={primary} disabled={!text.trim()} onClick={handlePaste}>
            导入并开始阅读
          </button>
        </div>
      )}

      {status && (
        <p
          className={`mt-4 rounded-lg px-4 py-3 text-sm ${status.type === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-stone-100 text-stone-500'}`}
        >
          {status.text}
        </p>
      )}

      <p className="mt-4 text-xs leading-relaxed text-stone-400">
        文件只在你的浏览器里解析，不会上传。支持没有 DRM 的 EPUB（例如 Project Gutenberg 的公版书）；Kindle 电子书受 DRM 保护无法导入，可以复制段落后粘贴。
      </p>

      <ul className="mt-8 divide-y divide-stone-200/70 border-y border-stone-200/70">
        {articles.map((a) => (
          <ArticleRow key={a.id} article={a} onDelete={handleDelete} />
        ))}
        <ArticleRow article={SAMPLE} />
      </ul>
    </main>
  )
}
