"use client";

import * as React from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { translate, type Lang } from "@/lib/i18n";

interface I18nState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      lang: "en",
      setLang: (lang) => set({ lang }),
    }),
    {
      name: "puretuber-lang",
    }
  )
);

// Hook: subscribes to lang so components re-render when language changes.
// Usage: const t = useT();
export function useT() {
  const lang = useI18nStore((s) => s.lang);
  return React.useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang]
  );
}

// for components that need the raw lang value
export function useLang() {
  return useI18nStore((s) => s.lang);
}
