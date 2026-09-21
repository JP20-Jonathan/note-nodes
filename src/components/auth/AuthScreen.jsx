import { useState } from "react";
import { supabase } from "../../lib/supabaseClient.js";

export function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        setNotice("Cuenta creada. Si tu proyecto de Supabase pide confirmar el correo, revisa tu bandeja antes de entrar.");
      }
    } catch (err) {
      setError(err.message || "Algo salió mal, intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pnd-app" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <form className="pnd-modal" style={{ position: "static" }} onSubmit={handleSubmit}>
        <h3 className="pnd-serif" style={{ margin: 0, fontSize: 18 }}>
          {mode === "signin" ? "Entrar a Note Nodes" : "Crear cuenta"}
        </h3>

        <div className="field">
          <label>Correo</label>
          <input
            className="form-control form-control-sm" type="email" required autoFocus
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com"
          />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input
            className="form-control form-control-sm" type="password" required minLength={6}
            value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres"
          />
        </div>

        {error && <p className="field-error">{error}</p>}
        {notice && <p className="cap-note">{notice}</p>}

        <div className="modal-actions" style={{ justifyContent: "space-between" }}>
          <button
            type="button" className="btn btn-ghost"
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setNotice(null); }}
          >
            {mode === "signin" ? "Crear cuenta nueva" : "Ya tengo cuenta"}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Un momento…" : mode === "signin" ? "Entrar" : "Registrarme"}
          </button>
        </div>
      </form>
    </div>
  );
}
