# DESIGN.md — Linkage

Visual and motion specification. PRD.md defines substance; this defines form.

---

## 0. The design problem

The failure mode this app exists to correct is that **records stop reading as people.**

That is not a metaphor. It is the actual mechanism by which privacy engineering goes wrong: a
dataset becomes a table, a table becomes rows, rows become a count, and somewhere in that
sequence the fact that each line is a person stops being available to the person publishing
it. Every re-identification incident in the literature has that shape.

So the design has one job, and it is unusual:

**Keep the person legible in the record, without manufacturing sentiment.**

Two ways not to do it. Do not render synthetic people as portraits, avatars, or name cards —
that fabricates pathos about people who do not exist, and a reader who notices the fabrication
stops trusting everything else. Do not use alarm colouring, warning icons, or a red-alert
register — the findings are disturbing on their own, and dramatising them turns a serious tool
into an advertisement for itself.

The honest answer is **structural rather than decorative**. A record is a mark. Marks are laid
out grouped by equivalence class, so records that cannot be told apart sit together and
records that stand alone sit alone. A person nobody can hide among appears on screen as a
single mark with empty space around it.

That single mark is the whole argument, and it required no sentiment to make. k-anonymity
becomes a physical property of the picture: at k=1 the field is a scatter of isolated points;
generalise, and marks coalesce; reach k=5 and no lone mark remains.

**Second design problem: two scales.** The app must be readable as a population — hundreds of
thousands of marks, a texture — and as an individual, one record with attributes. The attack
is precisely the operation that pulls one out of the other, so the transition between those
readings must be continuous and must belong to the user (§5.1).

---

## 1. Design plan

**Concept: the register.**

Ledger stock, ruled. The app is about registers — voter rolls, population registers, health
records — and the material is the register's own: a pale green-grey paper that record-keeping
has been printed on for a century, ruled lines, and columns of entries.

That grounds an app whose content is otherwise abstract, and it distinguishes it from the
warm manuscript paper of Compression Lab and the cool drafting stock of Query Planner without
inventing a mood.

**Alignment:** records are entries, so everything reads as a register — left-aligned labels,
right-aligned figures, consistent row rhythm, hairline rules between groups. The field is the
one element that breaks the grid, because a population is not a list.

---

## 2. Colour

### 2.1 Ground

| Token | Value | Use |
|---|---|---|
| `--ledger` | `#E6E9E3` | Page. Pale green-grey, record stock. |
| `--ledger-panel` | `#EFF1EC` | Raised panels. |
| `--ledger-deep` | `#D6DAD2` | The field's ground, recessed so marks sit on it. |
| `--ink` | `#191C18` | Text, marks, structural line. |
| `--ink-mid` | `#575E56` | Labels, axis text. |
| `--ink-faint` | `#9AA098` | Ticks, disabled, untested lattice nodes. |
| `--rule` | `#C6CBC2` | Hairlines, the register's ruling. |

### 2.2 The primary distinction

One binary dominates the app: a record either can be singled out, or cannot.

| Token | Value | Meaning |
|---|---|---|
| `--exposed` | `#A8452C` | A record in an equivalence class of size 1. |
| `--narrow` | `#C08A3E` | A class small enough to be nearly determinative — 2 to 4. |
| `--protected` | `#191C18` | Ink. A record indistinguishable from enough others. |

Note that **protected is the default and carries no colour.** Only the exposed and the nearly
exposed are tinted. A well-anonymised field is a field of plain ink marks, and colour appearing
in it means something has gone wrong. That inverts the usual treatment, where the safe state is
green, and it is better: safety should look like nothing, not like reassurance.

The spatial encoding does the primary work — isolation, not hue. Colour is reinforcement, and
the field must remain readable in greyscale.

### 2.3 The two tables

In the linkage view only:

| Token | Value | Use |
|---|---|---|
| `--released` | `#3F6B7A` | The anonymised table being attacked. |
| `--auxiliary` | `#6B5B8A` | The public roll being linked against. |
| `--matched` | `#191C18` | A row uniquely determined by the join. Ink, fully drawn. |

A unique match resolves to plain ink rather than to a brighter colour, because the point is
that it has become an ordinary identified record. Nothing about it is special any more. That
is the disturbing part.

### 2.4 Sensitive values

The class inspector needs a categorical set for sensitive attribute values — diagnoses,
income bands, whatever the case uses.

