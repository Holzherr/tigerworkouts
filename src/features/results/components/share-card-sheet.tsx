import { Download, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Sheet } from '@/shared/components/ui/sheet';
import { renderShareCard, shareImage, type ShareCardData } from '../share-card';

export interface ShareCardSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ShareCardData;
}

const canShareFiles = () => {
  try {
    return !!navigator.canShare?.({ files: [new File([''], 'x.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
};

/**
 * Bottom sheet with the rendered card as a preview image and one button: Share where the browser
 * can share files (phones), Save image everywhere else. The image is drawn when the sheet opens, so
 * the tap goes straight to the share sheet.
 */
export const ShareCardSheet = ({ open, onOpenChange, data }: ShareCardSheetProps) => {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const key = JSON.stringify(data);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    let made: string | null = null;
    renderShareCard(JSON.parse(key) as ShareCardData)
      .then(b => {
        if (!alive) return;
        made = URL.createObjectURL(b);
        setBlob(b);
        setUrl(made);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [open, key]);
  const share = canShareFiles();
  const filename = `tigerworkouts-${data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Share" height="88dvh">
      <div className="flex flex-col gap-3">
        {url ? <img src={url} alt={`Share card: ${data.title}`} className="mx-auto w-full max-w-[340px] rounded-card border border-line shadow-sm" /> : <div className="mx-auto aspect-[4/5] w-full max-w-[340px] animate-pulse rounded-card bg-line-soft" />}
        <Button block disabled={!blob} onClick={() => blob && shareImage(blob, filename, data.title)}>
          {share ? <Share2 /> : <Download />} {share ? 'Share' : 'Save image'}
        </Button>
      </div>
    </Sheet>
  );
};
