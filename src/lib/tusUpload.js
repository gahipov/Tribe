import * as tus from "tus-js-client";
import { supabase } from "@/api/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const BUCKET = "media";
const CHUNK_SIZE = 6 * 1024 * 1024; // 6MB — Supabase requirement

/**
 * Creates a TUS upload for a file to Supabase resumable storage.
 * Returns { start, abort } — call start() to begin or resume.
 *
 * @param {File|Blob} file
 * @param {string} objectPath  e.g. "userId/timestamp.mp4"
 * @param {{ onProgress, onSuccess, onError }} callbacks
 */
export function createTusUpload(file, objectPath, { onProgress, onSuccess, onError }) {
  let uploadInstance = null;

  async function start() {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    uploadInstance = new tus.Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: CHUNK_SIZE,
      allowedFileTypes: ["image/*", "video/*"],
      headers: {
        authorization: `Bearer ${token}`,
        "x-upsert": "true",
      },
      metadata: {
        bucketName: BUCKET,
        objectName: objectPath,
        contentType: file.type,
        cacheControl: "3600",
      },
      onProgress(bytesUploaded, bytesTotal) {
        const pct = Math.round((bytesUploaded / bytesTotal) * 100);
        onProgress?.(pct);
      },
      onSuccess() {
        onSuccess?.();
      },
      onError(err) {
        onError?.(err);
      },
    });

    const previous = await uploadInstance.findPreviousUploads();
    if (previous.length > 0) {
      uploadInstance.resumeFromPreviousUpload(previous[0]);
    }

    uploadInstance.start();
  }

  function abort() {
    uploadInstance?.abort();
  }

  return { start, abort };
}

/**
 * Returns the Supabase public URL for an object path in the media bucket.
 */
export function getPublicUrl(objectPath) {
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  return publicUrl;
}
