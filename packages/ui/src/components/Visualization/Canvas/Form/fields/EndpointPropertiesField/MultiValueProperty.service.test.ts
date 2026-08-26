import catalogLibrary from '@kaoto/camel-catalog/index.json';
import { CatalogLibrary } from '@kaoto/camel-catalog/types';

import { DynamicCatalogRegistry } from '../../../../../../dynamic-catalog/dynamic-catalog-registry';
import { CatalogKind } from '../../../../../../models';
import { getFirstCatalogMap, setupDynamicCatalogRegistry } from '../../../../../../stubs/test-load-catalog';
import { MultiValuePropertyService } from './MultiValueProperty.service';

describe('MultiValuePropertyService', () => {
  beforeAll(async () => {
    const catalogsMap = await getFirstCatalogMap(catalogLibrary as CatalogLibrary);
    setupDynamicCatalogRegistry(catalogsMap);
  });

  afterAll(() => {
    DynamicCatalogRegistry.get().clearRegistry();
  });

  describe('readMultiValue', () => {
    it('should return original properties if component has no multi-value parameters', async () => {
      const definition = { message: 'Hello World', level: 'INFO' };
      const result = await MultiValuePropertyService.readMultiValue('log', CatalogKind.Component, definition);

      expect(result).toEqual({ message: 'Hello World', level: 'INFO' });
    });

    it('should return original properties if component is not found', async () => {
      const definition = { param1: 'value1', param2: 'value2' };
      const result = await MultiValuePropertyService.readMultiValue(
        'unknown-component',
        CatalogKind.Component,
        definition,
      );

      expect(result).toEqual({ param1: 'value1', param2: 'value2' });
    });

    it('should convert flat multi-value parameters to nested structure', async () => {
      const definition = {
        'job.name': 'myJob',
        'job.description': 'My job description',
        'trigger.repeatCount': '5',
        'trigger.repeatInterval': '1000',
        normalParam: 'normalValue',
      };
      const result = await MultiValuePropertyService.readMultiValue('quartz', CatalogKind.Component, definition);

      expect(result).toEqual({
        normalParam: 'normalValue',
        jobParameters: {
          name: 'myJob',
          description: 'My job description',
        },
        triggerParameters: {
          repeatCount: '5',
          repeatInterval: '1000',
        },
      });
    });

    it('should handle mixed parameters correctly', async () => {
      const definition = {
        'job.name': 'testJob',
        regularParam: 'value',
        'trigger.cron': '0 0 * * *',
      };
      const result = await MultiValuePropertyService.readMultiValue('quartz', CatalogKind.Component, definition);

      expect(result).toEqual({
        regularParam: 'value',
        jobParameters: {
          name: 'testJob',
        },
        triggerParameters: {
          cron: '0 0 * * *',
        },
      });
    });

    it('should handle empty definition', async () => {
      const definition = {};
      const result = await MultiValuePropertyService.readMultiValue('quartz', CatalogKind.Component, definition);

      expect(result).toEqual({
        jobParameters: {},
        triggerParameters: {},
      });
    });
  });

  describe('getMultiValueSerializedDefinition', () => {
    it('should return the same parameters if the definition is not a component', async () => {
      const definition = { log: { message: 'Hello World' } };
      const result = await MultiValuePropertyService.getMultiValueSerializedDefinition(
        'from',
        CatalogKind.Pattern,
        definition,
      );

      expect(result).toEqual({ log: { message: 'Hello World' } });
    });

    it('should return the same parameters if the component is not found', async () => {
      const definition = {
        uri: 'unknown-component',
        parameters: { jobParameters: { test: 'test' }, triggerParameters: { test: 'test' } },
      };
      const result = await MultiValuePropertyService.getMultiValueSerializedDefinition(
        'from',
        CatalogKind.Pattern,
        definition,
      );

      expect(result).toEqual(definition);
    });

    it('should query the dynamic catalog service', async () => {
      const definition = { uri: 'log', parameters: { message: 'Hello World' } };
      const dynamicCatalogServiceSpy = vi.spyOn(DynamicCatalogRegistry.get(), 'getEntity');

      await MultiValuePropertyService.getMultiValueSerializedDefinition('log', CatalogKind.Component, definition);
      expect(dynamicCatalogServiceSpy).toHaveBeenCalledWith(CatalogKind.Component, 'log');
    });

    it('should return the serialized definition', async () => {
      const definition = {
        uri: 'quartz',
        parameters: { jobParameters: { test: 'test' }, triggerParameters: { test: 'test' } },
      };
      const result = await MultiValuePropertyService.getMultiValueSerializedDefinition(
        'quartz',
        CatalogKind.Component,
        definition,
      );

      expect(result).toEqual({
        uri: 'quartz',
        parameters: { 'job.test': 'test', 'trigger.test': 'test' },
      });
    });
  });
});
