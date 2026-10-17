# Catalog seed images

현재 seed는 프로필 SVG 15개를 공개 `catalog-assets` Storage 버킷에 업로드한다.
기본 경로는 `profile-icons/<id>.svg`이며 업적왕도 포함한다. 출석 아이콘 원본
`attendance-king.svg`는 기존 업로드를 덮어쓰지 않도록
`profile-icons/attendance-king-v2.svg`로 저장한다. 기존 보드 테마는 렌더링 토큰이므로
복사할 이미지 파일이 없다.

`20261017180002_attendance_portrait.sql`은 수정하지 않은 초기 출석 카탈로그만
새 경로로 연결한다. 관리자 편집본과 기존 Storage 이미지는 유지한다.
초기 14개 이미지와 후속 업로드의 검증 결과는 [통합 기록](full-performance/integration.md)을 따른다.

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
