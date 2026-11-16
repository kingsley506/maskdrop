/** Wrap only the processed text. A dynamic fence prevents snippet breakout. */
export function toMarkdown(text) {
  let width = 3;
  for (const run of text.matchAll(/`+/g)) width = Math.max(width, run[0].length + 1);
  const fence = '`'.repeat(width);
  return `## Shared snippet\n\n${fence}text\n${text}${text.endsWith('\n') ? '' : '\n'}${fence}\n\n_Processed with MaskDrop. Pattern matching is incomplete; review before sharing._\n`;
}
