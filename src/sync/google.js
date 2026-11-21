// Google 授权 + Drive 接口。
// 数据存在每个用户自己 Google Drive 的“应用隐藏文件夹”（appDataFolder）：
// 只有本应用能读写，用户在 Drive 里看不到、也不会和他的普通文件混在一起；
// 网站本身不经手任何数据——请求从浏览器直接发给 Google。

// OAuth Client ID 本来就是公开信息（会出现在每个用户的浏览器里），可以直接写在代码里
export const GOOGLE_CLIENT_ID = '1076658688471-c6143ck3ku2pkp9o5iqh0b12lse8vhl6.apps.googleusercontent.com'
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const FILE_NAME = 'jd-reading-sync.json'
const TOKEN_KEY = 'jdra.googleToken' // { accessToken, expiresAt }，access token 约 1 小时过期

export class AuthError extends Error {}

// ---------------- 授权（Google Identity Services，纯前端的 token 模式） ----------------

let gisPromise = null
function loadGis() {
  gisPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve(window.google)
    s.onerror = () => {
      gisPromise = null
      reject(new Error('无法加载 Google 登录组件，请检查网络'))
    }
    document.head.appendChild(s)
  })
  return gisPromise
}

export function getToken() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null')
    // 提前 1 分钟视为过期，避免请求到一半失效
    return t && t.expiresAt - 60_000 > Date.now() ? t.accessToken : null
  } catch {
    return null
  }
}

function saveToken(accessToken, expiresInSec) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken, expiresAt: Date.now() + expiresInSec * 1000 }))
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * 弹出 Google 授权窗口拿 access token。必须在用户点击按钮时调用（浏览器会拦截非点击触发的弹窗）。
 * firstTime=true 时显示完整的授权确认页；之后重新连接时，Google 通常一闪而过直接返回。
 */
export async function requestToken({ firstTime }) {
  const google = await loadGis()
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (res) => {
        if (res.error || !res.access_token) return reject(new Error(res.error_description || res.error || '授权失败'))
        if (!google.accounts.oauth2.hasGrantedAllScopes(res, SCOPE)) {
          return reject(new Error('需要勾选「查看和管理本应用在 Google 云端硬盘中的数据」才能同步'))
        }
        saveToken(res.access_token, Number(res.expires_in) || 3600)
        resolve(res.access_token)
      },
      error_callback: (err) => reject(new Error(err?.type === 'popup_closed' ? '授权窗口被关闭了' : '无法打开授权窗口（可能被浏览器拦截了弹窗）')),
    })
    client.requestAccessToken({ prompt: firstTime ? 'consent' : '' })
  })
}

/** 撤销授权（Drive 里已同步的数据不会被删除） */
export async function revokeToken() {
  const token = getToken()
  clearToken()
  if (!token) return
  try {
    const google = await loadGis()
    google.accounts.oauth2.revoke(token, () => {})
  } catch {
    // 撤销失败不影响本地断开
  }
}

// ---------------- Drive 接口 ----------------

async function driveFetch(url, options = {}) {
  const token = getToken()
  if (!token) throw new AuthError('授权已过期')
  const res = await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } })
  if (res.status === 401) {
    clearToken()
    throw new AuthError('授权已过期')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error?.message || `Google Drive 请求失败（HTTP ${res.status}）`)
  }
  return res
}

/** 找到同步文件，返回它的 id（还没有时返回 null） */
export async function findSyncFile() {
  const q = encodeURIComponent(`name='${FILE_NAME}'`)
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`)
  const { files } = await res.json()
  return files?.[0]?.id ?? null
}

export async function downloadSyncFile(id) {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`)
  return res.json()
}

/** 上传同步文件：id 为空时新建，否则覆盖 */
export async function uploadSyncFile(id, data) {
  const json = JSON.stringify(data)
  if (id) {
    await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    })
    return id
  }
  // 新建：multipart 上传，同时带上文件名和“放在 appDataFolder”这两个元数据
  const boundary = `jdra${crypto.randomUUID()}`
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] }),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    json,
    `--${boundary}--`,
  ].join('\r\n')
  const res = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return (await res.json()).id
}
