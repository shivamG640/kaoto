import { AddStepMode, BaseVisualCamelEntity, IVisualizationNode } from '../../../models';
import {
  FunctionComponent,
  PropsWithChildren,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Edge,
  MarkerType,
  Node,
  NodeMouseHandler,
  NodeTypes,
  OnConnect,
  OnEdgesChange,
  OnNodeDrag,
  OnNodesChange,
  Position,
  ReactFlow,
  useReactFlow,
  useStoreApi,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FlowService } from '../Canvas/flow.service';
import { RFCustomNode } from './RFCustomNode';
import ELK, { ElkNode, LayoutOptions } from 'elkjs/lib/elk.bundled.js';
import { ErrorBoundary } from '../../ErrorBoundary';
import { FilteredFieldProvider } from '@kaoto/forms';
import { CanvasForm } from '../Canvas/Form/CanvasForm';
import { Drawer, DrawerContent, DrawerContentBody, DrawerPanelContent } from '@patternfly/react-core';
import { CatalogModalContext, VisibleFlowsContext } from '../../../providers';
import { RFCustomGroup } from './RFCustomGroup';
import { CanvasNode } from '../Canvas';
import { useEntityContext } from '../../../hooks/useEntityContext/useEntityContext';
import { checkNodeDropCompatibility, handleValidNodeDrop } from '../Custom/Node/CustomNodeUtils';
import { NodeInteractionAddonContext } from '../../registers/interactions/node-interaction-addon.provider';
import { IInteractionType, IOnCopyAddon } from '../../registers/interactions/node-interaction-addon.model';

// Definícia typu pre dáta uzlov
interface NodeData {
  label?: string;
  vizNode?: IVisualizationNode;
  sourcePosition?: Position;
  targetPosition?: Position;
  [key: string]: unknown; // pre ďalšie vlastnosti
}

type RFElkNode = Node<NodeData> & CanvasNode & ElkNode & { layoutOptions?: LayoutOptions };

interface CanvasProps {
  entities: BaseVisualCamelEntity[];
  contextToolbar?: ReactNode;
}

const isHorizontal = false;
const PADDING = { top: 50, right: 20, bottom: 10, left: 20 };
const NODE_LABEL_HEIGHT = 20;
const MIN_DISTANCE = 150;

function getElkLayoutedElements(nodes: Node<NodeData>[], edges: Edge[]) {
  const rootNodes = nodes
    .filter((node) => node.type === 'cgroup' && node.parentId === undefined)
    .map((node, index) => getElkNode({ ...node, type: 'route' }, nodes, 10 - index));

  const elk = new ELK();
  const elkEdges = edges.map((edge) => ({
    ...edge,
    sources: [edge.source],
    targets: [edge.target],
  }));

  const elkGraph: ElkNode = {
    id: 'g1',
    children: rootNodes as ElkNode[],
    edges: elkEdges,
  };

  return elk.layout(elkGraph).then((layoutedGraph) => {
    return flattenElkNodes(layoutedGraph.children as RFElkNode[]);
  });
}

function flattenElkNodes(elkNodes: RFElkNode[] = []): Node<NodeData>[] {
  return elkNodes.flatMap((node) => {
    const { children, ...nodeProps } = node;

    // Vytvorí aktuálny uzol s pozíciou priamo z ELK.
    // Creates the current node with a position taken directly from ELK
    const currentNode: Node<NodeData> = {
      ...nodeProps,
      position: { x: node.x ?? 0, y: node.y ?? 0 },
      style: { width: node.width, height: node.height },
      data: {
        ...node.data,
        label: node.data?.vizNode?.getNodeLabel(),
      } as NodeData,
    };

    // Rekurzívne sploští potomkov a spojí ich s aktuálnym uzlom.
    // Recursively flattens the children and connects them to the current node
    const childNodes = children ? flattenElkNodes(children as unknown as RFElkNode[]) : [];

    return [currentNode, ...childNodes];
  });
}

