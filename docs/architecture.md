# Architecture

The module adapts native PF2e Aura rule elements and Foundry Regions into chat prompts. It does not replace the aura system or parse arbitrary prose at runtime.

- `profiles.js` and `catalog.js` associate reviewed mechanics with canonical content sources and modes.
- `geometry.js` supplies scoped geometry adapters, native movement probes and environmental tags.
- `sources.js` binds spell/ability Regions to cast snapshots, source DCs, traits, ranks and timing. Following Regions preserve both horizontal offsets and finite vertical bounds.
- `engine.js` coordinates triggers, duplicate suppression, native saves/damage and GM decisions.
- `main.js` registers hooks and the RegionBehavior type.

One active GM coordinates prompts. Clients retain Foundry/PF2e visibility settings and native roll behavior. Automatic exposure requires a started encounter on the current scene; hazards additionally require initiative or explicit GM live mode. Regular maximum durations use game-time timestamps; Sustain actions and early dismissal remain table decisions.

Content is versioned against PF2e 8.6.0. Additional content needs explicit review. Canonical source variants and internal modes are not counted as separate rules mechanics.

Scene resolution is shared by exposure, start/end, round, source-expiry, Sustain and scheduled timing. Explicit scene links take precedence. Otherwise, a single authoritative token-combatant scene is required; ambiguity is not resolved from the current viewport or from actor names. Resolution is recalculated so later combatant edits cannot retain stale scene authority. Native encounter/actor/scene documents are not changed by this fallback.

Imported aura compatibility uses a small reviewed map of exact public actor-and-item source identities to existing catalog definitions. It retains the native Aura rule check and native DC/damage extraction; there is no runtime prose matching or automatic remaster of campaign actors.
