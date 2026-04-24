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
        // Override parent's private handlers so we control item lookup via data-item-id.
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

      ctx.abilities = this.actor.items
        .filter(i => i.type === "ability")
        .map(i => this._prepareAbility(i));

      ctx.features = this.actor.items.filter(i => i.type === "feature");

      ctx.immunities = this._formatResistances(system.damage?.immunities);
      ctx.weaknesses = this._formatResistances(system.damage?.weaknesses);

      ctx.characteristics = ["might", "agility", "reason", "intuition", "presence"].map(key => {
        const v = system.characteristics?.[key]?.value ?? 0;
        return { key, label: key.charAt(0).toUpperCase() + key.slice(1, 3), value: v, formatted: this._formatSigned(v) };
      });

      ctx.movementTypes = Array.from(system.movement?.types ?? []);
      ctx.keywordList  = Array.from(system.monster?.keywords?.list ?? []);
      ctx.keywordLabels = system.monster?.keywords?.labels ?? "";

      return ctx;
    }

    _prepareAbility(item) {
      const sys = item.system;
      const tiers = [];
      if (sys.power?.effects) {
        for (const [k, eff] of sys.power.effects.entries?.() ?? Object.entries(sys.power.effects)) {
          // Collect each tier result in order
          for (const tier of [1, 2, 3]) {
            const key = `tier${tier}`;
            const val = eff?.[key];
            if (val && (val.damage || val.formula || val.description || val.value)) {
              tiers.push({
                tier,
                rangeLabel: tier === 1 ? "≤11" : tier === 2 ? "12–16" : "17+",
                text: this._formatTier(val),
              });
            }
          }
        }
      }

      return {
        id: item.id,
        name: item.name,
        img: item.img,
        type: sys.type,
        typeLabel: this._abilityTypeLabel(sys.type),
        keywords: this._formatSet(sys.keywords),
        distance: this._formatDistance(sys.distance),
        target: this._formatTarget(sys.target),
        trigger: sys.trigger,
        rollEnabled: !!sys.power?.roll?.enabled,
        characteristicKey: sys.power?.characteristic?.key,
        characteristicValue: this._formatSigned(sys.power?.characteristic?.value ?? 0),
        tiers,
        effectBefore: sys.effect?.before,
        effectAfter: sys.effect?.after,
        spendValue: sys.spend?.value,
        spendText: sys.spend?.text,
      };
    }

    _abilityTypeLabel(type) {
      const map = {
        action: "Action",
        maneuver: "Maneuver",
        triggered: "Triggered Action",
        free: "Free Action",
        villain: "Villain Action",
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
      if (d.type) parts.push(d.type);
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

    _formatTier(val) {
      if (!val) return "";
      if (typeof val === "string") return val;
      const parts = [];
      if (val.damage?.value) parts.push(`${val.damage.value}${val.damage.type ? ` ${val.damage.type}` : ""} damage`);
      else if (val.formula) parts.push(val.formula);
      if (val.description) parts.push(val.description);
      if (val.value && !parts.length) parts.push(String(val.value));
      return parts.filter(Boolean).join("; ");
    }

    async _onUseAbility(event, target) {
      const itemId = target.dataset.itemId ?? target.closest("[data-item-id]")?.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (!item) return;
      if (typeof item.roll === "function") await item.roll();
      else if (typeof item.use === "function") await item.use();
    }

    async _onEditItem(event, target) {
      const itemId = target.dataset.itemId ?? target.closest("[data-item-id]")?.dataset.itemId;
      const item = this.actor.items.get(itemId);
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
