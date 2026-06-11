import { EdgeStyle } from '@patternfly/react-topology';

import { IVisualizationNode } from '../../../models/visualization/base-visual-entity';
import { CanvasDefaults } from './canvas.defaults';
import { CanvasEdge, CanvasNode, CanvasNodesAndEdges } from './canvas.models';

export class FlowService {
  static nodes: CanvasNode[] = [];
  static edges: CanvasEdge[] = [];
  private static visitedNodes: string[] = [];
  private static consumersByEndpoint: Map<string, string[]> = new Map();
  private static outgoingByEntity: Map<string, string[]> = new Map();
  private static PRODUCER_KEYS = ['to', 'toD', 'wireTap', 'enrich', 'pollEnrich'] as const;
  private static IN_VM_ENDPOINT_PREFIXES = ['direct:', 'seda:', 'vm:', 'direct-vm:'];

  private static normalizeEndpoint = (uri: string | undefined): string | undefined => {
    if (!uri) {
      return undefined;
    }
    const stripped = uri.split('?')[0];
    return this.IN_VM_ENDPOINT_PREFIXES.some((p) => stripped.startsWith(p)) ? stripped : undefined;
  };

  private static getUri = (value: unknown): string | undefined => {
    if (typeof value === 'string') {
      return value;
    }
    if (value && typeof value === 'object') {
      const obj = value as { uri?: unknown; parameters?: { name?: unknown } };
      const rawUri = obj.uri;
      if (typeof rawUri === 'string') {
        // Camel allows `uri: direct` + `parameters.name: foo` as an equivalent of `uri: direct:foo`.
        // Compose the canonical form here so endpoint matching works for both spellings.
        if (!rawUri.includes(':')) {
          const name = obj.parameters?.name;
          if (typeof name === 'string') {
            return `${rawUri}:${name}`;
          }
        }
        return rawUri;
      }
    }
    return undefined;
  };

  static getFlowDiagram(
    scope: string,
    vizNode: IVisualizationNode,
    options: { removePlaceholder?: boolean; isTopologyView?: boolean } = {},
  ): CanvasNodesAndEdges {
    this.nodes = [];
    this.edges = [];
    this.visitedNodes = [];

    this.appendNodesAndEdges(vizNode, options);

    this.nodes.forEach((node) => {
      node.id = `${scope}|${node.id}`;
      node.children = node.children?.map((child) => `${scope}|${child}`);
      node.parentNode = node.parentNode ? `${scope}|${node.parentNode}` : undefined;
    });
    this.edges.forEach((edge) => {
      edge.id = `${scope}|${edge.id}`;
      edge.source = `${scope}|${edge.source}`;
      edge.target = `${scope}|${edge.target}`;
    });

    return { nodes: this.nodes, edges: this.edges };
  }

  /** Method for iterating over all the IVisualizationNode and its children using a depth-first algorithm */
  private static appendNodesAndEdges(
    vizNodeParam: IVisualizationNode,
    options: { removePlaceholder?: boolean; isTopologyView?: boolean } = {},
  ): void {
    const removePlaceholder = options.removePlaceholder ?? false;
    if (this.visitedNodes.includes(vizNodeParam.id) || (removePlaceholder && vizNodeParam.data.isPlaceholder)) {
      return;
    }
    let node: CanvasNode;

    let children = vizNodeParam.getChildren() ?? [];
    if (removePlaceholder) {
      children = children.filter((child) => !child.data.isPlaceholder);
    }
    const hasRealChildren = children.length > 0;

    if (vizNodeParam.data.isGroup && hasRealChildren) {
      children.forEach((child) => {
        this.appendNodesAndEdges(child, options);
      });

      node = this.getGroup(vizNodeParam.id, {
        label: vizNodeParam.id,
        children: children.map((c) => c.id),
        parentNode: vizNodeParam.getParentNode()?.id,
        data: { vizNode: vizNodeParam },
      });
    } else {
      vizNodeParam.data.isGroup = false;
      node = this.getCanvasNode(vizNodeParam);
      node.group = false;
      node.children = [];
    }

    /** Add node */
    this.nodes.push(node);
    this.visitedNodes.push(node.id);

    /** Add edges */
    this.edges.push(...this.getEdgesFromVizNode(vizNodeParam, options));
  }

  private static appendTopologyNodesAndEdges(
    vizNodeParam: IVisualizationNode,
    options: { isTopologyView?: boolean } = {},
  ): void {
    let node: CanvasNode;

    let children = vizNodeParam.getChildren() ?? [];
    children = children.filter((child) => !child.data.isPlaceholder);
    const hasRealChildren = children.length > 0;

    if (vizNodeParam.data.isGroup && vizNodeParam.getParentNode() === undefined) {
      node = this.getTopologyNode(vizNodeParam);
      /** Add node */
      this.nodes.push(node);
      this.visitedNodes.push(node.id);
    }

    if (vizNodeParam.data.isGroup && hasRealChildren) {
      children.forEach((child) => {
        this.appendTopologyNodesAndEdges(child, options);
      });
    } else {
      const processorName = vizNodeParam.data.processorName;
      const def = vizNodeParam.getNodeDefinition();
      if (processorName === 'from') {
        const endpoint = this.normalizeEndpoint(this.getUri(def));
        if (endpoint) this.consumersByEndpoint.set(endpoint, [vizNodeParam.getId() ?? vizNodeParam.id]);
      }
      if (this.PRODUCER_KEYS.includes(processorName as (typeof this.PRODUCER_KEYS)[number])) {
        const rawUri = this.getUri(def);
        const endpoint = this.normalizeEndpoint(rawUri);
        if (endpoint) {
          const producerId = vizNodeParam.getId() ?? vizNodeParam.id;
          const existingEndpoints = this.outgoingByEntity.get(producerId) ?? [];
          this.outgoingByEntity.set(producerId, [...existingEndpoints, endpoint]);
        }
      }
    }
  }

