import { isDefined } from '@kaoto/forms';

import { DynamicCatalogRegistry } from '../../../../../../dynamic-catalog/dynamic-catalog-registry';
import { CatalogKind, ICamelComponentDefinition } from '../../../../../../models';
import { ParsedParameters } from '../../../../../../utils';

export class MultiValuePropertyService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async readMultiValue(componentName: string, catalogKind: CatalogKind, definition: any) {
    const catalogLookup = (await DynamicCatalogRegistry.get().getEntity(
      catalogKind,
      componentName,
    )) as ICamelComponentDefinition;

    const multiValueParameters: Map<string, string> = new Map<string, string>();
    if (catalogLookup?.properties !== undefined) {
      Object.entries(catalogLookup.properties).forEach(([key, value]) => {
        if (value.multiValue) multiValueParameters.set(key, value.prefix!);
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parameters: any = {};

    if (multiValueParameters.size > 0) {
      // Initialize nested objects for each multi-value parameter
      const nestedByPrefix: Map<string, ParsedParameters> = new Map();
      multiValueParameters.forEach((prefix, _key) => {
        nestedByPrefix.set(prefix, {});
      });

      // Single pass: route each entry to the correct nested object or to parameters
      Object.entries(definition).forEach(([paramKey, paramValue]) => {
        let matched = false;
        for (const [prefix, nested] of nestedByPrefix.entries()) {
          if (paramKey.startsWith(prefix)) {
            nested[paramKey.replace(prefix, '')] = paramValue as string;
            matched = true;
            break;
          }
        }
        if (!matched) {
          parameters[paramKey] = paramValue;
        }
      });

      // Assign nested objects using their property names
      multiValueParameters.forEach((prefix, key) => {
        parameters[key] = { ...nestedByPrefix.get(prefix)! };
      });
    } else {
      parameters = { ...definition };
    }

    return parameters;
  }

  static async getMultiValueSerializedDefinition(
    componentName: string,
    catalogKind: CatalogKind,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    definition: any,
  ): Promise<ParsedParameters | undefined> {
    if (!componentName || !catalogKind || !isDefined(definition)) {
      return definition;
    }

    const catalogLookup = (await DynamicCatalogRegistry.get().getEntity(
      catalogKind,
      componentName,
    )) as ICamelComponentDefinition;
    if (catalogKind === CatalogKind.Component) {
      if (!catalogLookup?.properties) {
        return definition;
      }
      const multiValueParameters: Map<string, string> = new Map<string, string>();
      Object.entries(catalogLookup.properties).forEach(([key, value]) => {
        if (value.multiValue) multiValueParameters.set(key, value.prefix!);
      });
      const defaultMultiValues: ParsedParameters = {};
      const filteredParameters = { ...definition.parameters };
      const prefixes = Array.from(multiValueParameters.values());

      if (definition.parameters !== undefined) {
        Object.keys(definition.parameters).forEach((key) => {
          if (multiValueParameters.has(key)) {
            if (definition.parameters[key] === undefined) {
              return;
            }
            Object.keys(definition.parameters[key]).forEach((subKey) => {
              defaultMultiValues[multiValueParameters.get(key) + subKey] = definition.parameters[key][subKey];
            });
            delete filteredParameters[key];
          } else if (prefixes.some((prefix) => key.startsWith(prefix))) {
            // Remove stale flat keys that match a multi-value prefix
            delete filteredParameters[key];
          }
        });
      }
      return { ...definition, parameters: { ...filteredParameters, ...defaultMultiValues } };
    }
    return definition;
  }
}
