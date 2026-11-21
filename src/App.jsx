import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import Navbar from './components/Navbar'
import { countDueWords, getActiveWords } from './db'
import { useHashRoute } from './hooks/useHashRoute'
import { useNow } from './hooks/useNow'
import HelpPage from './pages/HelpPage'
import LibraryPage from './pages/LibraryPage'
import ReaderPage from './pages/ReaderPage'
import ReviewPage from './pages/ReviewPage'
import VocabPage from './pages/VocabPage'
import { startAutoSync } from './sync'

const EMPTY = []

export default function App() {
  const route = useHashRoute()

  // 已连接 Google Drive 时：打开应用、本地数据变化、切回页面时自动同步
  useEffect(startAutoSync, [])

  // 实时订阅 IndexedDB 里的生词本：数据一变（增/删/复习），组件自动重新渲染
  const words = useLiveQuery(getActiveWords, [], EMPTY)

  // 待复习数（due <= 现在），查询时取当前时间。以下情况会重新统计：
  // - words 变化（新标记 / 复习 / 删除）：新词的 due 等于创建时间，晚于上一次查询的时间点，
  //   不在 liveQuery 监听的范围里，所以必须靠 words 变化来触发，否则要等 30 秒才出现
  // - 每 30 秒（tick 变化）：让学习中的词到期后角标自动出现
  const tick = useNow()
  const dueCount = useLiveQuery(() => countDueWords(), [tick, words], 0)

  return (
    <div className="min-h-screen">
      <Navbar words={words} dueCount={dueCount} route={route} />
      {route === 'review' ? (
        <ReviewPage words={words} />
      ) : route === 'help' ? (
        <HelpPage />
      ) : route === 'library' ? (
        <LibraryPage />
      ) : route === 'vocab' ? (
        <VocabPage words={words} />
      ) : (
        <ReaderPage words={words} />
      )}
    </div>
  )
}
