import { useEffect, useState } from 'react'

/** 每隔 intervalMs 刷新一次的“当前时间”，用于让依赖时间的显示（待复习数、倒计时）自动更新 */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
