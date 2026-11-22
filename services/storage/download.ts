export function downloadJson(filename: string, json: string): void {
  const file = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
