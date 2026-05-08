import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { droneAPI } from "../lib/api";
import { Camera, Video, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";
import { LoadingState, EmptyState, ErrorState } from "../components/state";
import { toast } from "../lib/toast";

export default function DroneCameraFeeds() {
  const [feeds, setFeeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFeeds = async ({ isAutoRefresh = false } = {}) => {
    if (!isAutoRefresh) setLoading(true);
    try {
      const res = await droneAPI.getFeeds();
      setFeeds(res.data || []);
      setError(null);
    } catch (err) {
      if (isAutoRefresh) {
        toast.error("Feed refresh failed", {
          description: err.response?.data?.detail || err.message || "Couldn't reach the API",
        });
      } else {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFeeds(); }, []);

  return (
    <div className="space-y-6" data-testid="camera-feeds-page">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{feeds.length} active feeds</p>
        <Button size="sm" variant="outline" onClick={fetchFeeds}><RefreshCw className="w-4 h-4 mr-1" />Refresh</Button>
      </div>

      {loading ? (
        <LoadingState label="Loading drone feeds..." />
      ) : error && feeds.length === 0 ? (
        <ErrorState
          title="Couldn't load drone feeds"
          error={error}
          onRetry={() => { setError(null); fetchFeeds(); }}
        />
      ) : feeds.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="No active drone feeds"
          description="Deploy drones to see live camera feeds from the field."
        />
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
