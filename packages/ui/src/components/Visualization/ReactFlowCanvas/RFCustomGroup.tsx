import { useState, useCallback } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import './RFCustomGroup.scss';
import { StepToolbar } from '../Canvas/StepToolbar/StepToolbar';
import { IVisualizationNode } from '../../../models';

// Definícia typu pre `data` objekt uzla - kompatibilný s RFCanvas
interface CustomGroupData {
  label?: string;
  vizNode?: IVisualizationNode;
  sourcePosition?: Position;
  targetPosition?: Position;
  [key: string]: unknown; // pre ďalšie vlastnosti
}

const RFCustomGroup = ({ id, data, selected, parentId, dragging }: NodeProps) => {
  const { label, vizNode, sourcePosition, targetPosition } = data as CustomGroupData;
  const [isHovered, setIsHovered] = useState(false);
  const shouldShowToolbar = isHovered && !dragging;
  const iconSrc = vizNode?.data?.icon;
  const sourcePos = sourcePosition ?? Position.Bottom;
  const targetPos = targetPosition ?? Position.Top;

  // Definovanie handlerov pomocou useCallback pre stabilitu a prístup k scope
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  if (label?.includes('doTry')) console.log(`RFCustomGroup: ${id}-doCatch`);

  return (
    <div
      className={`rf-custom-group ${selected ? 'rf-custom-group--selected' : ''}`}
      style={{ position: 'relative' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {shouldShowToolbar && (
        <div className="custom-node__toolbar">
          <StepToolbar vizNode={vizNode!} isCollapsed={false} onCollapseToggle={() => {}} />
        </div>
      )}

      {/* Handles pre pripojenie hrán */}
      {parentId && (
        <>
          <Handle type="target" position={targetPos} id={`${id}-target`} />
          <Handle type="source" position={sourcePos} id={`${id}-source`} />
          {label?.includes('doTry') && <Handle type="source" position={Position.Right} id="doCatch" />}
        </>
      )}

      {/* Hlavička bude ignorovať myš, aby nerušila hover stav skupiny */}
      <div className="rf-custom-group__header" style={{ pointerEvents: 'none' }}>
        {iconSrc && <img src={iconSrc} alt={label} className="rf-custom-group__icon" />}
        <span className="rf-custom-group__label">{label}</span>
      </div>

      {/* Kontajner pre vnorené uzly je riešený cez ReactFlow a ElkJS */}
    </div>
  );
};

export { RFCustomGroup };
