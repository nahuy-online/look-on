import * as React from "react";
import { Youtube, Mail, Lock, Loader2, ShieldCheck, X } from "lucide-react";
import { useAuthStore } from "@/store/use-auth-store";
import { useT } from "@/store/use-i18n-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function LoginDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signInWithEmail = useAuthStore((s) => s.signInWithEmail);
  const loading = useAuthStore((s) => s.loading);
  const [mode, setMode] = React.useState<"choice" | "email">("choice");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) { setMode("choice"); setEmail(""); setPassword(""); }
  }, [open]);

  if (!open) return null;

  const handleGoogle = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
      toast.success(t("login.success"), { description: t("login.successDesc") });
      onOpenChange(false);
    } catch {
      toast.error("Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setBusy(true);
    try {
      await signInWithEmail(email.trim());
      toast.success(t("login.success"), { description: t("login.successDesc") });
      onOpenChange(false);
    } catch {
      toast.error("Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative w-full max-w-md bg-[rgb(var(--card))] border border-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Youtube className="h-4 w-4 text-white" />
            </div>
            {t("login.title")}
          </h2>
          <button onClick={() => onOpenChange(false)} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-4">{t("login.subtitle")}</p>

          {mode === "choice" ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-emerald-600">
                  <ShieldCheck className="h-3.5 w-3.5" /> {t("login.syncYourLibrary")}
                </div>
                <p className="text-muted-foreground">{t("login.syncDesc")}</p>
              </div>

              <button
                onClick={handleGoogle}
                disabled={busy || loading}
                className="w-full h-11 bg-[#FF0000] hover:bg-[#d90000] text-white rounded-xl flex items-center justify-center gap-2 font-semibold disabled:opacity-50"
              >
                {busy || loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Youtube className="h-5 w-5" />}
                {t("login.signInWithYouTube")}
              </button>

              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">{t("login.or")}</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <button
                onClick={() => setMode("email")}
                className="w-full h-11 border border-border rounded-xl flex items-center justify-center gap-2 hover:bg-accent"
              >
                <Mail className="h-4 w-4" /> {t("login.email")}
              </button>

              <p className="text-[11px] text-muted-foreground/70 text-center pt-1">{t("login.optional")}</p>
            </div>
          ) : (
            <form onSubmit={handleEmail} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t("login.email")}</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full h-10 pl-9 pr-3 bg-[rgb(var(--background))] border border-border rounded-lg outline-none focus:border-emerald-500 text-sm"
                    autoFocus
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t("login.password")}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-10 pl-9 pr-3 bg-[rgb(var(--background))] border border-border rounded-lg outline-none focus:border-emerald-500 text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setMode("choice")} className="flex-1 h-10 border border-border rounded-lg text-sm hover:bg-accent">
                  {t("login.cancel")}
                </button>
                <button type="submit" disabled={busy} className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t("login.signIn")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
