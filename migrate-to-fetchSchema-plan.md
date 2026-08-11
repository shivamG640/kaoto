# Plan: Migrate from `getNodeSchema()` to `fetchSchema()` / `fetchNodeSchema()`

## Top-Level Overview

`IVisualizationNode.getNodeSchema()` and `BaseVisualEntity.getNodeSchema()` are synchronous, path-based schema lookups backed by the static in-memory `CamelCatalogService`.
The migration target is:
- `IVisualizationNode.fetchSchema()` — async, no path needed, stores result in `vizNode.data.schema`
- `BaseVisualEntity.fetchNodeSchema(ids)` — async, ID-based (uses `IVisualizationNodeIds`)

**Goal:** Replace each production call-site of `getNodeSchema()` with the async equivalent,
one at a time, smallest-first. Tests and the interface declarations themselves are touched only
after all callers are gone.

**Out of scope for now:** Deleting the old method signatures or refactoring test stubs.

---

## Call-site Inventory

### Production callers of `getNodeSchema()` (the things to migrate)

| # | File | Line | Entity type | Pattern |
|---|------|------|-------------|---------|
| A | `CanvasFormBody.tsx` | 18 | `IVisualizationNode` | reads `vizNode.data.schema` — **already migrated** (populated by `fetchSchema()` before the component mounts) |
| B | `RestDslEditorPage.tsx` | 36 | `BaseVisualEntity` | calls `selectedEntity?.getNodeSchema(selectedElement?.modelPath)` synchronously during render |

> **Note:** `CanvasFormBody.tsx` does NOT call `getNodeSchema()` directly — it reads `vizNode.data.schema`
> which is already written by `fetchSchema()` (via `NodeEnrichmentService` and `useSelectedVizNode`).
> This means the canvas node path is already on the new API; it just has no explicit subtask here.

---

## Sub-Tasks

### Sub-task 1 — Migrate `RestDslEditorPage.tsx` from sync `getNodeSchema` to async `fetchNodeSchema`

**Status:** [ ] pending

**Intent**

`RestDslEditorPage.tsx` is the only remaining production caller of `BaseVisualEntity.getNodeSchema()`.
It reads the schema synchronously during render and passes it into a `KaotoForm`. Converting it to use
`fetchNodeSchema` removes the last non-test production use of the old path.

**Challenge**

`fetchNodeSchema` is ID-based (`IVisualizationNodeIds`), while the page only has a string `modelPath`.
`CamelRestVisualEntity` and `CamelRestConfigurationVisualEntity` do path-based lookups inside
`getNodeSchema`. For a minimal, safe migration we should add `fetchNodeSchema` overrides
(or adapt the page to call `fetchNodeSchema`) that preserve the same catalog lookups but via
the async route. The simplest approach is to convert the page to hold schema in `useState`,
fetch it in a `useEffect` whenever `selectedEntity` or `selectedElement.modelPath` changes,
and call `selectedEntity.fetchNodeSchema(...)` — where the IDs for the REST entities are
derived from the model path (since the REST entities own that mapping).

However, the `fetchNodeSchema` signature takes `IVisualizationNodeIds`, not a string path.
`CamelRestVisualEntity` and `CamelRestConfigurationVisualEntity` do NOT currently derive IDs
from a path inside `fetchNodeSchema` — they have that logic only in `getNodeSchema`.

**Minimum viable approach (chosen for smallest change):**

Add an overload / alternative on `BaseVisualEntity` — or expand `fetchNodeSchema` on only the
two REST entity classes — to accept a `modelPath: string` alongside IDs so the caller can pass
what it has. This keeps the REST entity schema logic co-located in the entity class and avoids
leaking path-parsing into the page component.

Alternative (even simpler): give `CamelRestVisualEntity` and `CamelRestConfigurationVisualEntity`
an override of `fetchNodeSchema` that internally calls the same `CamelCatalogService` lookups as
`getNodeSchema`, but derive the catalog identifiers from the IDs passed in. Then update
`RestDslEditorPage.tsx` to call `fetchNodeSchema` with the correct IDs mapped from `modelPath`.

**Expected Outcomes**

- `RestDslEditorPage.tsx` no longer calls `selectedEntity?.getNodeSchema(...)` anywhere.
- Schema is held in local `useState` and populated via `useEffect` + async call.
- A loading state is shown while the async fetch completes (the existing `!schema` loading UI
  can stay; the state is just initialized to `undefined` now instead of being synchronously set).
- All existing tests for `CamelRestVisualEntity` and `CamelRestConfigurationVisualEntity` continue to pass.
- The page renders correctly for RestConfiguration, Rest root, and Rest method paths.

**Todo List**

