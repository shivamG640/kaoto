import './Visualization.scss';

import { CanvasFormTabsProvider } from '@kaoto/forms';
import { FunctionComponent, JSX, PropsWithChildren, ReactNode } from 'react';

import { BaseVisualCamelEntity } from '../../models/visualization/base-visual-entity';
import { ErrorBoundary } from '../ErrorBoundary';
import { CanvasFallback } from './CanvasFallback';
import ElyraCanvas from './ElyraCanvas/ElyraCanvas';

interface CanvasProps {
  className?: string;
  entities: BaseVisualCamelEntity[];
  fallback?: ReactNode;
  additionalToolbarControls?: JSX.Element[];
}

export const Visualization: FunctionComponent<PropsWithChildren<CanvasProps>> = (props) => {
  return (
    <div className={`canvas-surface ${props.className ?? ''}`}>
      <CanvasFormTabsProvider>
        <ErrorBoundary fallback={props.fallback ?? <CanvasFallback />}>
          <ElyraCanvas entities={props.entities} />
          {/* <Canvas
            contextToolbar={<ContextToolbar additionalControls={props.additionalToolbarControls} />}
            entities={props.entities}
          /> */}
        </ErrorBoundary>
      </CanvasFormTabsProvider>
    </div>
  );
};
