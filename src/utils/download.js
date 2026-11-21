/** 把数据保存为 JSON 文件并触发浏览器下载 */
export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000) // 等下载开始后再释放
}

/** 本地日期 YYYY-MM-DD（'sv' 区域格式），用于文件名 */
export const todayStamp = () => new Date().toLocaleDateString('sv')
