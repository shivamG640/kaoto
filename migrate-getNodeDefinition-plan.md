# Plan: Real ID-Based `fetchNodeDefinition`, Remove `getNodeDefinition` from Interfaces

## Context

The previous iteration added `fetchNodeDefinition(path, ids)` as a thin async wrapper over the
existing `getNodeDefinition(path)`. This plan completes the migration:

1. Rewrites `fetchNodeDefinition` in every entity class to be a **genuine, independent
   implementation** — not a wrapper.
2. Refactors `getNodeValidationText` to call `fetchNodeDefinition` instead of `getNodeDefinition`,
   making it async all the way up.
3. Removes `getNodeDefinition` from `BaseVisualEntity` and `IVisualizationNode` interfaces.
4. Introduces a shared `useNodeDefinition(vizNode)` hook that resolves the definition once and
   caches it in React state, covering all render-path and sync-callback callers.
5. Migrates every remaining UI call-site to use the new hook or `await fetchNodeDefinition()`.

---

## How the Path-Based Flow Works Today (AbstractCamelVisualEntity)

```
path (string)
  ↓ getValue(this.entityDef, path)               ← still needed; reads current model data
current model data (definition)
  ↓ getCamelComponentLookup(path, definition)
  │  ├─ parses last path segment → processorName  ← already in ids.primaryNodeId.name
  │  └─ parses definition.uri   → componentName   ← already in ids.secondaryNodeId.name
  ↓ getUpdatedDefinition(lookup, definition)       ← sync; stays unchanged
  ↓
normalised definition object
```

With `ids` pre-computed, `getCamelComponentLookup` can be bypassed entirely:

```
ids.primaryNodeId.name  → processorName  ─┐
ids.secondaryNodeId.name → componentName  ─┴→ ICamelElementLookupResult (built directly)
  ↓ getUpdatedDefinition(lookup, definition)
  ↓
normalised definition object
```

---

## Cascading Effect of Making `getNodeValidationText` Async

`getNodeValidationText` currently calls `getNodeDefinition` synchronously. Refactoring it to call
`fetchNodeDefinition` makes it `async` — and this cascades:

```
BaseVisualEntity.getNodeValidationText(path)  → async
  ↓
VisualizationNode.getNodeValidationText()     → async (currently sync, calls entity)
  ↓
CustomNode / TopologyNode / CustomGroupExpanded
  (currently call vizNode.getNodeValidationText() in render)
  → must use the shared useNodeDefinition hook
```

The `useNodeDefinition` hook resolves this by caching both `definition` and `validationText` in one
place, removing the render-path sync dependency entirely.

---

## Scope

**In scope**
- Rewrite `fetchNodeDefinition` in all entity classes to be fully independent of `getNodeDefinition`.
- Make `getNodeValidationText` async in the `BaseVisualEntity` interface and all implementations.
- Update `VisualizationNode.getNodeValidationText` to `async`.
- Introduce `useNodeDefinition(vizNode)` shared hook.
- Remove `getNodeDefinition(path?: string): any` from `BaseVisualEntity` interface.
- Remove `getNodeDefinition(): any` and `getNodeValidationText(): string | undefined` from
  `IVisualizationNode` interface (both become async, replacing the sync versions).
- Migrate all UI render-path and sync-callback callers.
- Keep `getNodeDefinition` as an **entity-internal** method (not on the interface) in classes
  that still need it for `getNodeValidationText` during the transition, or remove it where possible.

**Out of scope**
- Changing `CamelComponentSchemaService.getCamelComponentLookup` or `getUpdatedDefinition` signatures.
- Changing the 4 direct-entity callers that pass an explicit path (`RestDslEditorPage`, `RestTree`,
  `rest-to-tree.ts`, `GroupAutoStartupSwitch`) — they call the method on the concrete class.

---

## Sub-Tasks

---

### Sub-Task 1 — Rewrite `AbstractCamelVisualEntity.fetchNodeDefinition` to use `ids` directly

