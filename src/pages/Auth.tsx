import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { BOOT_ENCORE_KEY } from "@/lib/bootSequence";
import { ProductMark } from "@/components/shell/AmbientHeader";
import { InstallFlyer } from "@/components/settings/InstallFlyer";
import { Loader2 } from "lucide-react";

export default function Auth() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // The front door is a room too: it gets the shutter wall while you stand there.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute("data-room");
    root.setAttribute("data-room", "door");
    return () => {
      if (prev) root.setAttribute("data-room", prev);
      else root.removeAttribute("data-room");
    };
  }, []);

  const onEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success(vantaSay.accountCreated());
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      /* Signing in is an arrival — flag it so the boot gives the full roll
         call instead of reading this as a quick reopen. */
      try { localStorage.setItem(BOOT_ENCORE_KEY, "1"); } catch { /* private window */ }
      nav("/", { replace: true });
    } catch (err) {
      toast.fromError(err, vantaSay.authFailed());
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setBusy(true);
    /* Set the encore before the redirect: the round trip through Google
       reloads the app, and without this the boot reads it as a quick reopen
       and skips the roll call. Consumed once on arrival. */
    try { localStorage.setItem(BOOT_ENCORE_KEY, "1"); } catch { /* private window */ }
    try {
      const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (r.error) throw r.error;
      if (!r.redirected) nav("/", { replace: true });
    } catch (err) {
      try { localStorage.removeItem(BOOT_ENCORE_KEY); } catch { /* private window */ }
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8 motion-fade">
        <div className="space-y-2 text-center">
          <ProductMark className="text-2xl" />
          <p className="text-sm text-muted-foreground">A situational companion for everyday life.</p>
          <Link
            to="/what-is-metro-echo"
            className="inline-block text-[12.5px] text-primary underline-offset-4 hover:underline"
          >
            What is Metro Echo?
          </Link>
        </div>

        <form onSubmit={onEmail} className="space-y-3 rounded-2xl glass p-5 shadow-md">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          <div className="relative my-2 text-center text-[11px] uppercase tracking-wider text-muted-foreground">
            <span className="bg-transparent px-2">or</span>
          </div>
          <Button type="button" variant="secondary" onClick={onGoogle} disabled={busy} className="w-full">
            Continue with Google
          </Button>
        </form>

        <InstallFlyer />

        <div className="text-center text-sm text-muted-foreground">
          {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-primary underline-offset-4 hover:underline"
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
