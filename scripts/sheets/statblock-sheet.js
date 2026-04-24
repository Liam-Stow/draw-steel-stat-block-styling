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

    static TYPE_ORDER = ["main", "maneuver", "triggered", "freeTriggered", "free", "none", "villain"];

    static TYPE_LABELS = {
      main: "Main Actions",
      maneuver: "Maneuvers",
      triggered: "Triggered Actions",
      freeTriggered: "Triggered Free Actions",
      free: "Free Actions",
      none: "No Action",
      villain: "Villain Actions",
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

      const allAbilities = abilityItems.map(item => this._prepareAbility(item));

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
      const { TYPE_ORDER, TYPE_LABELS } = this.constructor;
      const typeOrderSet = new Set(TYPE_ORDER);
      const buckets = new Map();
      for (const ability of allAbilities) {
        let bucket = buckets.get(ability.type);
        if (!bucket) { bucket = []; buckets.set(ability.type, bucket); }
        bucket.push(ability);
      }

      const knownTypes = TYPE_ORDER.filter(t => buckets.has(t));
      const unknownTypes = [...buckets.keys()].filter(t => !typeOrderSet.has(t)).sort();

      ctx.abilityGroups = [...knownTypes, ...unknownTypes].map(type => ({
        type,
        label: TYPE_LABELS[type] ?? (type.charAt(0).toUpperCase() + type.slice(1)),
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

    _prepareAbility(item) {
      const sys = item.system;
      const normalizedType = this._normalizeAbilityType(sys.type);

      // Aggregate text from all effects per tier (multiple effects can contribute to one tier row).
      const tierTexts = { 1: [], 2: [], 3: [] };
      if (sys.power?.effects) {
        const effects = sys.power.effects;
        const effectList = (effects instanceof Map || typeof effects.values === "function")
          ? Array.from(effects.values())
          : Object.values(effects);
        for (const eff of effectList) {
          for (const tier of [1, 2, 3]) {
            let text = "";
            // Prefer the system's own toText method — matches exactly what the item sheet shows.
            try {
              if (typeof eff.toText === "function") text = eff.toText(tier) ?? "";
            } catch (e) {
              console.warn("[ds-statblock] toText threw for", item.name, "tier", tier, e);
            }

            // Manual fallback: tier data lives at eff[TYPE]["tier1/2/3"]
            if (!text) {
              const effectType = eff.constructor?.TYPE ?? eff.type;
              const td = effectType ? eff[effectType]?.[`tier${tier}`] : null;
              if (td) text = this._formatEffectTier(td, effectType);
            }

            if (text) tierTexts[tier].push(text);
            else console.debug("[ds-statblock] no tier text for", item.name, "tier", tier, eff);
          }
        }
      }

      const tiers = [1, 2, 3]
        .map(tier => ({
          tier,
          rangeLabel: tier === 1 ? "≤11" : tier === 2 ? "12–16" : "17+",
          text: tierTexts[tier].join("; "),
        }))
        .filter(t => t.text);

      return {
        id: item.id,
        name: item.name,
        img: item.img,
        type: normalizedType,
        typeLabel: this._abilityTypeLabel(normalizedType),
        keywords: this._formatSet(sys.keywords),
        distance: this._formatDistance(sys.distance),
        target: this._formatTarget(sys.target),
        trigger: sys.trigger,
        rollEnabled: !!sys.power?.roll?.enabled,
        hasTiers: tiers.length > 0,
        characteristicKey: sys.power?.characteristic?.key,
        characteristicValue: this._formatSigned(sys.power?.characteristic?.value ?? 0),
        tiers,
        effectBefore: sys.effect?.before,
        effectAfter: sys.effect?.after,
        spendValue: sys.spend?.value,
        spendText: sys.spend?.text,
      };
    }

    _normalizeAbilityType(type) {
      return type === "action" ? "main" : (type ?? "main");
    }

    _abilityTypeLabel(type) {
      const map = {
        main: "Main",
        maneuver: "Maneuver",
        triggered: "Triggered",
        freeTriggered: "Triggered Free",
        free: "Free",
        villain: "Villain",
      };
      return map[type] ?? type ?? "";
    }

    _formatResistances(map) {
      if (!map) return [];
      const pairs = map instanceof Map
        ? Array.from(map, ([type, value]) => ({ type, value }))
        : Object.entries(map).map(([type, value]) => ({ type, value }));
      return pairs.filter(r => Number(r.value) !== 0);
    }

    _formatSet(s) {
      if (!s) return "";
      if (s instanceof Set) return Array.from(s).join(", ");
      if (Array.isArray(s)) return s.join(", ");
      return String(s);
    }

    _formatSigned(v) {
      const n = Number(v) || 0;
      return n >= 0 ? `+${n}` : `${n}`;
    }

    _formatDistance(d) {
      if (!d) return "";
      const parts = [];
      if (d.type && d.type !== "") parts.push(d.type);
      if (d.primary != null && d.primary !== "") parts.push(d.primary);
      if (d.secondary != null && d.secondary !== "") parts.push(`× ${d.secondary}`);
      return parts.join(" ");
    }

    _formatTarget(t) {
      if (!t) return "";
      if (t.custom) return t.custom;
      const qty = t.value == null ? "Each" : t.value;
      const kind = t.type || "target";
      return `${qty} ${kind}`;
    }

    _formatEffectTier(td, effectType) {
      if (!td) return "";

      // Other / Applied / Forced / Resource — all expose a .display string at the tier level.
      if (td.display) return td.display;

      // Damage: td.value (formula) + td.types (Set<string>)
      if (effectType === "damage" && td.value != null && td.value !== "") {
        const types = td.types instanceof Set
          ? Array.from(td.types).join("/")
          : Array.isArray(td.types) ? td.types.join("/") : "";
        return `${td.value}${types ? " " + types : ""} damage`;
      }

      // Resource fallback (amount + type)
      if (td.amount != null) {
        return `${td.amount}${td.type ? " " + td.type : ""}`;
      }

      return "";
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
