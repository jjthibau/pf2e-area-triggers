# Contributing

Open an issue before expanding a shared runtime path or adding a new rules subsystem. Content definitions should identify a canonical PF2e source and its exact recurring trigger, save/DC and damage pool. Do not infer a recurring save solely because an area or damage formula exists.

Use Node 24 and Python 3. Run `npm test`, `npm run build`, and `npm run check:release`. The public checks do not replace native Foundry validation. Foundry and licensed game assets are not distributed in this repository.

Keep source context, native geometry and rolls intact. Immunity, exemptions, conditions, action costs and other table-managed rules should remain outside the prompt engine. Add focused native evidence when geometry, timing or multiplayer coordination changes.

For a release, update module/package versions and the manifest's versioned download URL together. Push main and an annotated vVERSION tag. The release workflow validates and publishes module.json, module.zip and SHA256SUMS. No credentials or operational world data belong in this repository.
