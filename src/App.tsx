import { FormEvent, useEffect, useMemo, useState } from "react";
import { Camera, LogOut, Settings, ShieldCheck, UserRound, UsersRound, X } from "lucide-react";
import BusinessApp from "./BusinessApp";
import {
  fileToDataUrl,
  getSession,
  loadMyProfile,
  loadProfiles,
  loadSettings,
  onAuthChange,
  saveMyProfile,
  saveSettings,
  saveUserAccess,
  signIn,
  signOut,
  signUp
} from "./lib/account";
import { AppSettings, Profile } from "./types";
import { supabase } from "./lib/supabase";

const defaultLogo = "/DeiaCakes/deia-logo.webp";

export default function App() {
  const [session, setSession] = useState<any>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    appName: "Déia Cake Ateliê",
    logoDataUrl: null,
    backgroundDataUrl: null,
    backgroundOpacity: 0.08
  });
  const [accountOpen, setAccountOpen] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(
    new URLSearchParams(window.location.search).get("email_confirmed") === "1"
  );

  async function refreshSession() {
    const current = await getSession();
    setSession(current);

    if (!current) {
      setProfile(null);
      return;
    }

    setLoadingProfile(true);
    try {
      const myProfile = await loadMyProfile();
      setProfile(myProfile);
    } finally {
      setLoadingProfile(false);
    }
  }

  async function refreshSettings() {
    const value = await loadSettings();
    setSettings(value);
  }

  useEffect(() => {
    refreshSession();
    refreshSettings();
    return onAuthChange(refreshSession);
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;

    let refreshTimer = 0;
    const scheduleAccountRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(async () => {
        await refreshSettings();
        const currentProfile = await loadMyProfile();
        if (currentProfile) setProfile(currentProfile);
      }, 180);
    };

    const channel = supabase
      .channel("deia-cakes-account-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, scheduleAccountRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, scheduleAccountRefresh)
      .subscribe();

    return () => {
      window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [session]);

  useEffect(() => {
    if (!emailConfirmed) return;

    const url = new URL(window.location.href);
    url.searchParams.delete("email_confirmed");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, [emailConfirmed]);

  useEffect(() => {
    const logo = settings.logoDataUrl || defaultLogo;
    const manifest = {
      name: settings.appName,
      short_name: "Déia Cake",
      description: "Controle de pedidos, clientes, pagamentos e produção",
      theme_color: "#9a5d47",
      background_color: "#fff9f1",
      display: "standalone",
      start_url: "/DeiaCakes/",
      icons: [
        {
          src: logo,
          sizes: "512x512",
          type: settings.logoDataUrl ? "image/webp" : "image/webp",
          purpose: "any maskable"
        }
      ]
    };

    const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
    const url = URL.createObjectURL(blob);
    let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;

    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }

    link.href = url;
    document.title = settings.appName;

    return () => URL.revokeObjectURL(url);
  }, [settings]);

  const shellStyle = useMemo(() => {
    const logo = settings.logoDataUrl || defaultLogo;
    const background = settings.backgroundDataUrl ? `url("${settings.backgroundDataUrl}")` : "none";

    return {
      "--brand-logo": `url("${logo}")`,
      "--custom-background": background,
      "--custom-background-opacity": String(settings.backgroundOpacity)
    } as React.CSSProperties;
  }, [settings]);

  if (session === undefined || loadingProfile) {
    return <div className="auth-loading">Carregando Déia Cake Ateliê...</div>;
  }

  if (!session) {
    return (
      <AuthScreen
        settings={settings}
        onAuthenticated={refreshSession}
        emailConfirmed={emailConfirmed}
        onDismissConfirmation={() => setEmailConfirmed(false)}
      />
    );
  }

  if (!profile) {
    return <div className="auth-loading">Preparando seu perfil...</div>;
  }

  if (!profile.isActive) {
    return (
      <div className="auth-page" style={shellStyle}>
        <div className="auth-card compact-auth">
          <BrandHeader settings={settings} />
          <h2>Acesso desativado</h2>
          <p>Este usuário está cadastrado, mas o acesso foi desativado por um administrador.</p>
          <button className="primary-button" onClick={signOut}>Sair</button>
        </div>
      </div>
    );
  }

  return (
    <div className="customized-app" style={shellStyle}>
      <BusinessApp />

      <button className="account-fab" onClick={() => setAccountOpen(true)} aria-label="Minha conta">
        {profile.avatarDataUrl ? (
          <img src={profile.avatarDataUrl} alt="" />
        ) : (
          <UserRound size={22} />
        )}
      </button>

      {accountOpen && (
        <AccountPanel
          profile={profile}
          settings={settings}
          onClose={() => setAccountOpen(false)}
          onProfileChange={(value) => setProfile(value)}
          onSettingsChange={(value) => setSettings(value)}
        />
      )}
    </div>
  );
}

function BrandHeader({ settings }: { settings: AppSettings }) {
  return (
    <div className="auth-brand">
      <img src={settings.logoDataUrl || defaultLogo} alt="Logo Déia Cake Ateliê" />
      <div>
        <strong>{settings.appName}</strong>
        <span>Controle de vendas e encomendas</span>
      </div>
    </div>
  );
}

function AuthScreen({
  settings,
  onAuthenticated,
  emailConfirmed,
  onDismissConfirmation
}: {
  settings: AppSettings;
  onAuthenticated: () => Promise<void>;
  emailConfirmed: boolean;
  onDismissConfirmation: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      if (mode === "login") {
        await signIn(email.trim(), password);
        await onAuthenticated();
      } else {
        await signUp(name.trim(), email.trim(), password);
        setMessage("Cadastro criado. Se o Supabase pedir confirmação de e-mail, confirme antes de entrar.");
        setMode("login");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <BrandHeader settings={settings} />

        {emailConfirmed && (
          <div className="confirmation-banner">
            <div>
              <strong>E-mail confirmado ✓</strong>
              <span>Seu acesso foi confirmado. Agora é só entrar.</span>
            </div>
            <button type="button" onClick={onDismissConfirmation} aria-label="Fechar">×</button>
          </div>
        )}

        <div className="auth-copy">
          <h1>{mode === "login" ? "Entrar" : "Criar usuário"}</h1>
          <p>
            {mode === "login"
              ? "Acesse os pedidos, clientes e pagamentos."
              : "O primeiro usuário cadastrado vira administrador automaticamente."}
          </p>
        </div>

        <form className="form auth-form" onSubmit={submit}>
          {mode === "register" && (
            <label>
              <span>Nome</span>
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
          )}

          <label>
            <span>E-mail</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>

          <label>
            <span>Senha</span>
            <input type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>

          {message && <div className="auth-message">{message}</div>}

          <button className="primary-button wide-button" disabled={busy}>
            {busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar usuário"}
          </button>
        </form>

        <button className="text-button" onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setMessage("");
        }}>
          {mode === "login" ? "Primeiro acesso? Criar usuário" : "Já tenho usuário"}
        </button>
      </div>
    </div>
  );
}

function AccountPanel({
  profile,
  settings,
  onClose,
  onProfileChange,
  onSettingsChange
}: {
  profile: Profile;
  settings: AppSettings;
  onClose: () => void;
  onProfileChange: (profile: Profile) => void;
  onSettingsChange: (settings: AppSettings) => void;
}) {
  const [section, setSection] = useState<"profile" | "settings" | "users">("profile");

  return (
    <div className="account-backdrop" onMouseDown={onClose}>
      <aside className="account-panel" onMouseDown={(event) => event.stopPropagation()}>
        <div className="account-panel-header">
          <div className="account-user">
            <div className="account-avatar">
              {profile.avatarDataUrl ? <img src={profile.avatarDataUrl} alt="" /> : <UserRound size={24} />}
            </div>
            <div>
              <strong>{profile.name}</strong>
              <span>{profile.email}</span>
            </div>
          </div>
          <button className="icon-button" onClick={onClose}><X size={19} /></button>
        </div>

        <div className="account-tabs">
          <button className={section === "profile" ? "active" : ""} onClick={() => setSection("profile")}>
            <UserRound size={17} /> Meu perfil
          </button>
          {profile.role === "admin" && (
            <>
              <button className={section === "settings" ? "active" : ""} onClick={() => setSection("settings")}>
                <Settings size={17} /> Aparência
              </button>
              <button className={section === "users" ? "active" : ""} onClick={() => setSection("users")}>
                <UsersRound size={17} /> Usuários
              </button>
            </>
          )}
        </div>

        <div className="account-content">
          {section === "profile" && (
            <ProfileEditor profile={profile} onChange={onProfileChange} />
          )}
          {section === "settings" && profile.role === "admin" && (
            <AppearanceEditor settings={settings} onChange={onSettingsChange} />
          )}
          {section === "users" && profile.role === "admin" && (
            <UsersEditor currentUserId={profile.id} />
          )}
        </div>

        <button className="logout-button" onClick={signOut}>
          <LogOut size={17} /> Sair
        </button>
      </aside>
    </div>
  );
}

function ProfileEditor({
  profile,
  onChange
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatarDataUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function chooseAvatar(file?: File) {
    if (!file) return;
    setAvatar(await fileToDataUrl(file, 600, 0.82));
  }

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const updated = { ...profile, name: name.trim(), avatarDataUrl: avatar };
      await saveMyProfile(updated);
      onChange(updated);
      setMessage("Perfil salvo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-section">
      <h2>Meu perfil</h2>
      <p>Essa foto aparece no botão da sua conta.</p>

      <label className="image-picker avatar-picker">
        <div className="preview-avatar">
          {avatar ? <img src={avatar} alt="" /> : <UserRound size={36} />}
        </div>
        <span><Camera size={16} /> Alterar foto</span>
        <input type="file" accept="image/*" onChange={(event) => chooseAvatar(event.target.files?.[0])} />
      </label>

      <label className="settings-field">
        <span>Nome</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>

      <div className="profile-role">
        <ShieldCheck size={17} />
        {profile.role === "admin" ? "Administrador" : "Usuário"}
      </div>

      {message && <div className="inline-message">{message}</div>}
      <button className="primary-button" onClick={save} disabled={busy}>{busy ? "Salvando..." : "Salvar perfil"}</button>
    </div>
  );
}

function AppearanceEditor({
  settings,
  onChange
}: {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function pick(kind: "logo" | "background", file?: File) {
    if (!file) return;
    const value = await fileToDataUrl(file, kind === "logo" ? 800 : 1600, 0.82);
    setDraft((current) => kind === "logo"
      ? { ...current, logoDataUrl: value }
      : { ...current, backgroundDataUrl: value });
  }

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await saveSettings(draft);
      onChange(draft);
      setMessage("Aparência atualizada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-section">
      <h2>Aparência do app</h2>
      <p>Logo, ícone da PWA e fundo podem ser trocados daqui.</p>

      <label className="settings-field">
        <span>Nome do app</span>
        <input value={draft.appName} onChange={(event) => setDraft({ ...draft, appName: event.target.value })} />
      </label>

      <label className="image-picker brand-picker">
        <img src={draft.logoDataUrl || defaultLogo} alt="" />
        <span><Camera size={16} /> Alterar logo e ícone</span>
        <input type="file" accept="image/*" onChange={(event) => pick("logo", event.target.files?.[0])} />
      </label>

      <label className="image-picker background-picker">
        <div
          className="background-preview"
          style={draft.backgroundDataUrl ? { backgroundImage: `url("${draft.backgroundDataUrl}")` } : undefined}
        >
          {!draft.backgroundDataUrl && "Sem imagem de fundo"}
        </div>
        <span><Camera size={16} /> Alterar imagem de fundo</span>
        <input type="file" accept="image/*" onChange={(event) => pick("background", event.target.files?.[0])} />
      </label>

      {draft.backgroundDataUrl && (
        <>
          <label className="settings-field">
            <span>Intensidade do fundo: {Math.round(draft.backgroundOpacity * 100)}%</span>
            <input
              type="range"
              min="0.03"
              max="0.35"
              step="0.01"
              value={draft.backgroundOpacity}
              onChange={(event) => setDraft({ ...draft, backgroundOpacity: Number(event.target.value) })}
            />
          </label>
          <button className="text-button left-text" onClick={() => setDraft({ ...draft, backgroundDataUrl: null })}>
            Remover imagem de fundo
          </button>
        </>
      )}

      {message && <div className="inline-message">{message}</div>}
      <button className="primary-button" onClick={save} disabled={busy}>{busy ? "Salvando..." : "Salvar aparência"}</button>
      <small className="settings-note">Se o ícone de um app já instalado não mudar, remova e instale a PWA novamente para o celular buscar o novo ícone.</small>
    </div>
  );
}

function UsersEditor({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    try {
      setUsers(await loadProfiles());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar usuários.");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function update(user: Profile, changes: Partial<Profile>) {
    const next = { ...user, ...changes };
    setBusyId(user.id);
    setMessage("");

    try {
      await saveUserAccess(next);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="settings-section">
      <h2>Usuários</h2>
      <p>Controle quem entra no app e quem pode alterar configurações.</p>

      <div className="users-list">
        {users.map((user) => (
          <div className="user-access-card" key={user.id}>
            <div className="mini-avatar">
              {user.avatarDataUrl ? <img src={user.avatarDataUrl} alt="" /> : <UserRound size={19} />}
            </div>
            <div className="user-access-main">
              <strong>{user.name || user.email}</strong>
              <span>{user.email}</span>
            </div>
            <select
              value={user.role}
              disabled={busyId === user.id || user.id === currentUserId}
              onChange={(event) => update(user, { role: event.target.value as Profile["role"] })}
            >
              <option value="user">Usuário</option>
              <option value="admin">Admin</option>
            </select>
            <label className="access-toggle">
              <input
                type="checkbox"
                checked={user.isActive}
                disabled={busyId === user.id || user.id === currentUserId}
                onChange={(event) => update(user, { isActive: event.target.checked })}
              />
              <span>{user.isActive ? "Ativo" : "Inativo"}</span>
            </label>
          </div>
        ))}
      </div>

      {message && <div className="inline-message">{message}</div>}
      <small className="settings-note">Novos usuários usam “Criar usuário” na tela de entrada. O administrador pode ativar, desativar e promover depois.</small>
    </div>
  );
}
