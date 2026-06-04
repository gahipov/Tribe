import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, PenLine, ArrowRight, X, Barcode, CheckCircle2, Camera, Sparkles, Heart, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useUpgradeModal } from "@/components/PremiumGate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isNative } from "@/lib/revenueCat";
import { toast } from "sonner";

const USDA_KEY = import.meta.env.VITE_USDA_API_KEY || "DEMO_KEY";

// Prep type tags from USDA description
function getPrepTag(desc) {
  const d = desc.toLowerCase();
  if (d.includes("raw")) return { label: "Raw", color: "text-blue-400 bg-blue-400/10" };
  if (d.includes("cooked") || d.includes("boiled") || d.includes("roasted") || d.includes("baked")) return { label: "Cooked", color: "text-green-400 bg-green-400/10" };
  if (d.includes("grilled") || d.includes("broiled")) return { label: "Grilled", color: "text-orange-400 bg-orange-400/10" };
  if (d.includes("fried")) return { label: "Fried", color: "text-red-400 bg-red-400/10" };
  if (d.includes("dried") || d.includes("dehydrated")) return { label: "Dried", color: "text-yellow-400 bg-yellow-400/10" };
  return null;
}

// Simplify verbose USDA names like "Chicken, broilers or fryers, breast, meat only, raw"
function cleanName(desc) {
  // Capitalize first letter, truncate after 50 chars cleanly
  const clean = desc.charAt(0).toUpperCase() + desc.slice(1);
  if (clean.length <= 52) return clean;
  const truncated = clean.substring(0, 50);
  const lastComma = truncated.lastIndexOf(",");
  return (lastComma > 20 ? truncated.substring(0, lastComma) : truncated) + "…";
}

