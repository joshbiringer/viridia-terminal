import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "supabase/functions/**"] },
  {
    rules: {
      // Reading browser-only state (localStorage, navigator, the theme attribute) and resetting a
      // loading flag when a fetch starts both happen in effects on purpose: doing either during render
      // would break hydration. Kept visible as a warning rather than an error.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;
