import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { weatherAPI } from "../lib/api";
import { Cloud, Thermometer, Droplets, Wind, Sun, CloudRain, CloudFog } from "lucide-react";

const conditionIcons = {
  "Sunny": Sun, "Clear": Sun, "Hot": Sun,
  "Cloudy": Cloud, "Partly Cloudy": Cloud,
  "Rainy": CloudRain, "Light Rain": CloudRain,
  "Foggy": CloudFog, "Windy": Wind,
};

export default function WeatherDashboard() {
  const [weather, setWeather] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    weatherAPI.getAll().then(res => setWeather(res.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(5)].map((_, i) => <Card key={i}><CardContent className="p-4"><div className="h-40 bg-muted animate-pulse rounded-sm" /></CardContent></Card>)}</div>;

  return (
    <div className="space-y-6" data-testid="weather-page">
      {weather.length === 0 ? (
        <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground"><Cloud className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No weather data. Seed zones first.</p></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {weather.map((w, i) => {
            const Icon = conditionIcons[w.conditions] || Cloud;
            return (
              <Card key={w.zone_id || i} data-testid={`weather-card-${i}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{w.zone_name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon className="w-10 h-10 text-primary" strokeWidth={1} />
                      <div>
                        <p className="text-3xl font-heading font-bold">{w.temperature}°C</p>
                        <p className="text-sm text-muted-foreground">{w.conditions}</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2"><Droplets className="w-4 h-4 text-blue-500" /><div><p className="text-xs text-muted-foreground">Humidity</p><p className="font-medium">{w.humidity}%</p></div></div>
                    <div className="flex items-center gap-2"><Wind className="w-4 h-4 text-gray-500" /><div><p className="text-xs text-muted-foreground">Wind</p><p className="font-medium">{w.wind_speed} km/h</p></div></div>
                  </div>

                  {/* 7-day forecast */}
                  {w.forecast?.length > 0 && (
                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">7-Day Forecast</p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {w.forecast.slice(0, 5).map((f, fi) => {
                          const FIcon = conditionIcons[f.conditions] || Cloud;
                          return (
                            <div key={fi} className="flex flex-col items-center gap-1 min-w-[50px] text-xs">
                              <span className="text-muted-foreground">D{f.day}</span>
                              <FIcon className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                              <span className="font-medium">{f.temp_high}°</span>
                              <span className="text-muted-foreground">{f.temp_low}°</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
