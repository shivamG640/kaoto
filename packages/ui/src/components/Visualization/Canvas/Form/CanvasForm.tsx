import { Card, CardBody, CardHeader } from '@patternfly/react-core';
import { FunctionComponent, useCallback, useContext, useEffect, useRef } from 'react';
import { VisibleFlowsContext } from '../../../../providers';
import { ErrorBoundary } from '../../../ErrorBoundary';
import { Anchors } from '../../../registers/anchors';
import { RenderingAnchor } from '../../../RenderingAnchor/RenderingAnchor';
import { CanvasNode } from '../canvas.models';
import './CanvasForm.scss';
import { CanvasFormBody } from './CanvasFormBody';
import { CanvasFormHeader } from './CanvasFormHeader';

interface CanvasFormProps {
  selectedNode: CanvasNode;
  onClose?: () => void;
}

export const CanvasForm: FunctionComponent<CanvasFormProps> = ({ selectedNode, onClose }) => {
  const { visualFlowsApi } = useContext(VisibleFlowsContext)!;
  const flowIdRef = useRef<string | undefined>(undefined);
  const vizNode = selectedNode.data?.vizNode;
  const title = vizNode?.getNodeTitle();

  /** Store the flow's initial Id */
  useEffect(() => {
    flowIdRef.current = vizNode?.getId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCloseFn = useCallback(() => {
    onClose?.();
    const newId = vizNode?.getId();
    if (typeof flowIdRef.current === 'string' && typeof newId === 'string' && flowIdRef.current !== newId) {
      visualFlowsApi.renameFlow(flowIdRef.current, newId);
    }
  }, [onClose, visualFlowsApi, vizNode]);

  return (
    <ErrorBoundary key={selectedNode.id} fallback={<p>This node cannot be configured yet</p>}>
      <Card className="canvas-form">
        <CardHeader>
          <CanvasFormHeader nodeId={selectedNode.id} title={title} onClose={onCloseFn} nodeIcon={vizNode?.data?.icon} />
          <RenderingAnchor anchorTag={Anchors.CanvasFormHeader} vizNode={vizNode} />
        </CardHeader>

        <CardBody className="canvas-form__body">{vizNode && <CanvasFormBody vizNode={vizNode} />}</CardBody>
      </Card>
    </ErrorBoundary>
  );
};
