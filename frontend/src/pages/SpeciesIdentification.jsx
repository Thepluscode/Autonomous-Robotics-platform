import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { speciesAPI, zoneAPI } from "../lib/api";
import { formatDateTime } from "../lib/utils";
import { Bug, Search, Loader2, History, Upload, Link2, Image as ImageIcon } from "lucide-react";

export default function SpeciesIdentification() {
  const [zones, setZones] = useState([]);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [zoneId, setZoneId] = useState("__any__");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetch = async () => {
      try {
        const [z, h, s] = await Promise.all([zoneAPI.getAll(), speciesAPI.getHistory(), speciesAPI.getStats()]);
        setZones(z.data || []);
        setHistory(h.data || []);
        setStats(s.data);
      } catch {}
    };
    fetch();
  }, []);

  const refreshSpeciesData = async () => {
    const [h, s] = await Promise.all([speciesAPI.getHistory(), speciesAPI.getStats()]);
    setHistory(h.data || []);
    setStats(s.data);
  };

  const normalizedZoneId = zoneId === "__any__" ? undefined : zoneId;

  const handleIdentify = async () => {
    if (!imageUrl) return;
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const res = await speciesAPI.identify(imageUrl, normalizedZoneId);
      setResult(res.data);
      await refreshSpeciesData();
    } catch {
      setError("Species identification failed. Check the image URL and try again.");
    } finally { setLoading(false); }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    setSelectedFile(file || null);
    setResult(null);
    setError("");
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const handleUploadIdentify = async () => {
    if (!selectedFile || !previewUrl) return;
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const res = await speciesAPI.identifyUpload(previewUrl, selectedFile, normalizedZoneId);
      setResult(res.data);
      await refreshSpeciesData();
    } catch {
      setError("Species identification failed. Upload a valid image under 5MB.");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6" data-testid="species-id-page">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total IDs", value: stats.total_identifications },
            { label: "Unique Species", value: stats.unique_species },
            { label: "Endangered", value: stats.endangered_count },
            { label: "Vulnerable", value: stats.vulnerable_count },
          ].map(s => (
            <Card key={s.label}><CardContent className="p-4 text-center">
              <p className="text-2xl font-heading font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
            </CardContent></Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Bug className="w-4 h-4 text-primary" />Identify Species</CardTitle>
            <CardDescription>Submit field imagery from a drone feed or local observation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="upload" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload" data-testid="species-upload-tab"><Upload className="w-4 h-4 mr-2" />Upload</TabsTrigger>
                <TabsTrigger value="url" data-testid="species-url-tab"><Link2 className="w-4 h-4 mr-2" />URL</TabsTrigger>
              </TabsList>
              <TabsContent value="upload" className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="species-image-file">Image File</Label>
                  <Input
                    id="species-image-file"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    data-testid="species-image-file"
                  />
                </div>
                {previewUrl ? (
                  <img src={previewUrl} alt="Selected species observation" className="h-36 w-full rounded-sm border border-border object-cover" />
                ) : (
                  <div className="flex h-36 items-center justify-center rounded-sm border border-dashed border-border bg-muted/40 text-muted-foreground">
                    <ImageIcon className="w-8 h-8 opacity-40" />
                  </div>
                )}
                <Button className="w-full" onClick={handleUploadIdentify} disabled={!selectedFile || !previewUrl || loading} data-testid="species-identify-upload-btn">
                  {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Identifying...</> : <><Search className="w-4 h-4 mr-2" />Identify Upload</>}
                </Button>
              </TabsContent>
              <TabsContent value="url" className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="species-image-url">Image URL</Label>
                  <Input id="species-image-url" placeholder="https://..." value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} data-testid="species-image-url" />
                </div>
                <Button className="w-full" onClick={handleIdentify} disabled={!imageUrl || loading} data-testid="species-identify-url-btn">
                  {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Identifying...</> : <><Search className="w-4 h-4 mr-2" />Identify URL</>}
                </Button>
              </TabsContent>
            </Tabs>
            <div className="space-y-2">
              <Label>Zone (optional)</Label>
              <Select value={zoneId} onValueChange={setZoneId}>
                <SelectTrigger data-testid="species-zone-select"><SelectValue placeholder="Any zone" /></SelectTrigger>
                <SelectContent><SelectItem value="__any__">Any</SelectItem>{zones.filter(z => z.id).map(z => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive" data-testid="species-identify-error">{error}</p>}
          </CardContent>
        </Card>

        {/* Result */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Result</CardTitle></CardHeader>
          <CardContent>
            {result ? (
              <div className="space-y-3">
                <div className="flex gap-4">
                  {result.image_url && <img src={result.image_url} alt="Species" className="w-32 h-32 object-cover rounded-sm border border-border" />}
                  <div className="space-y-1">
                    <p className="font-heading font-semibold text-lg">{result.species_name}</p>
                    {result.scientific_name && <p className="text-sm text-muted-foreground italic">{result.scientific_name}</p>}
                    <Badge variant={result.confidence > 0.7 ? "success" : "warning"}>Confidence: {Math.round((result.confidence || 0) * 100)}%</Badge>
                  </div>
                </div>
                {result.ai_analysis && <div className="p-3 rounded-sm bg-muted/50 border border-border"><p className="text-sm">{result.ai_analysis}</p></div>}
              </div>
            ) : <div className="text-center py-12 text-muted-foreground"><Bug className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="text-sm">Submit an image to identify species</p></div>}
          </CardContent>
        </Card>
      </div>

      {/* History */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" />Identification History</CardTitle></CardHeader>
        <CardContent>
          {history.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {history.map((item, i) => (
                <div key={item.id || i} className="flex items-center gap-3 p-3 rounded-sm border border-border">
                  {item.image_url && <img src={item.image_url} alt="" className="w-12 h-12 object-cover rounded-sm" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.species_name}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground text-center py-4">No identifications yet</p>}
        </CardContent>
      </Card>
    </div>
  );
}
