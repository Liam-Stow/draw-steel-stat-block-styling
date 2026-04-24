import { createStatBlockSheet } from "./sheets/statblock-sheet.js";

const MODULE_ID = "draw-steel-stat-block-styling";

const PARTIALS = [
  "header",
  "stats-row",
  "characteristics",
  "resistances",
  "traits",
  "ability",
  "abilities",
];

Hooks.once("init", async () => {
  const loader = foundry.applications.handlebars.loadTemplates;
  await loader(PARTIALS.map(p => `modules/${MODULE_ID}/templates/partials/${p}.hbs`));
});

Hooks.once("ready", () => {
  const ParentSheet = resolveParentSheet();
  if (!ParentSheet) {
    ui.notifications?.error(
      "Draw Steel Stat Block Styling: could not locate DrawSteelNPCSheet. Is the Draw Steel system active?"
    );
    return;
  }

  const SheetClass = createStatBlockSheet(ParentSheet);

  foundry.documents.collections.Actors.registerSheet(MODULE_ID, SheetClass, {
    types: ["npc"],
    label: "Draw Steel Stat Block",
    makeDefault: false,
  });
});

function resolveParentSheet() {
  const viaApi = game.system?.api?.applications?.sheets?.DrawSteelNPCSheet;
  if (viaApi) return viaApi;

  const npcEntries = CONFIG.Actor?.sheetClasses?.npc ?? {};
  const drawSteelEntry = Object.entries(npcEntries).find(
    ([key]) => key.startsWith("draw-steel.") && /NPCSheet/i.test(key)
  );
  return drawSteelEntry?.[1]?.cls ?? null;
}
