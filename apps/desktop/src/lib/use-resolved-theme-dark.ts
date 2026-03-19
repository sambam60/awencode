import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/stores/app-store";

/** Matches App root `dark` class: light / dark / system (OS). */
export function useResolvedThemeIsDark(): boolean {
  const theme = useAppStore((s) => s.theme);
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    onChange();
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return theme === "dark" || (theme === "system" && systemDark);
}