A muted set of five, deliberately low-chroma, deliberately not evocative: `#5A7D6E`,
`#7A6A8C`, `#8C6F52`, `#4E6E8C`, `#7D6363`. No red, no green-means-good, no traffic-light
mapping. A sensitive value is not good or bad; it is private.

### 2.5 Prohibited

No alarm colouring. No warning triangles. No red banners. No shield or padlock iconography of
any kind. No before/after colour reversal implying rescue.

---

## 3. Typography

**Fira Sans** and **Fira Mono**. One superfamily.

Fira was drawn for legibility at small sizes in dense interfaces, which is what a register of
a hundred thousand entries needs. Its mono is unusually good for digit strings — and the NIK
dissector requires sixteen digits to be individually addressable, hovered, and masked, which
is a harder typographic job than it sounds.

**Fira Mono** for the NIK, all numerals, tables, and generalised quasi-identifier keys.
**Fira Sans** for everything else.

### 3.1 Scale

Base 15 px. Ratio 1.2.

| Token | Size / line-height | Face | Use |
|---|---|---|---|
| `--t-display` | 37 / 1.05, 600 | Fira Mono | The count: records uniquely identified |
| `--t-figure` | 22 / 1.1, 600 | Fira Mono | k, l, t, ε, uniqueness percentages |
| `--t-h2` | 18 / 1.3, 600 | Fira Sans | Case and panel headings |
| `--t-body` | 15 / 1.6, 400 | Fira Sans | Copy. Max 66 characters. |
| `--t-nik` | 17 / 1.4, 400 | Fira Mono | The dissector. Letter-spaced for digit addressing. |
| `--t-data` | 13 / 1.45, 400 | Fira Mono | Tables, keys, axis numbers |
| `--t-small` | 12 / 1.35, 400 | Fira Sans | Labels, legend, assumptions |

`font-variant-numeric: tabular-nums` on all Fira Mono.

### 3.2 Prohibitions

No all-caps. No tracked-out eyebrows. No coloured words in headings. Sentence case
throughout.

---

## 4. Layout

### 4.1 The case

```
┌──────────────────────────────────────────────────────────────┐
│ Linkage          Case 2 · k-anonymity           synthetic ⓘ  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ▪▪▪▪  ▪▪▪▪▪  ▪▪▪    ▪      ▪▪▪▪▪▪  ▪▪▪   ▪                 │
│   ▪▪▪▪  ▪▪▪▪▪  ▪▪▪           ▪▪▪▪▪▪  ▪▪▪                     │
│   ▪▪▪   ▪▪▪▪   ▪▪▪    ▪      ▪▪▪▪▪   ▪▪▪▪  ▪                 │
│                    ↑                          ↑              │
│                singletons                                    │
│                                                              │
│   THE FIELD — 200,000 records, grouped by class              │
│   smallest class: 1     classes: 41,208     exposed: 18,405  │
├───────────────────────────────┬──────────────────────────────┤
│ GENERALISATION                │ CLASS INSPECTOR              │
│ kelurahan  ●───────  level 0  │ key: 6401·1985·M             │
│ birthdate  ●───────  level 0  │ size 1 · l 1 · t 0.84        │
│ age band   ●───────  level 0  │ ▁▁▁▁█▁▁▁  one value          │
│                               │                              │
│ target k  ●─────  5           │                              │
├───────────────────────────────┴──────────────────────────────┤
│ [ field | linkage | lattice | NIK | frontier | budget ]      │
└──────────────────────────────────────────────────────────────┘
```

The field is always the largest element and always at the top. Everything else is a control on
it or a reading of it.

The synthetic-data statement sits in the header of every case (PRD §6.1), as a plain marker
that opens a short explanation, not as a dismissible banner.

### 4.2 Case progression

Five cases plus sandbox, as a horizontal progression in the header. A case is complete when
its attack has been performed and its defense applied; the next unlocks.

The sandbox unlocks after case 5 and exposes every control. Until then the interface shows
only what the current case needs, which is what keeps a five-defense sequence from being a
wall of sliders on first load.

### 4.3 Grid and rhythm

8 px base. Spacing scale: 8 · 12 · 16 · 24 · 40 · 64.

Register ruling: horizontal hairlines at consistent intervals in tabular areas, and nowhere
else. It is a material cue, not a grid overlay — do not rule the field.

