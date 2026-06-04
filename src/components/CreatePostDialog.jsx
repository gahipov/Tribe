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

const MAX_VIDEO_DURATION = 60; // seconds
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

async function loadFfmpeg() {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { fetchFile, toBlobURL } = await import("@ffmpeg/util");
  const ffmpeg = new FFmpeg();
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  return { ffmpeg, fetchFile };
}

async function compressVideo(file, onProgress) {
  const { ffmpeg, fetchFile } = await loadFfmpeg();
  ffmpeg.on("progress", ({ progress }) => onProgress(Math.round(progress * 100)));
  await ffmpeg.writeFile("input.mp4", await fetchFile(file));
  await ffmpeg.exec([
    "-i", "input.mp4",
    "-vf", "scale=-2:720",
    "-c:v", "libx264",
    "-crf", "28",
    "-preset", "fast",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "output.mp4",
  ]);
  const data = await ffmpeg.readFile("output.mp4");
  return new File([data.buffer], "compressed.mp4", { type: "video/mp4" });
}

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
  const [compressing, setCompressing] = useState(false);
  const [compressProgress, setCompressProgress] = useState(0);
  const fileInputRef = useRef(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { startUpload, setCompressing: setGlobalCompressing, onUploadProgress, onSuccess, onError } = useUpload();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith("video/")) {
      try {
        const duration = await checkVideoDuration(file);
        if (duration > MAX_VIDEO_DURATION) {
          toast.error("Videos must be 60 seconds or less.");
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

    let fileToUpload = mediaFile;

    // Compress video before upload
    if (mediaFile && mediaType === "video") {
      setCompressing(true);
      setCompressProgress(0);
      try {
        fileToUpload = await compressVideo(mediaFile, (pct) => {
          setCompressProgress(pct);
          setGlobalCompressing(pct);
        });
      } catch (err) {
        setCompressing(false);
        toast.error("Compression failed. Try a shorter video.");
        return;
      }
      setCompressing(false);
    }

    // Check compressed size
    if (fileToUpload && fileToUpload.size > MAX_FILE_SIZE) {
      toast.error("Video is too large (max 50MB). Trim it and try again.");
      return;
    }

    // Build the post row — we need the media_url before inserting
    const ext = fileToUpload ? (mediaType === "video" ? "mp4" : fileToUpload.name.split(".").pop()) : null;
    const objectPath = fileToUpload ? `${user.id}/${Date.now()}.${ext}` : null;
    const media_url = objectPath ? getPublicUrl(objectPath) : null;

    // Close dialog and hand off to background
    setOpen(false);
    setContent("");
    setMediaFile(null);
    setMediaPreview(null);

    if (!fileToUpload) {
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

    // Insert post row immediately (media_url is the eventual public URL)
    const { error: insertError } = await supabase.from("posts").insert({
      content,
      media_url,
      media_type: mediaType,
      user_id: user.id,
      author_name: user.full_name || user.email,
      author_image: user.profile_image || "",
    });
    if (insertError) {
      toast.error("Failed to create post.");
      return;
    }

    // Start background TUS upload
    const { start } = createTusUpload(fileToUpload, objectPath, {
      onProgress: onUploadProgress,
      onSuccess,
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
              <span className="text-sm text-muted-foreground">Add photo or video (max 60s)</span>
              <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
            </label>
          )}

          {compressing && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Compressing video…</span>
                <span>{compressProgress}%</span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${compressProgress}%` }} />
              </div>
            </div>
          )}

          <Button
            onClick={handlePost}
            disabled={compressing || (!content && !mediaFile)}
            className="w-full font-heading font-semibold"
          >
            {compressing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {compressing ? `Compressing… ${compressProgress}%` : "Post to Tribe"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
