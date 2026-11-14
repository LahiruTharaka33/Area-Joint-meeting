'use client';

import { useActionState, useRef, useState } from 'react';
import { uploadSlip } from '../actions';

const MAX_SIDE = 1800;
const MAX_BYTES = 4 * 1024 * 1024;

/** Shrink a phone photo to a ~1 MB JPEG so it fits Vercel's upload limit. */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/heic' || file.type === 'image/heif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export default function SlipUpload({ again }: { again: boolean }) {
  const [state, action, pending] = useActionState(uploadSlip, undefined);
  const [ready, setReady] = useState<'none' | 'working' | 'ok'>('none');
  const [tooBig, setTooBig] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const picked = input.files?.[0];
    setTooBig(false);
    if (!picked) return setReady('none');
    setReady('working');
    const file = await shrinkImage(picked);
    if (file !== picked) {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
    }
    if (file.size > MAX_BYTES) {
      setTooBig(true);
      return setReady('none');
    }
    setReady('ok');
  }

  return (
    <form action={action} style={{ display: 'grid', gap: 12 }}>
      <label className="field">
        {again ? 'Upload a new slip' : 'Upload your bank slip'}
        <span className="hint">A clear photo or PDF. Photos are made smaller automatically.</span>
        <input ref={inputRef} id="slip" name="slip" type="file" accept="image/*,application/pdf" required onChange={onPick} />
      </label>
      <label className="field">
        Reference / note <span className="hint">Optional, e.g. the transfer reference number.</span>
        <input id="reference" name="reference" type="text" maxLength={200} />
      </label>
      {tooBig && <div className="alert error" role="alert">This file is larger than 4 MB. Please take a photo of the slip instead, or send a smaller PDF.</div>}
      {state?.error && <div className="alert error" role="alert">{state.error}</div>}
      {state?.ok && <div className="alert ok" role="status">{state.ok}</div>}
      <button className="btn cta block" disabled={pending || ready !== 'ok'}>
        {pending ? 'Uploading…' : ready === 'working' ? 'Preparing photo…' : 'Upload slip'}
      </button>
    </form>
  );
}
