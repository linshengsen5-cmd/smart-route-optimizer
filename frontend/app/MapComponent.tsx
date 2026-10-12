"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L, { LatLngExpression, LatLngBoundsExpression } from "leaflet";
import polyline from "@mapbox/polyline";

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

interface ScheduleItem {
  type: string;
  name?: string;
  lat?: number;
  lng?: number;
  polyline?: string;
  arrive_time?: string;
  leave_time?: string;
}

interface MapProps {
  schedule?: ScheduleItem[];
}

function ChangeView({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && Array.isArray(bounds) && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [bounds, map]);
  return null;
}

export default function MapComponent({ schedule = [] }: MapProps) {
  const spots = (schedule || []).filter((item) => item.type === "spot" && item.lat && item.lng);

  // 移動区間ごとの encodedPolyline をデコードして道路沿いの座標配列を作成
  const detailedRoutePaths = useMemo(() => {
    const paths: [number, number][][] = [];
    (schedule || []).forEach((item) => {
      if (item.type === "travel" && item.polyline) {
        // polyline.decode は [[lat, lng], [lat, lng], ...] の形式を返す
        const decoded = polyline.decode(item.polyline) as [number, number][];
        if (decoded.length > 0) {
          paths.push(decoded);
        }
      }
    });
    return paths;
  }, [schedule]);

  // 全ルートの全座標（地図のズーム範囲自動調整用）
  const allCoords: [number, number][] = useMemo(() => {
    const flatCoords = detailedRoutePaths.flat();
    if (flatCoords.length > 0) return flatCoords;
    return spots.map((s) => [s.lat!, s.lng!]);
  }, [detailedRoutePaths, spots]);

  const center: LatLngExpression =
    spots.length > 0 ? [spots[0].lat!, spots[0].lng!] : [34.9948, 135.7850];

  return (
    <div className="w-full h-[450px] rounded-2xl overflow-hidden shadow-lg border border-slate-200">
      <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* 道路に沿った実際の走行ルートを描画 */}
        {detailedRoutePaths.map((path, idx) => (
          <Polyline
            key={idx}
            positions={path as LatLngExpression[]}
            color="#2563eb"
            weight={5}
            opacity={0.8}
          />
        ))}

        {/* スポットのマーカー */}
        {spots.map((spot, idx) => (
          <Marker key={idx} position={[spot.lat!, spot.lng!]} icon={defaultIcon}>
            <Popup>
              <div className="font-sans">
                <div className="font-bold text-sm text-slate-800">
                  {idx + 1}. {spot.name}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  到着: {spot.arrive_time || "-"} / 出発: {spot.leave_time || "-"}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {allCoords.length > 0 && (
          <ChangeView bounds={allCoords as LatLngBoundsExpression} />
        )}
      </MapContainer>
    </div>
  );
}