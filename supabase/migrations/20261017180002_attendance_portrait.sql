-- Preserve the immutable first portrait and any administrator-edited catalog entry.
update private.cosmetic_catalog
set definition = jsonb_set(definition, '{imagePath}', '"profile-icons/attendance-king-v2.svg"'::jsonb),
    revision = revision + 1, updated_at = now()
where kind = 'icon' and item_id = 'attendance-king' and revision = 1
  and definition->>'imagePath' = 'profile-icons/attendance-king.svg';
