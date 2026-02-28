"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, TileLayer, Circle, Marker, useMap } from "react-leaflet";
import L from "leaflet";

// Fix icon (en Next/Vercel a veces no se ve el marcador)
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView([lat, lng]);
  }, [lat, lng, map]);

  return null;
}

export default function MapView({
  lat,
  lng,
  radioKm,
}: {
  lat: number;
  lng: number;
  radioKm: number;
}) {
  const center: [number, number] = [lat, lng];
  const radiusMeters = radioKm * 1000;

  return (
    <div style={{ marginTop: 15, border: "1px solid #ddd" }}>
      <MapContainer
        center={center}
        zoom={radioKm >= 100 ? 7 : radioKm >= 25 ? 10 : 13}
        style={{ height: 300, width: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Recenter lat={lat} lng={lng} />

        <Marker position={center} />
        <Circle
          center={center}
          radius={radiusMeters}
          pathOptions={{ fillOpacity: 0.2 }}
        />
      </MapContainer>
    </div>
  );
}