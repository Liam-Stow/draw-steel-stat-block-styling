# Draw Steel Stat Block Styling — Dev Notes

## Reference: Draw Steel system source

`draw-steel-system/` is a read-only clone of [MetaMorphic-Digital/draw-steel](https://github.com/MetaMorphic-Digital/draw-steel) (the Foundry VTT system this module extends). It is gitignored and must not be edited.

Use it to look up:
- Data model paths — `draw-steel-system/src/module/` (actor/item data models, schema fields)
- Sheet classes — `draw-steel-system/src/module/applications/` (`DrawSteelNPCSheet` and related)
- Action handlers — search for `useAbility`, `edit`, `freeStrike`, etc. in the applications folder
- Effect types and `toText` implementations — search `src/module/` for effect model classes

To update the reference clone: `cd draw-steel-system && git pull`
