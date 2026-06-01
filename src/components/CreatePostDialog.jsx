import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Upload, X, Loader2 } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function CreatePostDialog() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [mediaType, setMediaType] = useState("image");
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [tags, setTags] = useState("");
  const [location, setLocation] = useState("");
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const createPost = useMutation({
    mutationFn: async (data) => {
      let media_url = null;
      if (mediaFile) {
        const ext = mediaFile.name.split('.').pop();
        const path = user.id + '/' + Date.now() + '.' + ext;
        const { error: uploadError } = await supabase.storage.from('media').upload(path, mediaFile);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path);
        media_url = publicUrl;
      }
      const { error } = await supabase.from('posts').insert({ ...data, media_url, user_id: user.id, author_name: user.full_name||user.email, author_image: user.profile_image||"" });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["posts"] }); toast.success("Posted to your tribe!"); setContent(""); setMediaFile(null); setMediaPreview(null); setTags(""); setLocation(""); setOpen(false); }
  });

  const handleFileChange = (e) => { const file = e.target.files?.[0]; if (file) { setMediaFile(file); const reader = new FileReader(); reader.onload = ev => setMediaPreview(ev.target.result); reader.readAsDataURL(file); } };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="icon" className="rounded-full h-12 w-12 shadow-lg shadow-primary/30"><Plus className="h-6 w-6"/></Button></DialogTrigger>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader><DialogTitle className="font-heading">Share with your Tribe</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <Textarea placeholder="What did you crush today?" value={content} onChange={e => setContent(e.target.value)} className="bg-secondary border-border min-h-[80px] resize-none"/>
          <div className="flex gap-3">
            <div className="flex-1"><Label className="text-xs text-muted-foreground mb-1.5 block">Media type</Label><Select value={mediaType} onValueChange={setMediaType}><SelectTrigger className="bg-secondary border-border"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="image">Image</SelectItem><SelectItem value="video">Video</SelectItem></SelectContent></Select></div>
            <div className="flex-1"><Label className="text-xs text-muted-foreground mb-1.5 block">Location</Label><Input placeholder="Your gym" value={location} onChange={e => setLocation(e.target.value)} className="bg-secondary border-border"/></div>
          </div>
          {mediaPreview ? (
            <div className="relative rounded-xl overflow-hidden">
              {mediaType==="video" ? <video src={mediaPreview} className="w-full max-h-48 object-cover" controls/> : <img src={mediaPreview} alt="" className="w-full max-h-48 object-cover"/>}
              <button onClick={() => { setMediaFile(null); setMediaPreview(null); }} className="absolute top-2 right-2 bg-black/60 rounded-full p-1"><X className="h-4 w-4 text-white"/></button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center h-28 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 transition-colors">
              <Upload className="h-6 w-6 text-muted-foreground mb-1"/><span className="text-sm text-muted-foreground">Upload {mediaType}</span>
              <input type="file" accept={mediaType==="video"?"video/*":"image/*"} className="hidden" onChange={handleFileChange}/>
            </label>
          )}
          <Input placeholder="Tags: bench, legs, cardio" value={tags} onChange={e => setTags(e.target.value)} className="bg-secondary border-border"/>
          <Button onClick={() => createPost.mutate({ content, media_type: mediaType, exercise_tags: tags.split(",").map(t=>t.trim()).filter(Boolean), location })} disabled={createPost.isPending||(!content&&!mediaFile)} className="w-full font-heading font-semibold">
            {createPost.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : null}Post to Tribe
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
