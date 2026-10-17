begin;

-- Keep the existing purchase FK and permanent ownership rows.
alter table private.cosmetic_catalog
  add column definition jsonb not null default '{}',
  add column acquisition text not null default 'coins' check(acquisition in ('free','coins','achievement')),
  add column status text not null default 'published' check(status in ('draft','published','archived')),
  add column revision integer not null default 1 check(revision>0),
  add column published_once boolean not null default true,
  add column legacy boolean not null default false,
  add column legacy_price integer check(legacy_price>=0),
  add column updated_at timestamptz not null default now();
update private.cosmetic_catalog set acquisition=case when price=0 then 'free' else 'coins' end,legacy_price=price;
create table private.achievement_catalog(
  item_id text primary key, definition jsonb not null,
  status text not null check(status in ('draft','published','archived')),
  revision integer not null default 1 check(revision>0),
  published_once boolean not null default false,
  updated_at timestamptz not null default now()
);
create table private.catalog_audit(
  id bigint generated always as identity primary key, actor_id uuid not null,
  kind text not null, item_id text not null, previous jsonb, current jsonb not null, created_at timestamptz not null default now()
);
revoke all on private.achievement_catalog,private.catalog_audit from public,anon,authenticated,service_role;

-- Existing IDs are seeded below; no player data is rewritten.
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','classic',0,'free','{"kind":"skin","id":"classic","name":"Classic","description":"Default board and tiles.","rarity":"common","price":0,"tokens":{"boardBackground":"#cbc5b6","emptyBackground":"#e1dccf","tileRadius":"0.5rem"},"sortOrder":0}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','slate',0,'free','{"kind":"skin","id":"slate","name":"Slate","description":"Slate frame with default tile colors.","rarity":"common","price":0,"tokens":{"boardBackground":"#818b99","emptyBackground":"#cdd3dc","tileRadius":"0.375rem"},"sortOrder":1}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','paper',0,'free','{"kind":"skin","id":"paper","name":"Paper","description":"Paper-colored board with square tiles.","rarity":"common","price":0,"tokens":{"boardBackground":"#d4cbb8","emptyBackground":"#f6f0e4","tileRadius":"0.125rem"},"sortOrder":2}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','confetti',300,'coins','{"kind":"skin","id":"confetti","name":"Confetti","description":"Polka-dot tiles.","rarity":"rare","price":0,"tokens":{"boardBackground":"#cbc5b6","emptyBackground":"#e1dccf","tileRadius":"0.5rem","tilePattern":"dots"},"sortOrder":3}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','gingham',300,'coins','{"kind":"skin","id":"gingham","name":"Picnic","description":"Gingham-patterned tiles.","rarity":"rare","price":0,"tokens":{"boardBackground":"#cbc5b6","emptyBackground":"#e1dccf","tileRadius":"0.5rem","tilePattern":"gingham"},"sortOrder":4}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','meadow',600,'coins','{"kind":"skin","id":"meadow","name":"Meadow","description":"Green board with pastel tiles.","rarity":"epic","price":0,"tokens":{"boardBackground":"radial-gradient(ellipse at top left, #b3cda0, #627e64)","emptyBackground":"#d9e5ca","tileRadius":"0.65rem","tilePattern":"dots","tilePalette":["#f4f3cc","#e1edb3","#c3e0b1","#f2d6a7","#f4bec0","#d4c4ea"]},"sortOrder":5}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','tide',600,'coins','{"kind":"skin","id":"tide","name":"Tide Pool","description":"Sea-glass board and tiles.","rarity":"epic","price":0,"tokens":{"boardBackground":"linear-gradient(145deg, #97cfda, #527b9e)","emptyBackground":"#d5e9e9","tileRadius":"0.65rem","tilePattern":"gingham","tilePalette":["#e4f3ee","#c6e7e4","#a9d7e6","#b6c9ed","#dac8eb","#f0cbd6"]},"sortOrder":6}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','kitty',1200,'coins','{"kind":"skin","id":"kitty","name":"Kitty Club","description":"Cat character tiles.","rarity":"legendary","price":0,"tokens":{"boardBackground":"linear-gradient(145deg, #e5b9a1, #b97864)","emptyBackground":"#f2d5bf","tileRadius":"0.6rem","character":"cat","tilePalette":["#f9e1b2","#f2cc9f","#f3bda6","#e9b0b5","#d4bce6","#bcd6c4"]},"sortOrder":7}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','bunny',1200,'coins','{"kind":"skin","id":"bunny","name":"Bunny Garden","description":"Rabbit character tiles.","rarity":"legendary","price":0,"tokens":{"boardBackground":"linear-gradient(145deg, #c2b7da, #8c7eae)","emptyBackground":"#e2d9ed","tileRadius":"0.6rem","character":"bunny","tilePalette":["#f5d9e6","#e4ceef","#c8d8ef","#c4e2d4","#e7e6b7","#f5d3b5"]},"sortOrder":8}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','charcoal',0,'free','{"kind":"skin","id":"charcoal","name":"Charcoal","description":"Graphite frame and gray cells.","rarity":"common","price":0,"tokens":{"boardBackground":"#41464d","emptyBackground":"#666c72","tileRadius":"0.4rem"},"sortOrder":9}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','espresso',0,'free','{"kind":"skin","id":"espresso","name":"Espresso","description":"Coffee-colored board with default tiles.","rarity":"common","price":0,"tokens":{"boardBackground":"#685347","emptyBackground":"#a18b79","tileRadius":"0.5rem"},"sortOrder":10}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','pinstripe',300,'coins','{"kind":"skin","id":"pinstripe","name":"Pinstripe","description":"Diagonal-striped tiles.","rarity":"rare","price":0,"tokens":{"boardBackground":"#cbc5b6","emptyBackground":"#e1dccf","tileRadius":"0.5rem","tilePattern":"pinstripe"},"sortOrder":11}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','weave',300,'coins','{"kind":"skin","id":"weave","name":"Woven Linen","description":"Woven-texture tiles.","rarity":"rare","price":0,"tokens":{"boardBackground":"#cbc5b6","emptyBackground":"#e1dccf","tileRadius":"0.5rem","tilePattern":"weave"},"sortOrder":12}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','runes',300,'coins','{"kind":"skin","id":"runes","name":"Rune Script","description":"Rune borders on tiles.","rarity":"rare","price":0,"tokens":{"boardBackground":"#cbc5b6","emptyBackground":"#e1dccf","tileRadius":"0.5rem","tilePattern":"runes"},"sortOrder":13}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','aurora',600,'coins','{"kind":"skin","id":"aurora","name":"Aurora","description":"Aurora board and blue tiles.","rarity":"epic","price":0,"tokens":{"boardBackground":"radial-gradient(ellipse at top left, #428880, transparent 65%), radial-gradient(ellipse at bottom right, #66548b, #202e40)","emptyBackground":"#324553","tileRadius":"0.5rem","tilePattern":"pinstripe","tilePalette":["#d7ebe4","#b7ddd6","#a9d8df","#b6c9e3","#c7b8dc","#ddc5df"]},"sortOrder":14}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','obsidian',600,'coins','{"kind":"skin","id":"obsidian","name":"Obsidian","description":"Black stone board and brass tile borders.","rarity":"epic","price":0,"tokens":{"boardBackground":"linear-gradient(135deg, #50545b, #20242b 60%, #54504a)","emptyBackground":"#62636a","tileRadius":"0.3rem","tilePattern":"weave","tilePalette":["#e5e0d4","#d5cbbb","#dfcba2","#d8b882","#dfb18e","#e6c47e"]},"sortOrder":15}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','astral',600,'coins','{"kind":"skin","id":"astral","name":"Astral Archive","description":"Silver rune and star patterns.","rarity":"epic","price":0,"tokens":{"boardBackground":"radial-gradient(circle at 20% 20%, #bba5df 1px, transparent 2px) 0 0 / 22px 22px, linear-gradient(135deg, #5e507e, #28273f)","emptyBackground":"#69627f","tileRadius":"0.5rem","tilePattern":"runes","tilePalette":["#e8e1f4","#d4c7e9","#bebfe5","#bdd6e5","#d8c8df","#ead7ac"]},"sortOrder":16}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','sentinel',1200,'coins','{"kind":"skin","id":"sentinel","name":"Iron Sentinel","description":"Mech character tiles.","rarity":"legendary","price":0,"tokens":{"boardBackground":"linear-gradient(135deg, #3d6576, #1e2c3b)","emptyBackground":"#536a78","tileRadius":"0.35rem","character":"sentinel","tilePalette":["#a7beca","#91b2be","#8dc7cc","#9caed3","#b6a9cc","#d4bc90"]},"sortOrder":17}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','runeknight',1200,'coins','{"kind":"skin","id":"runeknight","name":"Rune Knight","description":"Knight helmet tiles with amber runes.","rarity":"legendary","price":0,"tokens":{"boardBackground":"linear-gradient(135deg, #6c6260, #35343e)","emptyBackground":"#888180","tileRadius":"0.4rem","character":"runeknight","tilePalette":["#c6bdac","#b6baca","#d2bda2","#b4c9c7","#c4b2d4","#d9bf8b"]},"sortOrder":18}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','arcanist',1200,'coins','{"kind":"skin","id":"arcanist","name":"Arcane Order","description":"Wizard character tiles.","rarity":"legendary","price":0,"tokens":{"boardBackground":"radial-gradient(ellipse at top, #776490, #302d49)","emptyBackground":"#82768f","tileRadius":"0.5rem","character":"arcanist","tilePalette":["#b2a5d1","#a3b7d5","#9ec6bf","#c7b1cf","#cbbd9c","#bcb3dd"]},"sortOrder":19}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','dawn-oath',0,'achievement','{"kind":"skin","id":"dawn-oath","name":"Dawn Oath","description":"Rising-sun borders earned through seven days of attendance.","rarity":"rare","price":0,"tokens":{"boardBackground":"#cbc5b6","emptyBackground":"#e1dccf","tileRadius":"0.5rem","tilePattern":"sunrise"},"sortOrder":20}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','rune-sanctum',0,'achievement','{"kind":"skin","id":"rune-sanctum","name":"Rune Sanctum","description":"Jade stone and engraved magic circles for a 1024 milestone.","rarity":"epic","price":0,"tokens":{"boardBackground":"repeating-linear-gradient(90deg, transparent 0 23%, #b9d7ca12 23% 24%, transparent 24% 25%), radial-gradient(ellipse at top, #658a7f, #243e3d)","emptyBackground":"#52736a","tileRadius":"0.4rem","tilePattern":"magic-circle","tilePalette":["#e7eee1","#cddfcf","#b4d8ca","#b8d4da","#cbcce1","#e4d6aa"]},"sortOrder":21}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','rank-bronze',0,'achievement','{"kind":"skin","id":"rank-bronze","name":"Bronze Bastion","description":"Copper shields and etched metal for Bronze rank.","rarity":"rare","price":0,"tokens":{"boardBackground":"linear-gradient(135deg, #a86e49, #5d3f32)","emptyBackground":"#bd9577","tileRadius":"0.3rem","tilePattern":"shield","tilePalette":["#f3e4d1","#ecd6bc","#dfbf98","#e7bd91","#edc9ac","#f0d3a4"]},"sortOrder":22}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','rank-silver',0,'achievement','{"kind":"skin","id":"rank-silver","name":"Silver Crossguard","description":"Crossed silver blades and engraved steel for Silver rank.","rarity":"rare","price":0,"tokens":{"boardBackground":"linear-gradient(145deg, #a4b1c0, #4b596b)","emptyBackground":"#bec9d4","tileRadius":"0.2rem","tilePattern":"crossguard","tilePalette":["#edf1f4","#dce5ed","#cedde9","#c1d0e3","#d3d2e6","#e1e4ed"]},"sortOrder":23}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','rank-gold',0,'achievement','{"kind":"skin","id":"rank-gold","name":"Golden Laurel","description":"Sunlit gold and laurel borders for Gold rank.","rarity":"epic","price":0,"tokens":{"boardBackground":"radial-gradient(ellipse at top, #c9a64b, #685229)","emptyBackground":"#bfaa6b","tileRadius":"0.65rem","tilePattern":"laurel","tilePalette":["#faf0c8","#f4e3aa","#eed28d","#f1cc82","#f4d6a5","#e9d99c"]},"sortOrder":24}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','rank-platinum',0,'achievement','{"kind":"skin","id":"rank-platinum","name":"Platinum Compass","description":"Teal wings and compass markings for Platinum rank.","rarity":"epic","price":0,"tokens":{"boardBackground":"linear-gradient(150deg, #6bb2a7, #234d58)","emptyBackground":"#82b3b0","tileRadius":"0.4rem","tilePattern":"compass","tilePalette":["#e7f2e8","#cce8de","#b3dcd6","#acd2dd","#c6d7e7","#dfdfc7"]},"sortOrder":25}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','rank-diamond',0,'achievement','{"kind":"skin","id":"rank-diamond","name":"Diamond Prism","description":"Faceted crystal tiles with a prismatic merge burst for Diamond rank.","rarity":"legendary","price":0,"tokens":{"boardBackground":"conic-gradient(from 30deg at 30% 25%, #365e89, #9abed2, #45648c, #526895, #365e89)","emptyBackground":"#94b7cd","tileRadius":"0.4rem","character":"diamond","tilePalette":["#d7eaf5","#c4e1f3","#b9d8ee","#c7d5ed","#d8d4f1","#e4dbef"]},"sortOrder":26}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('skin','rank-master',0,'achievement','{"kind":"skin","id":"rank-master","name":"Master Crown","description":"Violet and gold crown tiles with a regal merge crest for Master rank.","rarity":"legendary","price":0,"tokens":{"boardBackground":"radial-gradient(ellipse at top, #87719d, #392d54 75%)","emptyBackground":"#9b88ad","tileRadius":"0.5rem","character":"crown","tilePalette":["#e8dcec","#dccbec","#d1c9eb","#d9c4df","#e6cdcd","#eed9b0"]},"sortOrder":27}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('icon','fox',0,'free','{"kind":"icon","id":"fox","name":"Ember Fox","color":"#c66a42","description":"","imagePath":"profile-icons/fox.svg","sortOrder":0}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('icon','owl',150,'coins','{"kind":"icon","id":"owl","name":"Moon Owl","color":"#7d83b5","description":"","imagePath":"profile-icons/owl.svg","sortOrder":1}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('icon','dragon',150,'coins','{"kind":"icon","id":"dragon","name":"Jade Dragon","color":"#4f9584","description":"","imagePath":"profile-icons/dragon.svg","sortOrder":2}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('icon','cat',150,'coins','{"kind":"icon","id":"cat","name":"Star Cat","color":"#b28a42","description":"","imagePath":"profile-icons/cat.svg","sortOrder":3}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('icon','rabbit',150,'coins','{"kind":"icon","id":"rabbit","name":"Cloud Rabbit","color":"#b57892","description":"","imagePath":"profile-icons/rabbit.svg","sortOrder":4}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('icon','robot',150,'coins','{"kind":"icon","id":"robot","name":"Tile Bot","color":"#548da7","description":"","imagePath":"profile-icons/robot.svg","sortOrder":5}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('icon','attendance-king',0,'achievement','{"kind":"icon","id":"attendance-king","name":"Attendance King","color":"#b68a43","description":"","imagePath":"profile-icons/attendance-king.svg","sortOrder":6}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('icon','victory-vanguard',0,'achievement','{"kind":"icon","id":"victory-vanguard","name":"Victory Vanguard","color":"#4c7e78","description":"","imagePath":"profile-icons/victory-vanguard.svg","sortOrder":7}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('icon','rank-bronze',0,'achievement','{"kind":"icon","id":"rank-bronze","name":"Bronze Bastion","color":"#a76e49","description":"","imagePath":"profile-icons/rank-bronze.svg","sortOrder":8}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('icon','rank-silver',0,'achievement','{"kind":"icon","id":"rank-silver","name":"Silver Crossguard","color":"#7e94af","description":"","imagePath":"profile-icons/rank-silver.svg","sortOrder":9}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('icon','rank-gold',0,'achievement','{"kind":"icon","id":"rank-gold","name":"Golden Laurel","color":"#b8953e","description":"","imagePath":"profile-icons/rank-gold.svg","sortOrder":10}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('icon','rank-platinum',0,'achievement','{"kind":"icon","id":"rank-platinum","name":"Platinum Compass","color":"#4b968e","description":"","imagePath":"profile-icons/rank-platinum.svg","sortOrder":11}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('icon','rank-diamond',0,'achievement','{"kind":"icon","id":"rank-diamond","name":"Diamond Prism","color":"#689ec3","description":"","imagePath":"profile-icons/rank-diamond.svg","sortOrder":12}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition) values('icon','rank-master',0,'achievement','{"kind":"icon","id":"rank-master","name":"Master Crown","color":"#8b69a7","description":"","imagePath":"profile-icons/rank-master.svg","sortOrder":13}'::jsonb) on conflict(kind,item_id) do update set definition=excluded.definition,acquisition=excluded.acquisition;
insert into private.achievement_catalog(item_id,definition,status,published_once) values('checkin-7','{"id":"checkin-7","name":"Seven dawns","description":"Check in for 7 consecutive days (KST).","metric":"attendance_streak","target":7,"reward":{"kind":"skin","skinId":"dawn-oath"},"sortOrder":0}'::jsonb,'published',true);
insert into private.achievement_catalog(item_id,definition,status,published_once) values('checkin-30','{"id":"checkin-30","name":"Attendance king","description":"Check in for 30 consecutive days (KST).","metric":"attendance_streak","target":30,"reward":{"kind":"icon","iconId":"attendance-king"},"sortOrder":1}'::jsonb,'published',true);
insert into private.achievement_catalog(item_id,definition,status,published_once) values('wins-10','{"id":"wins-10","name":"Victory vanguard","description":"Win 10 eligible matches.","metric":"wins","target":10,"reward":{"kind":"icon","iconId":"victory-vanguard"},"sortOrder":2}'::jsonb,'published',true);
insert into private.achievement_catalog(item_id,definition,status,published_once) values('tile-2048-reward','{"id":"tile-2048-reward","name":"Rune awakening","description":"Create a 1024 tile in an eligible match.","metric":"highest_tile","target":1024,"reward":{"kind":"skin","skinId":"rune-sanctum"},"sortOrder":3}'::jsonb,'published',true);
insert into private.achievement_catalog(item_id,definition,status,published_once) values('rank-bronze','{"id":"rank-bronze","name":"Bronze collector","description":"Reach Bronze in ranked play.","metric":"rank_tier","target":1,"reward":{"kind":"set","skinId":"rank-bronze","iconId":"rank-bronze"},"sortOrder":4}'::jsonb,'published',true);
insert into private.achievement_catalog(item_id,definition,status,published_once) values('rank-silver','{"id":"rank-silver","name":"Silver collector","description":"Reach Silver in ranked play.","metric":"rank_tier","target":2,"reward":{"kind":"set","skinId":"rank-silver","iconId":"rank-silver"},"sortOrder":5}'::jsonb,'published',true);
insert into private.achievement_catalog(item_id,definition,status,published_once) values('rank-gold','{"id":"rank-gold","name":"Gold collector","description":"Reach Gold in ranked play.","metric":"rank_tier","target":3,"reward":{"kind":"set","skinId":"rank-gold","iconId":"rank-gold"},"sortOrder":6}'::jsonb,'published',true);
insert into private.achievement_catalog(item_id,definition,status,published_once) values('rank-platinum','{"id":"rank-platinum","name":"Platinum collector","description":"Reach Platinum in ranked play.","metric":"rank_tier","target":4,"reward":{"kind":"set","skinId":"rank-platinum","iconId":"rank-platinum"},"sortOrder":7}'::jsonb,'published',true);
insert into private.achievement_catalog(item_id,definition,status,published_once) values('rank-diamond','{"id":"rank-diamond","name":"Diamond collector","description":"Reach Diamond in ranked play.","metric":"rank_tier","target":5,"reward":{"kind":"set","skinId":"rank-diamond","iconId":"rank-diamond"},"sortOrder":8}'::jsonb,'published',true);
insert into private.achievement_catalog(item_id,definition,status,published_once) values('rank-master','{"id":"rank-master","name":"Master collector","description":"Reach Master in ranked play.","metric":"rank_tier","target":6,"reward":{"kind":"set","skinId":"rank-master","iconId":"rank-master"},"sortOrder":9}'::jsonb,'published',true);


-- Existing solo catalogs publish only where the trusted solo result backend is installed.
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition,status,published_once) values('skin','copper-sprint',0,'achievement','{"id":"copper-sprint","name":"Copper Sprint","description":"Copper stripes celebrating your first solo 2048.","rarity":"rare","price":0,"tokens":{"boardBackground":"linear-gradient(135deg, #ae7253, #654637)","emptyBackground":"#c8a58b","tileRadius":"0.4rem","tilePattern":"pinstripe"},"sortOrder":28}'::jsonb,case when to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null then 'published' else 'draft' end,to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null) on conflict do nothing;
insert into private.achievement_catalog(item_id,definition,status,published_once) values('solo-first','{"id":"solo-first","name":"Solo breakthrough","description":"Reach 2048 in a solo time attack.","metric":"solo_time","target":3600000,"reward":{"kind":"skin","skinId":"copper-sprint"},"sortOrder":10}'::jsonb,case when to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null then 'published' else 'draft' end,to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null) on conflict do nothing;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition,status,published_once) values('skin','silver-current',0,'achievement','{"id":"silver-current","name":"Silver Current","description":"Cool silver and blue for a ten-minute finish.","rarity":"rare","price":0,"tokens":{"boardBackground":"linear-gradient(135deg, #a5bdcb, #344e67)","emptyBackground":"#829daa","tileRadius":"0.4rem","tilePattern":"weave"},"sortOrder":29}'::jsonb,case when to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null then 'published' else 'draft' end,to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null) on conflict do nothing;
insert into private.achievement_catalog(item_id,definition,status,published_once) values('solo-10min','{"id":"solo-10min","name":"Against the clock","description":"Reach 2048 within 10 minutes in solo time attack.","metric":"solo_time","target":600000,"reward":{"kind":"skin","skinId":"silver-current"},"sortOrder":11}'::jsonb,case when to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null then 'published' else 'draft' end,to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null) on conflict do nothing;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition,status,published_once) values('skin','golden-flash',0,'achievement','{"id":"golden-flash","name":"Golden Flash","description":"Golden rays earned by reaching 2048 in six minutes.","rarity":"epic","price":0,"tokens":{"boardBackground":"radial-gradient(ellipse at top left, #bd9344, #49331e)","emptyBackground":"#9e7d46","tileRadius":"0.4rem","tilePattern":"sunrise","tilePalette":["#fff1c9","#f8df9e","#f2ce7a","#eebc68","#e8aa70","#f2d991"]},"sortOrder":30}'::jsonb,case when to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null then 'published' else 'draft' end,to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null) on conflict do nothing;
insert into private.achievement_catalog(item_id,definition,status,published_once) values('solo-6min','{"id":"solo-6min","name":"Lightning hands","description":"Reach 2048 within 6 minutes in solo time attack.","metric":"solo_time","target":360000,"reward":{"kind":"skin","skinId":"golden-flash"},"sortOrder":12}'::jsonb,case when to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null then 'published' else 'draft' end,to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null) on conflict do nothing;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition,status,published_once) values('skin','storm-fox',0,'achievement','{"id":"storm-fox","name":"Storm Fox","description":"A silver fox with lightning ears for a four-minute finish.","rarity":"legendary","price":0,"tokens":{"boardBackground":"linear-gradient(145deg, #526d92, #222d50)","emptyBackground":"#60728d","tileRadius":"0.5rem","character":"fox","tilePalette":["#d8e8f8","#bddbed","#adc5ef","#c4b9ee","#d8c8f4","#f1deaf"]},"sortOrder":31}'::jsonb,case when to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null then 'published' else 'draft' end,to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null) on conflict do nothing;
insert into private.achievement_catalog(item_id,definition,status,published_once) values('solo-4min','{"id":"solo-4min","name":"Storm runner","description":"Reach 2048 within 4 minutes in solo time attack.","metric":"solo_time","target":240000,"reward":{"kind":"skin","skinId":"storm-fox"},"sortOrder":13}'::jsonb,case when to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null then 'published' else 'draft' end,to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null) on conflict do nothing;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition,status,published_once) values('skin','chrono-dragon',0,'achievement','{"id":"chrono-dragon","name":"Chrono Dragon","description":"An emerald dragon guarding the two-minute record.","rarity":"legendary","price":0,"tokens":{"boardBackground":"radial-gradient(ellipse at top, #6b947b, #203e3c)","emptyBackground":"#648778","tileRadius":"0.5rem","character":"dragon","tilePalette":["#dfedbd","#beddbb","#aad3ca","#bbd9db","#e2c6a5","#f4d48f"]},"sortOrder":32}'::jsonb,case when to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null then 'published' else 'draft' end,to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null) on conflict do nothing;
insert into private.achievement_catalog(item_id,definition,status,published_once) values('solo-2min','{"id":"solo-2min","name":"Time bender","description":"Reach 2048 within 2 minutes in solo time attack.","metric":"solo_time","target":120000,"reward":{"kind":"skin","skinId":"chrono-dragon"},"sortOrder":14}'::jsonb,case when to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null then 'published' else 'draft' end,to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null) on conflict do nothing;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition,status,published_once) values('skin','jade-path',0,'achievement','{"id":"jade-path","name":"Jade Path","description":"Jade rune borders for your first endless 2048.","rarity":"rare","price":0,"tokens":{"boardBackground":"#718d7d","emptyBackground":"#b6cbbb","tileRadius":"0.4rem","tilePattern":"runes"},"sortOrder":33}'::jsonb,case when to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null then 'published' else 'draft' end,to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null) on conflict do nothing;
insert into private.achievement_catalog(item_id,definition,status,published_once) values('endless-2048','{"id":"endless-2048","name":"Beyond the finish","description":"Create a 2048 tile in endless mode.","metric":"solo_tile","target":2048,"reward":{"kind":"skin","skinId":"jade-path"},"sortOrder":15}'::jsonb,case when to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null then 'published' else 'draft' end,to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null) on conflict do nothing;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition,status,published_once) values('skin','twilight-orbit',0,'achievement','{"id":"twilight-orbit","name":"Twilight Orbit","description":"Violet constellations earned at endless 4096.","rarity":"epic","price":0,"tokens":{"boardBackground":"radial-gradient(ellipse at top right, #8a7dab, #303047)","emptyBackground":"#716d8d","tileRadius":"0.5rem","tilePattern":"magic-circle","tilePalette":["#efe7f5","#dcd2ed","#cec6eb","#c3d1eb","#d9c3e8","#edc8cc"]},"sortOrder":34}'::jsonb,case when to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null then 'published' else 'draft' end,to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null) on conflict do nothing;
insert into private.achievement_catalog(item_id,definition,status,published_once) values('endless-4096','{"id":"endless-4096","name":"Twilight voyager","description":"Create a 4096 tile in endless mode.","metric":"solo_tile","target":4096,"reward":{"kind":"skin","skinId":"twilight-orbit"},"sortOrder":16}'::jsonb,case when to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null then 'published' else 'draft' end,to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null) on conflict do nothing;
insert into private.cosmetic_catalog(kind,item_id,price,acquisition,definition,status,published_once) values('skin','star-phoenix',0,'achievement','{"id":"star-phoenix","name":"Star Phoenix","description":"A celestial phoenix awakened by an endless 8192 tile.","rarity":"legendary","price":0,"tokens":{"boardBackground":"radial-gradient(ellipse at top, #a36c83, #352e53)","emptyBackground":"#886b87","tileRadius":"0.5rem","character":"phoenix","tilePalette":["#f9debf","#f2c7bb","#eac1db","#d8c1eb","#c7d4ee","#f5d995"]},"sortOrder":35}'::jsonb,case when to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null then 'published' else 'draft' end,to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null) on conflict do nothing;
insert into private.achievement_catalog(item_id,definition,status,published_once) values('endless-8192','{"id":"endless-8192","name":"Star sovereign","description":"Create an 8192 tile in endless mode.","metric":"solo_tile","target":8192,"reward":{"kind":"skin","skinId":"star-phoenix"},"sortOrder":17}'::jsonb,case when to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null then 'published' else 'draft' end,to_regclass('public.solo_records') is not null and to_regclass('public.solo_endless_records') is not null) on conflict do nothing;

