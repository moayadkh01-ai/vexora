/* VEXORA integrated build — API client (same battle-tested REST backend) */
export const API = {
  token: null as string | null,
  async call<T = any>(method: string, path: string, body?: any): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (API.token) headers.Authorization = 'Bearer ' + API.token;
    const r = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let j: any = null;
    try { j = await r.json(); } catch (e) { /* empty */ }
    if (!r.ok || !j || j.ok === false) {
      const err: any = new Error((j && j.msg) || (j && j.error) || 'خطأ غير متوقع');
      err.code = j && j.error;
      err.status = r.status;
      throw err;
    }
    return j;
  },
  get<T = any>(p: string) { return API.call<T>('GET', p); },
  post<T = any>(p: string, b?: any) { return API.call<T>('POST', p, b); },
  del<T = any>(p: string) { return API.call<T>('DELETE', p); }
};
try { API.token = localStorage.getItem('vexora_token'); } catch (e) { /* sandbox */ }

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
