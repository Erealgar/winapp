"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

type Task = {
  id: number;
  text: string;
  created_at: string;
  lat: number | null;
  lng: number | null;
};

function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const RADIOS_KM = [1, 3, 5, 10, 25, 50, 100, 200, 500] as const;
type RadioKm = (typeof RADIOS_KM)[number];

export default function Home() {
  const [text, setText] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  const [radioKm, setRadioKm] = useState<RadioKm>(5);

  // GPS (intento inicial)
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLat(null);
      setLng(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
      },
      () => {
        setLat(null);
        setLng(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  async function cargar() {
    const { data, error } = await supabase
      .from("tasks")
      .select("id,text,created_at,lat,lng")
      .order("id", { ascending: false });

    if (error) {
      console.error("Error cargar:", error.message);
      return;
    }

    setTasks((data ?? []) as Task[]);
  }

  useEffect(() => {
    cargar();
    const timer = setInterval(cargar, 5000);
    return () => clearInterval(timer);
  }, []);

  // publicar: obtiene coordenadas "en el momento" (arregla móvil si el state aún está null)
  async function publicar() {
    const t = text.trim();
    if (t.length < 3) return;

    setLoading(true);

    const coords = await new Promise<{ lat: number | null; lng: number | null }>(
      (resolve) => {
        if (!navigator.geolocation) return resolve({ lat: null, lng: null });

        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            }),
          () => resolve({ lat: null, lng: null }),
          { enableHighAccuracy: true, timeout: 8000 }
        );
      }
    );

    // actualiza el estado si las obtuvo (para que filtre bien después)
    if (coords.lat !== null && coords.lng !== null) {
      setLat(coords.lat);
      setLng(coords.lng);
    }

    const { error } = await supabase.from("tasks").insert([
      {
        text: t,
        lat: coords.lat,
        lng: coords.lng,
      },
    ]);

    setLoading(false);

    if (error) {
      console.error("Error insertar:", error.message);
      alert("Error al publicar (mira consola).");
      return;
    }

    setText("");
    cargar();
  }

  // borrar publicación
  async function borrar(id: number) {
    if (!confirm("¿Eliminar esta publicación?")) return;

    const { error } = await supabase.from("tasks").delete().eq("id", id);

    if (error) {
      console.error("Error borrar:", error.message);
      alert("No se pudo borrar. (Mira consola / RLS en Supabase)");
      return;
    }

    cargar();
  }

  const tareasFiltradas = useMemo(() => {
    if (lat === null || lng === null) return tasks;

    return tasks.filter((t) => {
      if (t.lat === null || t.lng === null) return true;
      return distanciaKm(lat, lng, t.lat, t.lng) <= radioKm;
    });
  }, [tasks, lat, lng, radioKm]);

  return (
    <main style={{ maxWidth: 700, margin: "40px auto", fontFamily: "Arial" }}>
      <h1>Necesidades cerca</h1>

      {/* Debug temporal */}
      <div style={{ fontSize: 12, opacity: 0.7 }}>
        lat={lat ?? "null"} lng={lng ?? "null"}
      </div>

      <div style={{ marginTop: 10 }}>

        Radio:{" "}
        <select
          value={radioKm}
          onChange={(e) => setRadioKm(parseInt(e.target.value, 10) as RadioKm)}
        >
          {RADIOS_KM.map((km) => (
            <option key={km} value={km}>
              {km} km
            </option>
          ))}
        </select>
      </div>

      <input
  value={text}
  onChange={(e) => setText(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      publicar();
    }
  }}
  placeholder="Ej: arreglar persiana"
  style={{ width: "100%", padding: 10, marginTop: 20 }}
/>

      <button
        onClick={publicar}
        disabled={loading}
        style={{
          width: "100%",
          padding: 10,
          marginTop: 10,
          background: "black",
          color: "white",
          border: "none",
          opacity: loading ? 0.6 : 1,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Publicando..." : "Publicar"}
      </button>

      <h2 style={{ marginTop: 30 }}>Necesidades (filtradas por {radioKm} km)</h2>

      {tareasFiltradas.map((t) => (
        <div
          key={t.id}
          style={{ border: "1px solid #ccc", padding: 10, marginTop: 10 }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div>{t.text}</div>

            <button
              onClick={() => borrar(t.id)}
              style={{
                border: "1px solid #ccc",
                background: "white",
                cursor: "pointer",
                padding: "2px 8px",
              }}
              title="Eliminar"
            >
              🗑️
            </button>
          </div>

          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
            {new Date(t.created_at).toLocaleString()}
          </div>
        </div>
      ))}
    </main>
  );
}