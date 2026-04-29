import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { notificationAPI } from "../lib/api";
import { formatDateTime } from "../lib/utils";
import { Bell, Mail, Plus } from "lucide-react";

export default function NotificationSettings() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [history, setHistory] = useState([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const [s, h] = await Promise.all([notificationAPI.getSubscriptions(), notificationAPI.getHistory()]);
        setSubscriptions(s.data || []);
        setHistory(h.data || []);
      } catch {} finally { setLoading(false); }
    };
    fetch();
  }, []);

  const handleSubscribe = async () => {
    if (!email) return;
    try {
      await notificationAPI.subscribe(email, name);
      const s = await notificationAPI.getSubscriptions();
      setSubscriptions(s.data || []);
      setEmail("");
      setName("");
    } catch {}
  };

  return (
    <div className="space-y-6" data-testid="notifications-page">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscribe */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Mail className="w-4 h-4 text-primary" />Email Notifications</CardTitle>
            <CardDescription>Subscribe to critical ecosystem alerts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" data-testid="notification-email" /></div>
            <Button className="w-full" onClick={handleSubscribe} disabled={!email}><Plus className="w-4 h-4 mr-2" />Subscribe</Button>
          </CardContent>
        </Card>

        {/* Current subscriptions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Subscriptions ({subscriptions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {subscriptions.length > 0 ? (
              <div className="space-y-2">
                {subscriptions.map((sub, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-sm border border-border">
                    <div>
                      <p className="text-sm font-medium">{sub.email}</p>
                      {sub.name && <p className="text-xs text-muted-foreground">{sub.name}</p>}
                    </div>
                    <Badge variant="success" className="text-[10px]">Active</Badge>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-4">No subscriptions yet</p>}
          </CardContent>
        </Card>
      </div>

      {/* Notification History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4" />Notification History</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length > 0 ? (
            <div className="space-y-2">
              {history.map((n, i) => (
                <div key={i} className="p-3 rounded-sm border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{n.subject || "Notification"}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(n.created_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{n.message || n.body || "—"}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground text-center py-4">No notifications sent yet</p>}
        </CardContent>
      </Card>
    </div>
  );
}
