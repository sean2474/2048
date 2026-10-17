# Rank collection visual contract

Extend the existing warm cream collection UI and outlined vector icons. Keep tile numbers dominant and use recognizable rank symbols, not color alone: bronze shield, silver swords, gold sun/laurel, platinum winged compass, diamond crystal, master crown.

Each rank has one paired board/profile reward card. Bronze/Silver are Rare, Gold/Platinum Epic, Diamond/Master Legendary. Existing ownership and keyboard-accessible preview/equip dialogs remain the entry points. Tier rewards cannot be bought with coins.

Validate at 320×740, 375×812, 768×1024, and 1440×900. Check locked and earned items, loading/error behavior, signed-out access, persisted equipment, long five-digit tile values, X/hard block rendering, and reduced motion. Diamond and Master use the existing shared merge effect renderer in both previews and live boards; reduced motion hides decorative animation.

References: existing profile-icon SVGs, NumberTile, SkinPreview, MergeFlair, and the achievements/loadout pages in this repository. No new UI dependency or separate reward service.
