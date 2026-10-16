import { nowIso } from "@/src/lib/clock";
import { newId } from "@/src/lib/id";
import { expoFs } from "./expoFs";
import { makeStyleStore } from "./styleStore";

/** The owner's styles on this phone. Under Jest, jest.setup.ts puts a store on its own in-memory files in its place (the test phone starts with none). */
export const myStyles = makeStyleStore(expoFs, { newId, nowIso });