**Intent**
Replace the current wrapper with a genuine IDs-driven implementation that builds
`ICamelElementLookupResult` directly from `ids`, bypassing `getCamelComponentLookup`.

**Implementation Shape**
```typescript
async fetchNodeDefinition(path: string | undefined, ids: IVisualizationNodeIds): Promise<unknown> {
  if (!path) return undefined;

  const definition = getValue(this.entityDef, path);

  // Build lookup from ids — no path-string parsing
  const processorName = (ids.primaryNodeId?.name ?? '') as keyof ProcessorDefinition;
  const componentName = ids.secondaryNodeId?.name;
  const camelElementLookup: ICamelElementLookupResult = { processorName, componentName };

  const updatedDefinition = CamelComponentSchemaService.getUpdatedDefinition(camelElementLookup, definition);

  if (updatedDefinition?.parameters === null) {
    updatedDefinition.parameters = {};
  }

  return updatedDefinition;
}
```

**Notes**
- `ICamelElementLookupResult` must be imported/exported from `camel-component-schema.service.ts`.
- `getNodeDefinition(path)` is kept unchanged — still called by `getNodeValidationText` in this
  sub-task. It will be cleaned up in Sub-Task 4.
- The DataMapper special case (processor named with `DATAMAPPER_ID_PREFIX`) is preserved
  because `ids.primaryNodeId.name` already carries that prefix.

**Expected Outcomes**
- `fetchNodeDefinition` no longer calls `this.getNodeDefinition`.
- `getCamelComponentLookup` is NOT called from `fetchNodeDefinition`.
- Existing `fetchNodeDefinition` tests still pass; results are equal to `getNodeDefinition` results.

**Relevant Context**
- [`abstract-camel-visual-entity.ts`](packages/ui/src/models/visualization/flows/abstract-camel-visual-entity.ts) lines ~148–167.
- [`camel-component-schema.service.ts`](packages/ui/src/models/visualization/flows/support/camel-component-schema.service.ts) — `getCamelComponentLookup`, `getUpdatedDefinition`, `ICamelElementLookupResult`.

**Status** — `[ ] pending`

---

### Sub-Task 2 — Rewrite `PipeVisualEntity` and `CitrusTestVisualEntity` `fetchNodeDefinition` to be independent

**Intent**
These entities hold their own model (`this.pipe.spec` / `this.test`), not `this.entityDef`. Their
current `fetchNodeDefinition` delegates to `getNodeDefinition` — replace with direct model reads.

**Implementation Shape (PipeVisualEntity)**
```typescript
async fetchNodeDefinition(path: string | undefined, _ids: IVisualizationNodeIds): Promise<unknown> {
  if (!path) return undefined;
  if (path === this.getRootPath()) return getCustomSchemaFromPipe(this.pipe);
  const stepModel: PipeStep = getValue(this.pipe.spec, path);
  return stepModel?.properties ?? {};
}
```

**Implementation Shape (CitrusTestVisualEntity)**
```typescript
async fetchNodeDefinition(path: string | undefined, _ids: IVisualizationNodeIds): Promise<unknown> {
  if (!path) return undefined;
  if (path === this.getRootPath()) return this.test;
  const actionName = CitrusTestSchemaService.extractTestActionName(path);
  const actionModel: TestAction = getValue(this.test, this.toModelPath(path));
  if (actionModel) this.updateTestActionModel(path, actionName, actionModel);
  return actionModel ?? {};
}
```

**Notes**
- `getNodeDefinition(path)` stays in both classes — still needed by `getNodeValidationText` until Sub-Task 4.
- The bodies above are identical to `getNodeDefinition` — this is intentional necessary duplication.

**Expected Outcomes**
- Spying on `getNodeDefinition` shows it is NOT called when `fetchNodeDefinition` is invoked.

**Relevant Context**
- [`pipe-visual-entity.ts`](packages/ui/src/models/visualization/flows/pipe-visual-entity.ts) lines ~99–111.
- [`citrus-test-visual-entity.ts`](packages/ui/src/models/visualization/flows/citrus-test-visual-entity.ts) lines ~198–216.

