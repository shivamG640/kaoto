import { isDefined, KaotoForm } from '@kaoto/forms';
import { FunctionComponent, useCallback, useContext, useMemo, useRef } from 'react';

import { useNodeDefinition } from '../../../../hooks';
import { IVisualizationNode } from '../../../../models';
import { EntitiesContext } from '../../../../providers/entities.provider';
import { setValue } from '../../../../utils';
import { UnknownNode } from '../../Custom/UnknownNode';
import { customFieldsFactoryfactory } from './fields/custom-fields-factory';
import { SuggestionRegistrar } from './suggestions/SuggestionsProvider';

interface CanvasFormTabsProps {
  vizNode: IVisualizationNode;
}

export const CanvasFormBody: FunctionComponent<CanvasFormTabsProps> = ({ vizNode }) => {
  const entitiesContext = useContext(EntitiesContext);
  const omitFields = useRef(vizNode.getOmitFormFields() ?? []);
  const schema = vizNode.data.schema;

  const isUnknownComponent = useMemo(() => {
    return !isDefined(schema) || Object.keys(schema).length === 0;
  }, [schema]);

  const model = useNodeDefinition(vizNode);

  const handleOnChangeIndividualProp = useCallback(
    (path: string, value: unknown) => {
      let updatedValue = value;
      if (typeof value === 'string' && value.trim() === '') {
        updatedValue = undefined;
      }

      void vizNode.fetchNodeDefinition().then((newModel) => {
        const safeModel = (newModel as Record<string, unknown>) ?? {};
        setValue(safeModel, path, updatedValue);
        vizNode.updateModel(safeModel);
        entitiesContext?.updateSourceCodeFromEntities();
      });
    },
    [entitiesContext, vizNode],
  );

  if (isUnknownComponent) {
    return <UnknownNode model={model} />;
  }

  return (
    <SuggestionRegistrar>
      <KaotoForm
        schema={schema}
        onChangeProp={handleOnChangeIndividualProp}
        model={model}
        omitFields={omitFields.current}
        customFieldsFactory={customFieldsFactoryfactory}
      />
    </SuggestionRegistrar>
  );
};
