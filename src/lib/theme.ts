export type ThemeChoice = "light" | "dark" | "system";

const KEY = "viridia.theme";

/** Resolves a theme choice to light or dark and applies it; "system" follows the OS setting. */
export function applyTheme(choice: ThemeChoice) {
  if (typeof window === "undefined") return;
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themeChoice = choice;
  try { localStorage.setItem(KEY, choice); } catch {}
}

export function currentTheme(): ThemeChoice {
  if (typeof document === "undefined") return "system";
  return (document.documentElement.dataset.themeChoice as ThemeChoice) || (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
}

/** Inline script for <head>: applies the stored choice before first paint and follows OS changes. */
export const THEME_BOOT = `try{var c=localStorage.getItem("${KEY}")||"light",m=window.matchMedia("(prefers-color-scheme: dark)"),d=document.documentElement;function a(){d.dataset.theme=(c==="dark"||(c==="system"&&m.matches))?"dark":"light";d.dataset.themeChoice=c}a();m.addEventListener("change",function(){c=localStorage.getItem("${KEY}")||c;if(c==="system")a()})}catch(e){}`;
