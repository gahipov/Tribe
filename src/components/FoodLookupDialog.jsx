import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, PenLine, ArrowRight, X, Barcode, ChevronRight, CheckCircle2, Camera, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useUpgradeModal } from "@/components/PremiumGate";

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
  { id: "ai", label: "AI Photo", icon: Sparkles, desc: "Snap & get macros" },
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
  const { isPremium } = useAuth();
  const { openUpgrade, UpgradeModal } = useUpgradeModal("AI Photo Meal Logging");
  const [method, setMethod] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const aiFileRef = useRef(null);

  const reset = () => { setMethod(null); setResults([]); setSelected(null); setQuery(""); setBarcode(""); setLoading(false); setError(""); };
  const handleClose = () => { reset(); onClose(); };

  const handleAIPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please select an image file."); return; }

    setLoading(true); setError(""); setSelected(null);
    try {
      // Convert to base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Call Edge Function via direct fetch so we can read the raw error body
      const { data: { session } } = await supabase.auth.getSession();
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-food-photo`;
      const fnRes = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ image_base64: base64, media_type: file.type }),
      });

      const data = await fnRes.json();
      console.log("Edge fn response:", fnRes.status, data);
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
      else setError("Product not found. Try manual entry.");
    } catch {
      setError("Lookup failed.");
    }
    setLoading(false);
  };

  const handleBarcodeFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if ("BarcodeDetector" in window) {
      setLoading(true);
      try {
        const bitmap = await createImageBitmap(file);
        const detector = new window.BarcodeDetector();
        const codes = await detector.detect(bitmap);
        if (codes.length > 0) {
          setBarcode(codes[0].rawValue);
          const res = await lookupBarcode(codes[0].rawValue);
          if (res) { setSelected(res); setLoading(false); return; }
        }
        setError("No barcode detected. Enter it manually below.");
      } catch {
        setError("Could not read barcode. Enter it manually.");
      }
      setLoading(false);
    } else {
      setError("Auto-scan not supported in this browser. Enter barcode number manually.");
    }
  };

  const editField = (key, val) => setSelected(s => ({ ...s, [key]: parseFloat(val) || 0 }));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
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
          <div className="grid grid-cols-2 gap-2 pt-2">
            {METHODS.map(m => (
              <button key={m.id} onClick={() => m.id === "ai" && !isPremium ? openUpgrade() : setMethod(m.id)}
                className={cn("bg-secondary hover:bg-secondary/80 rounded-2xl p-3 flex flex-col items-center gap-2 text-center transition-colors border hover:border-primary/30",
                  m.id === "ai" ? "border-primary/40 bg-primary/5" : "border-transparent")}>
                <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", m.id === "ai" ? "bg-primary/20" : "bg-primary/10")}>
                  <m.icon className={cn("h-5 w-5", m.id === "ai" ? "text-primary" : "text-primary")} />
                </div>
                <div>
                  <p className="font-heading font-semibold text-sm">{m.label}</p>
                  {m.id === "ai" && <span className="text-[9px] text-primary font-medium uppercase tracking-wider">{isPremium ? "Fastest" : "Pro"}</span>}
                  <p className="text-[10px] text-muted-foreground leading-tight">{m.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* AI Photo */}
        {method === "ai" && !selected && (
          <div className="space-y-4 pt-2">
            <input ref={aiFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleAIPhoto} />
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-10">
                <div className="relative">
                  <Sparkles className="h-10 w-10 text-primary animate-pulse" />
                </div>
                <p className="font-heading font-semibold text-sm">Analyzing your meal…</p>
                <p className="text-xs text-muted-foreground">GPT-4o is estimating macros</p>
              </div>
            ) : (
              <>
                <div
                  onClick={() => aiFileRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed border-primary/30 rounded-2xl cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-colors"
                >
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Camera className="h-7 w-7 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="font-heading font-semibold">Take a photo of your meal</p>
                    <p className="text-xs text-muted-foreground mt-1">Or tap to choose from gallery</p>
                  </div>
                </div>
                <div className="bg-secondary rounded-xl p-3 space-y-1">
                  <p className="text-xs font-heading font-semibold text-foreground">Tips for best results</p>
                  <p className="text-[11px] text-muted-foreground">• Good lighting, food fills the frame</p>
                  <p className="text-[11px] text-muted-foreground">• Separate dishes get better estimates</p>
                  <p className="text-[11px] text-muted-foreground">• Always review and adjust before logging</p>
                </div>
                {error && <p className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">{error}</p>}
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
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleBarcodeFile} />
            <Button onClick={() => fileRef.current?.click()} className="w-full" variant="outline" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Barcode className="h-4 w-4 mr-2" />}
              Scan Barcode with Camera
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
            {error && <p className="text-xs text-amber-400 bg-amber-400/10 px-3 py-2 rounded-lg">{error}</p>}
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
