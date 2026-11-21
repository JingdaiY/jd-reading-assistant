// 本地数据变化通知：数据库写操作调用 markDirty()，同步模块监听后（防抖）触发一次 Drive 同步。
// 单独成文件，避免 db 和 sync 模块互相 import。

const EVENT = 'jdra:dirty'

export function markDirty() {
  window.dispatchEvent(new Event(EVENT))
}

export function onDirty(callback) {
  window.addEventListener(EVENT, callback)
  return () => window.removeEventListener(EVENT, callback)
}
