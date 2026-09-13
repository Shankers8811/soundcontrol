import JSZip from 'jszip';

const EXTRA: Record<string, string> = {};

export function registerExport(path: string, contents: string) {
  EXTRA[path] = contents;
}

export async function buildProjectZip(): Promise<Blob> {
  const zip = new JSZip();
  const src = import.meta.glob('../**/*.{ts,tsx,css}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  for (const [path, content] of Object.entries(src)) {
    const clean = path.replace(/^\.\.\//, 'src/').replace(/\?raw$/, '');
    zip.file(clean, content);
  }

  for (const [path, content] of Object.entries(EXTRA)) {
    zip.file(path, content);
  }

  return zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(text: string, name: string, mime = 'text/plain') {
  downloadBlob(new Blob([text], { type: mime }), name);
}