-- Other already-deployed features keep their old equipment guards and allowed IDs.
-- Archived placeholders are not sold or granted by this migration.
do $$
declare c record; item text; expression text;
begin
  for c in select * from(values('skin','skin_id'),('icon','icon_id')) x(kind,column_name) loop
    select pg_get_expr(conbin,conrelid) into expression from pg_constraint
      where conrelid='public.player_preferences'::regclass and conname='player_preferences_'||c.column_name||'_check';
    for item in select match[1] from regexp_matches(coalesce(expression,''),'''([^'']+)''','g') match loop
      insert into private.cosmetic_catalog(kind,item_id,price,acquisition,status,legacy,definition)
      values(c.kind,item,0,'achievement','archived',true,jsonb_build_object('id',item,'name',item,'description','Legacy cosmetic','sortOrder',1000000)||
        case when c.kind='skin' then '{"rarity":"common","tokens":{"boardBackground":"#cbc5b6","emptyBackground":"#e1dccf","tileRadius":"0.5rem"}}'::jsonb
        else jsonb_build_object('color','#888888','imagePath','profile-icons/fox.svg') end)
      on conflict do nothing;
    end loop;
  end loop;
end;
$$;

-- Preserve independently added shop rows that are not part of this source snapshot.
update private.cosmetic_catalog set status='archived',legacy=true,definition=jsonb_build_object('id',item_id,'name',item_id,'description','Legacy cosmetic','sortOrder',1000000)||
 case when kind='skin' then '{"rarity":"common","tokens":{"boardBackground":"#cbc5b6","emptyBackground":"#e1dccf","tileRadius":"0.5rem"}}'::jsonb
 else jsonb_build_object('color','#888888','imagePath','profile-icons/fox.svg') end where definition='{}'::jsonb;

