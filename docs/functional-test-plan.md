# Functional test plan — Газови протоколи

The browser tests use a mocked Supabase client so that test runs do not touch real accounts or production records. They verify client-side behavior only; real Supabase login, database permissions, cloud sync, Android Gboard, and print/share behavior still require separate integration/device checks.

## Automated browser coverage

- Required client validation before save
- Corrector and meter consumption calculations, rounded to three decimals
- Local save, generated protocol number, and archive record
- Persistence after reload and opening a saved archive entry
- New protocol carries forward the same client's latest readings
- BG/EN language switching preserves the active input focus
- Registration mode and mismatched password validation

## Additional integration/manual coverage required

- Successful and failed Supabase sign-in, sign-up, email confirmation, sign-out and session restore
- Company join code, row-level security and cloud archive CRUD/synchronization across two devices
- Cloud failure and offline recovery without data loss
- Signature capture with touch/stylus, print/PDF and native file sharing
- Android Gboard language switching on the target phone
- Mobile viewport, date pickers, accessibility and browser compatibility
- Documentation-specific acceptance criteria, once the official requirements document is located

## Run locally

`npm ci`  
`npx playwright install --with-deps chromium`  
`npm test`
