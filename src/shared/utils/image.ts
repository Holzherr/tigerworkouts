/** Centre-crop an image file to a square and return it as a JPEG data URL. */
export const fileToSquareDataUrl = (file: File, size = 256, quality = 0.82) =>
  new Promise<string>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d')?.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => (URL.revokeObjectURL(url), reject(new Error('Could not read image')));
    img.src = url;
  });
