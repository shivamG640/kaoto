import './Visualization.scss';

import { CanvasFormTabsProvider } from '@kaoto/forms';
import { FunctionComponent, JSX, PropsWithChildren, ReactNode, useContext } from 'react';

import { BaseVisualEntity } from '../../models/visualization/base-visual-entity';
import { VisibleFlowsContext } from '../../providers/visible-flows.provider';
import { ErrorBoundary } from '../ErrorBoundary';
import { Canvas } from './Canvas';
import { CanvasFallback } from './CanvasFallback';
import { ContextToolbar } from './ContextToolbar/ContextToolbar';
import { useVisibleVizNodes } from './hooks/use-visible-viz-nodes';

interface VisualizationProps {
  className?: string;
  entities: BaseVisualEntity[];
  fallback?: ReactNode;
  additionalToolbarControls?: JSX.Element[];
}

export const Visualization: FunctionComponent<PropsWithChildren<VisualizationProps>> = ({
  className,
  entities,
  fallback,
  additionalToolbarControls,
}) => {
  const { visibleFlows } = useContext(VisibleFlowsContext)!;
  const vizNodes = useVisibleVizNodes(entities, visibleFlows);

  return (
    <div className={`canvas-surface ${className ?? ''}`}>
      <CanvasFormTabsProvider>
        <ErrorBoundary fallback={fallback ?? <CanvasFallback />}>
          <Canvas
            contextToolbar={<ContextToolbar additionalControls={additionalToolbarControls} />}
            vizNodes={vizNodes}
            entitiesCount={entities.length}
          />
        </ErrorBoundary>
      </CanvasFormTabsProvider>
    </div>
  );
};