create function private.catalog_cosmetic_json(c private.cosmetic_catalog) returns jsonb
language sql stable set search_path='' as $$
 select (c.definition-'kind')||jsonb_build_object('id',c.item_id,'price',c.price,'acquisition',c.acquisition,'status',c.status,'revision',c.revision,'publishedOnce',c.published_once,'updatedAt',c.updated_at)
$$;
create function private.catalog_achievement_json(c private.achievement_catalog) returns jsonb
language sql stable set search_path='' as $$
 select c.definition||jsonb_build_object('id',c.item_id,'status',c.status,'revision',c.revision,'publishedOnce',c.published_once,'updatedAt',c.updated_at)
$$;
create function private.read_content_catalog(p_drafts boolean) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'skins',coalesce((select jsonb_agg(private.catalog_cosmetic_json(c) order by coalesce((definition->>'sortOrder')::integer,0),item_id) from private.cosmetic_catalog c where kind='skin' and (p_drafts or (status<>'draft' and published_once))),'[]'::jsonb),
  'profileIcons',coalesce((select jsonb_agg(private.catalog_cosmetic_json(c) order by coalesce((definition->>'sortOrder')::integer,0),item_id) from private.cosmetic_catalog c where kind='icon' and (p_drafts or (status<>'draft' and published_once))),'[]'::jsonb),
  'achievements',coalesce((select jsonb_agg(private.catalog_achievement_json(c) order by coalesce((definition->>'sortOrder')::integer,0),item_id) from private.achievement_catalog c where p_drafts or (status<>'draft' and published_once)),'[]'::jsonb))
