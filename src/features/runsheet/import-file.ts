/**
 * Import: a photo or a text file in, plan text out, for parsePlan to turn into blocks. Photos are
 * read on the device with Tesseract (loaded only when someone picks an image), so nothing is sent
 * anywhere and there is no per-import cost. The text lands in the box first, where it can be fixed
 * before "Use this".
 */

export const isImage = (file: File) => file.type.startsWith('image/');

/** What OCR and pasted notes get wrong before the parser sees them. */
export const cleanImportText = (raw: string, { photo = false } = {}) =>
  raw
    .replace(/\r/g, '')
    .split('\n')
    .map(line =>
      line
        .replace(/^\s*(?:[-•*·▪●◦]|\d+[.)])\s+/, '') // bullets and "1." numbering
        .replace(/[×✕✖]/g, 'x')
        .replace(/(\d)\s*(?:secs?|seconds)\b/gi, '$1s')
        .replace(/\b(\d+)\s*\/\s*(\d+)\b/g, '$1/$2')
        .replace(/[|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    // A photo wraps long lines: a line starting lower-case, with a number or with + carries on the one before.
    .reduce<string[]>((lines, line) => {
      if (photo && lines.length && /^(?:[a-z]|\d|x\d|\+|\/)/.test(line)) lines[lines.length - 1] += ` ${line}`;
      else lines.push(line);
      return lines;
    }, [])
    // A title ("Thursday session", "Leg day:") names the workout; it is not a step.
    .filter(line => /[a-z]/i.test(line))
    .filter((line, i, all) => !(/:$/.test(line) || (i === 0 && all.length > 1 && !/\d/.test(line))))
    .join('\n');

export async function readImport(file: File, onProgress?: (pct: number) => void): Promise<string> {
  if (!isImage(file)) return cleanImportText(await file.text());
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: m => {
      if (m.status === 'recognizing text' && onProgress) onProgress(Math.round(m.progress * 100));
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return cleanImportText(data.text, { photo: true });
  } finally {
    await worker.terminate();
  }
}
