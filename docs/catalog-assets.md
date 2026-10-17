# Initial catalog images

The content catalog migration stores the existing 14 profile images as
`profile-icons/<id>.svg` in the public `catalog-assets` Storage bucket. Existing
board themes remain rendering tokens; they do not have image files to copy.

Apply the catalog database migration before uploading. From the repository root,
inspect the exact file paths, byte counts and SHA-256 checksums without credentials:

```sh
pnpm --filter socket seed:catalog-assets --dry-run
```

To upload, supply `SUPABASE_URL` and `SUPABASE_SECRET_KEY` through the operator's
environment, then explicitly select the matching project:

```sh
pnpm --filter socket seed:catalog-assets --target staging
```

Staging requires `https://nwdjucplpyorwiwshxtf.supabase.co`. Production requires
`https://rbfujqjvkfdgaofztrdq.supabase.co` and the explicit `--target production`
argument. The script does not read `.env` files, create buckets, apply migrations,
change catalog rows or print credentials. Production uploads remain a separate
deployment action subject to the deployment guide.

Each asset uploads with `upsert: false`. The script downloads every stored object
and verifies its checksum. Repeating a completed upload succeeds without changing
the objects. A different object at an existing path stops the run without replacing
it; investigate that mismatch instead of enabling overwrites. A partial run can be
repeated after correcting connectivity or permissions.

Keep these initial paths immutable because their cache lifetime is one year. New
or edited artwork should use a new uploaded path through the administrator page.
The seed script accepts only the repository's static SVG subset; it is not an SVG
sanitizer for administrator uploads. Run it before deploying web code that resolves
the migrated catalog image paths.
