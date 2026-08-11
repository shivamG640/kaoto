import { useEffect, useState } from 'react';

import { IVisualizationNode } from '../models/visualization/base-visual-entity';

/**
 * Resolves the node definition asynchronously for a given IVisualizationNode.
 *
 * Returns `undefined` on the first render (before the Promise resolves) and
 * re-fetches whenever the node reference changes or `vizNode.lastUpdate` changes.
 * A cancelled flag prevents stale state updates on unmount or rapid re-renders.
 */
export const useNodeDefinition = (vizNode: IVisualizationNode | undefined): unknown => {
  const [nodeDef, setNodeDef] = useState<unknown>(undefined);
  const lastUpdate = vizNode?.lastUpdate;

  useEffect(() => {
    if (!vizNode) {
      setNodeDef(undefined);
      return;
    }

    let cancelled = false;

    void vizNode.fetchNodeDefinition().then((def) => {
      if (!cancelled) setNodeDef(def);
    });

    return () => {
      cancelled = true;
    };
  }, [vizNode, lastUpdate]);

  return nodeDef;
};
