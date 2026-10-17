"use client";

import * as React from "react";
import { Youtube, Mail, Lock, Loader2, ShieldCheck, User, AlertCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/store/use-i18n-store";
import { toast } from "sonner";

export function LoginDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const { loginWithYouTube, loginWithEmail } = useAuth();
  const [mode, setMode] = React.useState<"choice" | "email">("choice");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState<"youtube" | "email" | null>(null);

  React.useEffect(() => {
    if (open) { setMode("choice"); setEmail(""); setPassword(""); setLoading(null); }
  }, [open]);

  const handleYouTube = async () => {
    setLoading("youtube");
    try {
      // Real Google OAuth — this redirects the browser to Google's consent
      // screen and never resolves here on success. If env vars aren't set,
      // next-auth will surface the error on its /api/auth/error page.
      await loginWithYouTube("/");
      // In the redirect case this line is never reached; in the no-redirect
      // error case we still close the dialog and show a toast.
      toast.success(t("login.success"), { description: t("login.successDesc") });
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      toast.error("YouTube sign-in failed", {
        description: msg || "Check that GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set.",
      });
    } finally {
      setLoading(null);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading("email");
    try {
      await loginWithEmail(email.trim());
      toast.success(t("login.success"), { description: t("login.successDesc") });
      onOpenChange(false);
    } catch {
      toast.error("Sign in failed");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Youtube className="h-4 w-4 text-white" />
            </div>
            {t("login.title")}
          </DialogTitle>
          <DialogDescription>{t("login.subtitle")}</DialogDescription>
        </DialogHeader>

        {mode === "choice" ? (
          <div className="space-y-3 py-2">
            {/* sync benefits */}
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-700 dark:text-emerald-300 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold">
                <ShieldCheck className="h-3.5 w-3.5" /> {t("login.syncYourLibrary")}
              </div>
              <p className="text-muted-foreground">{t("login.syncDesc")}</p>
            </div>

            <Button
              onClick={handleYouTube}
              disabled={!!loading}
              className="w-full h-11 bg-[#FF0000] hover:bg-[#d90000] text-white gap-2 font-semibold"
            >
              {loading === "youtube" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Youtube className="h-5 w-5" />}
              {t("login.signInWithYouTube")}
            </Button>

            {/* env-config note */}
            <div className="flex items-start gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 mt-px shrink-0" />
              <span>{t("login.requiresEnv")}</span>
            </div>

            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">{t("login.or")}</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <Button
              onClick={() => setMode("email")}
              variant="outline"
              className="w-full h-11 gap-2"
            >
              <Mail className="h-4 w-4" /> {t("login.email")}
            </Button>

            <p className="text-[11px] text-muted-foreground text-center pt-1">{t("login.privacy")}</p>
            <p className="text-[11px] text-muted-foreground/70 text-center">{t("login.optional")}</p>
          </div>
        ) : (
          <form onSubmit={handleEmail} className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="login-email">{t("login.email")}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="pl-9"
                  autoFocus
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">{t("login.password")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9"
                />
              </div>
            </div>
            <button type="button" className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline">
              {t("login.forgotPassword")}
            </button>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setMode("choice")}>{t("login.cancel")}</Button>
              <Button type="submit" disabled={!!loading} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                {loading === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
                {t("login.signIn")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
