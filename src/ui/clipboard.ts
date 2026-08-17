import { send } from '../engine/bridge';

let pending = false;

export function requestCopy(): void {
  pending = true;
  send({ type: 'requestRle' });
}

export function consumeCopy(rle: string): void {
  if (!pending) return;
  pending = false;
  void navigator.clipboard.writeText(rle);
}

export function savePng(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = 'life.png';
  link.click();

  URL.revokeObjectURL(url);
}

export function pasteRle(): void {
  void navigator.clipboard.readText().then((text) => {
    if (text.trim().length > 0) send({ type: 'loadRle', rle: text });
    return text;
  });
}