**Status** — `[ ] pending`

---

### Sub-Task 3 — Verify and confirm Camel subclass overrides (`Kamelet`, `CamelRest`, `CamelRouteConfiguration`)

**Intent**
These classes override `fetchNodeDefinition` with root-path special cases and then call
`super.fetchNodeDefinition(path, ids)` for the general case. Once Sub-Task 1 is done they
automatically benefit from the IDs-based implementation. Verify no class still calls
`super.getNodeDefinition`.

**Expected Outcomes**
- No `fetchNodeDefinition` override calls `super.getNodeDefinition` or `this.getNodeDefinition`.
- `CamelRestConfigurationVisualEntity` and `CamelErrorHandlerVisualEntity` are already independent.

**Todo List**
1. Grep for `getNodeDefinition` inside `fetchNodeDefinition` bodies in all entity classes. Fix any found.
2. No code changes expected beyond what Sub-Task 1 provides.

**Status** — `[ ] pending`

---

### Sub-Task 4 — Make `getNodeValidationText` async; remove `getNodeDefinition` as an entity-internal method where possible

**Intent**
`getNodeValidationText(path)` calls `this.getNodeDefinition(path)` synchronously. By switching to
`await this.fetchNodeDefinition(path, {})` (empty ids — this method is internal and path-driven),
we can remove `getNodeDefinition` from the entity bodies that no longer need it otherwise.

**Implementation Shape (shared pattern across all three affected entities)**
```typescript
async getNodeValidationText(path?: string): Promise<string | undefined> {
  const schema = this.getNodeSchema(path);
  const definition = await this.fetchNodeDefinition(path, {});
  if (!schema || !definition) return undefined;
  return ModelValidationService.validateNodeStatus(schema, definition);
}
```

**Files to update**
| Entity | Can `getNodeDefinition` be removed? |
|--------|-------------------------------------|
| `AbstractCamelVisualEntity` | No — still called by direct-entity callers in pages |
| `PipeVisualEntity` | Yes — after this sub-task |
| `CitrusTestVisualEntity` | Yes — after this sub-task |
| `CamelRestVisualEntity` | Has own override delegating to super — remove override if no other internal use |
| `CamelRestConfigurationVisualEntity` | Keep — called by direct-entity callers |
| `CamelErrorHandlerVisualEntity` | Keep — called by direct-entity callers |

**Update interface signatures**
- `BaseVisualEntity.getNodeValidationText(path?: string): string | undefined` → `Promise<string | undefined>`
- `IVisualizationNode.getNodeValidationText(): string | undefined` → `Promise<string | undefined>`
- `VisualizationNode.getNodeValidationText()` → `async`, returns `await this.getBaseEntity()?.getNodeValidationText(this.data.path)`

**Expected Outcomes**
- `PipeVisualEntity.getNodeDefinition` removed entirely.
- `CitrusTestVisualEntity.getNodeDefinition` removed entirely.
- `getNodeValidationText` is async in the interface and all implementations.
- `VisualizationNode.getNodeValidationText` is `async`.

**Relevant Context**
- [`abstract-camel-visual-entity.ts`](packages/ui/src/models/visualization/flows/abstract-camel-visual-entity.ts) lines ~304–310.
- [`pipe-visual-entity.ts`](packages/ui/src/models/visualization/flows/pipe-visual-entity.ts) lines ~232–238.
- [`citrus-test-visual-entity.ts`](packages/ui/src/models/visualization/flows/citrus-test-visual-entity.ts) lines ~362–368.
- [`base-visual-entity.ts`](packages/ui/src/models/visualization/base-visual-entity.ts) lines 89, 177.
- [`visualization-node.ts`](packages/ui/src/models/visualization/visualization-node.ts) line 191.

**Status** — `[ ] pending`

---

### Sub-Task 5 — Remove `getNodeDefinition` from `BaseVisualEntity` and `IVisualizationNode` interfaces; remove `VisualizationNode.getNodeDefinition`

