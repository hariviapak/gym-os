"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CameraCapture } from "@/components/members/camera-capture";
import { PhotoCropper } from "@/components/members/photo-cropper";

// Receptionist flow: tap the avatar → Change Photo → Take Photo / Upload /
// Remove. Take Photo uses the browser webcam (getUserMedia) where possible and
// falls back to the native camera app / file picker. Every capture passes
// through the Adjust Photo cropper, is compressed client-side to ≤300KB, and
// only then uploaded. Remove clears the record and deletes the Storage object
// server-side. Replacing overwrites the same fixed object key, so the old
// photo is never removed before the new one is safely stored.
//
// The widget keeps its surface minimal on purpose: just the avatar (with a
// small camera hint when empty) — photo controls never compete with the
// member's main actions.

interface PhotoUploadProps {
  memberId: string;
  gymId: string;
  currentPhotoUrl: string | null;
  initials: string;
  onUploaded?: (url: string) => void;
  canDelete?: boolean;
  size?: "sm" | "md" | "lg";
}

export function PhotoUpload({
  memberId,
  gymId,
  currentPhotoUrl,
  initials,
  onUploaded,
  canDelete = false,
  size = "md",
}: PhotoUploadProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(currentPhotoUrl);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pending, setPending] = useState<{ image: string; fromCamera: boolean } | null>(null);
  const [busy, setBusy] = useState<null | "saving" | "removing">(null);
  const [error, setError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [stage, setStage] = useState<"uploading" | "finishing" | null>(null);

  const sizeClasses = {
    sm: "h-10 w-10 text-sm",
    md: "h-16 w-16 text-xl",
    lg: "h-24 w-24 text-2xl",
  };

  // ---- final step: upload the processed blob + update the member record ----
  const savePhoto = async (blob: Blob) => {
    const hadPhoto = !!photoUrl;
    setBusy("saving");
    setStage("uploading");

    const filePath = `${gymId}/${memberId}.jpg`;
    const supabase = createClient();
    const version = Date.now();

    try {
      // a flaky mobile connection should fail fast with a retry message,
      // not spin forever. storage-js can't take an abort signal, so race a
      // timeout instead; a late background success is harmless because
      // retry uses upsert.
      const { error: uploadError } = await Promise.race([
        supabase.storage
          .from("member-photos")
          .upload(filePath, blob, { contentType: "image/jpeg", upsert: true }),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("Upload timed out — check your connection and try again.")), 20000)
        ),
      ]);
      if (uploadError) throw new Error("Couldn't upload the photo. Please try again.");

      const { data: urlData } = supabase.storage.from("member-photos").getPublicUrl(filePath);
      setStage("finishing");

      // version the stored URL: the object path is fixed per member, so
      // without a fresh query param the CDN/browser serves the OLD cached
      // bytes after a replace — the "deleted photo came back" bug.
      const versionedUrl = `${urlData.publicUrl}?v=${version}`;
      const res = await fetch("/api/members/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, photoUrl: versionedUrl, photoPath: filePath }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        // never leave a failed/orphaned object for a first-time photo
        if (!hadPhoto) {
          await supabase.storage.from("member-photos").remove([filePath]).catch(() => {});
        }
        throw new Error("Couldn't save the photo. Please try again.");
      }

      setPhotoUrl(versionedUrl);
      onUploaded?.(versionedUrl);
      router.refresh(); // sync server-rendered references to the new photo
    } finally {
      // ALWAYS clear the busy state — a failed save used to leave the
      // avatar spinning "Uploading…" forever until a full page refresh
      setBusy(null);
      setStage(null);
    }
  };

  const confirmCrop = async (blob: Blob) => {
    try {
      await savePhoto(blob);
      setPending(null); // success closes the cropper
    } catch (err) {
      throw err; // shown inside the cropper; existing photo untouched
    }
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPending({ image: reader.result as string, fromCamera: false });
    reader.onerror = () => setError("Please select a valid image.");
    reader.readAsDataURL(file);
  };

  // Take Photo: browser webcam first (desktop), native camera / picker as fallback
  const takePhoto = () => {
    setMenuOpen(false);
    setError(null);
    if (typeof navigator !== "undefined" && navigator.mediaDevices) {
      setCameraOpen(true);
    } else {
      cameraInputRef.current?.click();
    }
  };

  const uploadPhoto = () => {
    setMenuOpen(false);
    setError(null);
    uploadInputRef.current?.click();
  };

  const removePhoto = async () => {
    if (!window.confirm("Remove this profile photo?")) return;
    setMenuOpen(false);
    setError(null);
    setBusy("removing");
    try {
      const res = await fetch("/api/members/photo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      if (!res.ok) throw new Error("Couldn't remove the photo. Please try again.");
      const body = await res.json().catch(() => ({}));
      setPhotoUrl(null);
      if (body.storageWarning) {
        setError("Photo removed, but the stored image couldn't be cleaned up right now. It doesn't affect the profile.");
      }
    } catch {
      setError("Couldn't remove the photo. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const disabled = busy !== null;

  return (
    <div className="flex flex-col items-center">
      {/* avatar — the single photo entry point */}
      <button
        type="button"
        onClick={() => !disabled && setMenuOpen(true)}
        disabled={disabled}
        className={`group relative ${sizeClasses[size]} overflow-hidden rounded-full bg-gradient-to-br from-zinc-800 to-zinc-950 font-bold text-white ring-zinc-900/10 transition hover:ring-4 disabled:cursor-wait`}
        aria-label="Change photo"
        title="Change photo"
      >
        {photoUrl ? (
          <img src={photoUrl} alt="Member photo" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center">{initials}</span>
        )}
        {disabled && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </span>
        )}
        {!photoUrl && !disabled && (
          <span
            className={`absolute bottom-[14%] right-[14%] flex items-center justify-center rounded-full bg-zinc-900 text-white ring-2 ring-white ${
              size === "lg" ? "h-5 w-5" : size === "md" ? "h-4 w-4" : "h-3 w-3"
            }`}
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-[60%] w-[60%]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </span>
        )}
      </button>
      {busy === "saving" && (
        <p className="mt-1.5 text-xs text-zinc-400">{stage === "finishing" ? "Finishing…" : "Uploading…"}</p>
      )}
      {busy === "removing" && <p className="mt-1.5 text-xs text-zinc-400">Removing…</p>}
      {error && !menuOpen && <p className="mt-1.5 max-w-[240px] text-center text-xs text-red-600">{error}</p>}

      {/* hidden inputs: native camera (mobile) + gallery/file picker */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {/* Change Photo menu */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => e.target === e.currentTarget && setMenuOpen(false)}
        >
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="mb-4 text-center text-base font-semibold text-zinc-900">Change Photo</h2>
            <div className="space-y-2">
              <button
                type="button"
                onClick={takePhoto}
                className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                Take Photo
              </button>
              <button
                type="button"
                onClick={uploadPhoto}
                className="w-full rounded-lg border border-zinc-300 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                Upload Photo
              </button>
              {canDelete && photoUrl && (
                <button
                  type="button"
                  onClick={removePhoto}
                  className="w-full rounded-lg py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
                  Remove Photo
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="mt-3 w-full py-1 text-center text-sm font-medium text-zinc-400 transition hover:text-zinc-700"
            >
              Cancel
            </button>
            {error && <p className="mt-2 text-center text-xs text-red-600">{error}</p>}
          </div>
        </div>
      )}

      {/* desktop webcam */}
      {cameraOpen && (
        <CameraCapture
          onCapture={(dataUrl) => {
            setCameraOpen(false);
            setPending({ image: dataUrl, fromCamera: true });
          }}
          onCancel={() => setCameraOpen(false)}
          onUnavailable={() => {
            // webcam denied/missing → native camera on mobile, picker on desktop
            setCameraOpen(false);
            cameraInputRef.current?.click();
          }}
        />
      )}

      {/* Adjust Photo (both webcam captures and uploads) */}
      {pending && (
        <PhotoCropper
          key={pending.image}
          image={pending.image}
          retakeLabel={pending.fromCamera ? "Retake" : "Choose other photo"}
          onRetake={() => {
            setPending(null);
            if (pending.fromCamera) takePhoto();
            else uploadPhoto();
          }}
          onCancel={() => setPending(null)}
          onConfirm={confirmCrop}
        />
      )}
    </div>
  );
}
