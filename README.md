# Draw Steel Stat Block Styling

A Foundry VTT module for the [Draw Steel](https://foundryvtt.com/packages/draw-steel)
system that renders NPC actor sheets in a style similar to the official books.
<img width="523" height="609" alt="image" src="https://github.com/user-attachments/assets/e9a86492-048f-4471-bf9d-8f48ac738fbf" />
<img width="1373" height="697" alt="image" src="https://github.com/user-attachments/assets/7b194dc9-5c66-42c6-a999-370572ededbf" />

## Features

- Single-page, scrollable stat block styled after the Draw Steel core rulebook layout:
  - Header with name, level, organization, role, keywords, and EV
  - Top stats row (Size · Speed · Stamina · Stability · Free Strike)
  - Characteristics row (Might, Agility, Reason, Intuition, Presence) with signed modifiers
  - Immunities / Weaknesses pills
  - Traits (passive features)
  - Abilities with icon, type badge, keywords, distance, target, power roll, and tier results
- **Everything is clickable**:
  - Ability name / power row → invokes the Draw Steel system's `useAbility` action
  - Pencil icon on any ability or trait → opens that item's sheet for editing
  - Characteristic modifier → rolls that characteristic
  - Stamina value → opens a quick edit dialog
  - Free Strike → rolls a free strike
- **Opt-in per actor.** The Draw Steel system's default NPC sheet is untouched. Pick
  "Draw Steel Stat Block" from the sheet configuration (cog icon) on any NPC.

## Installation

### Manifest URL

```
https://github.com/liam-stow/draw-steel-stat-block-styling/releases/latest/download/module.json
```

Paste the URL into Foundry's *Install Module* dialog.

### Manual

Copy the module folder into `FoundryVTT/Data/modules/draw-steel-stat-block-styling/`
and enable it in your world.

## Requirements

- Foundry VTT **v14** (Stable)
- Draw Steel System **v1.0.1+**

## Usage

1. Enable the module in the world's *Manage Modules* dialog.
2. Open any NPC actor sheet.
3. Click the cog icon in the window header → *Sheet Configuration*.
4. Select **Draw Steel Stat Block** and save.

The sheet will re-render in the new style. Switch back to the system default sheet
the same way.

## Development

```
draw-steel-stat-block-styling/
├── module.json
├── scripts/
│   ├── module.js                # init/ready hooks, sheet registration
│   └── sheets/statblock-sheet.js # DrawSteelStatBlockSheet factory
├── templates/
│   ├── statblock.hbs
│   └── partials/
│       ├── header.hbs
│       ├── stats-row.hbs
│       ├── characteristics.hbs
│       ├── resistances.hbs
│       ├── traits.hbs
│       ├── ability.hbs
│       └── abilities.hbs
└── styles/statblock.css
```

The sheet class is constructed lazily in the `ready` hook via a factory so it can
extend the Draw Steel system's `DrawSteelNPCSheet` (which isn't available at `init`).
All click interactions use `data-action` attributes dispatched by the parent sheet's
action handler pipeline — no custom handler wiring is required for the actions
provided by the system (`useAbility`, `edit`, `roll`, `freeStrike`).

## License

MIT
