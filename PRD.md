# Linkage — Product Requirements

**Name:** Linkage
**Descriptor:** Removing names does not anonymize anything
**Type:** Static single-page application. No backend, no network at runtime.
**Deploy target:** GitHub Pages.
**Interface language:** English.

> **On the name.** *Re-Identify* is punchier and names the user's action. *Linkage* names the
> mechanism, is the precise term of art for the attack, and reads as analysis rather than
> instruction — which matters for a portfolio belonging to someone who runs a government open
> data platform. Take the neutral one.

---

## 0. The constraints, before the features

These come first because they define the product rather than qualify it.

### 0.1 Synthetic data only. No file upload. Ever.

The app generates its populations in the browser. There is no file input, no drag-and-drop,
no paste-a-CSV, and no code path that accepts a record from outside.

Three reasons, in order of weight:

**An app that ingests a dataset and helps you re-identify the people in it is a
re-identification tool**, whatever the surrounding copy says. That line is not worth
crossing.

**Ground truth is required to teach.** With synthetic data the app knows who every record
actually is, so it can tell you that you correctly identified 340 of 500 targets and which
ones you missed. With uploaded data it can tell you nothing, which makes it a worse teacher,
not a better one.

**The subject is how risk varies**, with population size, attribute cardinality, and
correlation structure. Only a generator lets those be swept.

This constraint is stated in the interface, at the top, unmissable, in plain language. Not in
a footer, not in an about page.

### 0.2 The schema assessor takes metadata, never records

§4.7 describes a mode where a data steward assesses their own dataset. It accepts column
descriptions — name, type, cardinality, generalisation hierarchy — and never a single row of
data. That distinction is structural: the input type has no field capable of holding a
record.

### 0.3 No novel attack

Every technique in this app is textbook and published. The app contributes explanation and
measurement, not capability. If a proposed feature would give someone a capability they could
not get from the literature, it does not belong here.

---

## 1. The thesis

Removing names does not anonymize anything. The identifier was never the name — it is the
*combination* of ordinary attributes, none of which looks sensitive alone.

Sweeney's founding result, on 1990 US Census data: 87% of the population — 216 million of
248 million — had a combination of five-digit ZIP, gender, and full date of birth likely to
be unique. She demonstrated the consequence by buying Massachusetts voter registration
records for twenty dollars and linking them to supposedly anonymous hospital data.

## 2. The number is contested, and that is the app's best feature

Golle re-ran the analysis on 2000 census data and found 63%. Re-running Sweeney's own 1990
data he obtained 61%, not 87%, and stated plainly that he could not account for the
discrepancy because he lacked detail on her collection and analysis methods.

So the most-cited statistic in data privacy is one two careful researchers disagree about by
more than twenty-five percentage points, unresolved.

Both agree on the phenomenon. Sweeney found city or town plus gender plus date of birth
identifies roughly half the population, and county plus gender plus date of birth about 18%.
Golle also found 18% at county level. The disagreement is about the sharpest case.

**The app settles it the way a simulator can**: generate populations where the truth is
known, run both methodologies against them, and show where they diverge and why. This is the
same move as the equivalence bench in Mixed Traffic Simulator — when field measurements
disagree, build the controlled experiment the field cannot run.

## 3. The Indonesian result

NIK is sixteen digits with a published structure: two for province, two for kabupaten or
kota, two for kecamatan, six for date of birth, four sequential. Female records add 40 to the
day-of-birth field.

A NIK therefore does not merely identify. It **encodes Sweeney's exact quasi-identifier
triple by construction** — region, date of birth, gender.

Which produces the app's most useful and least obvious finding:

**Masking a NIK the way you mask a credit card is exactly backwards.** Cards show the last
four digits. Do that to a NIK and you preserve region, birthdate and gender — everything an
attacker needs — while hiding only the sequence number, which carries almost no identifying
information. The correct masking destroys the head and may safely keep the tail.

This is a defensive finding, it is locally specific, and every Indonesian data steward should
see it once. It gets its own instrument (§5.4).

## 4. Scope

### 4.1 The generator

Synthetic populations with a realistic Indonesian administrative hierarchy — provinsi,
kabupaten/kota, kecamatan, kelurahan — with plausible population weights at each level, since
cardinality at each level drives every result in the app.

Controls: population size, age distribution, sensitive-attribute distribution, and a
correlation control between attributes. Seeded, so every population is reproducible.

Ground truth is retained: the generator knows every record's identity, which is what allows
attacks to be scored.

### 4.2 Attacks

