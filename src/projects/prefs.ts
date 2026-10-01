import { expoFs } from "./expoFs";

const PATH = () => `${expoFs.documentDir}prefs.json`;

type Prefs = { recentEmoji: string[] };

async function read(): Promise<Prefs> {
  try { return { recentEmoji: [], ...(JSON.parse(await expoFs.readText(PATH())) as Partial<Prefs>) }; }
  catch { return { recentEmoji: [] }; }
}

export const prefs = {
  getRecentEmoji: async () => (await read()).recentEmoji,
  pushRecentEmoji: async (char: string) => {
    const p = await read();
    p.recentEmoji = [char, ...p.recentEmoji.filter((c) => c !== char)].slice(0, 24);
    await expoFs.writeText(PATH(), JSON.stringify(p));
  },
};
