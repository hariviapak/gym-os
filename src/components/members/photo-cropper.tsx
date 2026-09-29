"use client";

import { useEffect, useRef, useState } from "react";

// Adjust Photo step: drag/zoom the image inside a circular crop area that
// shows EXACTLY what the final avatar will look like. "Use Photo" renders the
// same visible region to a 512×512 canvas and compresses it client-side until
// it is under 300KB. No blind center-crop anywhere.
const VIEW = 300; // square crop area (px) — fits comfortably on a 390px phone
const OUT = 512;
const MAX_BYTES = 300 * 1024;

export function PhotoCropper({
  image,
  retakeLabel,
  onRetake,
  onCancel,
  onConfirm,
}: {
  image: string;
  retakeLabel: string;
  onRetake: () => void;
  onCancel: () => void;
  onConfirm: (blob: Blob) => Promise<void>;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null); // image load failures
  const [saveError, setSaveError] = useState<string | null>(null); // upload failures — shown inline so the crop is kept
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  // invalid image → friendly error instead of a broken cropper
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setDims({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => setError("Please select a valid image.");
    img.src = image;
  }, [image]);

  if (error) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        onClick={(e) => e.target === e.currentTarget && onCancel()}
      >
        <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-xl">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button type="button" onClick={onCancel} className="mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
            Close
          </button>
        </div>
      </div>
    );
  }
  // imgRef is assigned by the load effect before dims is ever set
  if (!dims) return null;

  const s0 = Math.max(VIEW / dims.w, VIEW / dims.h); // "cover" base scale
  const s = s0 * zoom;
  const maxOff = (axis: "w" | "h") => Math.max(0, (dims[axis] * s - VIEW) / 2);
  const clamp = (o: { x: number; y: number }) => ({
    x: Math.max(-maxOff("w"), Math.min(maxOff("w"), o.x)),
    y: Math.max(-maxOff("h"), Math.min(maxOff("h"), o.y)),
  });

  const left = (VIEW - dims.w * s) / 2 + offset.x;
  const top = (VIEW - dims.h * s) / 2 + offset.y;

  const setZoomClamped = (z: number) => {
    const nz = Math.max(1, Math.min(5, z));
    // keep the view centred when zooming so nothing jumps
    setOffset((o) => clamp({ x: o.x, y: o.y }));
    setZoom(nz);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset(clamp({ x: drag.current.ox + (e.clientX - drag.current.px), y: drag.current.oy + (e.clientY - drag.current.py) }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const usePhoto = async () => {
    const img = imgRef.current;
    if (!img) return;
    setBusy(true);
    setError(null);
    setSaveError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not process the photo on this device");

      // exactly what the circular preview shows, rendered at 512×512
      const k = OUT / VIEW;
      ctx.drawImage(img, left * k, top * k, dims.w * s * k, dims.h * s * k);

      // progressive JPEG compression until under 300KB
      const qualities = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25];
      let blob: Blob | null = null;
      for (const q of qualities) {
        blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", q));
        if (blob && blob.size <= MAX_BYTES) break;
        blob = null;
      }
      if (!blob) {
        // extremely rare: shrink the render and try once more
        const c2 = document.createElement("canvas");
        c2.width = c2.height = 384;
        const k2 = 384 / VIEW;
        c2.getContext("2d")!.drawImage(img, left * k2, top * k2, dims.w * s * k2, dims.h * s * k2);
        blob = await new Promise<Blob | null>((res) => c2.toBlob(res, "image/jpeg", 0.5));
      }
      if (!blob || blob.size > MAX_BYTES) throw new Error("Photo could not be compressed small enough");

      await onConfirm(blob);
    } catch (err) {
      // upload/save failures stay INLINE so the user keeps their cropped
      // photo and can retry or back out — never drop back to a bare error box
      setSaveError(err instanceof Error ? err.message : "Couldn't save the photo. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="mb-3 text-base font-semibold text-zinc-900">Adjust Photo</h2>

        {/* circular crop area — the visible circle IS the saved crop */}
        <div
          className="relative mx-auto touch-none select-none overflow-hidden rounded-full bg-zinc-900 ring-4 ring-zinc-900/10"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => {
            e.preventDefault();
            setZoomClamped(zoom * (e.deltaY < 0 ? 1.08 : 0.93));
          }}
        >
          {/* max-w-none: Tailwind's preflight clamps img to the container
              width, which would squash wide webcam frames and desync the
              preview from the saved 512×512 output. */}
          <img
            src={image}
            alt="Adjust"
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{ left, top, width: dims.w * s, height: dims.h * s }}
          />
        </div>

        {/* zoom controls */}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setZoomClamped(zoom - 0.25)}
            className="h-9 w-9 shrink-0 rounded-full border border-zinc-300 text-lg font-semibold text-zinc-700 transition hover:bg-zinc-50"
            aria-label="Zoom out"
          >
            −
          </button>
          <input
            type="range"
            min={1}
            max={5}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoomClamped(parseFloat(e.target.value))}
            className="h-9 flex-1 accent-zinc-900"
            aria-label="Zoom"
          />
          <button
            type="button"
            onClick={() => setZoomClamped(zoom + 0.25)}
            className="h-9 w-9 shrink-0 rounded-full border border-zinc-300 text-lg font-semibold text-zinc-700 transition hover:bg-zinc-50"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
        <p className="mt-1.5 text-center text-xs text-zinc-400">Drag to position · the circle is exactly how the photo will appear</p>

        {(error || saveError) && <p className="mt-2 text-center text-xs text-red-600">{error ?? saveError}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onRetake}
            className="flex-1 rounded-lg border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40"
          >
            {retakeLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={usePhoto}
            className="flex-1 rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Use Photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
