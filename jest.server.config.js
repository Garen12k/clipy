/** Server-side (Edge Function) logic runs under plain Node: no React Native, no Deno. */
module.exports = {
  rootDir: __dirname,
  testEnvironment: "node",
  testMatch: ["<rootDir>/supabase/functions/**/*.test.ts"],
  transform: { "^.+\\.ts$": ["babel-jest", { babelrc: false, configFile: false, presets: ["babel-preset-expo"] }] },
};