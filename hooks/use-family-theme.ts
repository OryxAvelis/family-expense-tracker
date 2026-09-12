"use client";

import { useEffect, useState } from "react";

import {
  FAMILY_THEME_STORAGE_KEY,
  LEGACY_FAMILY_THEME_STORAGE_KEY,
} from "@/lib/family-theme";

export type FamilyTheme = "light" | "dark";

function applyTheme(theme: FamilyTheme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function useFamilyTheme() {
  const [theme, setTheme] = useState<FamilyTheme>("light");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedTheme = window.localStorage.getItem(FAMILY_THEME_STORAGE_KEY);
      const nextTheme: FamilyTheme = savedTheme === "dark" ? "dark" : "light";
      window.localStorage.setItem(FAMILY_THEME_STORAGE_KEY, nextTheme);
      window.localStorage.removeItem(LEGACY_FAMILY_THEME_STORAGE_KEY);
      setTheme(nextTheme);
      applyTheme(nextTheme);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const toggleTheme = () => {
    const nextTheme: FamilyTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(FAMILY_THEME_STORAGE_KEY, nextTheme);
  };

  return { theme, toggleTheme };
}
