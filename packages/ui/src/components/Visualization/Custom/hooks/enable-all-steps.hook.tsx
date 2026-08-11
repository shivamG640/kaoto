import { useVisualizationController } from '@patternfly/react-topology';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { IVisualizationNode } from '../../../../models/visualization/base-visual-entity';
import { EntitiesContext } from '../../../../providers/entities.provider';
import { getVisualizationNodesFromGraph } from '../../../../utils';
import { setValue } from '../../../../utils/set-value';

export const useEnableAllSteps = () => {
  const entitiesContext = useContext(EntitiesContext);
  const controller = useVisualizationController();
  const allNodes = useMemo(() => {
    return getVisualizationNodesFromGraph(controller.getGraph(), () => true);
  }, [controller]);

  const [disabledNodes, setDisabledNodes] = useState<IVisualizationNode[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      allNodes.map(async (node) => {
        const def = (await node.fetchNodeDefinition()) as { disabled?: boolean } | undefined;
        return def?.disabled ? node : null;
      }),
    ).then((results) => {
      if (!cancelled) {
        setDisabledNodes(results.filter((n): n is IVisualizationNode => n !== null));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [allNodes]);

  const areMultipleStepsDisabled = disabledNodes.length > 1;

  const onEnableAllSteps = useCallback(() => {
    disabledNodes.forEach((node) => {
      void node.fetchNodeDefinition().then((currentModel) => {
        const newModel = (currentModel as Record<string, unknown>) || {};
        setValue(newModel, 'disabled', false);
        node.updateModel(newModel);
      });
    });

    entitiesContext?.updateEntitiesFromCamelResource();
  }, [disabledNodes, entitiesContext]);

  const value = useMemo(
    () => ({
      onEnableAllSteps,
      areMultipleStepsDisabled,
    }),
    [areMultipleStepsDisabled, onEnableAllSteps],
  );

  return value;
};
