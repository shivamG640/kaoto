import { useEffect, useState } from 'react';

import { BaseVisualEntity, IVisualizationNode } from '../../../models/visualization/base-visual-entity';
import { IVisibleFlows } from '../../../utils/init-visible-flows';

/**
 * Builds the list of root visualization nodes for entities that are currently visible in the canvas.
 * Re-resolves when `entities` or `visibleFlows` change; stale async results are ignored after unmount or dependency change.
 */
export function useVisibleVizNodes(entities: BaseVisualEntity[], visibleFlows: IVisibleFlows): IVisualizationNode[] {
  const [vizNodes, setVizNodes] = useState<IVisualizationNode[]>([]);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      const nodes: IVisualizationNode[] = [];
      for (const entity of entities) {
        if (visibleFlows[entity.id]) {
          const vizNode = await entity.toVizNode();
          nodes.push(vizNode);
        }
      }
      if (!cancelled) {
        setVizNodes(nodes);
      }
    };

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [entities, visibleFlows]);

  return vizNodes;
}