Panels raised by value with a hairline. 0 radius. No shadows.

### 4.4 Mobile

Below 860 px the field keeps the top of the viewport at reduced height and stays the hero. The
generalisation controls become a horizontal strip beneath it. The class inspector and the
other instruments move into a single tabbed panel below.

The NIK dissector is the one view that improves on mobile — sixteen digits across a phone
width, thumb-draggable mask. Design it phone-first and let desktop inherit.

---

## 5. Instruments

### 5.1 The field

Canvas. One mark per record, 2–3 px, grouped into equivalence classes.

**Class packing is the design.** Classes are laid out with spacing proportional to their
isolation: a class of 20 is a tight block, a class of 2 is a pair, a class of 1 gets deliberate
padding around it. That padding is not an aesthetic choice — it is the visual encoding of the
thing the app is about, and CLAUDE.md §6 requires the packing to produce it rather than leave
it to chance.

**Two readings, one continuous zoom.** At default, the field is a population texture and the
eye finds the isolated marks. Zoom in and marks grow, gain their class boundary, and at closest
zoom each mark shows its generalised quasi-identifier. The transition belongs to the user, by
scroll or pinch, and is never automatic.

Hovering a mark reads out its class key, class size, and whether it is uniquely determined.
Selecting opens the class inspector.

Determinism matters: a record must not move when an unrelated class changes, or the
coalescence animation is noise instead of information.

### 5.2 Linkage

Two tables, `--released` on one side and `--auxiliary` on the other, rows drawn as short bars.

Join lines connect matching quasi-identifiers. A row matching many fades its lines to
`--ink-faint`. A row matching exactly one resolves — both rows and their single connecting
line settle into plain `--matched` ink.

The resolution is quiet. No flash, no expansion, no sound. A record has simply become
identified, and the design's refusal to celebrate that is the register the whole app is in.

### 5.3 The generalisation lattice

Nodes as a grid indexed by per-column generalisation level, so position encodes the vector
directly and a reader can navigate by geometry.

Untested nodes `--ink-faint`. Tested-and-failing hollow. Tested-and-satisfying filled. Pruned
nodes drawn with a hairline to the node that implied them, so the pruning is visible as
inference rather than as absence.

The frontier between failing and satisfying is drawn as a line through the grid. Minimal
satisfying nodes sit on it and are marked.

Selecting a node applies its generalisation vector to the field above — so the lattice is a
navigable control on the field, not a separate illustration.

### 5.4 NIK dissector

Sixteen digit cells in `--t-nik`, letter-spaced enough that each is a discrete target,
segmented by a hairline into region, date, and sequence, each segment labelled with what it
encodes.

A mask handle drags across the digits. Masked digits render as a neutral block; unmasked stay
ink.

Three live readouts: what remains known, the resulting uniqueness in the current population,
and the equivalent Sweeney configuration.

**Two presets, side by side, permanently visible:** card-style masking (last four shown) and
correct masking (head destroyed). Each with its uniqueness figure beneath. The gap between the
two numbers is this view's entire argument and it should require no explanation.

### 5.5 Class inspector

One class: its key in `--t-data`, its size, l, and t, and its sensitive value distribution as a
small bar chart with the population distribution drawn behind it as a hairline outline.

Homogeneity is a chart with one bar. Skewness is a distribution sitting visibly away from the
outline behind it. Neither needs a label.

### 5.6 Frontier

Privacy on the horizontal — achieved k, or ε. Two vertical series: re-identification rate, and
utility.

The two curves cross somewhere, and where they cross is the decision nobody can make for you.
Draw a draggable marker on the curve with both values reading out, so a user can find the point
they would actually choose and see what it costs both ways.

### 5.7 Budget

A horizontal meter, ε spent against ε allotted, with the query log beneath — each query, its
sensitivity, its derivation, and its cost.

The meter only empties. There is no refill control and no reset within a case, because that is
the property being taught.

### 5.8 Differencing bench

Two query builders side by side, their results, and the difference beneath. When the difference
isolates one individual, the app states which record and how many people the two queries
differed by.

Then the same pair with the DP mechanism applied, where the difference is noise and the readout
says so.

### 5.9 Schema assessor

Deliberately plainer than everything else — a form and a table, on `--ledger-panel`, no field,
no animation. It is a working tool rather than an explainer, and it should feel like one.

