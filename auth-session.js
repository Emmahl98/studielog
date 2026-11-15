const KEY='studielog.google-session';
export function restoreSession(storage,clientId,now=Date.now()) {
  try{
    const session=JSON.parse(storage.getItem(KEY)||'null');
    if(session?.clientId===clientId && typeof session.token==='string' && session.token && Number.isFinite(session.expiresAt) && session.expiresAt>now)return session;
    storage.removeItem(KEY);
  }catch{/* Storage can be unavailable or contain an incomplete session. */}
  return null;
}
export function saveSession(storage,session) { try{storage.setItem(KEY,JSON.stringify(session));}catch{/* Sign-in still works in memory. */} }
export function clearSession(storage) { try{storage.removeItem(KEY);}catch{/* Storage may be disabled. */} }
