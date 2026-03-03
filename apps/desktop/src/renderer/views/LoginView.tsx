import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface LoginViewProps {
  supabase: SupabaseClient;
  onLoggedIn: () => void;
}

export function LoginView({ supabase, onLoggedIn }: LoginViewProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: signError } = await supabase.auth.signInWithPassword({ email, password });
      if (signError) {
        setError(signError.message);
        return;
      }
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        maxWidth: 360,
        mx: "auto",
      }}
    >
      <Typography variant="h6" sx={{ mb: 2 }}>
        DoAi.Me Desktop — Sign in
      </Typography>
      <form onSubmit={handleSubmit} style={{ width: "100%" }}>
        <TextField
          fullWidth
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          sx={{ mb: 2 }}
        />
        {error && (
          <Typography color="error" variant="body2" sx={{ mb: 2 }}>
            {error}
          </Typography>
        )}
        <Button fullWidth type="submit" variant="contained" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>
        Uses Supabase Auth (anon key + session only).
      </Typography>
    </Box>
  );
}
