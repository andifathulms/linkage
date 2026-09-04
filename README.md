# Linkage

**Removing names does not anonymize anything.**

A static single-page application about re-identification. It generates synthetic
populations in the browser, runs published attacks against them, applies the standard
defenses, and scores every attack against ground truth.

No backend. No network at runtime. No file input, anywhere.

## The constraints, before the features

**Synthetic data only. No file upload. Ever.** The application generates its populations
in the browser. There is no file input, no drag-and-drop, no paste-a-CSV, and no code path
that accepts a record from outside. An application that ingests a dataset and helps you
re-identify the people in it is a re-identification tool, whatever the surrounding copy
says.

Generated data is also what makes the teaching possible: the application knows who every
record actually is, so it can report that you correctly identified 340 of 500 targets and
show you the 160 that failed. An uploaded dataset could tell you nothing.

`tests/no-file-input.test.ts` greps the built bundle for file-input and network APIs and
fails the build on a hit. It is the most important test in the project.

**The schema assessor takes metadata, never records.** The one mode intended for a real
dataset, without that dataset ever being loaded. Its input type has no field capable of
holding a row, and `tests/assessor-purity.test.ts` asserts that at the type level and at
runtime.

**No novel attack.** Every technique here is textbook and published. The application
contributes explanation and measurement, not capability.

## Running it

```sh
npm install
npm run dev          # development server
npm run verify       # typecheck, tests, build — what CI runs
npm run build        # production bundle into dist/
npm run preview      # serve the built bundle
```

The deployed base path is `/linkage/`. Override it with `VITE_BASE=/ npm run build` for a
root deployment.

## What is in it

Five cases, in order, each an attack followed by the defense that closes it followed by
the attack that beats that defense:

1. **The linkage.** Two tables, neither identifying anyone. One join.
2. **k-anonymity, and homogeneity.** Generalise until k is satisfied, then learn a
   diagnosis without identifying anybody.
3. **l-diversity, and skewness.** Enforce diversity, then find the class where diversity
   is technically satisfied and the distribution still gives near-certainty.
4. **The aggregates.** No record-level data at all. Two published averages, one
   subtraction.
5. **Differential privacy, and the budget.** A guarantee that holds regardless of
   auxiliary knowledge, and its price.

A sandbox unlocks afterwards with every control exposed: the generalisation lattice, the
NIK dissector, the privacy–utility frontier, the Sweeney/Golle uniqueness study, the
differencing bench, the budget meter, and the schema assessor.

### The Indonesian result

A NIK is sixteen digits with a published structure: province, kabupaten, kecamatan, date
of birth with 40 added to the day field for female records, and a sequence number.

It therefore encodes Sweeney's quasi-identifier triple — region, date of birth, gender —
by construction. Which means **masking a NIK the way you mask a credit card is exactly
backwards**: card masking shows the last four digits, and on a NIK those are the
registration sequence, which identifies almost nobody. The head is the identifying part.
The dissector shows both maskings side by side with their measured uniqueness figures.

### The disagreement

Sweeney (2000) reports that 87% of the 1990 US population was unique on ZIP, gender and
full date of birth. Golle (2006) reports 63% on 2000 data, and 61% re-running Sweeney's
own 1990 data — stating plainly that he could not account for the difference because he
lacked detail on her collection and analysis methods.

The application does not resolve this. It runs both methodologies on populations where the
truth is known and reports what each produces, with both published figures beside them.

## Architecture

```
src/
  engine/       pure — imports no React, no DOM, no Date
    generate/   RNG, hierarchy, population with retained ground truth, NIK
    attacks/    linkage, homogeneity, background, skewness, differencing
    dp/         sensitivity, Laplace, Gaussian, budget
    taxonomy, generalise, classes, lattice, utility, uniqueness
  assessor/     metadata-only schema and estimator
  views/        one directory per instrument
  cases/        one file per case
  state/        configuration, URL serialisation
tests/          see below
```

The engine is pure and seeded. There is no `Math.random` in `src/` — eslint forbids it and
a test greps for it — so every population is reproducible from its seed, and every seed is
in the URL.

## Correctness

`npm test` runs 200 tests. The ones that matter:

| Test | What it holds |
|---|---|
| `no-file-input` | The built bundle contains no file-input or network API |
| `assessor-purity` | The assessor's input type admits no record-shaped value |
| `groundtruth` | Identity recoverable from the NIK; uniqueness counted two independent ways |
| `anonymity` | k against brute force; l and t against hand-computed fixtures |
| `lattice` | Pruned search finds the same minimal set as exhaustive search |
| `dp` | Laplace output matches its analytic density; sensitivity per query type against hand calculation |
| `uniqueness` | Both methodologies agree where their assumptions hold; divergences reported |
| `field-layout` | Singletons are more isolated; a record does not move when an unrelated class changes |
| `performance` | 200,000 records re-cluster and re-lay-out inside one coalescence transition |
| `render` | Every case and instrument renders; the copy holds to its register |

## Known deviations from the specification

**Fonts are not bundled.** DESIGN.md §3 specifies Fira Sans and Fira Mono. PRD §6.5
forbids network requests at runtime, so a font CDN is out, and bundling four faces would
take a large share of the 250 KB budget. The stacks name Fira first — a reader who has it
installed gets the intended setting — and fall back to system faces. Documented in
`src/styles/tokens.css`.

**React's chunk is exempt from the paste rule.** React's synthetic event table names
`clipboardData` whether or not anything listens for a paste. Rather than exempting the
whole bundle, the build splits React into its own chunk and the paste rules apply to every
other file, with a test asserting the split still happens so the exemption cannot widen.

## Privacy

Nothing leaves the device. No network requests, no analytics, no telemetry. The only thing
stored is your case progress, in `localStorage`. Given the subject, this is not a nicety —
an application about data disclosure that phoned home would be self-refuting.
