import React from 'react';

let host: HTMLElement | null = null;
export function toast(title: string, sub?: string) {
  if (!host) { host = document.createElement('div'); document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<b>' + title + '</b>' + (sub ? '<div style="color:var(--muted);font-size:12px;margin-top:2px">' + sub + '</div>' : '');
  host.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