$$;
create function public.content_catalog() returns jsonb language sql stable security definer set search_path='' as $$select private.read_content_catalog(false)$$;
create function public.admin_content_catalog() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_game_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 return private.read_content_catalog(true);
end;$$;

create function private.catalog_valid_path(p_path text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(length(p_path)<=220 and p_path~'^[a-z0-9][a-z0-9/_-]*\.(png|jpe?g|webp|svg)$' and position('//' in p_path)=0,false)
$$;
create function private.catalog_valid_metadata(p jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p)='object' and jsonb_typeof(p->'id')='string' and p->>'id'~'^[a-z0-9][a-z0-9-]{0,63}$'
 and jsonb_typeof(p->'name')='string' and length(btrim(p->>'name')) between 1 and 120
 and (not p?'nameKo' or (jsonb_typeof(p->'nameKo')='string' and length(btrim(p->>'nameKo')) between 1 and 120))
 and (not p?'description' or(jsonb_typeof(p->'description')='string' and length(p->>'description')<=1000))
 and (not p?'descriptionKo' or(jsonb_typeof(p->'descriptionKo')='string' and length(p->>'descriptionKo')<=1000))
 and p->>'status' in ('draft','published','archived')
 and (not p?'sortOrder' or(jsonb_typeof(p->'sortOrder')='number' and (p->>'sortOrder')::numeric between 0 and 1000000 and (p->>'sortOrder')::numeric=trunc((p->>'sortOrder')::numeric))),false)
