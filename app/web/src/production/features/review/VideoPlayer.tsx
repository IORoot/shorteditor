import { useState } from 'react';

export function VideoPlayer({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-small text-warn">The video is not available on the server any more.</p>;
  }
  return <video controls preload="metadata" src={src} onError={() => setFailed(true)} className="max-h-[360px] w-full rounded-xl bg-black" />;
}
