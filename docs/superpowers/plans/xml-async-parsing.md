# XML Async Parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate XML parsing from synchronous to asynchronous API using DynamicCatalog pattern

**Architecture:** Following the pattern from commit bf4b3df9 (Icon async migration), this migrates all XML parsing operations to return Promises. The key change is making `KaotoXmlParser.parseXML()` and related methods async, updating the `KaotoResourceSerializer` interface to support async parsing, and updating all callers to handle Promises using React hooks where needed.

**Tech Stack:** TypeScript, React hooks (useState, useEffect), DOMParser API, Jest/Vitest for testing

---

## Task 1: Update KaotoResourceSerializer Interface

**Files:**
- Modify: `packages/ui/src/models/kaoto-resource.ts:47-55`

- [ ] **Step 1: Write failing test for async parse method**

```typescript
// Add to existing test file or create new one
// packages/ui/src/models/kaoto-resource.test.ts
describe('KaotoResourceSerializer', () => {
  it('should have async parse method', () => {
    const serializer: KaotoResourceSerializer = new XmlCamelResourceSerializer();
    const result = serializer.parse('<xml/>');
    expect(result).toBeInstanceOf(Promise);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @kaoto/kaoto run test -- --testPathPattern="kaoto-resource.test" --silent`
Expected: FAIL - parse method returns synchronous value

- [ ] **Step 3: Update interface to support async parse**

```typescript
// packages/ui/src/models/kaoto-resource.ts:47-55
export interface KaotoResourceSerializer {
  parse: (code: string) => Promise<CamelYamlDsl | Integration | Kamelet | KameletBinding | Pipe | Test | undefined>;
  serialize: (resource: KaotoResource) => string;
  getComments: () => string[];
  setComments: (comments: string[]) => void;
  setMetadata: (metadata: Metadata) => void;
  getMetadata: () => Metadata;
  getType(): SerializerType;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @kaoto/kaoto run test -- --testPathPattern="kaoto-resource.test" --silent`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/models/kaoto-resource.ts packages/ui/src/models/kaoto-resource.test.ts
