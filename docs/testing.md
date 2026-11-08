## Unlinked encounters and imported identities (2026-11-08)

Nine portable contracts pass, including single-scene inference, explicit-link precedence, inactive/unstarted guards, missing/mixed membership and five exact imported aura aliases with negative identity/rule guards. A fresh isolated Foundry 14.369 / PF2e 8.6.0 synthetic world passes seven focused native checks: original profiles load, unstarted silence, actual end-turn prompts in an unlinked encounter, linked parity, an imported aura retaining its authored DC, foreign-scene exclusion and mixed-scene exclusion. Zero browser errors. These checks cover this compatibility patch; they do not rerun the historical broad catalog suite.

Two earlier fixture failures were preserved: an incomplete synthetic ability identity and a core-rejected attempt to link combatants to a scene that did not contain them. Fresh native fixtures use original public compendium identities and valid foreign-scene participants. No campaign data is included in the test distribution.

# Testing and compatibility

Tested with Foundry VTT 14.369 and PF2e 8.6.0 in an isolated synthetic world.

Version 0.1.1 moves a fixed spell-source lookup out of the per-item matching path. In a private campaign clone, all 8,278 owned-item profile results matched 0.1.0, including 132 positive matches. Local reconciliation measured 17–23 ms before and a 1.5 ms median after; the same-scene item lookup benchmark used alternating before/after order. These are local measurements, not a production latency guarantee. The original broad gameplay suite was not repeated for this lookup-only change.

The original implementation baseline passed 16,504 native assertions: 2,845 workflow/geometry/permission/scope checks and 13,659 checks across a 966-source aura sweep. Those counts are assertions, not distinct spells, and refer to the original baseline runtime.

Subsequent maintenance passed 66 affected native assertions: 17 vertical-follow/duration cases and 49 movement, teleport and troop-persistence cases, with no browser errors. Four separate harness checks verify late-error and teardown verdicts. The entire baseline was not repeated for those localized changes.

Native cases exercise actual casting, Region placement, movement, save statistics, damage rolls and source context. They include finite/unbounded height ranges, older saved follow records, actual entry prompts after vertical area movement, Freezing Rain's ten-minute maximum, combat-only suppression and GM-controlled hazard activation.

`npm test` runs syntax and dependency-free regression/contract checks. Release validation verifies an exact ten-file runtime archive, manifest URLs, tag/version agreement, checksums and source parity. GitHub CI does not run Foundry or bundle licensed core/system assets.

Game-table testing with arbitrary third-party module combinations is separate from isolated native acceptance. Use the world setting to disable area prompts if a conflict occurs, and report the versions and exact source involved.
