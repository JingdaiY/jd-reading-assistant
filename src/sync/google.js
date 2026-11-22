// Google 授权 + Drive 接口。
// 数据存在每个用户自己 Google Drive 的“应用隐藏文件夹”（appDataFolder）：
// 只有本应用能读写，用户在 Drive 里看不到、也不会和他的普通文件混在一起；
// 网站本身不经手任何数据——请求从浏览器直接发给 Google。

// OAuth Client ID 本来就是公开信息（会出现在每个用户的浏览器里），可以直接写在代码里
export const GOOGLE_CLIENT_ID = '1076658688471-c6143ck3ku2pkp9o5iqh0b12lse8vhl6.apps.googleusercontent.com'
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
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

// 同步文件布局（都在 appDataFolder 里）：
//   jd-reading-sync.json      生词 + 书架目录（文章元数据），每次同步都读写，体积很小
//   article-<id>.json         某本书的正文（导入后不再变化），打开这本书时才下载
//   original-<id>             某本书的原始文件（PDF / EPUB），查看原版页面 / 显示插图时才下载
export const INDEX_FILE = 'jd-reading-sync.json'
export const contentFileName = (id) => `article-${id}.json`
export const originalFileName = (id) => `original-${id}`

const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const RESUMABLE_THRESHOLD = 4 * 1024 * 1024 // 超过 4 MB 用分段上传（Drive 的普通上传只适合 5 MB 以内的文件）

/** 列出 appDataFolder 里所有文件 → Map(文件名 → { id, size }) */
export async function listAppFiles() {
  const files = new Map()
  let pageToken = ''
  do {
    const res = await driveFetch(
      `${API}?spaces=appDataFolder&pageSize=1000&fields=nextPageToken,files(id,name,size)${pageToken ? `&pageToken=${pageToken}` : ''}`,
    )
    const body = await res.json()
    for (const f of body.files ?? []) files.set(f.name, { id: f.id, size: Number(f.size) || 0 })
    pageToken = body.nextPageToken ?? ''
  } while (pageToken)
  return files
}

/** 下载文件：as = 'json' | 'blob' */
export async function downloadFile(id, as = 'json') {
  const res = await driveFetch(`${API}/${id}?alt=media`)
  return as === 'blob' ? res.blob() : res.json()
}

export async function deleteFile(id) {
  await driveFetch(`${API}/${id}`, { method: 'DELETE' })
}

/**
 * 上传文件：fileId 为空时新建（放进 appDataFolder），否则覆盖内容。
 * data：字符串（JSON）或 Blob（原始文件）。返回文件 id。
 */
export async function uploadFile({ name, data, mimeType = 'application/json', fileId = null }) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType })
  if (blob.size > RESUMABLE_THRESHOLD) return uploadResumable({ name, blob, mimeType, fileId })

  if (fileId) {
    await driveFetch(`${UPLOAD}/${fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': mimeType }, body: blob })
    return fileId
  }
  // 新建：multipart 上传，同时带上文件名和“放在 appDataFolder”这两个元数据
  const boundary = `jdra${crypto.randomUUID()}`
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify({ name, parents: ['appDataFolder'] }),
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ])
  const res = await driveFetch(`${UPLOAD}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return (await res.json()).id
}

/**
 * 分段上传（resumable）：先建立上传会话拿到会话地址，再把文件内容 PUT 过去。
 * 会话地址在响应头 Location 里；浏览器读不到 Location 时，用 X-GUploader-UploadID 拼出同一个地址。
 */
async function uploadResumable({ name, blob, mimeType, fileId }) {
  const url = fileId ? `${UPLOAD}/${fileId}?uploadType=resumable` : `${UPLOAD}?uploadType=resumable&fields=id`
  const res = await driveFetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(blob.size) },
    body: JSON.stringify(fileId ? {} : { name, parents: ['appDataFolder'] }),
  })
  const uploadId = res.headers.get('X-GUploader-UploadID')
  const session = res.headers.get('Location') || (uploadId ? `${url}&upload_id=${encodeURIComponent(uploadId)}` : null)
  if (!session) throw new Error('无法建立 Google Drive 上传会话')
  const put = await driveFetch(session, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: blob })
  return fileId ?? (await put.json()).id
}
