# CLAUDE.md — Linkage

Build instructions for Claude Code. PRD.md is what and why. DESIGN.md is how it looks.

## Non-negotiables

1. **No file input, anywhere.** No `<input type="file">`, no drag-and-drop handler, no
   `FileReader`, no clipboard paste of tabular data. A test greps the built bundle for these
   APIs and fails on a hit. This is PRD §0.1 and it is the single most important rule in the
   project.
2. **The schema assessor cannot accept a record.** Its input type has no field capable of
   holding row data. Enforced by a type-level test (§7), not by a comment.
3. **The generator is seeded and pure.** No `Math.random()` anywhere in `src/`. Every
   population is reproducible from its seed.
4. **Attacks are scored against ground truth, always.** An attack module returns counts of
   correct, incorrect, and failed identifications. It never returns a claim without a count.
5. **The engine is pure.** `src/engine/` imports nothing — no React, no DOM, no `Date`.
6. **No network at runtime.**

## Stack

- Vite + React 18 + TypeScript, strict.
- Plain CSS with custom properties.
- No charting library. No data-grid library — the field is a custom canvas layer and the
  tables are small.
- Canvas for the field (§6). SVG for everything else.
- Vitest.

Zero runtime dependencies beyond React.

## Layout

```
/
├─ src/
│  ├─ engine/
│  │  ├─ rng.ts
│  │  ├─ types.ts
│  │  ├─ generate/
│  │  │  ├─ hierarchy.ts       # provinsi → kabupaten → kecamatan → kelurahan
│  │  │  ├─ population.ts      # records + retained ground truth
│  │  │  └─ nik.ts             # NIK construction and dissection
│  │  ├─ taxonomy.ts           # generalisation hierarchies per column
│  │  ├─ generalise.ts         # apply a generalisation vector
│  │  ├─ classes.ts            # equivalence classes, k, l, t
│  │  ├─ lattice.ts            # minimal generalisation search
│  │  ├─ attacks/
│  │  │  ├─ linkage.ts
│  │  │  ├─ homogeneity.ts
│  │  │  ├─ background.ts
│  │  │  ├─ skewness.ts
│  │  │  ├─ differencing.ts
│  │  │  └─ types.ts           # AttackResult, always scored
│  │  ├─ dp/
│  │  │  ├─ sensitivity.ts
│  │  │  ├─ laplace.ts
│  │  │  ├─ gaussian.ts
│  │  │  └─ budget.ts
│  │  ├─ utility.ts            # information loss, query accuracy
│  │  ├─ uniqueness.ts         # Sweeney/Golle reconstruction
│  │  └─ index.ts
│  ├─ assessor/
│  │  └─ schema.ts             # metadata only — see §7
│  ├─ cases/                   # one file per case, scripted
│  ├─ views/
│  │  ├─ Field/                # canvas
│  │  ├─ Linkage/
│  │  ├─ Lattice/
│  │  ├─ Nik/
│  │  ├─ ClassInspector/
│  │  ├─ Frontier/
│  │  ├─ Budget/
│  │  ├─ Differencing/
│  │  └─ Assessor/
│  ├─ state/
│  ├─ ui/
│  └─ styles/
└─ tests/
   ├─ no-file-input.test.ts    # greps the bundle
   ├─ assessor-purity.test.ts  # type-level
   ├─ groundtruth.test.ts
   ├─ anonymity.test.ts        # k, l, t against brute force
   ├─ lattice.test.ts
   ├─ dp.test.ts
   └─ uniqueness.test.ts       # Sweeney/Golle reconstruction
```

## 1. Core types

