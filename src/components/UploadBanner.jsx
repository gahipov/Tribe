import { useUpload } from "@/lib/uploadContext";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function UploadBanner() {
  const { status, progress, error, retry } = useUpload();

  if (status === "idle") return null;

  const isCompressing = status === "compressing";
  const isUploading = status === "uploading";
  const isSuccess = status === "success";
  const isError = status === "error";

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
        isSuccess && "bg-primary/20 text-primary",
        isError && "bg-destructive/20 text-destructive cursor-pointer",
        (isCompressing || isUploading) && "bg-card border-t border-border text-foreground"
      )}
      onClick={isError ? retry : undefined}
    >
      {(isCompressing || isUploading) && (
        <Loader2 className="h-4 w-4 animate-spin flex-shrink-0 text-primary" />
      )}
      {isSuccess && <CheckCircle2 className="h-4 w-4 flex-shrink-0" />}
      {isError && <AlertCircle className="h-4 w-4 flex-shrink-0" />}

      <span className="flex-1">
        {isCompressing && `Compressing… ${progress}%`}
        {isUploading && `Posting to your tribe… ${progress}%`}
        {isSuccess && "Posted! ✓"}
        {isError && "Upload failed. Tap to retry."}
      </span>

      {(isCompressing || isUploading) && (
        <div className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