$$;
create function private.catalog_valid_tokens(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare token text; value text;
begin
 if jsonb_typeof(p) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p) k where k not in('boardBackground','emptyBackground','tileRadius','tilePattern','tilePalette','character','boardImagePath','tileImagePath')) then return false;end if;
 foreach token in array array['boardBackground','emptyBackground'] loop
   value:=p->>token;
   if jsonb_typeof(p->token) is distinct from 'string' or length(value) not between 1 and 1000 or value!~'^[a-zA-Z0-9#(),.%[:space:]/-]+$' or value~*'(url|expression|var)[[:space:]]*\(' then return false;end if;
 end loop;
 if jsonb_typeof(p->'tileRadius') is distinct from 'string' or p->>'tileRadius'!~'^\d+(\.\d+)?(rem|px|%)$' then return false;end if;
 if p?'tilePattern' and coalesce(p->>'tilePattern','') not in('dots','gingham','pinstripe','weave','runes','sunrise','magic-circle','shield','crossguard','laurel','compass') then return false;end if;
 if p?'character' and coalesce(p->>'character','') not in('cat','bunny','sentinel','runeknight','arcanist','diamond','crown','fox','dragon','phoenix') then return false;end if;
 if p?'tilePalette' then
   if jsonb_typeof(p->'tilePalette') is distinct from 'array' then return false;end if;
   if jsonb_array_length(p->'tilePalette') not between 1 and 16 or exists(select 1 from jsonb_array_elements(p->'tilePalette') v where jsonb_typeof(v)<>'string' or v#>>'{}'!~'^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$') then return false;end if;
 end if;
 foreach token in array array['boardImagePath','tileImagePath'] loop
   if p?token and (jsonb_typeof(p->token) is distinct from 'string' or not private.catalog_valid_path(p->>token)) then return false;end if;
 end loop;
 return true;
end;$$;

create function private.catalog_asset_exists(p_path text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare available boolean;
begin
 if to_regclass('storage.objects') is null then return false;end if;
 execute 'select exists(select 1 from storage.objects where bucket_id=$1 and name=$2)' into available using 'catalog-assets',p_path;
 return available;
end;$$;

create function public.admin_save_cosmetic(p_kind text,p_item jsonb,p_expected_revision integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing private.cosmetic_catalog; saved private.cosmetic_catalog; item jsonb;
begin
 if not public.is_game_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('catalog'),0);
 if not private.catalog_valid_metadata(p_item) then raise exception 'Invalid cosmetic' using errcode='22023';end if;
 if (p_kind='icon' and p_item->>'id'='guest') or p_kind is null or p_kind not in('skin','icon') or p_expected_revision is null or p_expected_revision<0
 or (p_item?'kind' and p_item->>'kind' is distinct from p_kind)
 or exists(select 1 from jsonb_object_keys(p_item) k where k not in('kind','id','name','nameKo','description','descriptionKo','status','sortOrder','acquisition','price','rarity','tokens','color','imagePath'))
 or coalesce(p_item->>'acquisition','') not in('free','coins','achievement') or jsonb_typeof(p_item->'price') is distinct from 'number' then raise exception 'Invalid cosmetic' using errcode='22023';end if;
 if (p_item->>'price')::numeric not between 0 and 1000000000 or (p_item->>'price')::numeric<>trunc((p_item->>'price')::numeric)
 or ((p_item->>'acquisition'='coins')<>((p_item->>'price')::numeric>0)) then raise exception 'Invalid price' using errcode='22023';end if;
 if p_kind='skin' then
   if coalesce(p_item->>'rarity','') not in('common','rare','epic','legendary') or not private.catalog_valid_tokens(p_item->'tokens') or p_item?'color' or p_item?'imagePath' then raise exception 'Invalid skin' using errcode='22023';end if;
 elsif jsonb_typeof(p_item->'color') is distinct from 'string' or p_item->>'color'!~'^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$' or not private.catalog_valid_path(p_item->>'imagePath') or p_item?'rarity' or p_item?'tokens' then raise exception 'Invalid icon' using errcode='22023';end if;
 if p_item->>'status'='published' and ((p_kind='icon' and not private.catalog_asset_exists(p_item->>'imagePath')) or
 (p_kind='skin' and ((p_item->'tokens'?'boardImagePath' and not private.catalog_asset_exists(p_item->'tokens'->>'boardImagePath')) or (p_item->'tokens'?'tileImagePath' and not private.catalog_asset_exists(p_item->'tokens'->>'tileImagePath'))))) then raise exception 'Image asset must be uploaded before publishing' using errcode='22023';end if;
 select * into existing from private.cosmetic_catalog where kind=p_kind and item_id=p_item->>'id' for update;
 if coalesce(existing.revision,0)<>p_expected_revision then raise exception 'Catalog changed; reload before saving' using errcode='40001';end if;
 if existing.published_once and existing.acquisition<>p_item->>'acquisition' then raise exception 'Published acquisition cannot change' using errcode='22023';end if;
 if existing.published_once and p_item->>'status'='draft' then raise exception 'Published items can be archived, not drafted' using errcode='22023';end if;
 if (p_kind='skin' and p_item->>'id'='classic') or (p_kind='icon' and p_item->>'id'='fox') then
   if p_item->>'status'<>'published' then raise exception 'Default cosmetics must remain published' using errcode='22023';end if;
 end if;
 if p_item->>'status'<>'published' and exists(select 1 from private.achievement_catalog c where c.status='published' and c.definition->'reward'->>case when p_kind='skin' then 'skinId' else 'iconId' end=p_item->>'id') then
   raise exception 'Archive the published achievement before its reward' using errcode='22023';
 end if;
 item:=jsonb_build_object('description','','sortOrder',0)||p_item-'kind';
 insert into private.cosmetic_catalog(kind,item_id,price,acquisition,status,definition,revision,published_once)
 values(p_kind,item->>'id',(item->>'price')::integer,item->>'acquisition',item->>'status',item,1,item->>'status'='published')
 on conflict(kind,item_id) do update set price=excluded.price,acquisition=excluded.acquisition,status=excluded.status,definition=excluded.definition,
 revision=private.cosmetic_catalog.revision+1,published_once=private.cosmetic_catalog.published_once or excluded.published_once,updated_at=now()
 returning * into saved;
 insert into private.catalog_audit(actor_id,kind,item_id,previous,current) values(auth.uid(),p_kind,saved.item_id,case when existing.item_id is not null then private.catalog_cosmetic_json(existing) end,private.catalog_cosmetic_json(saved));
 return private.catalog_cosmetic_json(saved);
end;$$;

create function public.admin_save_achievement(p_item jsonb,p_expected_revision integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing private.achievement_catalog; saved private.achievement_catalog; item jsonb; reward jsonb; entry record;
begin
 if not public.is_game_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('catalog'),0);
 if not private.catalog_valid_metadata(p_item) then raise exception 'Invalid achievement' using errcode='22023';end if;
 if p_expected_revision is null or p_expected_revision<0
 or exists(select 1 from jsonb_object_keys(p_item) k where k not in('id','name','nameKo','description','descriptionKo','status','sortOrder','metric','target','reward'))
 or coalesce(p_item->>'metric','') not in('attendance_streak','wins','highest_tile','rank_tier','solo_time','solo_tile')
 or jsonb_typeof(p_item->'target') is distinct from 'number' or jsonb_typeof(p_item->'reward') is distinct from 'object' then raise exception 'Invalid achievement' using errcode='22023';end if;
 if (p_item->>'target')::numeric not between 1 and 1000000000 or (p_item->>'target')::numeric<>trunc((p_item->>'target')::numeric)
 or (p_item->>'metric'='rank_tier' and (p_item->>'target')::numeric>6) then raise exception 'Invalid achievement target' using errcode='22023';end if;
 reward:=p_item->'reward';
 if coalesce(reward->>'kind','') not in('skin','icon','set')
 or exists(select 1 from jsonb_object_keys(reward) k where k not in('kind','skinId','iconId'))
 or ((reward->>'kind' in('skin','set'))<>(reward?'skinId')) or ((reward->>'kind' in('icon','set'))<>(reward?'iconId')) then raise exception 'Invalid achievement reward' using errcode='22023';end if;
 for entry in select * from(values('skin',reward->>'skinId'),('icon',reward->>'iconId')) x(kind,id) where id is not null loop
   if entry.id!~'^[a-z0-9][a-z0-9-]{0,63}$' or not exists(select 1 from private.cosmetic_catalog where kind=entry.kind and item_id=entry.id and acquisition='achievement' and (p_item->>'status'<>'published' or status='published')) then raise exception 'Invalid achievement reward' using errcode='22023';end if;
 end loop;
 if (reward?'skinId' and jsonb_typeof(reward->'skinId') is distinct from 'string') or (reward?'iconId' and jsonb_typeof(reward->'iconId') is distinct from 'string') then raise exception 'Invalid achievement reward' using errcode='22023';end if;
 select * into existing from private.achievement_catalog where item_id=p_item->>'id' for update;
 if coalesce(existing.revision,0)<>p_expected_revision then raise exception 'Catalog changed; reload before saving' using errcode='40001';end if;
 if existing.published_once and existing.definition->'reward' is distinct from reward then raise exception 'Published reward cannot change' using errcode='22023';end if;
 if existing.published_once and p_item->>'status'='draft' then raise exception 'Published achievements can be archived, not drafted' using errcode='22023';end if;
 item:=jsonb_build_object('description','','sortOrder',0)||p_item;
 insert into private.achievement_catalog(item_id,definition,status,published_once) values(item->>'id',item,item->>'status',item->>'status'='published')
 on conflict(item_id) do update set definition=excluded.definition,status=excluded.status,revision=private.achievement_catalog.revision+1,
 published_once=private.achievement_catalog.published_once or excluded.published_once,updated_at=now() returning * into saved;
 insert into private.catalog_audit(actor_id,kind,item_id,previous,current) values(auth.uid(),'achievement',saved.item_id,case when existing.item_id is not null then private.catalog_achievement_json(existing) end,private.catalog_achievement_json(saved));
 return private.catalog_achievement_json(saved);
end;$$;

-- Preserve extra progress keys introduced by independently deployed game modes.
alter function private.achievement_progress(uuid) rename to achievement_progress_before_catalog;
create function private.achievement_progress(p_player uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select private.achievement_progress_before_catalog(p_player)||jsonb_build_object('wins',(select count(*) from public.match_participants p join public.matches m on m.id=p.match_id where p.player_id=p_player and p.result='win' and m.achievement_eligible))
$$;
create function private.catalog_metric(p_player uuid,p_metric text) returns bigint language plpgsql security definer set search_path='' as $$
begin
 return case p_metric when 'attendance_streak' then coalesce((select best_streak from public.player_attendance where player_id=p_player),0)
 when 'wins' then (private.achievement_progress(p_player)->>'wins')::bigint
 when 'highest_tile' then (private.achievement_progress(p_player)->>'highestTile')::bigint
 when 'rank_tier' then private.highest_rank(p_player)
 when 'solo_time' then coalesce((private.achievement_progress(p_player)->>'soloBestMs')::bigint,0)
 when 'solo_tile' then coalesce((private.achievement_progress(p_player)->>'soloHighestTile')::bigint,0) else 0 end;
end;$$;
create function private.guard_catalog_unlock() returns trigger language plpgsql security definer set search_path='' as $$
declare item private.achievement_catalog; current_value bigint;
begin
 if exists(select 1 from public.achievement_unlocks where player_id=new.player_id and achievement_id=new.achievement_id) then return null;end if;
 select * into item from private.achievement_catalog where item_id=new.achievement_id;
 if found then
   current_value:=private.catalog_metric(new.player_id,item.definition->>'metric');
   if item.status<>'published' or (case when item.definition->>'metric'='solo_time' then current_value<=0 or current_value>(item.definition->>'target')::bigint else current_value<(item.definition->>'target')::bigint end) then return null;end if;
 end if;
 return new;
end;$$;
-- Old event hooks still handle independent legacy rewards, but cannot override edited catalog rules.
create trigger guard_catalog_unlock before insert on public.achievement_unlocks for each row execute function private.guard_catalog_unlock();
alter table public.achievement_unlocks drop constraint achievement_unlocks_achievement_id_check;
create function private.award_catalog_achievements(p_player uuid) returns void language plpgsql security definer set search_path='' as $$
declare progress jsonb; streak integer; reached integer;
begin
 if not exists(select 1 from auth.users where id=p_player and not coalesce(is_anonymous,false)) then return;end if;
 progress:=private.achievement_progress(p_player);reached:=private.highest_rank(p_player);
 select coalesce(best_streak,0) into streak from public.player_attendance where player_id=p_player;
 insert into public.achievement_unlocks(player_id,achievement_id)
 select p_player,item_id from private.achievement_catalog c where status='published'
 and not exists(select 1 from public.achievement_unlocks u where u.player_id=p_player and u.achievement_id=c.item_id) and
 case when definition->>'metric'='solo_time' then coalesce((progress->>'soloBestMs')::bigint,0)>0 and (progress->>'soloBestMs')::bigint<=(definition->>'target')::bigint
 else case definition->>'metric' when 'attendance_streak' then coalesce(streak,0) when 'wins' then (progress->>'wins')::bigint
 when 'highest_tile' then (progress->>'highestTile')::bigint when 'rank_tier' then reached when 'solo_tile' then coalesce((progress->>'soloHighestTile')::bigint,0) else 0 end >=(definition->>'target')::bigint end
 on conflict do nothing;
end;$$;
alter function private.award_match_achievements(uuid) rename to award_match_achievements_before_catalog;
create function private.award_match_achievements(p_player uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform private.award_match_achievements_before_catalog(p_player);perform private.award_catalog_achievements(p_player);end;$$;
alter function private.award_rank_cosmetics(uuid) rename to award_rank_cosmetics_before_catalog;
create function private.award_rank_cosmetics(p_player uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform private.award_rank_cosmetics_before_catalog(p_player);perform private.award_catalog_achievements(p_player);end;$$;
alter function private.check_in_at(uuid,timestamptz) rename to check_in_at_before_catalog;
create function private.check_in_at(p_player uuid,p_now timestamptz) returns void language plpgsql security definer set search_path='' as $$
begin perform private.check_in_at_before_catalog(p_player,p_now);perform private.award_catalog_achievements(p_player);end;$$;
create function private.award_solo_catalog_achievements() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.award_catalog_achievements(new.player_id);return new;end;$$;
do $$
begin
 if to_regclass('public.solo_records') is not null then
   execute 'create trigger award_solo_catalog_achievements after insert or update on public.solo_records for each row execute function private.award_solo_catalog_achievements()';
 end if;
 if to_regclass('public.solo_endless_records') is not null then
   execute 'create trigger award_endless_catalog_achievements after insert or update on public.solo_endless_records for each row execute function private.award_solo_catalog_achievements()';
 end if;
end;$$;
create function public.sync_achievements() returns jsonb language plpgsql security definer set search_path='' as $$
declare player uuid:=auth.uid();
begin
 if player is null or not exists(select 1 from auth.users where id=player and not coalesce(is_anonymous,false)) then raise exception 'Account required' using errcode='42501';end if;
 perform private.award_catalog_achievements(player);return public.achievement_state();
end;$$;

-- Old guards still enforce unknown legacy items; managed IDs use catalog reward links.
create function private.legacy_cosmetic_id(p_kind text,p_id text) returns text language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from private.cosmetic_catalog where kind=p_kind and item_id=p_id and not legacy)
 then case when p_kind='skin' then 'classic' else 'fox' end else p_id end
$$;
do $$
declare guard text; source text;
begin
 foreach guard in array array['private.require_achievement_equipment()','private.require_rank_cosmetic_equipment()'] loop
   select pg_get_functiondef(guard::regprocedure) into source;
   source:=regexp_replace(source,'\mnew\.skin_id\M','private.legacy_cosmetic_id(''skin'',new.skin_id)','gi');
   source:=regexp_replace(source,'\mnew\.icon_id\M','private.legacy_cosmetic_id(''icon'',new.icon_id)','gi');
   execute source;
 end loop;
end;$$;

alter table public.player_preferences drop constraint player_preferences_skin_id_check,drop constraint player_preferences_icon_id_check;
create or replace function private.require_cosmetic_equipment() returns trigger language plpgsql security definer set search_path='' as $$
declare entry record; item private.cosmetic_catalog;
begin
 if current_setting('role',true)='authenticated' and new.player_id is distinct from auth.uid() then raise exception 'row-level security violation' using errcode='42501';end if;
 for entry in select * from(values('skin',new.skin_id),('icon',new.icon_id)) x(kind,id) loop
   if entry.id is null then continue;end if;
   select * into item from private.cosmetic_catalog where kind=entry.kind and item_id=entry.id;
   if not found then raise exception 'Unknown item' using errcode='22023';end if;
   if item.legacy and item.price=0 then continue;end if;
   if item.status='draft' or not item.published_once then raise exception 'Item is not available' using errcode='42501';end if;
   if item.acquisition='coins' and not exists(select 1 from public.cosmetic_purchases where player_id=new.player_id and kind=entry.kind and item_id=entry.id) then raise exception 'Purchase required' using errcode='42501';end if;
   if item.acquisition='achievement' and not exists(select 1 from public.achievement_unlocks u join private.achievement_catalog c on c.item_id=u.achievement_id
     where u.player_id=new.player_id and c.definition->'reward'->>case when entry.kind='skin' then 'skinId' else 'iconId' end=entry.id) then raise exception 'Achievement required' using errcode='42501';end if;
 end loop;
 return new;
end;$$;
create function public.purchase_cosmetic(p_kind text,p_item_id text,p_expected_price integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare player uuid:=auth.uid();cost integer;coins bigint;source text;
begin
 if player is null or not exists(select 1 from auth.users where id=player and not coalesce(is_anonymous,false)) then raise exception 'Account required' using errcode='42501';end if;
 select price,acquisition into cost,source from private.cosmetic_catalog where kind=p_kind and item_id=p_item_id and status='published' and acquisition in('free','coins') for share;
 if not found then raise exception 'Unknown item' using errcode='22023';end if;
 if cost=0 then raise exception 'Item is included' using errcode='22023';end if;
 if p_expected_price is null or p_expected_price<0 then raise exception 'Price confirmation required' using errcode='22023';end if;
 select balance into coins from public.player_wallets where player_id=player for update;
 if not found then raise exception 'Wallet unavailable' using errcode='55000';end if;
 if exists(select 1 from public.cosmetic_purchases where player_id=player and kind=p_kind and item_id=p_item_id) then return public.cosmetic_state()||jsonb_build_object('purchased',false);end if;
 if p_expected_price<>cost then raise exception 'Price changed. Review the updated price before buying.' using errcode='22023';end if;
 if coins<cost then raise exception 'Not enough coins' using errcode='22023';end if;
 update public.player_wallets set balance=balance-cost where player_id=player;
 insert into public.cosmetic_purchases(player_id,kind,item_id,price_paid) values(player,p_kind,p_item_id,cost);
 return public.cosmetic_state()||jsonb_build_object('purchased',true);
end;$$;

-- Old clients can finish a rolling release only at the price frozen before catalog edits.
create or replace function public.purchase_cosmetic(p_kind text,p_item_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare original_price integer;player uuid:=auth.uid();
begin
 if player is null or not exists(select 1 from auth.users where id=player and not coalesce(is_anonymous,false)) then raise exception 'Account required' using errcode='42501';end if;
 select legacy_price into original_price from private.cosmetic_catalog where kind=p_kind and item_id=p_item_id;
 if original_price is null then raise exception 'Price confirmation required' using errcode='22023';end if;
 return public.purchase_cosmetic(p_kind,p_item_id,original_price);
end;$$;
revoke all on function public.purchase_cosmetic(text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.purchase_cosmetic(text,text,integer) to authenticated;

-- Storage owns the binary data; RPC metadata contains only bucket-relative paths.
do $$
begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('catalog-assets','catalog-assets',true,2097152,array['image/png','image/jpeg','image/webp','image/svg+xml']) on conflict(id) do nothing;
  execute 'create policy "Read catalog assets" on storage.objects for select to anon,authenticated using(bucket_id=''catalog-assets'')';
  execute 'create policy "Admin uploads catalog assets" on storage.objects for insert to authenticated with check(bucket_id=''catalog-assets'' and public.is_game_admin() and metadata->>''mimetype'' in (''image/png'',''image/jpeg'',''image/webp'') and name~''^[a-z0-9][a-z0-9/_-]*\.(png|jpe?g|webp)$'' and position(''//'' in name)=0)';
 end if;
end;$$;

revoke all on function private.catalog_cosmetic_json(private.cosmetic_catalog),private.catalog_achievement_json(private.achievement_catalog),private.read_content_catalog(boolean),private.catalog_valid_path(text),private.catalog_asset_exists(text),private.catalog_valid_metadata(jsonb),private.catalog_valid_tokens(jsonb),private.catalog_metric(uuid,text),private.legacy_cosmetic_id(text,text),private.guard_catalog_unlock(),private.award_solo_catalog_achievements(),private.award_catalog_achievements(uuid),private.achievement_progress(uuid),private.award_match_achievements(uuid),private.award_rank_cosmetics(uuid),private.check_in_at(uuid,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.content_catalog(),public.admin_content_catalog(),public.admin_save_cosmetic(text,jsonb,integer),public.admin_save_achievement(jsonb,integer),public.sync_achievements() from public,anon,authenticated,service_role;
grant execute on function public.content_catalog() to anon,authenticated,service_role;
grant execute on function public.admin_content_catalog(),public.admin_save_cosmetic(text,jsonb,integer),public.admin_save_achievement(jsonb,integer),public.sync_achievements() to authenticated;
commit;
