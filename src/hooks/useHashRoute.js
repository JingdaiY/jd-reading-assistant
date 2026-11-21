import { useEffect, useState } from 'react'

// 极简 hash 路由：#/ → 阅读页，#/review → 复习室。
// 用 hash 而不是 history 路由，部署成静态网页（如 Vercel）时不需要配置服务端重写规则。
const parse = () => window.location.hash.replace(/^#\/?/, '') || 'read'

export function useHashRoute() {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const onChange = () => {
      setRoute(parse())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
