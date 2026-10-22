# PF2e Area Triggers

Save, damage, healing and reminder cards for supported PF2e auras and persistent areas, using Foundry's native geometry and PF2e rolls. No Aura Forge or toolbox module is required.

Tested with **Foundry VTT 14.369** and **PF2e 8.6.0**. No Aura Forge, socket library, or toolbox dependency.

## Install

In Foundry Setup, open **Add-on Modules ? Install Module** and paste this manifest URL:

```text
https://github.com/jjthibau/pf2e-area-triggers/releases/latest/download/module.json
```

Enable **PF2e Area Triggers** in your PF2e world. The **Enable area trigger prompts** world setting turns the automation on or off. Foundry can check the same manifest for future updates.

## Combat and GM control

Automatic prompts require a started encounter in the current scene. Exploration movement and unstarted initiative stay silent, including movement through placed spell areas.

Traps and haunts become live when their source joins the started encounter, or when the GM chooses **Live during encounters** on the supported ability card. **Paused** prevents new prompts even when the hazard is in initiative. Explicit activation still does not bypass the combat requirement. Previously posted cards remain available for manual resolution.

## Spell and ability areas

Cast a supported spell and place its normal area from the spell card. For creatures with multiple tokens, cast from the intended token's sheet so the origin is unambiguous. The module captures its source, rank, save DC, traits and damage. Creature auras use their native Aura rules; source-centered fields follow their source horizontally and vertically where appropriate. Finite height limits move with the source; unbounded areas stay unbounded.

For an ability without a suitable native area, draw its actual spaces with the Region tools, then choose **Link drawn ability area** on its card. Where an ability has several areas or modes, choose the matching one. Areas tied to another creature or object must be placed and moved to match that anchor. A haunt's trigger room and its affected area can be linked separately; the GM activates the resulting save prompts for all eligible creatures in the affected areas.

The definition selects the written trigger: entry, movement, start of turn, end of turn, source turn or another supported activation. Placing an area does not count as entering it. Initial spell damage is not assumed to repeat just because its template remains on the map.

Conditional prompts explain which table decision is needed. Some reactions first produce a GM notice, then offer the saving throw only after the GM chooses to use the reaction.

## Delayed effects and crew attacks

Supported next-turn effects use the source's actual initiative, including a defeated source whose initiative slot is skipped. An explosion prompts once; its posted cards remain usable afterward.

The GM can use **Schedule linked field** to select the relevant combatant and turn boundary. For a two-crew activity, select the **second participating crew member's end of turn**. The module does not substitute the vehicle's own turn or spend crew actions. If the GM changes the intended timing, reschedule the linked field.

Supported ability Sustain buttons extend the area's deadline without inventing an additional save. Where the rules set a maximum duration, that limit remains in effect.

Areas with a defined maximum duration use a simple game-time expiry timestamp; reaching it removes the placed Region and stops further prompts. The module does not track whether players spent the required Sustain actions. Remove an area manually when it ends earlier.

## Native rolls and table decisions

Players roll for creatures they own; GMs can resolve any request. Saves and damage use PF2e's native statistics and DamageRolls, including source context and ordinary NPC adjustments. Native visibility settings control DC/result display. Hidden Enemy Spells can keep supported enemy spell-area labels anonymous.

Damage application remains manual and uses PF2e's normal immunity, weakness and resistance handling. The module does not create or enforce temporary immunity, caster-selected exemptions such as Darklight's spared allies, disbelief, action costs, conditions, optional bonuses or resource expenditure. Ignore an inapplicable prompt and handle those rules at the table. Unmitigated HP-loss reminders do not offer ordinary damage buttons.

Mark special environmental exposure in the Region's **Appearance ? Area counts as** settings. These tags describe the actual exposure area, including its required distance or elevation. The module does not guess sunlight, ground, water or music from image filenames.

## Content coverage

The reviewed PF2e 8.6.0 inventory contains 388 aura families, 140 canonical spells and 133 other qualifying ability families. Definitions are authored individually; duplicate creature variants are not counted as separate mechanics. See [testing and compatibility](docs/testing.md) for the validation scope.

Initial-only effects, target-bound recovery outside an area, passive benefits without an exposure trigger, and source-state reactions are not converted into recurring area saves. In particular, Poltergeist's Fury does not receive an invented repeat-damage trigger. New PF2e content and unsupported homebrew need reviewed definitions rather than automatic prose guesses.

## Development

Run `npm test`, `npm run build`, and `npm run check:release`. The explicit ten-file archive includes only the module manifest, six runtime scripts, stylesheet, this README and the MIT license. Licensed compendia, local world data, test fixtures, operational notes and credentials are excluded.

The module code is original and MIT licensed. Foundry and PF2e game content retain their respective licenses.

## Examples

Real native chat cards from an isolated synthetic encounter:

<img src="https://raw.githubusercontent.com/jjthibau/pf2e-area-triggers/main/docs/images/end-turn.png" width="292" alt="Mastiff Ripping Gaze end-of-turn save"> <img src="https://raw.githubusercontent.com/jjthibau/pf2e-area-triggers/main/docs/images/entering.png" width="292" alt="Darklight area entry save"> <img src="https://raw.githubusercontent.com/jjthibau/pf2e-area-triggers/main/docs/images/item-reminder.png" width="292" alt="Magic banner start-of-turn reminder">

## Credits and support

Original module by Jesse. Uses Foundry's native Region APIs and the [PF2e system](https://github.com/foundryvtt/pf2e); it does not bundle Foundry or Paizo compendia or artwork. Pathfinder and its game content belong to their respective owners; this is an unofficial community module, not endorsed by Paizo or Foundry Gaming.

Report reproducible problems in [GitHub Issues](https://github.com/jjthibau/pf2e-area-triggers/issues). Include your Foundry/PF2e versions, the exact source ability or spell, and the triggering movement or turn.
