import React, { type CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SKINS } from "schema/loadout";
import { I18nProvider } from "ui/i18n";
import { Tile } from "../src/components/2048/tile";

// Render the real moving-tile component at fixed values without changing game state.
// tsx uses classic JSX for workspace packages; Next supplies its own JSX runtime.
Object.assign(globalThis, { React });
console.log(renderToStaticMarkup(<I18nProvider initialLocale="en" messages={{}}>
  {SKINS.map(skin => <section key={skin.id} data-skin={skin.id} className="mb-6">
    <h2 className="mb-2 font-bold">{skin.name}</h2>
    <div className="relative aspect-square" style={{ width: "var(--fixture-width, 343px)", containerType: "inline-size", background: skin.tokens.boardBackground, borderRadius: `calc(${skin.tokens.tileRadius} + 6px)`, "--gap": "6px", "--tile": "calc((100% - 36px) / 5)", "--skin-tile-radius": skin.tokens.tileRadius } as CSSProperties}>
      <div className="relative size-full" style={{ padding: 6 }}>
        {[2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768].map((value, index) => <Tile key={value} tokens={skin.tokens} tile={{ id: value, value, row: Math.floor(index / 5), col: index % 5 }} />)}
        <Tile tokens={skin.tokens} tile={{ id: -1, value: 0, row: 3, col: 0, blockType: "xblock" }} />
        <Tile tokens={skin.tokens} tile={{ id: -2, value: 0, row: 3, col: 1, blockType: "hardblock" }} />
      </div>
    </div>
  </section>)}
</I18nProvider>));