Its output leads with the assumption it made: the estimate treats declared columns as
independent, correlation makes it optimistic, and it should not be trusted blindly by someone
about to publish.

---

## 6. Motion

### 6.1 The rule

Settled across seven apps:

**Continuous control → direct mapping, zero easing.** Generalisation levels, target k, ε,
correlation, population size, and the field's zoom.

**Discrete control → timed transition.** Case advance, attack execution, defense application,
lattice node selection.

### 6.2 Durations

| Event | Duration | Curve |
|---|---|---|
| Field coalescence | 620 ms | `cubic-bezier(.32,.72,0,1)` |
| Linkage join lines resolving | 400 ms | `cubic-bezier(.4,0,.2,1)` |
| Lattice node test | 90 ms per node, in search order | linear |
| Class inspector open | 180 ms | `cubic-bezier(.4,0,.2,1)` |
| NIK mask drag | continuous, no duration | — |
| Frontier marker | continuous | — |
| Budget meter | 300 ms per query | `cubic-bezier(.4,0,.2,1)` |

### 6.3 The orchestrated moment: coalescence

Raise a generalisation level and the field reorganises. Marks travel from their old class to
their new one and settle into tighter groups. Isolated marks are absorbed. The count of
singletons falls as you watch.

620 ms, one interpolation, all marks moving together. It is slower than most transitions in
this family because it is the app's central lesson and it should be watchable rather than
efficient.

**The moment inside the moment:** the last singleton being absorbed. When the field crosses
from having isolated marks to having none, that is k-anonymity achieved, and it is visible
without a number. Do not annotate it. The field going quiet is the annotation.

### 6.4 Second moment: the ignition

Case 1. Two tables, a join, and one row resolving to identified ink while everything around it
stays ambiguous.

Requirement: this must land within 60 seconds of first load (PRD §8.4). The app's argument is
that this is easy, and an app that takes ten minutes to demonstrate ease has refuted itself.

### 6.5 Restraint

No panel entrances. No hover transitions on marks. No pulsing. No sound, ever — an app about
disclosure that makes a noise when it discloses something is a different, worse app.

### 6.6 Reduced motion

`prefers-reduced-motion: reduce`: coalescence becomes an instant re-layout, join lines resolve
without transition, lattice nodes fill instantly with a step control available, the budget
meter jumps.

---

## 7. Copy

English, sentence case, no exclamation marks.

**Clinical, never lurid.** The app reports what an attack recovered. It does not use "expose",
"victim", "steal", "breach", or "attack" as a verb applied to a person. It does not
congratulate a successful re-identification and does not warn dramatically about a failed
defense.

Numbers carry their denominators: `340 of 500 targets uniquely identified`, never `68%
success`.

Every defense is introduced with the threat model it assumes, then the attack that defeats it,
in that order.

The Sweeney and Golle figures are both given, with the disagreement stated as unresolved and
each author's methodology named. The app does not pick a winner.

The synthetic-data statement, in the header of every case: `All records are generated. No real
person's data is used or accepted.`

---

## 8. Quality floor

Assumed, not announced: usable at 380 px with the field legible; visible keyboard focus
everywhere including field marks and lattice nodes; every instrument has a keyboard-reachable
table equivalent; the field readable in greyscale, since spatial isolation carries the primary
encoding; populations and results export as CSV; contrast 4.5:1 for text and 3:1 for graphical
objects; reduced motion honoured; no network at runtime, and no file input anywhere.

## 9. Relationship to the house layer

Takes: the spacing scale, the motion curve family, the citation-popover pattern, the type
floor, the continuous-versus-discrete motion rule, the constant-anchor layout.

Contributes back:

**Safety as absence.** The protected state carries no colour and no reassurance; only the
problem is marked. A well-configured system looks like nothing. This is a better default than
the green-tick convention for any app where the user's job is to find what is wrong.

**Spatial encoding as the primary channel.** Isolation carries the meaning here and colour only
reinforces it, which is why the field survives greyscale. Worth having in the house layer as a
reminder that position is a stronger channel than hue and is used far less often.

Departs in one place: this is the only app in the family with a case progression rather than
free exploration from the first screen. The reason is that five defenses each defeated by the
next attack is a sequence with a dependency order, and exposing all of it at once would be a
wall of controls. Document the departure — a case structure is right here and would be
patronising in the explainers.
