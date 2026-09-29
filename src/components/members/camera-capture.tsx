"use client";

import { useEffect, useRef, useState } from "react";

// Desktop/laptop webcam capture: live preview via getUserMedia, one tap to
// capture a frame. The stream is ALWAYS stopped on capture, cancel, error and
// unmount — only the captured frame is ever passed on (never the stream).
export function CameraCapture({
  onCapture,
  onCancel,
  onUnavailable,
}: {
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
  onUnavailable: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setReady(true);
        }
      } catch {
        // denied, no camera, or unsupported (e.g. iOS webviews) — let the
        // parent fall back to the native camera / file picker
        if (!cancelled) onUnavailable();
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // mirror to match the live preview the user just saw
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    stopStream();
    onCapture(dataUrl);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          stopStream();
          onCancel();
        }
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">Camera</h2>
          <button
            type="button"
            onClick={() => {
              stopStream();
              onCancel();
            }}
            className="rounded-lg px-2 py-1 text-sm text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-full bg-zinc-900">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full scale-x-[-1] object-cover"
          />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={capture}
            disabled={!ready}
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-40"
          >
            Capture
          </button>
          <button
            type="button"
            onClick={() => {
              stopStream();
              onCancel();
            }}
            className="w-full rounded-lg py-2 text-sm font-medium text-zinc-500 transition hover:text-zinc-900"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