1. **Override `fetchNodeSchema` in `CamelRestConfigurationVisualEntity`** to perform the same
   `CamelCatalogService.getComponent(CatalogKind.Entity, 'restConfiguration')` lookup the sync
   method already does — ignore ids and return the same schema.
2. **Override `fetchNodeSchema` in `CamelRestVisualEntity`** to perform the same path-dependent
   lookup that `getNodeSchema` does. The path context needs to be threaded through — decide whether
   to extend `IVisualizationNodeIds` with an optional `modelPath` field or pass it via a dedicated
   optional parameter. Keep the change minimal.
3. **Refactor `RestDslEditorPage.tsx`** to declare `schema` as `useState<...>(undefined)` and add
   a `useEffect` that calls `await selectedEntity.fetchNodeSchema(...)` and sets the state.
4. **Add/update tests** for the two new `fetchNodeSchema` overrides in the REST entity test files.
5. Verify with `yarn workspace @kaoto/kaoto lint && yarn workspace @kaoto/kaoto test`.

**Relevant Context**

- `packages/ui/src/pages/RestDslEditor/RestDslEditorPage.tsx` line 36 — the call to replace
- `packages/ui/src/models/visualization/flows/camel-rest-visual-entity.ts` lines 78–91 — `getNodeSchema` to migrate
- `packages/ui/src/models/visualization/flows/camel-rest-configuration-visual-entity.ts` lines 95–98 — `getNodeSchema` to migrate
- `packages/ui/src/models/visualization/base-visual-entity.ts` line 37 — `fetchNodeSchema` interface
- `packages/ui/src/models/visualization/base-visual-entity.ts` line 194–230 — `IVisualizationNodeIds`
- `packages/ui/src/hooks/useSelectedVizNode.ts` lines 49–53 — pattern: async fetch + setState in effect
- `packages/ui/src/models/visualization/flows/nodes/node-enrichment.service.ts` line 49 — uses `fetchSchema()` (already migrated pattern)

---

### Sub-task 2 — Remove `getNodeSchema()` from `IVisualizationNode` and `BaseVisualEntity` once all callers are gone

**Status:** [ ] pending (blocked by Sub-task 1)

**Intent**

After Sub-task 1 eliminates the last production caller, the old method can be removed from both
interfaces and all concrete implementations, completing the migration.

**Expected Outcomes**

- `getNodeSchema()` is removed from `IVisualizationNode` (interface + `VisualizationNode` class).
- `getNodeSchema(path?)` is removed from `BaseVisualEntity` (interface + all implementing classes).
- All test mocks of `getNodeSchema` are updated to mock `fetchSchema` / `fetchNodeSchema` instead.
- Lint and test suite pass cleanly.

**Todo List**

1. Delete `getNodeSchema` from the `IVisualizationNode` interface and `VisualizationNode` class.
2. Delete `getNodeSchema` from the `BaseVisualEntity` interface.
3. Delete `getNodeSchema` from all implementing classes:
   `AbstractCamelVisualEntity`, `PipeVisualEntity`, `CitrusTestVisualEntity`, `KameletVisualEntity`,
   `CamelRestVisualEntity`, `CamelRouteConfigurationVisualEntity`, `CamelRestConfigurationVisualEntity`,
   `CamelErrorHandlerVisualEntity`.
4. Update all test files that spy on or mock `getNodeSchema` — replace with equivalent
   `fetchSchema` / `fetchNodeSchema` mocks.
5. Verify `yarn workspace @kaoto/kaoto lint && yarn workspace @kaoto/kaoto test`.

**Relevant Context**

- All test files listed in the investigation report under "ALL USAGES OF `getNodeSchema()`"
- `packages/ui/src/components/Visualization/Canvas/Form/CanvasForm.test.tsx` lines 90, 118
- `packages/ui/src/components/Visualization/Custom/hooks/paste-step.hook.test.tsx` line 110
- `packages/ui/src/components/ComponentMode/ComponentMode.test.tsx` line 33

---

## Notes

- `CanvasFormBody.tsx` already reads `vizNode.data.schema` (set by `fetchSchema()`), so the canvas
  node form path is complete and does not require a sub-task.
- `CitrusTestSchemaService.getNodeSchema()` (static utility) is separate from the interface hierarchy
  and is out of scope for this plan — it is not part of `IVisualizationNode` or `BaseVisualEntity`.
- Internal calls to `this.getNodeSchema()` inside entity implementations (e.g.,
  `abstract-camel-visual-entity.ts` line 302, `pipe-visual-entity.ts` line 229,
  `citrus-test-visual-entity.ts` line 359, `camel-rest-configuration-visual-entity.ts` line 141)
  are intermediate steps; they will naturally disappear when the method is removed in Sub-task 2.
