"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import dynamic from "next/dynamic";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div style={{ marginTop: 15, fontSize: 12, opacity: 0.7 }}>
      Cargando mapa…
    </div>
  ),
});

type Task = {
  id: number;
  text: string;
  created_at: string;
  lat: number | null;
  lng: number | null;
  user_id: string | null;
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

  // Auth user
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

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
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }, []);

  async function cargar() {
    const { data, error } = await supabase
      .from("tasks")
      .select("id,text,created_at,lat,lng,user_id")
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

  // Login simple (temporal)
  async function entrar() {
    const email = prompt("Email:");
    const password = prompt("Password:");
    if (!email || !password) return;

    const r = await supabase.auth.signInWithPassword({ email, password });
    if (r.error) alert(r.error.message);
  }

  async function salir() {
    await supabase.auth.signOut();
  }

  // publicar: obtiene coordenadas "en el momento"
  async function publicar() {
    const t = text.trim();
    if (t.length < 3) return;

    if (!userId) {
      alert("Tienes que iniciar sesión para publicar.");
      return;
    }

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

    // actualiza el estado si las obtuvo
    if (coords.lat !== null && coords.lng !== null) {
      setLat(coords.lat);
      setLng(coords.lng);
    }

    const { error } = await supabase.from("tasks").insert([
      {
        text: t,
        lat: coords.lat,
        lng: coords.lng,
        user_id: userId,
      },
    ]);

    setLoading(false);

    if (error) {
      console.error("Error insertar:", error.message);
      alert("Error al publicar: " + error.message);
      return;
    }

    setText("");
    cargar();
  }

  // borrar publicación (RLS ya impide borrar las de otros)
  async function borrar(id: number) {
    if (!confirm("¿Eliminar esta publicación?")) return;

    const { error } = await supabase.from("tasks").delete().eq("id", id);

    if (error) {
      console.error("Error borrar:", error.message);
      alert("No se pudo borrar: " + error.message);
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

      {/* Auth UI temporal */}
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        {userId ? (
          <>
            <div style={{ fontSize: 12, opacity: 0.7, alignSelf: "center" }}>
              Sesión iniciada
            </div>
            <button onClick={salir}>Salir</button>
          </>
        ) : (
          <button onClick={entrar}>Entrar</button>
        )}
      </div>

      <MapView lat={lat ?? 39.57} lng={lng ?? 2.65} radioKm={radioKm} />

      {lat === null || lng === null ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
          Obteniendo ubicación…
        </div>
      ) : null}

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
        placeholder="Ej: iPhone 15 Pro"
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

            {/* Papelera SOLO si es del usuario */}
            {userId && t.user_id === userId ? (
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
            ) : null}
          </div>

          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
            {new Date(t.created_at).toLocaleString()}
          </div>
        </div>
      ))}
    </main>
  );
}