import { useLiveQuery } from 'dexie-react-hooks'
import Navbar from './components/Navbar'
import { db } from './db'
import { useHashRoute } from './hooks/useHashRoute'
import { useNow } from './hooks/useNow'
import HelpPage from './pages/HelpPage'
import ReaderPage from './pages/ReaderPage'
import ReviewPage from './pages/ReviewPage'

const EMPTY = []

export default function App() {
  const route = useHashRoute()

  // 实时订阅 IndexedDB 里的生词本：数据一变（增/删/复习），组件自动重新渲染
  const words = useLiveQuery(() => db.words.toArray(), [], EMPTY)

  // 待复习数（due <= 现在）。查询函数里取当前时间：数据库一变化就重新计算；
  // 另外每 30 秒（tick 变化）重算一次，让学习中的词到期后角标自动出现
  const tick = useNow()
  const dueCount = useLiveQuery(() => db.words.where('due').belowOrEqual(new Date().toISOString()).count(), [tick], 0)

  return (
    <div className="min-h-screen">
      <Navbar words={words} dueCount={dueCount} route={route} />
      {route === 'review' ? (
        <ReviewPage words={words} />
      ) : route === 'help' ? (
        <HelpPage />
      ) : (
        <ReaderPage words={words} />
      )}
    </div>
  )
}