  static getTopologyFlowDiagram(vizNodes: IVisualizationNode[]): CanvasNodesAndEdges {
    this.nodes = [];
    this.edges = [];
    this.visitedNodes = [];

    vizNodes.forEach((vizNode) => {
      this.appendTopologyNodesAndEdges(vizNode, { isTopologyView: true });
    });

    this.outgoingByEntity.forEach((endpoints, producerId) => {
      const producerTop = this.nodes.map((node) => node.id.split('|')[0]).includes(producerId);
      if (!producerTop) {
        return;
      }
      endpoints.forEach((endpoint) => {
        const consumerIds = this.consumersByEndpoint.get(endpoint);

        // The endpoint is consumed somewhere in this file (possibly only by the producer itself).
        // Don't treat it as external; emit edges to any non-self consumer.
        if (consumerIds && consumerIds.length > 0) {
          consumerIds.forEach((consumerId) => {
            if (consumerId === producerId) {
              return;
            }
            if (this.nodes.map((node) => node.id.split('|')[0]).includes(consumerId)) {
              this.edges.push(this.getEdge(producerId, consumerId, true));
            }
          });
        }
      });
    });

    return { nodes: this.nodes, edges: this.edges };
  }

  private static getCanvasNode(vizNodeParam: IVisualizationNode): CanvasNode {
    /** Join the parent if exist to form a group */
    const parentNode =
      vizNodeParam.getParentNode()?.getChildren() !== undefined ? vizNodeParam.getParentNode()?.id : undefined;

    const canvasNode = this.getNode(vizNodeParam.id, {
      parentNode,
      data: { vizNode: vizNodeParam },
    });

    if (vizNodeParam.data.isPlaceholder) {
      canvasNode.type = 'node-placeholder';
      canvasNode.width = CanvasDefaults.DEFAULT_PLACEHOLDER_NODE_WIDTH;
      canvasNode.height = CanvasDefaults.DEFAULT_PLACEHOLDER_NODE_HEIGHT;
    }

    return canvasNode;
  }

  private static getEdgesFromVizNode(
    vizNodeParam: IVisualizationNode,
    options: { removePlaceholder?: boolean } = {},
  ): CanvasEdge[] {
    const edges: CanvasEdge[] = [];
    const prev = vizNodeParam.getPreviousNode?.();
    const next = vizNodeParam.getNextNode?.();

    const removePlaceholder = options.removePlaceholder ?? false;
    if (removePlaceholder && next?.data.isPlaceholder) {
      return edges;
    }

    const isGroup = vizNodeParam.data?.isGroup === true;
    const hasChildren = (vizNodeParam.getChildren() ?? []).length > 0;

    /**
     *  Priority Rule 1: Normal flow
     */
    if (next) {
      edges.push(this.getEdge(vizNodeParam.id, next.id));
    } else if (isGroup && !hasChildren && prev) {
      /**
       *  Priority Rule 2 (Fallback):
       * If node was a group like "choice" → now empty → keep it after its previous sibling
       */
      edges.push(this.getEdge(prev.id, vizNodeParam.id));
    }

    return edges;
  }

  private static getGroup(
    id: string,
    options: { label?: string; children?: string[]; parentNode?: string; data?: CanvasNode['data'] } = {},
  ): CanvasNode {
    return {
      id,
      type: 'group',
      group: true,
      label: options.label ?? id,
      children: options.children ?? [],
      parentNode: options.parentNode,
      data: options.data,
      style: {
        padding: CanvasDefaults.DEFAULT_GROUP_PADDING,
      },
    };
  }

  private static getNode(id: string, options: { parentNode?: string; data?: CanvasNode['data'] } = {}): CanvasNode {
    return {
      id,
      type: 'node',
      parentNode: options.parentNode,
      data: options.data,
      width: CanvasDefaults.DEFAULT_NODE_WIDTH,
      height: CanvasDefaults.DEFAULT_NODE_HEIGHT,
      shape: CanvasDefaults.DEFAULT_NODE_SHAPE,
    };
  }

  private static getTopologyNode(vizNodeParam: IVisualizationNode): CanvasNode {
    return {
      id: vizNodeParam.getId() ?? vizNodeParam.id,
      type: 'topology-node',
      label: vizNodeParam.getId(),
      data: { vizNode: vizNodeParam },
      width: CanvasDefaults.DEFAULT_NODE_WIDTH,
      height: CanvasDefaults.DEFAULT_NODE_HEIGHT,
      shape: CanvasDefaults.DEFAULT_NODE_SHAPE,
    };
  }

  private static getEdge(source: string, target: string, isTopologyEdge?: boolean): CanvasEdge {
    return {
      id: `${source} >>> ${target}`,
      type: isTopologyEdge ? 'topology-edge' : 'edge',
      source,
      target,
      edgeStyle: EdgeStyle.solid,
    };
  }
}