| Attack | What it exploits |
|---|---|
| **Linkage** | Quasi-identifiers shared between an anonymised table and a public roll |
| **Homogeneity** | An equivalence class where every record shares one sensitive value |
| **Background knowledge** | Auxiliary facts that eliminate candidates within a class |
| **Skewness** | A class whose sensitive distribution differs sharply from the population |
| **Differencing** | Two aggregates whose difference isolates one individual |
| **Composition** | Many individually harmless queries that jointly disclose |

### 4.3 Defenses

**Generalisation and suppression**, per column, over an explicit taxonomy — a date becomes a
month becomes a year becomes a five-year band; a kelurahan becomes a kecamatan becomes a
kabupaten.

**k-anonymity.** Every record indistinguishable from at least k−1 others on quasi-identifiers.
Includes the search for a *minimal* generalisation achieving k, which is a lattice search over
the taxonomy product (§5.3).

**l-diversity.** At least l well-represented sensitive values in every equivalence class.

**t-closeness.** Each class's sensitive distribution within t of the population's, by earth
mover's distance.

**Differential privacy.** Laplace and Gaussian mechanisms, with sensitivity analysis, an
epsilon control, and a composing budget.

### 4.4 The cases

The app is structured as a sequence of cases rather than a set of tools. Each case is an
attack the user performs, followed by the defense that closes it, followed by the attack that
beats that defense.

1. **The linkage.** You are given a target and two tables. Neither identifies anyone alone.
   You join them. It works.
2. **k-anonymity, and homogeneity.** Generalise until k is satisfied. Then discover a class
   where every record shares one diagnosis, and learn it without identifying anyone.
3. **l-diversity, and skewness.** Enforce diversity. Then find the class where diversity is
   technically satisfied and the distribution still gives you near-certainty.
4. **The aggregates.** No record-level data at all. Two published averages. One subtraction.
   One person exposed.
5. **Differential privacy, and the budget.** A guarantee that holds regardless of auxiliary
   knowledge — and its price, in noise and in a budget that composes and cannot be refilled.

Each case is scored against ground truth. A sandbox mode unlocks after case 5 with every
control exposed.

### 4.5 Sandbox

All generator parameters, all defenses, all attacks, free composition. The privacy–utility
frontier (§5.6) is the sandbox's centre.

### 4.6 The uniqueness study

The Sweeney/Golle reconstruction (§2). Generate populations under both authors' stated
assumptions, run both methodologies, and plot uniqueness against population size, region
granularity, and date precision.

Reports the three headline configurations: full postcode-equivalent plus gender plus date;
city plus gender plus date; county-equivalent plus gender plus date. Compares against the
published figures and shows where the assumptions diverge.

### 4.7 The schema assessor

The mode with direct professional utility, and the only one intended for use on a real
dataset — without that dataset ever being loaded.

Input: a column list. For each column, its role (identifier, quasi-identifier, sensitive,
non-sensitive), its type, its cardinality, and its available generalisation levels. Plus the
population size.

Output: estimated uniqueness under the declared quasi-identifiers, the minimum generalisation
needed to reach a target k, the utility cost of that generalisation, and a ranked list of
which columns contribute most risk.

**The input type contains no field capable of holding a record.** Enforced by the schema, not
by instruction.

## 5. Instruments

### 5.1 The field — the hero

Every record in the population as a single mark, laid out grouped by equivalence class.

Records sharing a generalised quasi-identifier cluster together. A class of size 20 is a tight
group of twenty marks. **A class of size 1 is a lone mark with empty space around it** — and
it is the loneliest thing on the screen.

k-anonymity therefore becomes a visible physical property: at k=1 the field is a scatter of
isolated points; generalise, and marks coalesce into clumps; reach k=5 and no lone mark
remains.

The smallest class is your actual guarantee, and it is findable by eye. A field that is
otherwise 20-anonymous with one singleton is 1-anonymous, and seeing that one mark sitting
alone teaches it better than the number does.

Zooming moves between two readings: at distance the field is a population texture; close in,
each mark is a record with attributes. The attack is what pulls one out of the other.

### 5.2 The linkage

Two tables approaching each other. Rows connect where quasi-identifiers match. Ambiguous
matches — one row matching several — fade. A row matching exactly one row on the other side
ignites.

That ignition is the app's opening moment, and it should happen in case 1 within the first
minute.

### 5.3 The generalisation lattice

The search for a minimal generalisation achieving k, over the product of per-column taxonomy
levels.

Each node is a generalisation combination; each is tested for k-anonymity; the search prunes
upward, since generalising further can only increase k. The frontier between failing and
satisfying nodes is drawn, and the minimal satisfying nodes sit on it.