function getElkNode(node: Node<NodeData>, allNodes: Node<NodeData>[], priority: number): RFElkNode {
  const children = allNodes
    .filter((child) => child.parentId === node.id)
    .map((child, index) => getElkNode(child, allNodes, priority - index));

  // Predvolené pozície handle-ov (pre uzly v hlavnej route)
  // Default positions of handles (for nodes in the main route)
  const sourcePosition = isHorizontal ? Position.Right : Position.Bottom;
  const targetPosition = isHorizontal ? Position.Left : Position.Top;

  const elkNode: RFElkNode = { ...(node as RFElkNode) };
  const layoutOptions: LayoutOptions = {
    'elk.padding': `[left=${PADDING.left}, top=${PADDING.top}, right=${PADDING.right}, bottom=${PADDING.bottom}]`,
    'elk.algorithm': 'layered',
    'elk.direction': isHorizontal ? 'RIGHT' : 'DOWN',
    'elk.layered.spacing.nodeNodeBetweenLayers': '50',
    'elk.aspectRatio': '10.0', // High aspect ratio forces horizontal (row) layout
    'elk.priority': `${priority}`,
  };

  elkNode.height = (elkNode.height ?? 0) + NODE_LABEL_HEIGHT;

  return {
    ...elkNode,
    data: {
      ...elkNode.data,
      sourcePosition,
      targetPosition,
    } as NodeData,
    children: children as unknown as string[] & ElkNode[],
    layoutOptions,
  };
}

