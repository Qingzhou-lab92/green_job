import { openDB } from "idb";
import { emptyState, stateSchema, type State } from "./model";
import { reconcileWorkflow } from "./workflow";
const db = () =>
  openDB("career-desk", 1, {
    upgrade(database) {
      database.createObjectStore("workspace");
    },
  });
export async function readState(): Promise<State> {
  const d = await db();
  const value = await d.get("workspace", "state");
  return value ? reconcileWorkflow(stateSchema.parse(value)) : emptyState();
}
export async function writeState(state: State) {
  const d = await db();
  await d.put(
    "workspace",
    reconcileWorkflow(stateSchema.parse(state)),
    "state",
  );
}
export async function clearState() {
  const d = await db();
  await d.clear("workspace");
}
export function download(
  name: string,
  content: string,
  type = "text/plain;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
