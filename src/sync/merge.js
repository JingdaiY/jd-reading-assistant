// 逐条合并：Drive 同步和备份导入共用。
//
// 规则（last-writer-wins，按记录）：
// - 同一条记录在两边都有：updatedAt 更新的那份胜出；一样新时保留本地
// - 只有一边有：直接保留
// - 删除不是真删，而是留一条带 deletedAt 的“删除记录”（tombstone），
//   这样另一台设备同步时才知道这个词被删了，而不是把它当成新词加回来
//
// 生词按“小写单词”匹配（两台设备各自标记同一个词时 id 不同，但应视为同一条）；
// 文章按 id 匹配（文章只在一台设备上导入，之后靠同步复制到其他设备，id 一致）。

export const wordKey = (w) => w.word.trim().toLowerCase()
export const articleKey = (a) => a.id

const time = (r) => Date.parse(r?.updatedAt ?? r?.createdAt ?? 0) || 0

/**
 * 合并本地和远端两组记录。
 * 返回：
 *  - merged：合并后的完整列表（用于上传到 Drive）
 *  - localWrites：需要写入本地数据库的记录（远端更新的那些）
 *  - remoteChanged：远端是否需要更新（本地有更新的记录）
 */
export function mergeRecords(localList, remoteList, keyOf) {
  const local = new Map(localList.map((r) => [keyOf(r), r]))
  const remote = new Map(remoteList.map((r) => [keyOf(r), r]))
  const merged = []
  const localWrites = []
  let remoteChanged = false

  for (const key of new Set([...local.keys(), ...remote.keys()])) {
    const l = local.get(key)
    const r = remote.get(key)
    if (l && !r) {
      merged.push(l)
      remoteChanged = true
    } else if (r && !l) {
      merged.push(r)
      localWrites.push(r)
    } else if (time(r) > time(l)) {
      // 远端更新：写入本地，但保留本地的 id（生词在两台设备上的 id 可能不同）
      const winner = { ...r, id: l.id }
      merged.push(winner)
      localWrites.push(winner)
    } else {
      merged.push(l)
      if (time(l) > time(r)) remoteChanged = true
    }
  }
  return { merged, localWrites, remoteChanged }
}
