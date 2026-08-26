import { FieldProps, ModelContextProvider, ObjectField, SchemaContext, setValue, useFieldValue } from '@kaoto/forms';
import { cloneDeep } from 'lodash';
import { FunctionComponent, useContext, useEffect, useMemo, useState } from 'react';

import { CatalogKind } from '../../../../../../models';
import { ParsedParameters } from '../../../../../../utils';
import { MultiValuePropertyService } from './MultiValueProperty.service';

export const MultiValuePropertyEditor: FunctionComponent<FieldProps> = ({ propName, required }) => {
  const { schema } = useContext(SchemaContext);
  const { value: flatParameters = {}, onChange, disabled } = useFieldValue<ParsedParameters | undefined>(propName);

  const componentName = useMemo(() => {
    const name = schema['x-component-name'] as string | undefined;
    return name || '';
  }, [schema]);

  const catalogKind = useMemo(() => {
    const name = schema['x-endpoint-catalog-kind'] as CatalogKind | undefined;
    return name || CatalogKind.Component;
  }, [schema]);

  const [nestedModel, setNestedModel] = useState<{ parameters: ParsedParameters } | undefined>();
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    MultiValuePropertyService.readMultiValue(componentName, catalogKind, flatParameters)
      .then((parameters) => {
        if (!cancelled) {
          setNestedModel({ parameters });
          setIsReady(true);
        }
      })
      .catch((error) => {
        if (!cancelled) console.error(error);
      });
    return () => {
      cancelled = true;
    };
  }, [componentName, catalogKind, flatParameters]);

  if (!isReady || !nestedModel) {
    return null;
  }

  const onPropertyChange = async (path: string, value: unknown) => {
    const updatedDefinition = cloneDeep(nestedModel);

    let updatedValue = value;
    if (typeof value === 'string' && value.trim() === '') {
      updatedValue = undefined;
    }
    setValue(updatedDefinition, path, updatedValue);

    const multiValueParameters = await MultiValuePropertyService.getMultiValueSerializedDefinition(
      componentName,
      catalogKind,
      updatedDefinition,
    );

    if (
      multiValueParameters &&
      typeof multiValueParameters === 'object' &&
      'parameters' in multiValueParameters &&
      typeof multiValueParameters.parameters === 'object'
    ) {
      onChange(multiValueParameters.parameters as ParsedParameters);
    }
  };

  return (
    <ModelContextProvider onPropertyChange={onPropertyChange} model={nestedModel} disabled={disabled}>
      <ObjectField propName={propName} required={required} />
    </ModelContextProvider>
  );
};
