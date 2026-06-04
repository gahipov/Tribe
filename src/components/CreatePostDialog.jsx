import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Loader2, Image } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useUpload } from "@/lib/uploadContext";
import { createTusUpload, getPublicUrl } from "@/lib/tusUpload";

const MAX_VIDEO_DURATION = 30; // seconds
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function checkVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => reject(new Error("Could not read video metadata"));
    video.src = URL.createObjectURL(file);
  });
}

export default function CreatePostDialog() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaType, setMediaType] = useState("image");
  const fileInputRef = useRef(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { startUpload, onUploadProgress, onSuccess, onError } = useUpload();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith("video/")) {
      try {
        const duration = await checkVideoDuration(file);
        if (duration > MAX_VIDEO_DURATION) {
          toast.error("Videos must be 30 seconds or less.");
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }
      } catch {
        toast.error("Could not read video. Try another file.");
        return;
      }
      setMediaType("video");
    } else {
      setMediaType("image");
    }

    setMediaFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setMediaPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const clearMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePost = async () => {
    if (!content && !mediaFile) return;

    if (mediaFile && mediaFile.size > MAX_FILE_SIZE) {
      toast.error("File is too large (max 50MB).");
      return;
    }

    const ext = mediaFile ? (mediaType === "video" ? mediaFile.name.split(".").pop() || "mp4" : mediaFile.name.split(".").pop()) : null;
    const objectPath = mediaFile ? `${user.id}/${Date.now()}.${ext}` : null;
    const media_url = objectPath ? getPublicUrl(objectPath) : null;

    // Close dialog immediately
    setOpen(false);
    setContent("");
    setMediaFile(null);
    setMediaPreview(null);

    if (!mediaFile) {
      // Text-only post — insert directly
      const { error } = await supabase.from("posts").insert({
        content,
        media_url: null,
        media_type: null,
        user_id: user.id,
        author_name: user.full_name || user.email,
        author_image: user.profile_image || "",
      });
      if (error) toast.error("Failed to post.");
      else {
        queryClient.invalidateQueries({ queryKey: ["posts"] });
        toast.success("Posted to your tribe!");
      }
      return;
    }

    // Start background TUS upload — insert post row only after upload succeeds
    const { start } = createTusUpload(mediaFile, objectPath, {
      onProgress: onUploadProgress,
      onSuccess: async () => {
        const { error: insertError } = await supabase.from("posts").insert({
          content,
          media_url,
          media_type: mediaType,
          user_id: user.id,
          author_name: user.full_name || user.email,
          author_image: user.profile_image || "",
        });
        if (insertError) {
          onError(new Error("Failed to save post"));
        } else {
          onSuccess();
        }
      },
      onError,
    });
    startUpload(start);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-tour="create-post" size="icon" className="rounded-full h-12 w-12 shadow-lg shadow-primary/30">
          <Plus className="h-6 w-6" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Share with your Tribe</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <Textarea
            placeholder="What did you crush today?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="bg-secondary border-border min-h-[80px] resize-none"
          />

          {mediaPreview ? (
            <div className="relative rounded-xl overflow-hidden">
              {mediaType === "video"
                ? <video src={mediaPreview} className="w-full max-h-48 object-cover" controls />
                : <img src={mediaPreview} alt="" className="w-full max-h-48 object-cover" />}
              <button onClick={clearMedia} className="absolute top-2 right-2 bg-black/60 rounded-full p-1">
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 transition-colors">
              <Image className="h-6 w-6 text-muted-foreground mb-1" />
              <span className="text-sm text-muted-foreground">Add photo or video (max 30s)</span>
              <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
            </label>
          )}

          <Button
            onClick={handlePost}
            disabled={!content && !mediaFile}
            className="w-full font-heading font-semibold"
          >
            Post to Tribe
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
