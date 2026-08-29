# Audit Report — Listening Step Trainer

## Result

The audit loop was continued until **two consecutive passes produced no further correction items**.

- Loop 1: corrections found and applied
- Loop 2: corrections found and applied
- Loop 3: correction found and applied
- Loop 4: correction found and applied
- Loop 5: corrections found and applied
- **Loop 6: CLEAN — no correction items**
- **Loop 7: CLEAN — no correction items**

## Corrections applied before the two clean passes

### Loop 1 — source fidelity / classification
- Removed eight page-number artifacts accidentally attached to final choices.
- Corrected diagnostic tagging for:
  - 2019 short dialogue #2 → `CHANGE`
  - 2026 short dialogue #3 → `NOT`
- Replaced purely automatic A/B assignment with a curated **non-official strategic A/B classification**.

### Loop 2 — learning-route logic
- Changed the 2024 advancement condition to:
  - 16/20 or higher
  - **zero A-problem misses**
  - key weak skill(s) provisionally cleared
- Made rediagnosis of long passages replay only the question(s) that were actually missed.
- Added exact-stage resume logic so interrupted drill/script work does not unnecessarily restart from rediagnosis.
- Saved the “return to script practice” state after a drill failure.

### Loop 3 — documentation consistency
- Updated the README so the documented 2024 advancement rule matches the implementation (`A misses = 0`).

### Loop 4 — task priority
- Active correction work now has priority over an older spaced-retention task.
- Retention still occurs within the 2–4 day window, but it no longer breaks the current:
  `past exam → correction → drill` cycle.

### Loop 5 — unseen retention integrity
- Added 33 retention-only original items:
  - 3 reserved unseen items × 11 skill categories.
- Separated the immediate drill pool and the retention pool.
- Immediate drills are now explicitly labeled:
  `【オリジナル類題・弱点ミニ練習】`
- Full exam-format transfer is checked by the next unseen past exam rather than pretending the short skill drill reproduces the full passage length.

## Loop 6 — clean pass

Verified:

- 2019–2026 present
- 8 years
- 10 listening questions per year
- 20 listening points per year
- 80 official past-exam questions total
- official answer-index mapping matches the supplied answer keys
- no page-number artifacts remain in choices
- all Section 2 questions are B in the strategic classification
- public `web/` contains no private-pack markers, PDFs, or audio files
- original practice bank contains:
  - 7 immediate drill items per skill
  - 3 retention-only items per skill
  - 110 original items total
- JavaScript syntax passes
- Python validation passes
- DOM smoke test passes

**Result: no correction items.**

## Loop 7 — independent adversarial flow pass

A separate flow audit exercised these paths:

1. fresh user → 2023 first
2. after 2023 → one old year selected
3. old year 16/20 + A0 → 2024
4. A miss present → a second old year before 2024
5. after two old years → 2024 is no longer delayed
6. after 2024 → remaining 2019–2022 years before 2025
7. 2025 held until the intended stage
8. 2026 remains the final unseen past exam
9. unfinished remediation takes priority over a due retention item

**Result: no correction items.**

## Final fixed learning route

`2023 initial diagnosis`
→ `correction`
→ `2019–2022: one weakness-matched unseen year`
→ `if needed, one more old year`
→ `2024 intermediate check`
→ `remaining 2019–2022`
→ `2025 recent-format mock`
→ `final correction`
→ `2026 final unseen mock`

For each missed item:

`initial miss`
→ `one answer-hidden rediagnosis`
→ `answer reveal`
→ `script + repeated listening`
→ `sentence replay / ×5 / speed control / shadowing`
→ `original mini-drill`
→ `provisional pass`
→ `2–4 day unseen retention check`
→ `transfer confirmed again by the next unseen past exam`

## Important interpretation

- A/B is **not an official school difficulty rating**.
- 14/20, 16/20, and 18/20 are **study-management targets**, not official admission cutoffs.
- The audio is **Synthetic Practice Audio**, not the official examination recording.
- Exact official narrator voice, speed, and pause lengths are not claimed.

# Persistence / Export-Import Audit

## Requirement 1 — history survives app upgrades without export

**PASS**

Implemented:

- stable, unversioned LocalStorage key: `waseshibu-listening-progress`
- schema version stored inside the data, not in the storage key
- automatic migration from legacy `waseshibu-step-progress-v1`
- previous valid primary snapshot copied to `waseshibu-listening-progress-backup`
- automatic recovery from backup when primary JSON is corrupt
- compatibility mirror back to the legacy v1 key
- unknown future fields preserved during normalization where possible

This protects normal version upgrades as long as the browser/site origin remains the same and site data is not manually cleared.

## Requirement 2 — export/import works correctly

**PASS**

Export:

- JSON envelope with format/version metadata
- checksum
- learning progress/history only
- explicitly excludes the official Private Pack

Import:

- validates JSON
- validates checksum for new-format backups
- accepts legacy raw progress JSON
- safely merges rather than blindly overwriting
- preserves the earliest initial score
- unions different years
- deduplicates retakes/history
- merges remediation metadata
- keeps newer mastery status
- preserves active local pending task

## Automated tests

`node scripts/storage_roundtrip_test.js` verifies:

1. legacy-v1 automatic migration to the stable key
2. future-schema/unknown-field preservation
3. automatic backup creation
4. corrupted-primary recovery from backup
5. export/import round trip
6. Private Pack exclusion
7. checksum tamper rejection
8. earliest-initial-score preservation
9. different-year merge
10. legacy raw-progress import

All tests pass.