export const RFCanvas: FunctionComponent<PropsWithChildren<CanvasProps>> = ({ entities, contextToolbar }) => {
  const [nodes, setNodes] = useState<Node<NodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const { visibleFlows } = useContext(VisibleFlowsContext)!;
  const entitiesContext = useEntityContext();
  const catalogModalContext = useContext(CatalogModalContext);
  const nodeInteractionAddonContext = useContext(NodeInteractionAddonContext);

  const [selectedNode, setSelectedNode] = useState<CanvasNode | undefined>(undefined);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);

  const { updateEdge, getEdge, addEdges, getInternalNode, updateNode, getNode } = useReactFlow();
  const store = useStoreApi();
  const overlappedEdgeRef = useRef<string | null>(null);
  const overlappedNodeRef = useRef<string | null>(null);

  const getClosestSimilarNode = useCallback((node: Node<NodeData>) => {
    const { nodeLookup } = store.getState();
    const internalNode = getInternalNode(node.id);

    const closestNode = Array.from(nodeLookup.values())
      .filter((n) => {
        return (
          n.type === 'cgroup' &&
          checkNodeDropCompatibility(
            node.data.vizNode!,
            n.data.vizNode as IVisualizationNode,
            (mode: AddStepMode, filterNode: IVisualizationNode, compatibilityCheckNodeName: string) => {
              const filter = entitiesContext.camelResource.getCompatibleComponents(
                mode,
                filterNode.data,
                filterNode.getNodeDefinition(),
              );
              return catalogModalContext?.checkCompatibility(compatibilityCheckNodeName, filter) ?? false;
            },
          )
        );
      })
      .reduce(
        (res: { distance: number; node: Node<NodeData> | null }, n) => {
          if (n.id !== internalNode!.id) {
            const dx = n.internals.positionAbsolute.x - internalNode!.internals.positionAbsolute.x;
            const dy = n.internals.positionAbsolute.y - internalNode!.internals.positionAbsolute.y;
            const d = Math.sqrt(dx * dx + dy * dy);

            if (d < res.distance && d < MIN_DISTANCE) {
              res.distance = d;
              res.node = n;
            }
          }

          return res;
        },
        {
          distance: Number.MAX_VALUE,
          node: null,
        },
      );

    return closestNode.node;
  }, []);

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      if (node.type === 'node') {
        const edgeId = overlappedEdgeRef.current;
        if (!edgeId) return;
        const edge = getEdge(edgeId);
        if (!edge) return;

        updateEdge(edgeId, { source: edge.source, target: node.id, style: {} });

        addEdges({
          id: `${node.id}->${edge.target}`,
          source: node.id,
          target: edge.target,
        });

        handleValidNodeDrop(
          node.data.vizNode as IVisualizationNode,
          getNode(edge.target)?.data.vizNode as IVisualizationNode,
          (flowId?: string) => entitiesContext?.camelResource.removeEntity(flowId ? [flowId] : undefined),
          (vn) =>
            nodeInteractionAddonContext.getRegisteredInteractionAddons(IInteractionType.ON_COPY, vn) as IOnCopyAddon[],
        );
        entitiesContext.updateEntitiesFromCamelResource();

        overlappedEdgeRef.current = null;
      } else if (node.type === 'cgroup') {
        const closestNodeId = overlappedNodeRef.current;
        if (!closestNodeId) return;
        const closestNode = getNode(closestNodeId);
        if (!closestNode) return;

        handleValidNodeDrop(
          node.data.vizNode as IVisualizationNode,
          closestNode.data.vizNode as IVisualizationNode,
          (flowId?: string) => entitiesContext?.camelResource.removeEntity(flowId ? [flowId] : undefined),
          (vn) =>
            nodeInteractionAddonContext.getRegisteredInteractionAddons(IInteractionType.ON_COPY, vn) as IOnCopyAddon[],
        );
        entitiesContext.updateEntitiesFromCamelResource();

        overlappedNodeRef.current = null;
      }
    },
    [getEdge, addEdges, updateEdge],
  );

  const onNodeDrag: OnNodeDrag = useCallback(
    (_e, node) => {
      if (node.type === 'node') {
        const nodeDiv = document.querySelector(`.react-flow__node[data-id="${node.id}"]`);

        if (!nodeDiv) return;

        const rect = nodeDiv.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const edgeFound = document
          .elementsFromPoint(centerX, centerY)
          .find((el) => el.classList.contains('react-flow__edge-interaction'))?.parentElement;

        const edgeId = edgeFound?.dataset.id;

        if (
          edgeId &&
          checkNodeDropCompatibility(
            node.data.vizNode as IVisualizationNode,
            getNode(getEdge(edgeId)!.target)!.data.vizNode as IVisualizationNode,
            (mode: AddStepMode, filterNode: IVisualizationNode, compatibilityCheckNodeName: string) => {
              const filter = entitiesContext.camelResource.getCompatibleComponents(
                mode,
                filterNode.data,
                filterNode.getNodeDefinition(),
              );
              return catalogModalContext?.checkCompatibility(compatibilityCheckNodeName, filter) ?? false;
            },
          )
        ) {
          updateEdge(edgeId, { style: { stroke: 'black' } });
        } else if (overlappedEdgeRef.current) updateEdge(overlappedEdgeRef.current, { style: {} });

        overlappedEdgeRef.current = edgeId || null;
      } else if (node.type === 'cgroup') {
        const closestNode = getClosestSimilarNode(node);
        if (closestNode) {
          updateNode(closestNode.id, {
            style: { border: '2px dashed #0078d4' },
          });
          console.log('Closest node found:', closestNode.id);
        } else if (overlappedNodeRef.current) {
          updateNode(overlappedNodeRef.current, {
            style: {},
          });
        }

        overlappedNodeRef.current = closestNode!.id || null;
      }
    },
    [updateEdge],
  );

  const nodeTypes: NodeTypes = {
    node: RFCustomNode,
    cgroup: RFCustomGroup,
    route: RFCustomGroup,
  };

  useEffect(() => {
    setSelectedNode(undefined);
    const allNodes: Node<NodeData>[] = [];
    let allEdges: Edge[] = [];

    entities.forEach((entity) => {
      if (visibleFlows[entity.id]) {
        const { nodes: entityNodes, edges: childEdges } = FlowService.getFlowDiagram(entity.id, entity.toVizNode());

        entityNodes.forEach((node) => {
          allNodes.push({
            ...node,
            position: { x: 0, y: 0 },
            id: node.id,
            data: {
              ...node.data,
              label: node.label,
            } as NodeData,
            parentId: node.parentNode,
            type: node.group ? 'cgroup' : 'node',
          });
        });

        allEdges = allEdges.concat(childEdges.map((edge) => ({ ...edge, type: 'smoothstep' })));
      }
    });

    getElkLayoutedElements(allNodes, allEdges).then((layoutedNodes) => {
      setNodes(layoutedNodes);
      setEdges(allEdges);
    });
  }, [entities, visibleFlows]);

  const onNodesChange: OnNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange: OnEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect: OnConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), []);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setSelectedNode(node as CanvasNode);
    setIsDrawerExpanded(true);
  }, []);

  const sidePanelContent = (
    <DrawerPanelContent>
      <ErrorBoundary fallback={<p>Something did not work as expected</p>}>
        {selectedNode && (
          <FilteredFieldProvider>
            <CanvasForm selectedNode={selectedNode} onClose={() => setIsDrawerExpanded(false)} />
          </FilteredFieldProvider>
        )}
      </ErrorBoundary>
    </DrawerPanelContent>
  );

  return (
    <Drawer isExpanded={isDrawerExpanded}>
      <DrawerContent panelContent={sidePanelContent}>
        <DrawerContentBody>
          {contextToolbar}
          <div style={{ width: '100%', height: '100%' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              defaultEdgeOptions={{
                animated: true,
                type: 'default',
                markerEnd: { type: MarkerType.ArrowClosed },
                interactionWidth: 175,
              }}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onNodeDragStop={onNodeDragStop}
              onNodeDrag={onNodeDrag}
              fitView
            >
              <Background />
              <Controls />
            </ReactFlow>
          </div>
        </DrawerContentBody>
      </DrawerContent>
    </Drawer>
  );
};