**Intent**
Strip the method from the public contracts. After this sub-task, TypeScript enforces that no UI
code can call `vizNode.getNodeDefinition()` through the `IVisualizationNode` interface.

**Expected Outcomes**
- `BaseVisualEntity.getNodeDefinition(path?: string): any` declaration removed.
- `IVisualizationNode.getNodeDefinition(): any` declaration removed.
- `VisualizationNode.getNodeDefinition()` method body removed.
- TypeScript errors appear only at the UI call-sites identified below. No errors inside entity files.
- `getNodeDefinition` method bodies in `AbstractCamelVisualEntity`, `CamelRestVisualEntity`,
  `CamelRestConfigurationVisualEntity`, `CamelErrorHandlerVisualEntity`, `CamelRouteConfigurationVisualEntity`,
  and `KameletVisualEntity` remain — they are now entity-internal methods, not part of any interface.

**UI call-sites that will break (to be fixed in Sub-Task 6)**

| File | Line(s) | Usage |
|------|---------|-------|
| `CanvasFormBody.tsx` | 24, 33 | `model` for form render + change handler |
| `CustomNode.tsx` | 89, 181 | `isDisabled` + `canDrop` compatibility |
| `TopologyNode.tsx` | 39, 43 | `description` label + `isDisabled` |
| `disable-step.hook.tsx` | 9, 12 | `isDisabled` + toggle callback |
| `enable-all-steps.hook.tsx` | 13, 20 | filter disabled nodes + enable callback |
| `duplicate-step.hook.tsx` | 49, 61 | `canDuplicate` useMemo |
| `collapse-step.hook.tsx` | 26 | `id` inside `action()` |
| `CustomGroupExpanded.tsx` | 75, 145 | `isDisabled` + `canDrop` |
| `PlaceholderNode.tsx` | 167 | `canDrop` compatibility |
| `ComponentMode.tsx` | 26 | model for mode switch callback |
| `DataMapperLauncher.tsx` | 57 | `steps` in useMemo |
| `DataMapperPage.tsx` | 30 | filter by `id` in sync find |

**Todo List**
1. Remove `getNodeDefinition(path?: string): any` from `BaseVisualEntity` interface.
2. Remove `getNodeDefinition(): any` from `IVisualizationNode` interface.
3. Delete `VisualizationNode.getNodeDefinition()` method.
4. Run `tsc` and confirm errors are only at the 12 UI call-sites above.

**Status** — `[ ] pending`

---

### Sub-Task 6 — Introduce `useNodeDefinition(vizNode)` shared hook and migrate all UI call-sites

**Intent**
A single hook encapsulates the `useEffect` + `useState` async-resolution pattern. Every UI
call-site that previously called `vizNode.getNodeDefinition()` in render or in a sync context
now reads from the hook's cached state instead.

**Hook signature and implementation**
```typescript
// packages/ui/src/hooks/useNodeDefinition.hook.ts
export const useNodeDefinition = (vizNode: IVisualizationNode | undefined) => {
  const [nodeDef, setNodeDef] = useState<unknown>(undefined);

  useEffect(() => {
    if (!vizNode) {
      setNodeDef(undefined);
      return;
    }
    let cancelled = false;
    void vizNode.fetchNodeDefinition().then((def) => {
      if (!cancelled) setNodeDef(def);
    });
    return () => { cancelled = true; };
  }, [vizNode, vizNode?.lastUpdate]);  // re-resolve when node data changes

  return nodeDef;
};
```

**Key design decisions for this hook**
- Depends on `vizNode.lastUpdate` so it re-fetches whenever the node's model changes.
- Returns `undefined` synchronously on first render (before the Promise resolves).
- The cancelled flag prevents stale state updates on unmount or rapid re-renders.

**Migration per call-site**

