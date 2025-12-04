/*
 * Copyright 2025 Elyra Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import '@carbon/styles/css/styles.min.css';
import '@elyra/canvas/dist/styles/common-canvas.min.css';

import { Theme } from '@carbon/react';
import { CanvasConfig, CanvasController, CommonCanvas, NodeTypeDef } from '@elyra/canvas';
import ELK, { ElkNode, LayoutOptions } from 'elkjs/lib/elk.bundled.js';
import { FunctionComponent, PropsWithChildren, useContext, useEffect, useMemo } from 'react';
import { IntlProvider } from 'react-intl';

import { BaseVisualCamelEntity } from '../../../models/visualization/base-visual-entity';
import { VisibleFlowsContext } from '../../../providers/visible-flows.provider';
import { CanvasEdge } from '../Canvas/canvas.models';
import { ElyraFlowService } from '../Canvas/elyraFlow.service';
import { PipelineService } from './Pipeline.Service';

interface ElyraCanvasProps {
  entities: BaseVisualCamelEntity[];
  // contextToolbar?: ReactNode;
}

export type RFElkNode = NodeTypeDef & ElkNode & { layoutOptions?: LayoutOptions };
const PADDING = { top: 50, right: 20, bottom: 20, left: 20 };

function getElkLayoutedElements(nodes: NodeTypeDef[], edges: CanvasEdge[]) {
  const rootNodes = nodes
    .filter((node) => node.type === 'super_node' && node.app_data?.parentNode === undefined)
    .map((node) => getElkNode(node, nodes));

  const elk = new ELK();
  const elkEdges = edges.map((edge) => ({
    ...edge,
    sources: [edge.source],
    targets: [edge.target],
  }));

  const elkGraph: ElkNode = {
    id: 'g1',
    layoutOptions: {
      'elk.algorithm': 'layered',
      // Spacing between nodes at the SAME level (horizontal spacing in same layer)
      'elk.spacing.nodeNode': '80',
      // Spacing between different layers (vertical spacing between layers)
      'elk.layered.spacing.nodeNodeBetweenLayers': '150',
      // Node placement strategy affects how nodes are arranged in same layer
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    },
    children: rootNodes as ElkNode[],
    edges: elkEdges,
  };

  return elk.layout(elkGraph).then((layoutedGraph) => {
    return PipelineService.getPipelineDefinition(layoutedGraph.children as RFElkNode[]);
  });
}

function getElkNode(node: NodeTypeDef, allNodes: NodeTypeDef[]): RFElkNode {
  const children = allNodes
    .filter((child) => child.app_data?.parentNode === node.id)
    .map((child) => getElkNode(child, allNodes));

  const elkNode: RFElkNode = { ...(node as RFElkNode) };
  // Ensure nodes have width and height for proper spacing calculation
  if (!elkNode.width) elkNode.width = 100;
  if (!elkNode.height) elkNode.height = 100;

  const layoutOptions: LayoutOptions = {
    'elk.padding': `[left=${PADDING.left}, top=${PADDING.top}, right=${PADDING.right}, bottom=${PADDING.bottom}]`,
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
    // Spacing between different layers (vertical spacing between layers)
    'elk.layered.spacing.nodeNodeBetweenLayers': '100',
    'elk.aspectRatio': '3', // High aspect ratio forces horizontal (row) layout
  };

  return {
    ...elkNode,
    children: children as unknown as string[] & ElkNode[],
    layoutOptions,
  };
}

const ElyraCanvas: FunctionComponent<PropsWithChildren<ElyraCanvasProps>> = ({ entities }) => {
  const canvasController = new CanvasController();
  const { visibleFlows } = useContext(VisibleFlowsContext)!;

  /** Draw graph */
  useEffect(() => {
    const nodes: NodeTypeDef[] = [];
    const edges: CanvasEdge[] = [];

    entities.forEach((entity) => {
      if (visibleFlows[entity.id]) {
        const { nodes: childNodes, edges: childEdges } = ElyraFlowService.getFlowDiagram(entity.toVizNode());
        nodes.push(...childNodes);
        edges.push(...childEdges);
      }
    });

    getElkLayoutedElements(nodes, edges).then((PipelineFlow) => {
      canvasController.setPipelineFlow(PipelineFlow);
    });
  }, [canvasController, entities, visibleFlows]);

  const commonCanvasConfig = useMemo(
    () => ({
      enableNodeFormatType: 'Vertical',
      enableLinkType: 'Straight',
      enableLinkDirection: 'TopBottom',
      enableResizableNodes: false,
      enableInsertNodeDroppedOnLink: true,
      enableMoveNodesOnSupernodeResize: true,
      // Displays the external object specified, as the body of the node
      // nodeExternalObject: ElyraCustomNode,
      // Displays the node outline shape underneath the image and label.
      nodeShapeDisplay: false,
      // Display image
      // imageDisplay: false,
      // Display label
      labelDisplay: true,
    }),
    [],
  );

  return (
    <Theme theme="g10">
      <div style={{ height: '100vh' }}>
        <IntlProvider locale="en">
          <CommonCanvas canvasController={canvasController} config={commonCanvasConfig as unknown as CanvasConfig} />
        </IntlProvider>
      </div>
    </Theme>
  );
};

export default ElyraCanvas;
