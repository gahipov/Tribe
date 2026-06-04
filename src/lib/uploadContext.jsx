import { createContext, useContext, useState, useRef, useCallback } from "react";
import { queryClientInstance } from "@/lib/query-client";

// status: 'idle' | 'compressing' | 'uploading' | 'success' | 'error'
const UploadContext = createContext(null);

export function UploadProvider({ children }) {
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0); // 0-100
  const [error, setError] = useState(null);
  const retryRef = useRef(null); // stores () => void to retry upload
  const timerRef = useRef(null);

  const startUpload = useCallback((tusStartFn) => {
    // tusStartFn: () => void — call to begin/resume the TUS upload
    clearTimeout(timerRef.current);
    retryRef.current = tusStartFn;
    setStatus("uploading");
    setProgress(0);
    setError(null);
    tusStartFn();
  }, []);

  const setCompressing = useCallback((pct) => {
    setStatus("compressing");
    setProgress(pct);
  }, []);

  const onUploadProgress = useCallback((pct) => {
    setStatus("uploading");
    setProgress(pct);
  }, []);

  const onSuccess = useCallback(() => {
    clearTimeout(timerRef.current);
    setStatus("success");
    setProgress(100);
    queryClientInstance.invalidateQueries({ queryKey: ["posts"] });
    timerRef.current = setTimeout(() => setStatus("idle"), 3000);
  }, []);

  const onError = useCallback((err) => {
    setStatus("error");
    setError(err?.message || "Upload failed");
  }, []);

  const retry = useCallback(() => {
    if (retryRef.current) {
      setStatus("uploading");
      setProgress(0);
      setError(null);
      retryRef.current();
    }
  }, []);

  return (
    <UploadContext.Provider value={{ status, progress, error, startUpload, setCompressing, onUploadProgress, onSuccess, onError, retry }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used inside UploadProvider");
  return ctx;
}