| File | Old usage | New pattern |
|------|-----------|-------------|
| `CanvasFormBody.tsx` | `vizNode.getNodeDefinition()` for `model` (render + callback) | `const model = useNodeDefinition(vizNode)` for render; callback uses `vizNode.fetchNodeDefinition()` directly since it's async already |
| `CustomNode.tsx` (line 89) | `getNodeDefinition()?.disabled` in render | `const nodeDef = useNodeDefinition(vizNode); const isDisabled = !!nodeDef?.disabled` |
| `CustomNode.tsx` (line 181) | `filterNode.getNodeDefinition()` in `canDrop` sync callback | `canDrop` callback reads from a `nodeDefRef` populated by `useNodeDefinition` on `filterNode`; or refactor `checkNodeDropCompatibility` to accept pre-fetched definition |
| `TopologyNode.tsx` | `getNodeDefinition()` in render (description + disabled) | `const nodeDef = useNodeDefinition(vizNode)` |
| `disable-step.hook.tsx` | `getNodeDefinition()?.disabled` (render) + `getNodeDefinition()` (callback) | `const nodeDef = useNodeDefinition(vizNode)` for `isDisabled`; callback calls `await vizNode.fetchNodeDefinition()` |
| `enable-all-steps.hook.tsx` | `getNodeDefinition()?.disabled` in useMemo filter + `getNodeDefinition()` in callback | Filter moves to `useEffect` collecting disabled nodes asynchronously; callback calls `await node.fetchNodeDefinition()` |
| `duplicate-step.hook.tsx` | `getNodeDefinition()` in `canDuplicate` useMemo | `const nodeDef = useNodeDefinition(vizNode)` and `const parentNodeDef = useNodeDefinition(parentVizNode)` |
| `collapse-step.hook.tsx` | `getNodeDefinition()?.id` inside `action()` sync | `useNodeDefinition(vizNode)` cached at hook level; `action()` reads from local ref |
| `CustomGroupExpanded.tsx` (line 75) | `getNodeDefinition()?.disabled` in render | `const nodeDef = useNodeDefinition(groupVizNode)` |
| `CustomGroupExpanded.tsx` (line 145) | `filterNode.getNodeDefinition()` in `canDrop` | Same pattern as `CustomNode.tsx` canDrop |
| `PlaceholderNode.tsx` (line 167) | `filterNode.getNodeDefinition()` in `canDrop` | Same pattern as `CustomNode.tsx` canDrop |
| `ComponentMode.tsx` (line 26) | `getNodeDefinition()` in `switchComponentMode` callback | Callback becomes `async`; call `await vizNode.fetchNodeDefinition()` |
| `DataMapperLauncher.tsx` (line 57) | `getNodeDefinition()?.steps` in `useMemo` | `const nodeDef = useNodeDefinition(vizNode)` |
| `DataMapperPage.tsx` (line 30) | `getNodeDefinition()?.id` in sync `find()` | `useState`+`useEffect` resolving all node definitions asynchronously; or simply `useNodeDefinition` on the matched node found by `IDs`/URL param match |

**Special case: `canDrop` callbacks**
`canDrop` in PatternFly topology is a sync function and cannot be made async. The solution:
preload definitions for all involved nodes via `useNodeDefinition` and store in a `useRef` that
`canDrop` reads from synchronously. Because `canDrop` receives the `filterNode` (which could be
any node in the graph), a single `useNodeDefinition(vizNode)` isn't sufficient — here `getCompatibleComponents`
accepts the definition as a parameter. The approach is:
- Wrap `checkNodeDropCompatibility` to accept an optional pre-fetched definition map, OR
- Accept that `canDrop` calls `filterNode.getNodeDefinition()` on the **concrete entity class**
  (via `filterNode.data.entity?.getNodeDefinition(filterNode.data.path)`) which still exists
  on the entity class body — this keeps the canDrop case sync without breaking the interface contract.

**Expected Outcomes**
- `useNodeDefinition` hook exists in `packages/ui/src/hooks/`.
- All 12 call-sites migrated.
- No call-site uses `vizNode.getNodeDefinition()` through `IVisualizationNode`.
- All affected test mocks updated to use `fetchNodeDefinition: vi.fn().mockResolvedValue(x)`.

