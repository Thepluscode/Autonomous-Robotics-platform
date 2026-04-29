import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { droneAPI } from "../lib/api";
import { Camera, Video, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";

export default function DroneCameraFeeds() {
  const [feeds, setFeeds] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchFeeds = async () => {
    setLoading(true);
    try { const res = await droneAPI.getFeeds(); setFeeds(res.data || []); }
    catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchFeeds(); }, []);

  return (
    <div className="space-y-6" data-testid="camera-feeds-page">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{feeds.length} active feeds</p>
        <Button size="sm" variant="outline" onClick={fetchFeeds}><RefreshCw className="w-4 h-4 mr-1" />Refresh</Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => <Card key={i}><CardContent className="p-0"><div className="h-48 bg-muted animate-pulse" /></CardContent></Card>)}
        </div>
      ) : feeds.length === 0 ? (
        <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground">
          <Camera className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No active drone feeds. Deploy drones to see camera feeds.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {feeds.map((feed, i) => (
            <Card key={feed.drone_id || i} className="overflow-hidden" data-testid={`feed-card-${i}`}>
              <div className="relative">
                <img src={feed.feed_url} alt={feed.drone_name} className="w-full h-48 object-cover" loading="lazy" />
                <div className="absolute top-2 left-2 flex items-center gap-1">
                  <Badge variant="destructive" className="text-[10px] gap-1"><Video className="w-2.5 h-2.5" />LIVE</Badge>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                  <p className="text-white text-sm font-medium">{feed.drone_name}</p>
                  {feed.zone_name && <p className="text-white/70 text-xs">{feed.zone_name}</p>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