Structurally a sibling of Query Planner's join-order lattice, and worth building with the
same care — it is the one genuine algorithm in this app.

### 5.4 The NIK dissector

Sixteen digit cells, segmented and labelled by what each segment encodes.

A mask you drag across the digits. As you mask, three readouts update: what is still known
(region granularity, date precision, gender), the resulting uniqueness in the current
population, and the equivalent Sweeney configuration.

The credit-card masking and the correct masking are both one click away as presets, side by
side, with their uniqueness figures. The gap between them is the section's argument.

### 5.5 Equivalence class inspector

One class at a time: its generalised quasi-identifier, its size, its sensitive value
distribution, its l, and its distance from the population distribution.

Homogeneity is visible as a bar chart with one bar. Skewness is visible as a distribution
sitting nowhere near the population's, drawn behind it.

### 5.6 The privacy–utility frontier

The trade-off as a curve you move along, not a sentence you read.

Horizontal: privacy, as achieved k or as ε. Vertical: two series — re-identification rate,
and a utility measure (query accuracy against the true population, and information loss from
generalisation).

Every defense buys privacy with accuracy. The frontier makes that a shape, and the sandbox's
job is to let a user find the point they would actually choose.

### 5.7 The budget meter

ε spent, ε remaining, and the query log that spent it. Composition shown as accumulation — a
hundred queries at 0.1 is a budget of 10, and the meter empties.

Refill is not offered. That is the point.

### 5.8 The differencing bench

Two aggregate queries the user composes, their results, and their difference. When the
difference isolates a single individual, the app says so and shows which one.

Then the same pair under differential privacy, where the difference is noise.

## 6. Commitments

### 6.1 Synthetic, and said so

§0.1, stated in the interface at the top of every case, not once at load.

### 6.2 Every attack is scored against ground truth

The app never asserts an attack "would work". It runs it and reports the count. A user who
re-identifies 340 of 500 targets sees 340 of 500, and can inspect the 160 that failed.

### 6.3 The defenses are stated with their assumptions

k-anonymity, l-diversity and t-closeness each defend against a specific threat model and fail
outside it. Each is presented with the model it assumes, at the point of use — not as a
solution and then a retraction.

Differential privacy is presented with its guarantee stated precisely, including what it does
*not* promise.

### 6.4 The uniqueness disagreement is not resolved by fiat

§2 and §4.6. The app reports what each methodology produces on populations where the truth is
known. It does not declare Sweeney or Golle correct.

### 6.5 Nothing leaves the device

No network at runtime. No analytics. Given the subject, this is not a nicety — an app about
data disclosure that phones home would be self-refuting.

## 7. Correctness

1. **Generator ground truth**: every record's identity is recoverable, and the uniqueness
   count computed by the engine matches a direct independent count.
2. **k-anonymity**: the reported k equals the minimum equivalence class size, verified by
   brute force on small populations.
3. **Lattice minimality**: for small taxonomies, exhaustive search must find the same minimal
   generalisations as the pruned search.
4. **l-diversity and t-closeness** against hand-computed fixtures, including the earth
   mover's distance.
5. **Differential privacy**: the Laplace mechanism's output distribution matches the analytic
   density over many samples; sensitivity is computed, not assumed, and asserted against hand
   calculation per query type.
6. **Composition**: sequential composition of ε values is additive, verified against the
   budget log.
7. **Sweeney/Golle reconstruction**: on a uniform synthetic population matching the stated
   assumptions of each paper, the reconstruction reproduces each author's reported figure
   within tolerance. Divergences are documented rather than tuned away.
8. **Schema assessor purity**: a type-level test asserting the assessor's input type admits no
   record-shaped value.

## 8. Acceptance criteria

1. All tests in §7 pass in CI and block deploy.
2. No file input exists anywhere in the built application. Asserted by a test that greps the
   bundle for file-input APIs.
3. A population of 200,000 records renders as a field at 60 fps, with generalisation changes
   re-clustering without a stall.
4. Case 1 delivers a successful linkage within 60 seconds of first load.
5. The NIK dissector shows both masking presets with their uniqueness figures side by side.
6. `prefers-reduced-motion` honoured: coalescence becomes an instant re-layout, ignition
   becomes a state change.
7. Fully keyboard operable, including field navigation and lattice traversal.
8. Every instrument has a keyboard-reachable table equivalent. Populations and results export
   as CSV.
9. Zero runtime network requests.
10. Bundle under 250 KB gzipped.
11. Usable at 380 px, with the field legible.
