import { AppSettings, Profile } from "../types";
import { supabase } from "./supabase";

function mapProfile(row: any): Profile {
  return {
    id: row.id,
    name: row.name ?? "",
    email: row.email ?? "",
    avatarDataUrl: row.avatar_data_url ?? null,
    role: row.role,
    isActive: row.is_active
  };
}

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthChange(callback: () => void) {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange(() => callback());
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error("Supabase não configurado.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(name: string, email: string, password: string) {
  if (!supabase) throw new Error("Supabase não configurado.");
  const emailRedirectTo = `${window.location.origin}/DeiaCakes/?email_confirmed=1`;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo
    }
  });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function loadMyProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) throw error;
  return mapProfile(data);
}

export async function loadProfiles(): Promise<Profile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("name");

  if (error) throw error;
  return (data ?? []).map(mapProfile);
}

export async function saveMyProfile(profile: Profile) {
  if (!supabase) return;
  const { error } = await supabase
    .from("profiles")
    .update({
      name: profile.name,
      avatar_data_url: profile.avatarDataUrl
    })
    .eq("id", profile.id);

  if (error) throw error;
}

export async function saveUserAccess(profile: Profile) {
  if (!supabase) return;
  const { error } = await supabase
    .from("profiles")
    .update({
      role: profile.role,
      is_active: profile.isActive
    })
    .eq("id", profile.id);

  if (error) throw error;
}

export async function loadSettings(): Promise<AppSettings> {
  const fallback: AppSettings = {
    appName: "Déia Cake Ateliê",
    logoDataUrl: null,
    backgroundDataUrl: null,
    backgroundOpacity: 0.08
  };

  if (!supabase) return fallback;

  const { data, error } = await supabase
    .from("app_settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) return fallback;

  return {
    appName: data.app_name ?? fallback.appName,
    logoDataUrl: data.logo_data_url ?? null,
    backgroundDataUrl: data.background_data_url ?? null,
    backgroundOpacity: Number(data.background_opacity ?? 0.08)
  };
}

export async function saveSettings(settings: AppSettings) {
  if (!supabase) return;
  const { error } = await supabase
    .from("app_settings")
    .update({
      app_name: settings.appName,
      logo_data_url: settings.logoDataUrl,
      background_data_url: settings.backgroundDataUrl,
      background_opacity: settings.backgroundOpacity,
      updated_at: new Date().toISOString()
    })
    .eq("id", 1);

  if (error) throw error;
}

export function fileToDataUrl(file: File, maxSize = 1400, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Imagem inválida."));
      image.onload = () => {
        const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * ratio);
        canvas.height = Math.round(image.height * ratio);

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Não foi possível preparar a imagem."));
          return;
        }

        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/webp", quality));
      };
      image.src = String(reader.result);
    };

    reader.readAsDataURL(file);
  });
}
