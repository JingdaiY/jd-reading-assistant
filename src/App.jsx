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
import { startAutoSync } from './sync'

const EMPTY = []

export default function App() {
  const route = useHashRoute()

  // 已连接 Google Drive 时：打开应用、本地数据变化、切回页面时自动同步
  useEffect(startAutoSync, [])

  // 实时订阅 IndexedDB 里的生词本：数据一变（增/删/复习），组件自动重新渲染
  const words = useLiveQuery(getActiveWords, [], EMPTY)

  // 待复习数（due <= 现在）。查询函数里取当前时间：数据库一变化就重新计算；
  // 另外每 30 秒（tick 变化）重算一次，让学习中的词到期后角标自动出现
  const tick = useNow()
  const dueCount = useLiveQuery(() => countDueWords(), [tick], 0)

  return (
    <div className="min-h-screen">
      <Navbar words={words} dueCount={dueCount} route={route} />
      {route === 'review' ? (
        <ReviewPage words={words} />
      ) : route === 'help' ? (
        <HelpPage />
      ) : route === 'library' ? (
        <LibraryPage />
      ) : (
        <ReaderPage words={words} />
      )}
    </div>
  )
}
