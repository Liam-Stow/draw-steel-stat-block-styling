export const ABILITY_TYPES = [
  { key: "main",          groupLabel: "Main Actions",           shortLabel: "Main"          },
  { key: "maneuver",      groupLabel: "Maneuvers",              shortLabel: "Maneuver"       },
  { key: "triggered",     groupLabel: "Triggered Actions",      shortLabel: "Triggered"      },
  { key: "freeTriggered", groupLabel: "Triggered Free Actions", shortLabel: "Triggered Free" },
  { key: "free",          groupLabel: "Free Actions",           shortLabel: "Free"           },
  { key: "none",          groupLabel: "No Action",              shortLabel: ""               },
  { key: "malice",        groupLabel: "Malice Actions",         shortLabel: "Malice"         },
  { key: "villain",       groupLabel: "Villain Actions",        shortLabel: "Villain"        },
];

const ABILITY_TYPE_MAP = new Map(ABILITY_TYPES.map(t => [t.key, t]));

/**
 * Factory that returns a sheet class extending the Draw Steel system's NPC sheet.
 * We build it lazily inside the `ready` hook so `game.system.api` is populated.
 */
export function createStatBlockSheet(ParentSheet) {
  return class DrawSteelStatBlockSheet extends ParentSheet {
    static DEFAULT_OPTIONS = {
      classes: ["draw-steel", "statblock-sheet"],
      position: { width: 580, height: 760 },
      window: { resizable: true, icon: "fa-solid fa-scroll" },
      actions: {
        // AppV2 merges DEFAULT_OPTIONS up the prototype chain, so the parent's `roll`
        // and `freeStrike` actions are inherited automatically — no need to redeclare them.
        // We only override `useAbility` and `edit` because the parent's private handlers
        // resolve items via `data-document-id`; our templates use `data-item-id` instead.
        useAbility: this.prototype._onUseAbility,
        edit: this.prototype._onEditItem,
        editStamina: this.prototype._onEditStamina,
      },
    };

    static PARTS = {
      statblock: {
        template: "modules/draw-steel-stat-block-styling/templates/statblock.hbs",
        scrollable: [""],
      },
    };

    async _prepareContext(options) {
      const ctx = await super._prepareContext(options);
      const system = this.actor.system;

      // Explicitly set these so our templates always have them regardless of parent context shape.
      ctx.actor = this.actor;
      ctx.system = system;

      // Single pass: partition items, keeping raw item refs for enrichment.
      const abilityItems = [];
      const featureItems = [];
      for (const item of this.actor.items) {
        if (item.type === "ability") abilityItems.push(item);
        else if (item.type === "feature") featureItems.push(item);
      }

      const allAbilities = await Promise.all(abilityItems.map(item => this._prepareAbility(item)));

      // Enrich effect HTML so inline roll links and @UUID refs are functional.
      await Promise.all(abilityItems.map(async (item, i) => {
        const a = allAbilities[i];
        const opts = { relativeTo: item };
        if (a.effectBefore) a.effectBefore = await TextEditor.enrichHTML(a.effectBefore, opts);
        if (a.effectAfter)  a.effectAfter  = await TextEditor.enrichHTML(a.effectAfter,  opts);
      }));

      ctx.abilities = allAbilities;

      // Convert features to plain objects with enriched ProseMirror descriptions.
      ctx.features = await Promise.all(featureItems.map(async item => ({
        id: item.id,
        name: item.name,
        enrichedDescription: item.system.description?.value
          ? await TextEditor.enrichHTML(item.system.description.value, { relativeTo: item })
          : "",
      })));

      // Group abilities by type in a single pass via a bucket Map.
      const buckets = new Map();
      for (const ability of allAbilities) {
        let bucket = buckets.get(ability.type);
        if (!bucket) { bucket = []; buckets.set(ability.type, bucket); }
        bucket.push(ability);
      }

      const typeKeys = ABILITY_TYPES.map(t => t.key);
      const typeKeySet = new Set(typeKeys);
      const knownTypes = typeKeys.filter(t => buckets.has(t));
      const unknownTypes = [...buckets.keys()].filter(t => !typeKeySet.has(t)).sort();

      ctx.abilityGroups = [...knownTypes, ...unknownTypes].map(type => ({
        type,
        label: ABILITY_TYPE_MAP.get(type)?.groupLabel ?? (type.charAt(0).toUpperCase() + type.slice(1)),
        abilities: buckets.get(type),
      }));

      ctx.immunities = this._formatResistances(system.damage?.immunities);
      ctx.weaknesses = this._formatResistances(system.damage?.weaknesses);

      ctx.characteristics = ["might", "agility", "reason", "intuition", "presence"].map(key => {
        const v = system.characteristics?.[key]?.value ?? 0;
        return { key, label: key.charAt(0).toUpperCase() + key.slice(1, 3), value: v, formatted: this._formatSigned(v) };
      });

      ctx.movementTypes = Array.from(system.movement?.types ?? []);
      ctx.keywordLabels = system.monster?.keywords?.labels ?? "";

      return ctx;
    }

    async _prepareAbility(item) {
      const sys = item.system;
      const baseType = this._normalizeAbilityType(sys.type);
      const normalizedType = (sys.resource > 0 && baseType === "none") ? "malice" : baseType;

      const rollText = typeof sys.powerRollText === "function"
        ? tier => sys.powerRollText(tier)
        : () => Promise.resolve("");
      const [tier1Text, tier2Text, tier3Text] = await Promise.all([1, 2, 3].map(rollText));

      return {
        id: item.id,
        name: item.name,
        img: item.img,
        type: normalizedType,
        typeLabel: ABILITY_TYPE_MAP.get(normalizedType)?.shortLabel ?? normalizedType ?? "",
        keywords: item.system.formattedLabels?.keywords ?? "",
        distance: item.system.formattedLabels?.distance ?? "",
        target: item.system.formattedLabels?.target ?? "",
        trigger: sys.trigger,
        rollEnabled: !!sys.power?.roll?.enabled,
        hasTiers: !!(tier1Text || tier2Text || tier3Text),
        characteristicKey: sys.power?.characteristic?.key,
        characteristicValue: this._formatSigned(sys.power?.characteristic?.value ?? 0),
        tier1Text,
        tier2Text,
        tier3Text,
        effectBefore: sys.effect?.before,
        effectAfter: sys.effect?.after,
        spendValue: sys.spend?.value,
        spendText: sys.spend?.text,
      };
    }

    _normalizeAbilityType(type) {
      return type === "action" ? "main" : (type ?? "main");
    }

    _formatResistances(map) {
      if (!map) return [];
      const pairs = map instanceof Map
        ? Array.from(map, ([type, value]) => ({ type, value }))
        : Object.entries(map).map(([type, value]) => ({ type, value }));
      return pairs.filter(r => Number(r.value) !== 0);
    }

    _formatSigned(v) {
      const n = Number(v) || 0;
      return n >= 0 ? `+${n}` : `${n}`;
    }

    _getItemFromTarget(target) {
      const id = target.dataset.itemId ?? target.closest("[data-item-id]")?.dataset.itemId;
      return this.actor.items.get(id) ?? null;
    }

    async _onUseAbility(event, target) {
      const item = this._getItemFromTarget(target);
      if (!item) return;
      if (typeof item.roll === "function") await item.roll();
      else if (typeof item.use === "function") await item.use();
    }

    async _onEditItem(event, target) {
      const item = this._getItemFromTarget(target);
      item?.sheet.render(true);
    }

    async _onEditStamina(event, target) {
      const current = this.actor.system.stamina?.value ?? 0;
      const max = this.actor.system.stamina?.max ?? 0;
      const result = await foundry.applications.api.DialogV2.prompt({
        window: { title: `Edit Stamina — ${this.actor.name}` },
        content: `
          <div class="form-group">
            <label>Current (max ${max})</label>
            <input type="number" name="value" value="${current}" autofocus />
          </div>`,
        ok: {
          label: "Save",
          callback: (_event, button) => Number(button.form.elements.value.value),
        },
        rejectClose: false,
      });
      if (Number.isFinite(result)) {
        await this.actor.update({ "system.stamina.value": result });
      }
    }
  };
}
