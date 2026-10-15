# Legendary preview and line icons

The loadout detail dialog lets players inspect a legendary skin's real merge motion and sound before equipping it. The primary action is an explicit, repeatable preview button. Guests can preview locked skins. Previewing never changes the equipped skin. Reuse NumberTile, legendary merge CSS and the existing audio engine, including mute, volume and reduced-motion preferences. Closing the dialog cancels pending playback.

Replace all ten GameEmblem drawings with consistent monochrome outlines on a 24px grid. The user's screenshots reject octagonal metal frames and the crowded brush/sword drawings. Use simple silhouettes, rounded strokes and the existing palette; preserve the approved ranked tier artwork. Shared callers include the header, page headings, navigation, onboarding, match states and results. Keep adjacent text labels and decorative SVG semantics.

Check at 1440×900, 768×1024 and 375×812. Dialogs must fit, remain keyboard-operable, and return focus to the selected card. Preview state: idle → moving (busy button) → merged (real effect and audio) → replay. Muted or unavailable audio keeps the visual preview usable with clear feedback. Account save/loading/error and guest unlock boundaries remain in the existing loadout flow. No new dependencies, purchase logic or multiplayer state changes.
