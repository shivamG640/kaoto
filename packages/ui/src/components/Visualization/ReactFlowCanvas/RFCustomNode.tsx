import { memo, useState } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import { ArrowDownIcon, ArrowRightIcon, PlusCircleIcon } from '@patternfly/react-icons';
import './CustomNode.scss';
import { Icon } from '@patternfly/react-core';

import { AddStepIcon } from '../Custom/Edge/AddStepIcon';
import { AddStepMode, IVisualizationNode, IVisualizationNodeData } from '../../../models';
import { StepToolbar } from '../Canvas/StepToolbar/StepToolbar';

export const RFCustomNode = memo((props: NodeProps) => {
  const { data, selected, dragging } = props;
  const vizNode: IVisualizationNode = data?.vizNode as IVisualizationNode<IVisualizationNodeData>;
  const iconSrc = vizNode?.data?.icon;
  const [isHover, setIsHover] = useState(false);
  const shouldShowAddStep = isHover || selected;
  const shouldShowToolbar = isHover && !dragging;
  const isHorizontal = false; // adjust if you have this prop

  const sourcePos = data.sourcePosition ?? Position.Bottom;
  const targetPos = data.targetPosition ?? Position.Top;

  return (
    <div
      className="custom-node"
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      style={{ position: 'relative' }}
    >
      {shouldShowToolbar && (
        <div
          className="custom-node__toolbar"
          onMouseEnter={() => setIsHover(true)}
          onMouseLeave={() => setIsHover(false)}
        >
          <StepToolbar vizNode={vizNode} isCollapsed={false} onCollapseToggle={() => {}} />
        </div>
      )}

      <div className="custom-node__container">
        <Handle type="target" position={targetPos as Position} />
        <div className="custom-node__container__image">
          {iconSrc ? (
            <img src={iconSrc} alt={vizNode?.getTooltipContent?.() ?? ''} />
          ) : (
            <Icon style={{ width: '100%', height: '100%' }} size="lg">
              <PlusCircleIcon />
            </Icon>
          )}
        </div>
        {shouldShowAddStep && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
            }}
          >
            <AddStepIcon
              vizNode={vizNode}
              mode={AddStepMode.AppendStep}
              title="Add step"
              data-testid="quick-append-step"
            >
              <Icon size="lg">{isHorizontal ? <ArrowRightIcon /> : <ArrowDownIcon />}</Icon>
            </AddStepIcon>
          </div>
        )}
        <Handle type="source" position={sourcePos as Position} />
      </div>
      <div className="custom-node__label">{vizNode?.getNodeLabel?.() ?? data.label}</div>
    </div>
  );
});