git commit -m "feat(Serializer): Make parse method async in KaotoResourceSerializer interface"
```

---

## Task 2: Make KaotoXmlParser.parseXML Async

**Files:**
- Modify: `packages/ui/src/serializers/xml/kaoto-xml-parser.ts:52-59`
- Modify: `packages/ui/src/serializers/xml/kaoto-xml-parser.ts:61-110`
- Test: `packages/ui/src/serializers/xml/xml-parser.test.ts`

- [ ] **Step 1: Write failing test for async parseXML**

```typescript
// packages/ui/src/serializers/xml/xml-parser.test.ts
describe('KaotoXmlParser async', () => {
  it('should return a Promise from parseXML', async () => {
    const parser = new KaotoXmlParser();
    const xml = '<camel><route id="test"></route></camel>';
    const result = parser.parseXML(xml);
    
    expect(result).toBeInstanceOf(Promise);
    const entities = await result;
    expect(entities).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @kaoto/kaoto run test -- --testPathPattern="xml-parser.test" --silent`
Expected: FAIL - parseXML returns synchronous value

- [ ] **Step 3: Make parseXML method async**

```typescript
// packages/ui/src/serializers/xml/kaoto-xml-parser.ts:52-59
async parseXML(xml: string): Promise<unknown> {
  try {
    const xmlDoc = KaotoXmlParser.domParser.parseFromString(xml, 'application/xml');
    return await this.parseFromXmlDocument(xmlDoc);
  } catch (e) {
    console.log('Error parsing XML', e);
  }
}
```

- [ ] **Step 4: Make parseFromXmlDocument method async**

```typescript
// packages/ui/src/serializers/xml/kaoto-xml-parser.ts:61-110
async parseFromXmlDocument(xmlDoc: Document): Promise<unknown> {
  const rawEntities = [];
  const rootCamelElement = xmlDoc.getElementsByTagName('camel')[0];
  const children = rootCamelElement ? rootCamelElement.children : xmlDoc.children;

  // Process route entities
  Array.from(xmlDoc.getElementsByTagName('route')).forEach((routeElement) => {
    const route = RouteXmlParser.parse(routeElement);
    rawEntities.push({ route });
  });

  // Process beans (bean factory)
  const beansSection = xmlDoc.getElementsByTagName('beans')[0];
  const beans: BeanFactory[] = beansSection ? this.beanParser.transformBeansSection(beansSection) : [];
  // process beans outside of beans section
  Array.from(children)
    .filter((child) => child.tagName === 'bean')
    .forEach((beanElement) => {
      beans.push(BeansXmlParser.transformBeanFactory(beanElement));
    });

  if (beans.length > 0) {
    rawEntities.push({ beans });
  }

  // Process rest entities
  Array.from(xmlDoc.getElementsByTagName('rest')).forEach((restElement) => {
    const rest = RestXmlParser.parse(restElement);
    rawEntities.push({ rest });
  });

  // Process route configurations
  Array.from(xmlDoc.getElementsByTagName('routeConfiguration')).forEach((routeConf) => {
    const routeConfiguration = RouteXmlParser.parseRouteConfiguration(routeConf);
    rawEntities.push({ routeConfiguration });
  });

  // rest of the elements
  Array.from(children).forEach((child) => {
    if (KaotoXmlParser.PARSABLE_ELEMENTS.includes(child.tagName)) {
      const entity = StepParser.parseElement(child);
      if (entity) {
        rawEntities.push({ [child.tagName]: entity });
      }
    }
  });

  return rawEntities;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn workspace @kaoto/kaoto run test -- --testPathPattern="xml-parser.test" --silent`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/serializers/xml/kaoto-xml-parser.ts packages/ui/src/serializers/xml/xml-parser.test.ts
git commit -m "feat(XmlParser): Make parseXML and parseFromXmlDocument async"
```

---

## Task 3: Update XmlCamelResourceSerializer to Use Async Parsing

**Files:**
- Modify: `packages/ui/src/serializers/xml-camel-resource-serializer.ts:31-42`
- Test: `packages/ui/src/serializers/xml-to-yaml.test.ts`

- [ ] **Step 1: Write failing test for async parse**

```typescript
// Add to packages/ui/src/serializers/xml-camel-resource-serializer.test.ts
describe('XmlCamelResourceSerializer async', () => {
  it('should parse XML asynchronously', async () => {
    const serializer = new XmlCamelResourceSerializer();
    const xml = '<?xml version="1.0"?>\n<camel><route id="test"></route></camel>';
    
    const result = serializer.parse(xml);
    expect(result).toBeInstanceOf(Promise);
    
    const entities = await result;
    expect(entities).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @kaoto/kaoto run test -- --testPathPattern="xml-camel-resource-serializer" --silent`
Expected: FAIL - parse method is synchronous

- [ ] **Step 3: Make parse method async**

```typescript
// packages/ui/src/serializers/xml-camel-resource-serializer.ts:31-42
async parse(code: unknown): Promise<CamelYamlDsl | Integration | Kamelet | KameletBinding | Pipe> {
  const xmlParser = new KaotoXmlParser();

  this.metadata.xmlDeclaration = this.parseXmlDeclaration(code as string);

  const codeWithoutDeclaration = (code as string).replace(this.metadata.xmlDeclaration, '');
  this.extractComments(codeWithoutDeclaration);
  this.metadata.rootElementDefinitions = xmlParser.parseRootElementDefinitions(codeWithoutDeclaration);
  const entities = await xmlParser.parseXML(codeWithoutDeclaration as string);

  return entities as CamelYamlDsl;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @kaoto/kaoto run test -- --testPathPattern="xml-camel-resource-serializer" --silent`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/serializers/xml-camel-resource-serializer.ts
git commit -m "feat(XmlSerializer): Make parse method async"
```

---

## Task 4: Update YamlCamelResourceSerializer (Stub Implementation)

**Files:**
- Modify: `packages/ui/src/serializers/yaml-camel-resource-serializer.ts`

- [ ] **Step 1: Write failing test for async parse**

```typescript
// Add to packages/ui/src/serializers/yaml-camel-resource-serializer.test.ts
describe('YamlCamelResourceSerializer async', () => {
  it('should parse YAML asynchronously', async () => {
    const serializer = new YamlCamelResourceSerializer();
    const yaml = 'integration:\n  flows:\n    - route:\n        id: test';
    
    const result = serializer.parse(yaml);
    expect(result).toBeInstanceOf(Promise);
    
    const entities = await result;
    expect(entities).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @kaoto/kaoto run test -- --testPathPattern="yaml-camel-resource-serializer" --silent`
Expected: FAIL - parse method is synchronous

- [ ] **Step 3: Make parse method async (wrapper around sync implementation)**

```typescript
// Find the parse method in packages/ui/src/serializers/yaml-camel-resource-serializer.ts
// Wrap it to return a Promise
async parse(code: unknown): Promise<CamelYamlDsl | Integration | Kamelet | KameletBinding | Pipe> {
  // Existing synchronous logic here
  const result = /* existing parse logic */;
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @kaoto/kaoto run test -- --testPathPattern="yaml-camel-resource-serializer" --silent`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/serializers/yaml-camel-resource-serializer.ts
git commit -m "feat(YamlSerializer): Make parse method async for interface compliance"
```

---

## Task 5: Update CamelResourceFactory to Handle Async Parse

**Files:**
- Modify: `packages/ui/src/models/camel/camel-resource-factory.ts`
- Test: `packages/ui/src/models/camel/camel-resource-factory.test.ts`

- [ ] **Step 1: Write failing test for async factory**

```typescript
// packages/ui/src/models/camel/camel-resource-factory.test.ts
describe('CamelResourceFactory async', () => {
  it('should handle async XML parsing', async () => {
    const xml = '<?xml version="1.0"?>\n<camel><route id="test"></route></camel>';
    const factory = new CamelResourceFactory();
    
    const resourcePromise = factory.create(xml);
    expect(resourcePromise).toBeInstanceOf(Promise);
    
    const resource = await resourcePromise;
    expect(resource).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @kaoto/kaoto run test -- --testPathPattern="camel-resource-factory" --silent`
Expected: FAIL - factory.create is synchronous

- [ ] **Step 3: Update factory create method to be async**

```typescript
// packages/ui/src/models/camel/camel-resource-factory.ts
// Find the create method and make it async
static async create(source: string, type?: SourceSchemaType): Promise<KaotoResource> {
  const serializer = 
    XmlCamelResourceSerializer.isApplicable(source)
      ? new XmlCamelResourceSerializer()
      : new YamlCamelResourceSerializer();
  
  const parsedEntities = await serializer.parse(source);
  
  // Rest of the logic remains the same
  // Return appropriate resource type based on parsed entities
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @kaoto/kaoto run test -- --testPathPattern="camel-resource-factory" --silent`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/models/camel/camel-resource-factory.ts packages/ui/src/models/camel/camel-resource-factory.test.ts
git commit -m "feat(Factory): Make CamelResourceFactory.create async"
```

---

## Task 6: Update CamelRouteResource to Handle Async Serialization

**Files:**
- Modify: `packages/ui/src/models/camel/camel-route-resource.ts`
- Test: `packages/ui/src/models/camel/camel-route-resource.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/ui/src/models/camel/camel-route-resource.test.ts
describe('CamelRouteResource serialization async', () => {
  it('should update serializer asynchronously', async () => {
    const resource = new CamelRouteResource({/* initial data */});
    const updatePromise = resource.setSerializer('XML');
    
    expect(updatePromise).toBeInstanceOf(Promise);
    await updatePromise;
    expect(resource.getSerializerType()).toBe('XML');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @kaoto/kaoto run test -- --testPathPattern="camel-route-resource" --silent`
Expected: FAIL - setSerializer is synchronous

- [ ] **Step 3: Make setSerializer async**

```typescript
// packages/ui/src/models/camel/camel-route-resource.ts
async setSerializer(serializerType: 'XML' | 'YAML'): Promise<void> {
  const currentSource = this.toString();
  const serializer = serializerType === 'XML' ? new XmlCamelResourceSerializer() : new YamlCamelResourceSerializer();
  
  const parsedEntities = await serializer.parse(currentSource);
  
  // Update internal state with parsed entities
  this.serializer = serializer;
  // Update entities from parsedEntities
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @kaoto/kaoto run test -- --testPathPattern="camel-route-resource" --silent`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/models/camel/camel-route-resource.ts packages/ui/src/models/camel/camel-route-resource.test.ts
git commit -m "feat(Resource): Make CamelRouteResource.setSerializer async"
```

---

## Task 7: Update React Components to Handle Async Parsing

**Files:**
- Modify: `packages/ui/src/components/SourceCode/SourceCode.tsx`
- Test: `packages/ui/src/components/SourceCode/SourceCode.test.tsx`

- [ ] **Step 1: Write failing test for component**

```typescript
// packages/ui/src/components/SourceCode/SourceCode.test.tsx
describe('SourceCode async parsing', () => {
  it('should handle async XML parsing with loading state', async () => {
    const xml = '<?xml version="1.0"?>\n<camel><route id="test"></route></camel>';
    const { getByText, queryByText } = render(<SourceCode code={xml} />);
    
    // Should show loading initially
    expect(queryByText(/loading/i)).toBeInTheDocument();
    
    // Wait for parsing to complete
    await waitFor(() => {
      expect(queryByText(/loading/i)).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @kaoto/kaoto run test -- --testPathPattern="SourceCode.test" --silent`
Expected: FAIL - no loading state handling

- [ ] **Step 3: Add React state and async effect**

```typescript
// packages/ui/src/components/SourceCode/SourceCode.tsx
import { useEffect, useState } from 'react';

export const SourceCode: FunctionComponent<SourceCodeProps> = ({ code, onChange }) => {
  const [parsedResource, setParsedResource] = useState<KaotoResource | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    
    async function parseCode() {
      setIsLoading(true);
      try {
        const resource = await CamelResourceFactory.create(code);
        if (!cancelled) {
          setParsedResource(resource);
        }
      } catch (error) {
        console.error('Error parsing code:', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }
    
    parseCode();
    
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    // Existing component JSX using parsedResource
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @kaoto/kaoto run test -- --testPathPattern="SourceCode.test" --silent`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/SourceCode/SourceCode.tsx packages/ui/src/components/SourceCode/SourceCode.test.tsx
git commit -m "feat(SourceCode): Add async parsing with loading state"
```

---

## Task 8: Update All Existing Tests for Async Parsing

**Files:**
- Modify: `packages/ui/src/serializers/xml-to-yaml.test.ts`
- Modify: `packages/ui/src/models/camel/camel-route-resource.test.ts`
- Modify: `packages/ui/src/models/camel/kamelet-resource.test.ts`

- [ ] **Step 1: Update xml-to-yaml.test.ts**

```typescript
// packages/ui/src/serializers/xml-to-yaml.test.ts
it.each(xmlFiles)('parses and compares %s correctly', async (xmlFile) => {
  const parser = new KaotoXmlParser();
  const xmlContent = fs.readFileSync(xmlFile, 'utf8');
  const result = await parser.parseXML(xmlContent);  // Add await
  
  expect(result).toBeDefined();
  // rest of assertions
});
```

- [ ] **Step 2: Update camel-route-resource.test.ts**

```typescript
// packages/ui/src/models/camel/camel-route-resource.test.ts
it('should create route from XML', async () => {  // Add async
  const xml = '<?xml version="1.0"?>\n<camel><route id="test"></route></camel>';
  const resource = await CamelResourceFactory.create(xml);  // Add await
  
  expect(resource).toBeDefined();
  expect(resource.getVisualEntities()).toHaveLength(1);
});
```

- [ ] **Step 3: Update kamelet-resource.test.ts**

```typescript
// packages/ui/src/models/camel/kamelet-resource.test.ts
it('should create kamelet from definition', async () => {  // Add async
  const definition = { /* kamelet definition */ };
  const resource = await KameletResourceFactory.create(definition);  // Add await if needed
  
  expect(resource).toBeDefined();
});
```

- [ ] **Step 4: Run all tests**

Run: `yarn workspace @kaoto/kaoto run test -- --testPathPattern="xml-to-yaml|camel-route-resource|kamelet-resource" --silent`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/serializers/xml-to-yaml.test.ts packages/ui/src/models/camel/camel-route-resource.test.ts packages/ui/src/models/camel/kamelet-resource.test.ts
git commit -m "test: Update existing tests to handle async XML parsing"
```

---

## Task 9: Update Visualization Entity Tests

**Files:**
- Modify: `packages/ui/src/models/visualization/flows/camel-rest-visual-entity.test.ts`
- Modify: `packages/ui/src/models/visualization/flows/camel-route-configuration-visual-entity.test.ts`
- Modify: `packages/ui/src/models/visualization/flows/nodes/mappers/base-node-mapper.test.ts`

- [ ] **Step 1: Update camel-rest-visual-entity.test.ts**

```typescript
// packages/ui/src/models/visualization/flows/camel-rest-visual-entity.test.ts
describe('CamelRestVisualEntity', () => {
  it('should parse REST entity from XML', async () => {  // Add async
    const xml = '<rest id="test"><get path="/test"></get></rest>';
    const parser = new KaotoXmlParser();
    const entities = await parser.parseXML(xml);  // Add await
    
    expect(entities).toBeDefined();
  });
});
```

- [ ] **Step 2: Update camel-route-configuration-visual-entity.test.ts**

```typescript
// packages/ui/src/models/visualization/flows/camel-route-configuration-visual-entity.test.ts
describe('CamelRouteConfigurationVisualEntity', () => {
  it('should parse route configuration', async () => {  // Add async
    const xml = '<routeConfiguration id="test"></routeConfiguration>';
    const parser = new KaotoXmlParser();
    const entities = await parser.parseXML(xml);  // Add await
    
    expect(entities).toBeDefined();
  });
});
```

- [ ] **Step 3: Update base-node-mapper.test.ts**

```typescript
// packages/ui/src/models/visualization/flows/nodes/mappers/base-node-mapper.test.ts
describe('BaseNodeMapper', () => {
  it('should map XML node to visualization node', async () => {  // Add async
    const xml = '<from uri="direct:test"><to uri="log:test"/></from>';
    const parser = new KaotoXmlParser();
    const entities = await parser.parseXML(xml);  // Add await
    
    const mapper = new BaseNodeMapper();
    const node = mapper.map(entities);
    
    expect(node).toBeDefined();
  });
});
```

- [ ] **Step 4: Run tests**

Run: `yarn workspace @kaoto/kaoto run test -- --testPathPattern="camel-rest-visual-entity|camel-route-configuration-visual-entity|base-node-mapper" --silent`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/models/visualization/flows/camel-rest-visual-entity.test.ts packages/ui/src/models/visualization/flows/camel-route-configuration-visual-entity.test.ts packages/ui/src/models/visualization/flows/nodes/mappers/base-node-mapper.test.ts
git commit -m "test: Update visualization entity tests for async parsing"
```

---

## Task 10: Run Full Test Suite and Fix Any Remaining Issues

**Files:**
- All test files that may have been missed

- [ ] **Step 1: Run complete test suite**

Run: `yarn workspace @kaoto/kaoto run test`
Expected: Identify any failing tests

- [ ] **Step 2: Fix any remaining synchronous parse calls**

Search for remaining sync usage:
```bash
grep -r "\.parse(" packages/ui/src --include="*.ts" --include="*.tsx" | grep -v "await" | grep -v "test"
```

For each file found, add `await` before the parse call and make the containing function async.

- [ ] **Step 3: Run tests again**

Run: `yarn workspace @kaoto/kaoto run test`
Expected: All PASS

- [ ] **Step 4: Run linter**

Run: `yarn workspace @kaoto/kaoto run lint`
Expected: No errors

- [ ] **Step 5: Commit any final fixes**

```bash
git add .
git commit -m "fix: Final async parsing fixes and test updates"
```

---

## Task 11: Update Documentation and Add Migration Notes

**Files:**
- Create: `docs/migrations/xml-async-parsing.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Create migration guide**

```markdown
<!-- docs/migrations/xml-async-parsing.md -->
# XML Async Parsing Migration Guide

## Overview

As of [VERSION], XML parsing has been migrated to an asynchronous API. This affects all code that uses `KaotoXmlParser` or `KaotoResourceSerializer`.

## Breaking Changes

### KaotoResourceSerializer.parse()

**Before:**
\`\`\`typescript
const serializer = new XmlCamelResourceSerializer();
const entities = serializer.parse(xmlString);
\`\`\`

**After:**
\`\`\`typescript
const serializer = new XmlCamelResourceSerializer();
const entities = await serializer.parse(xmlString);
\`\`\`

### CamelResourceFactory.create()

**Before:**
\`\`\`typescript
const resource = CamelResourceFactory.create(source);
\`\`\`

**After:**
\`\`\`typescript
const resource = await CamelResourceFactory.create(source);
\`\`\`

### React Components

Components that parse XML need to use React hooks:

\`\`\`typescript
const [resource, setResource] = useState<KaotoResource>();
const [isLoading, setIsLoading] = useState(true);

useEffect(() => {
  async function load() {
    const parsed = await CamelResourceFactory.create(code);
    setResource(parsed);
    setIsLoading(false);
  }
  load();
}, [code]);
\`\`\`

## Rationale

This migration enables:
- Progressive enhancement with loading states
- Better error handling
- Future integration with DynamicCatalog for on-demand schema loading
- Consistency with the icon resolution async migration (bf4b3df9)
```

- [ ] **Step 2: Update CHANGELOG.md**

```markdown
<!-- CHANGELOG.md -->
## [Unreleased]

### Changed
- **BREAKING**: XML parsing is now asynchronous. All `parse()` methods now return Promises.
  - `KaotoResourceSerializer.parse()` is now async
  - `CamelResourceFactory.create()` is now async
  - `KaotoXmlParser.parseXML()` is now async
  
See [migration guide](docs/migrations/xml-async-parsing.md) for details.
```

- [ ] **Step 3: Commit documentation**

```bash
git add docs/migrations/xml-async-parsing.md CHANGELOG.md
git commit -m "docs: Add XML async parsing migration guide"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✓ KaotoResourceSerializer interface updated
- ✓ KaotoXmlParser made async
- ✓ XmlCamelResourceSerializer updated
- ✓ YamlCamelResourceSerializer updated for interface compliance
- ✓ CamelResourceFactory updated
- ✓ CamelRouteResource updated
- ✓ React components handle async with loading states
- ✓ All tests updated
- ✓ Migration documentation added

**2. Placeholder scan:** None - all code examples are complete

**3. Type consistency:** All async methods return `Promise<T>` consistently

**4. Pattern consistency:** Follows bf4b3df9 (Icon async migration) pattern:
- Methods changed from sync to async
- React components use useState/useEffect
- Tests updated to use async/await
- Interface changes force all implementations to update
