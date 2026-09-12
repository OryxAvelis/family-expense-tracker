"use client";

import { useEffect, useState } from "react";

export type FamilyTheme = "light" | "dark";

function applyTheme(theme: FamilyTheme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function useFamilyTheme() {
  const [theme, setTheme] = useState<FamilyTheme>("light");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedTheme = window.localStorage.getItem("family-expense-theme");
      const nextTheme: FamilyTheme = savedTheme === "dark" ? "dark" : "light";
      setTheme(nextTheme);
      applyTheme(nextTheme);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const toggleTheme = () => {
    const nextTheme: FamilyTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem("family-expense-theme", nextTheme);
  };

  return { theme, toggleTheme };
}
