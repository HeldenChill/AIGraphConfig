export function h(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v);
  }
  e.append(...children.flat().filter(c => c !== null && c !== undefined).map(c => (c instanceof Node ? c : String(c))));
  return e;
}

export async function api(path, options) {
  const r = await fetch(path, options);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}
