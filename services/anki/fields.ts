const fieldEntities: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&nbsp;': ' ', '&#39;': "'", '&apos;': "'",
};

export function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|nbsp|#39|apos);/gi, (entity) => fieldEntities[entity.toLowerCase()] ?? entity)
    .normalize('NFC').trim();
}