**Relevant Context**
- Existing hook: [`packages/ui/src/components/Visualization/Custom/hooks/`](packages/ui/src/components/Visualization/Custom/hooks/) directory.
- `vizNode.lastUpdate` is the timestamp field updated on every model change.

**Status** — `[ ] pending`

---

### Sub-Task 7 — Update unit tests

**Intent**
Verify the new implementations and the shared hook, and fix all tests broken by removing
the sync `getNodeDefinition` interface contract.

**Expected Outcomes**
- `abstract-camel-visual-entity.test.ts` `fetchNodeDefinition` tests assert `getCamelComponentLookup` is NOT called.
- `pipe-visual-entity.test.ts` and `citrus-test-visual-entity.test.ts` assert `getNodeDefinition` is NOT called by `fetchNodeDefinition`.
- `getNodeValidationText` tests updated to `await` the result.
- `useNodeDefinition` hook has its own test file.
- All previously passing tests continue to pass.

**Todo List**
1. Update `abstract-camel-visual-entity.test.ts` — spy on `CamelComponentSchemaService.getCamelComponentLookup` and assert NOT called from `fetchNodeDefinition`.
2. Update `pipe-visual-entity.test.ts` and `citrus-test-visual-entity.test.ts` — spy on entity's `getNodeDefinition` and assert NOT called from `fetchNodeDefinition`.
3. Update `getNodeValidationText` tests in all entity test files to `await` results.
4. Update `visualization-node.test.ts` `getNodeValidationText` tests to `await`.
5. Create `packages/ui/src/hooks/useNodeDefinition.hook.test.ts` with tests for: initial `undefined`, resolves after Promise, cancels on unmount, re-fetches on `lastUpdate` change.
6. Update all component test files that mocked `getNodeDefinition: vi.fn().mockReturnValue(x)` — replace with `fetchNodeDefinition: vi.fn().mockResolvedValue(x)`.
7. Update `getNodeValidationText` mock expectations in component test files to use `async/await`.

**Status** — `[ ] pending`

---

## Sub-Task Order / Dependencies

```
Sub-Task 1 (Abstract: real IDs-based fetchNodeDefinition)
    │
    ├──→ Sub-Task 2 (Pipe + Citrus: independent fetchNodeDefinition)
    │        │
    │        └──→ Sub-Task 3 (Verify Camel subclasses)
    │
    └──→ Sub-Task 4 (getNodeValidationText async; remove getNodeDefinition from Pipe + Citrus bodies)
              │
              └──→ Sub-Task 5 (Remove from interfaces + VisualizationNode)
                        │
                        └──→ Sub-Task 6 (useNodeDefinition hook + migrate all UI callers)
                                  │
                                  └──→ Sub-Task 7 (Update all tests)
```

Subtasks 2 and 3 can run in parallel with Sub-Task 4 once Sub-Task 1 is complete.

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Keep `path` in `fetchNodeDefinition(path, ids)` | Yes | Still needed for `getValue(this.entityDef, path)` to read model data |
| Build `ICamelElementLookupResult` from `ids` directly | Yes | Eliminates path-string parsing |
| `getNodeValidationText` becomes async | Yes (cascading) | It calls `fetchNodeDefinition`; needed to remove `getNodeDefinition` from Pipe + Citrus |
| `useNodeDefinition` in shared `hooks/` folder | Yes | Prevents repeating `useState`+`useEffect` across ~10 components |
| `useNodeDefinition` depends on `vizNode.lastUpdate` | Yes | Re-fetches when model changes |
| `canDrop` sync callbacks | Read from entity class directly | PatternFly canDrop cannot be async; entity class still has the method body |
| Keep `getNodeDefinition` on entity class bodies | Yes (where needed) | Direct-entity callers in pages; AbstractCamelVisualEntity is still needed |
| Remove `getNodeDefinition` from Pipe + Citrus class bodies | Yes | After Sub-Task 4, no remaining internal callers |