```ts
interface Record {
  id: number;                       // ground truth handle, never displayed as identity
  nik: string;                      // 16 digits, generated
  quasi: Record<ColumnId, Value>;   // the attack surface
  sensitive: Record<ColumnId, Value>;
  identity: Identity;               // ground truth — see §2
}

interface Population {
  seed: number;
  records: Record[];
  hierarchy: Hierarchy;
  columns: ColumnSpec[];
}

interface GeneralisationVector {
  [column: string]: number;   // taxonomy level, 0 = raw
}

interface EquivalenceClass {
  key: string;                // the generalised quasi-identifier
  members: number[];          // record ids
  k: number;
  l: number;
  t: number;
  sensitiveDistribution: Map<Value, number>;
}
```

## 2. Ground truth, handled carefully

The generator produces synthetic identities so attacks can be scored. Two rules:

**Identities are visibly synthetic.** Generated from a name-fragment table, never sampled
from a real roll or a real name frequency list for a specific place. The interface states
that they are generated.

**Identity is never a mark's visual content.** Records render as marks, not as portraits or
name cards. The app resists the pull toward manufactured pathos — it does not need it, and
faking it would be manipulative. The design's job (DESIGN.md §0) is to keep the *person*
readable in the *record*, which is a structural property, not a decorative one.

## 3. Attacks

```ts
interface AttackResult {
  attempted: number;
  correct: number;
  incorrect: number;
  failed: number;              // no unique candidate found
  perTarget: Array<{
    targetId: number;
    guessId: number | null;
    correct: boolean;
    candidateCount: number;    // 1 means uniquely determined
  }>;
}
```

Every attack returns this shape. There is no method that returns "this record is
identifiable" without the count that justifies it (PRD §6.2).

`candidateCount` matters as much as `correct` — an attack that narrows 500,000 records to
three has done most of the work even though it did not finish, and the interface should be
able to show that.

## 4. The lattice search

Minimal generalisation achieving a target k, over the product of per-column taxonomy levels.

Monotonicity: if a generalisation vector satisfies k, every vector above it does too. So the
search prunes upward and only the frontier needs testing.

```ts
interface LatticeNode {
  vector: GeneralisationVector;
  level: number;               // sum of component levels
  satisfies: boolean | null;   // null = not yet tested
  k: number | null;
  informationLoss: number;
  tested: boolean;
  prunedBy: string | null;     // which node's result implied this one
}

function searchLattice(pop, taxonomy, targetK): {
  nodes: LatticeNode[];
  minimal: GeneralisationVector[];
  order: string[];             // exact test order, for the animation
};
```

`prunedBy` and `order` exist for the visualisation. Keep them; the search is small and this
is what makes the lattice view honest rather than a re-enactment. Same discipline as the DP
trace in Query Planner.

`lattice.test.ts` asserts the pruned search finds the same minimal set as exhaustive search
on small taxonomies.

## 5. Differential privacy

Sensitivity is **computed per query type, not assumed**. A count has sensitivity 1. A sum has
sensitivity equal to the clamp range. A mean is a composition and needs care. Hardcoding
sensitivity 1 everywhere is the standard way to build a DP implementation that does not
actually provide DP.

```ts
interface Query {
  kind: 'count' | 'sum' | 'mean' | 'histogram';
  sensitivity: number;         // derived, with the derivation recorded
  derivation: string;
}
```

`dp.test.ts` asserts the Laplace mechanism's empirical output distribution matches the
analytic density over many samples, and asserts each query type's sensitivity against hand
calculation.

Budget composition is sequential and additive in v1. Advanced composition is out of scope and
must be named as out of scope in the interface, because a user who has read about it will
notice.

## 6. The field

The performance-critical view. 200,000 marks at 60 fps means canvas, not SVG.

- One canvas, one draw pass. Marks as filled rects of 2–3 px.
- Layout: equivalence classes packed into clusters. Use a simple deterministic packing —
  classes sorted by size, laid out in a space-filling order, members packed within a class's
  allotted area. Determinism matters: **a record must not move when an unrelated class
  changes**, or the coalescence animation becomes noise.
