import './SplitPanel.scss';

import { Panel, PanelMain, PanelMainBody } from '@patternfly/react-core';
import { FunctionComponent, PropsWithChildren, useMemo } from 'react';

// Internal constraints for panel widths
const MIN_WIDTH = 10; // 10%
const MAX_WIDTH = 90; // 90%

export interface SplitPanelProps {
  width: number;
  position: 'left' | 'right';
}

export const SplitPanel: FunctionComponent<PropsWithChildren<SplitPanelProps>> = ({ children, width, position }) => {
  // Constrain width to internal min/max bounds
  const constrainedWidth = useMemo(() => {
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
  }, [width]);

  const panelClassName = `split-panel split-panel--${position}`.trim();

  return (
    <div className={panelClassName} style={{ width: `${constrainedWidth}%` }} data-testid={`split-panel--${position}`}>
      <Panel>
        <PanelMain>
          <PanelMainBody>{children}</PanelMainBody>
        </PanelMain>
      </Panel>
    </div>
  );
};