// USDA FDC — SR Legacy + Foundation only (government whole-food data, accurate per 100g)
async function searchUSDA(query) {
  const res = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=20&dataType=SR%20Legacy,Foundation&api_key=${USDA_KEY}`
  );
  if (!res.ok) throw new Error("USDA API error");
  const data = await res.json();

  const mapped = (data.foods || []).map(food => {
    const n = {};
    food.foodNutrients?.forEach(x => { n[x.nutrientId] = x.value; });
    return {
      name: cleanName(food.description),
      rawName: food.description,
      prep: getPrepTag(food.description),
      serving_size: "100g",
      calories: Math.round(n[1008] || n[2047] || 0),
      protein_g: +(n[1003] || 0).toFixed(1),
      carbs_g: +(n[1005] || 0).toFixed(1),
      fat_g: +(n[1004] || 0).toFixed(1),
    };
  }).filter(f => f.calories > 0);

  // De-duplicate: keep best per calorie range bucket (avoid 20 near-identical entries)
  const seen = new Set();
  const deduped = [];
  for (const f of mapped) {
    const bucket = Math.round(f.calories / 30); // group within 30 kcal
    const key = f.name.split(",")[0].toLowerCase() + bucket;
    if (!seen.has(key)) { seen.add(key); deduped.push(f); }
    if (deduped.length >= 6) break;
  }
  return deduped;
}

// Open Food Facts barcode lookup
async function lookupBarcode(barcode) {
  const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
  const data = await res.json();
  if (data.status !== 1) return null;
  const p = data.product;
  const n = p.nutriments || {};
  return {
    name: p.product_name || barcode,
    brand: p.brands || "",
    serving_size: p.serving_size || "100g",
    calories: Math.round(n["energy-kcal_100g"] || n["energy-kcal"] || 0),
    protein_g: +(n.proteins_100g || 0).toFixed(1),
    carbs_g: +(n.carbohydrates_100g || 0).toFixed(1),
    fat_g: +(n.fat_100g || 0).toFixed(1),
  };
}

const METHODS = [
  { id: "ai", label: "AI", icon: Sparkles, desc: "Text, photo, or both" },
  { id: "saved", label: "Saved", icon: Heart, desc: "Your favorite meals" },
  { id: "search", label: "Search", icon: Search, desc: "USDA food database" },
  { id: "barcode", label: "Barcode", icon: Barcode, desc: "Scan product barcode" },
  { id: "manual", label: "Manual", icon: PenLine, desc: "Enter values yourself" },
];

function MacroBadge({ label, value, color }) {
  return (
    <div className="text-center">
      <p className={`text-xs font-bold ${color}`}>{value}g</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

export default function FoodLookupDialog({ open, onClose, onSelect }) {
  const { user, isPremium } = useAuth();
  const queryClient = useQueryClient();
  const { openUpgrade, UpgradeModal } = useUpgradeModal("AI Photo Meal Logging");

  const { data: savedMeals = [] } = useQuery({
    queryKey: ["saved_meals"],
    queryFn: async () => {
      const { data } = await supabase.from("saved_meals").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const deleteSaved = async (id) => {
    await supabase.from("saved_meals").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["saved_meals"] });
  };
  const [method, setMethod] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [aiHint, setAiHint] = useState("");
  const [aiPhoto, setAiPhoto] = useState(null); // { file, previewUrl, base64, mediaType }
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef(null);
  const aiFileRef = useRef(null);

  const startScan = async () => {
    if (!isNative()) {
      fileRef.current?.click();
      return;
    }
    setError("");
    setScanning(true);
    try {
      const { BarcodeScanner, BarcodeFormat } = await import("@capacitor-mlkit/barcode-scanning");
      const { Capacitor } = await import("@capacitor/core");
      const platform = Capacitor.getPlatform();

      // Android: ensure Google Barcode Scanner Module is installed
      if (platform === "android") {
        const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
        if (!available) {
          toast.info("Preparing scanner for first use…");
          await BarcodeScanner.installGoogleBarcodeScannerModule();
          await new Promise((resolve, reject) => {
            let handle;
            handle = BarcodeScanner.addListener("googleBarcodeScannerModuleInstallProgress", (event) => {
              if (event.state === "COMPLETED") { handle.remove(); resolve(); }
              if (event.state === "FAILED" || event.state === "CANCELED") { handle.remove(); reject(new Error("Module install failed")); }
            });
            setTimeout(() => { handle.remove(); reject(new Error("Module install timed out")); }, 30000);
          });
        }
      }

      // iOS: pre-warm camera to prevent silent scan failure
      if (platform === "ios") {
        await BarcodeScanner.prepare?.();
      }

      const { camera } = await BarcodeScanner.requestPermissions();
      if (camera !== "granted" && camera !== "limited") {
        setScanning(false);
        setError("Camera permission denied. Enter barcode manually.");
        return;
      }

      const { barcodes } = await BarcodeScanner.scan({
        formats: [
          BarcodeFormat.Ean13, BarcodeFormat.Ean8,
          BarcodeFormat.UpcA, BarcodeFormat.UpcE,
          BarcodeFormat.Code128, BarcodeFormat.Code39,
          BarcodeFormat.QrCode,
        ],
      });

      setScanning(false);
      if (barcodes.length > 0) {
        const code = barcodes[0].rawValue;
        setBarcode(code);
        setLoading(true);
        try {
          const res = await lookupBarcode(code);
          if (res) setSelected(res);
          else setError("not_found");
        } catch { setError("Lookup failed."); }
        setLoading(false);
      }
    } catch {
      setScanning(false);
      setError("Scan failed. Enter barcode manually.");
    }
  };

  const reset = () => { setScanning(false); setMethod(null); setResults([]); setSelected(null); setQuery(""); setBarcode(""); setAiHint(""); setAiPhoto(null); setLoading(false); setError(""); };
  const handleClose = () => { reset(); onClose(); };

  const handleAIPhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please select an image file."); return; }
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setAiPhoto({ file, previewUrl: URL.createObjectURL(file), base64, mediaType: file.type });
    setError("");
  };

  const analyzeAI = async () => {
    if (!aiHint.trim() && !aiPhoto) { setError("Add a photo or describe what you're eating."); return; }
    setLoading(true); setError(""); setSelected(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fnRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-food-photo`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          image_base64: aiPhoto?.base64 || undefined,
          media_type: aiPhoto?.mediaType || undefined,
          hint: aiHint.trim() || undefined,
        }),
      });
      const data = await fnRes.json();
      if (!fnRes.ok || data?.error) throw new Error(data?.error || `HTTP ${fnRes.status}`);
      setSelected({
        name: data.name || "Unknown food",
        serving_size: data.serving_size || "1 serving",
        calories: Math.round(data.calories || 0),
        protein_g: +(data.protein_g || 0).toFixed(1),
        carbs_g: +(data.carbs_g || 0).toFixed(1),
        fat_g: +(data.fat_g || 0).toFixed(1),
        _confidence: data.confidence,
        _notes: data.notes,
      });
    } catch (err) {
      setError("AI analysis failed: " + (err?.message || "Try again or use Search"));
    }
    setLoading(false);
  };

  const doSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(""); setResults([]); setSelected(null);
    try {
      const res = await searchUSDA(query);
      if (res.length === 0) setError("No results. Try a more specific term or use Manual.");
      else setResults(res);
    } catch {
      setError("Search failed. Check connection or try Manual.");
    }
    setLoading(false);
  };

  const doBarcode = async () => {
    const code = barcode.trim();
    if (!code) return;
    setLoading(true); setError(""); setSelected(null);
    try {
      const res = await lookupBarcode(code);
      if (res) setSelected(res);
      else setError("not_found");
    } catch {
      setError("Lookup failed.");
    }
    setLoading(false);
  };

  const handleBarcodeFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setLoading(true); setError("");
    try {
      const { BrowserMultiFormatReader, DecodeHintType } = await import("@zxing/library");
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints);
      const imgUrl = URL.createObjectURL(file);
      const img = new Image();
      img.src = imgUrl;
      await new Promise(r => { img.onload = r; img.onerror = r; });
      URL.revokeObjectURL(imgUrl);
      // Try multiple scales — ZXing works best ~800-1500px wide, large photos fail
      const scales = [1280, 800, 1920, 640];
      let code = null;
      for (const maxW of scales) {
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        try { code = reader.decodeFromCanvas(canvas).getText(); break; } catch { /* try next */ }
      }
      if (code) {
        setBarcode(code);
        const res = await lookupBarcode(code);
        if (res) { setSelected(res); setLoading(false); return; }
        else setError("not_found");
      } else {
        setError("No barcode detected. Try a clearer photo or enter the number manually.");
      }
    } catch {
      setError("Could not read barcode. Enter manually.");
    }
    setLoading(false);
  };

  const editField = (key, val) => setSelected(s => ({ ...s, [key]: parseFloat(val) || 0 }));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border max-w-md max-h-[90dvh] overflow-y-auto">
        <UpgradeModal />
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            {method && (
              <button onClick={() => { setMethod(null); setResults([]); setSelected(null); setError(""); }}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            {method ? (method === "ai" ? "AI Photo" : method === "search" ? "Search Food" : method === "barcode" ? "Barcode Lookup" : "Manual Entry") : "Add Food"}
          </DialogTitle>
        </DialogHeader>

        {/* Method picker */}
        {!method && (
          <div className="space-y-2 pt-2">
            {METHODS.map(m => (
              <button key={m.id} onClick={() => m.id === "ai" && !isPremium ? openUpgrade() : setMethod(m.id)}
                className={cn("w-full bg-secondary hover:bg-secondary/80 rounded-2xl px-3 py-2.5 flex items-center gap-3 transition-colors border hover:border-primary/30",
                  m.id === "ai" ? "border-primary/40 bg-primary/5" : "border-transparent")}>
                <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0", m.id === "ai" ? "bg-primary/20" : "bg-primary/10")}>
                  <m.icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <p className="font-heading font-semibold text-sm">{m.label}</p>
                    {m.id === "ai" && <span className="text-[9px] text-primary font-medium uppercase tracking-wider bg-primary/10 px-1.5 py-0.5 rounded-full">{isPremium ? "Fastest" : "Pro"}</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{m.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* AI */}
        {method === "ai" && !selected && (
          <div className="space-y-3 pt-2">
            <input ref={aiFileRef} type="file" accept="image/*" className="hidden" onChange={handleAIPhotoSelect} />
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-10">
                <Sparkles className="h-10 w-10 text-primary animate-pulse" />
                <p className="font-heading font-semibold text-sm">Analyzing your meal…</p>
                <p className="text-xs text-muted-foreground">GPT-4o is estimating macros</p>
              </div>
            ) : (
              <>
                {/* Text input */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Describe what you're eating</p>
                  <Input
                    placeholder='e.g. "grilled chicken with rice, about 300g"'
                    value={aiHint}
                    onChange={e => setAiHint(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && analyzeAI()}
                    className="bg-secondary border-border text-sm"
                    autoFocus
                  />
                </div>

                {/* Photo attachment */}
                {aiPhoto ? (
                  <div className="relative rounded-2xl overflow-hidden">
                    <img src={aiPhoto.previewUrl} alt="meal" className="w-full h-36 object-cover" />
                    <button
                      onClick={() => setAiPhoto(null)}
                      className="absolute top-2 right-2 h-6 w-6 rounded-full bg-black/60 flex items-center justify-center text-white">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => aiFileRef.current?.click()}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-muted-foreground">
                    <Camera className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm">Add a photo <span className="text-xs opacity-60">(optional)</span></span>
                  </button>
                )}

                {error && <p className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">{error}</p>}

                <Button
                  onClick={analyzeAI}
                  disabled={!aiHint.trim() && !aiPhoto}
                  className="w-full font-heading font-semibold rounded-2xl">
                  <Sparkles className="h-4 w-4 mr-2" />Analyze
                </Button>
              </>
            )}
          </div>
        )}

        {/* Search */}
        {method === "search" && !selected && (
          <div className="space-y-3 pt-2">
            <div className="flex gap-2">
              <Input
                placeholder="e.g. chicken breast raw, banana, oats"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && doSearch()}
                className="bg-secondary border-border flex-1"
                autoFocus
              />
              <Button onClick={doSearch} disabled={loading || !query.trim()} size="icon" className="flex-shrink-0">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            {error && <p className="text-xs text-amber-400 bg-amber-400/10 px-3 py-2 rounded-lg">{error}</p>}

            {results.length > 0 && (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                <p className="text-[11px] text-muted-foreground px-1">{results.length} results — tap to select</p>
                {results.map((food, i) => (
                  <button key={i} onClick={() => setSelected({ ...food })}
                    className="w-full text-left bg-secondary hover:bg-primary/10 rounded-xl px-3 py-2.5 transition-colors">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-sm font-medium flex-1 min-w-0 text-left">{food.name}</p>
                      {food.prep && (
                        <span className={`text-[10px] font-heading font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${food.prep.color}`}>
                          {food.prep.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-heading font-bold text-primary">{food.calories} kcal</span>
                      <span className="text-[11px] text-muted-foreground">per 100g</span>
                      <div className="flex gap-2 ml-auto">
                        <MacroBadge label="P" value={food.protein_g} color="text-cyan-400" />
                        <MacroBadge label="C" value={food.carbs_g} color="text-amber-400" />
                        <MacroBadge label="F" value={food.fat_g} color="text-pink-400" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Barcode */}
        {method === "barcode" && !selected && (
          <div className="space-y-3 pt-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleBarcodeFile} />
            <Button onClick={startScan} className="w-full" variant="outline" disabled={loading || scanning}>
              {scanning || loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
              {scanning ? "Opening scanner…" : "Scan Barcode"}
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or enter manually</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. 0123456789012"
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                onKeyDown={e => e.key === "Enter" && doBarcode()}
                className="bg-secondary border-border flex-1"
              />
              <Button onClick={doBarcode} disabled={loading || !barcode.trim()} size="icon" className="flex-shrink-0">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {error && error !== "not_found" && <p className="text-xs text-amber-400 bg-amber-400/10 px-3 py-2 rounded-lg">{error}</p>}
            {error === "not_found" && (
              <div className="bg-secondary rounded-xl p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Product not in database. Enter nutrition values manually.</p>
                <Button size="sm" className="w-full font-heading" onClick={() => { setSelected({ name: barcode, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, serving_size: "100g" }); setError(""); }}>
                  <PenLine className="h-3.5 w-3.5 mr-1.5" />Enter Manually
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Confirm / edit selected result */}
        {selected && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-sm text-primary">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-medium">Found — confirm or adjust values</span>
              {selected._confidence && (
                <span className={cn("ml-auto text-[10px] font-heading font-semibold px-2 py-0.5 rounded-full",
                  selected._confidence === "high" ? "bg-green-400/10 text-green-400" :
                  selected._confidence === "medium" ? "bg-yellow-400/10 text-yellow-400" :
                  "bg-red-400/10 text-red-400"
                )}>
                  {selected._confidence} confidence
                </span>
              )}
            </div>
            {selected._notes && (
              <p className="text-[11px] text-muted-foreground bg-secondary px-3 py-2 rounded-lg italic">{selected._notes}</p>
            )}
            <div className="bg-secondary rounded-xl p-4 space-y-3">
              <div>
                <Label className="text-[10px] text-muted-foreground mb-1 block">Food Name</Label>
                <Input value={selected.name} onChange={e => setSelected(s => ({ ...s, name: e.target.value }))} className="bg-card border-border font-medium" />
              </div>
              {selected.brand && <p className="text-xs text-muted-foreground">Brand: {selected.brand}</p>}
              <p className="text-xs text-muted-foreground">Per: {selected.serving_size}</p>
              <div className="grid grid-cols-4 gap-2">
                {[["Calories", "calories", "text-primary"], ["Protein g", "protein_g", "text-cyan-400"], ["Carbs g", "carbs_g", "text-amber-400"], ["Fat g", "fat_g", "text-pink-400"]].map(([label, key, color]) => (
                  <div key={key}>
                    <Label className={`text-[10px] mb-1 block ${color}`}>{label}</Label>
                    <Input type="number" value={selected[key] || ""} onChange={e => editField(key, e.target.value)} className="bg-card border-border text-sm" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSelected(null)} className="flex-1">Back</Button>
              <Button onClick={() => { onSelect(selected); handleClose(); }} className="flex-1 font-heading font-semibold">
                <ArrowRight className="h-4 w-4 mr-2" />Log Food
              </Button>
            </div>
          </div>
        )}

        {/* Saved meals */}
        {method === "saved" && !selected && (
          <div className="pt-2 space-y-2">
            {savedMeals.length === 0 ? (
              <div className="text-center py-10">
                <Heart className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No saved meals yet</p>
                <p className="text-xs text-muted-foreground mt-1">Tap the ♡ on any logged meal to save it</p>
              </div>
            ) : savedMeals.map(m => (
              <div key={m.id} className="flex items-center gap-3 bg-secondary rounded-2xl px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-heading font-semibold truncate">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.calories} kcal · {m.protein_g}g P · {m.carbs_g}g C · {m.fat_g}g F</p>
                </div>
                <button onClick={() => deleteSaved(m.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setSelected({ name: m.name, calories: m.calories, protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g, serving_size: m.serving_size })}
                  className="p-1.5 text-primary hover:text-primary/80 transition-colors flex-shrink-0">
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Manual */}
        {method === "manual" && !selected && (
          <div className="pt-2">
            <p className="text-sm text-muted-foreground mb-3">Enter nutrition values manually.</p>
            <Button onClick={() => setSelected({ name: "", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, serving_size: "100g" })} className="w-full">
              <PenLine className="h-4 w-4 mr-2" />Enter Manually
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