- Hit testing on one listener, by dividing pointer coordinates into the layout grid.
- Singleton classes get extra padding in the packing, deliberately. Their isolation is the
  visual argument (DESIGN.md §5.1) and the layout must produce it rather than leave it to
  chance.

Coalescence animation: when the generalisation vector changes, marks interpolate from their
old position to their new one over one transition. Positions are computed for both states and
tweened in a single rAF loop — never 200,000 animated components.

## 7. The schema assessor

```ts
// src/assessor/schema.ts
interface ColumnDescription {
  name: string;
  role: 'identifier' | 'quasi' | 'sensitive' | 'other';
  type: 'categorical' | 'ordinal' | 'date' | 'numeric';
  cardinality: number;
  generalisationLevels: Array<{ label: string; cardinality: number }>;
}

interface AssessorInput {
  populationSize: number;
  columns: ColumnDescription[];
}
```

Cardinality is a number. There is no `values`, no `sample`, no `rows`, no `data`. A record
cannot be expressed in this type.

`assessor-purity.test.ts` is a type-level test asserting that assigning a record-shaped object
to `AssessorInput` fails to compile, plus a runtime test asserting the assessor's functions
accept no additional properties.

The estimate uses the same uniqueness mathematics as §4.6's reconstruction, applied to
declared cardinalities under an independence assumption — and **states that assumption**,
because correlated columns make the estimate optimistic and the assessor must not be trusted
blindly by someone about to publish a dataset.

## 8. Animation

Hand-rolled, one rAF loop. The house rule, settled across seven apps:

**Continuous control → direct mapping, zero easing.** Generalisation level sliders, k target,
ε, correlation, population size.

**Discrete control → timed transition.** Case advance, attack execution, defense application,
view switch.

## 9. State and URL

Seed, generator parameters, generalisation vector, k target and ε serialise to the URL —
these describe a *population and a configuration*, not anyone's data, so sharing is safe by
construction.

Case progress is local only. Attack results are not shared.

## 10. Copy

English, sentence case, no exclamation marks.

**Register: clinical, never lurid.** The app describes what an attack recovers. It does not
dramatise, does not use words like "expose", "victim" or "steal", and does not congratulate a
successful re-identification. The finding is disturbing enough without help, and the
difference between an educational tool and a how-to is largely tone.

Every defense is introduced with the threat model it assumes and the attack that defeats it,
in that order (PRD §6.3).

The synthetic-data statement appears at the top of every case, not once at load.

Sources cited inline via the popover pattern: Sweeney 2000, Golle 2006, Machanavajjhala et al.
on l-diversity, Li et al. on t-closeness, Dwork on differential privacy. The Sweeney/Golle
disagreement is presented as unresolved, quoting neither at length.

## 11. Build order

Do not start the UI before step 3 passes.

1. RNG, hierarchy, population generator with retained ground truth. `groundtruth.test.ts`.
2. Taxonomy, generalisation, equivalence classes, k/l/t. `anonymity.test.ts` against brute
   force.
3. `no-file-input.test.ts` and `assessor-purity.test.ts` wired into CI. **Gate.**
4. Attacks, all returning scored results.
5. Lattice search with trace. `lattice.test.ts`.
6. DP: sensitivity, mechanisms, budget. `dp.test.ts`.
7. Design tokens, shell, the field on canvas at 200k marks. Tune the packing here — the
   coalescence is the hero and everything else can wait for it.
8. Case 1: the linkage view and the ignition. This must land within 60 seconds of first load.
9. Cases 2–3: class inspector, homogeneity, skewness.
10. Case 4: differencing bench. Case 5: budget meter.
11. Lattice view. NIK dissector.
12. Frontier, sandbox.
13. Uniqueness study and the Sweeney/Golle reconstruction.
14. Schema assessor.
15. Reduced motion, keyboard, CSV export, mobile, Lighthouse.

## 12. Deployment

GitHub Pages via Actions. CI: typecheck → lint → test → bundle grep → build. Deploy only on
green.
