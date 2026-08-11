import { setValue } from '@kaoto/forms';
import { useCallback, useContext, useMemo } from 'react';

import { useNodeDefinition } from '../../../../hooks';
import { IVisualizationNode } from '../../../../models/visualization/base-visual-entity';
import { EntitiesContext } from '../../../../providers/entities.provider';

export const useDisableStep = (vizNode: IVisualizationNode) => {
  const entitiesContext = useContext(EntitiesContext);
  const nodeDef = useNodeDefinition(vizNode) as { disabled?: boolean } | undefined;
  const isDisabled = !!nodeDef?.disabled;

  const onToggleDisableNode = useCallback(() => {
    void vizNode.fetchNodeDefinition().then((currentModel) => {
      const newModel = (currentModel as Record<string, unknown>) || {};
      setValue(newModel, 'disabled', !isDisabled);
      vizNode.updateModel(newModel);
      entitiesContext?.updateEntitiesFromCamelResource();
    });
  }, [entitiesContext, isDisabled, vizNode]);

  const value = useMemo(
    () => ({
      onToggleDisableNode,
      isDisabled,
    }),
    [isDisabled, onToggleDisableNode],
  );

  return value;
};
