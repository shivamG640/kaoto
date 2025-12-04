import { NodeTypeDef } from '@elyra/canvas';
import { EdgeStyle } from '@patternfly/react-topology';

import { IVisualizationNode } from '../../../models/visualization/base-visual-entity';
import { CanvasEdge, CanvasNode } from './canvas.models';

export class ElyraFlowService {
  static nodes: NodeTypeDef[] = [];
  static edges: CanvasEdge[] = [];
  private static visitedNodes: string[] = [];

  static getFlowDiagram(vizNode: IVisualizationNode): { nodes: NodeTypeDef[]; edges: CanvasEdge[] } {
    this.nodes = [];
    this.edges = [];
    this.visitedNodes = [];

    this.appendNodesAndEdges(vizNode);

    return { nodes: this.nodes, edges: this.edges };
  }

  /** Method for iterating over all the IVisualizationNode and its children using a depth-first algorithm */
  private static appendNodesAndEdges(vizNodeParam: IVisualizationNode): void {
    if (this.visitedNodes.includes(vizNodeParam.id)) {
      return;
    }

    let node: NodeTypeDef;

    const children = vizNodeParam.getChildren();
    if (vizNodeParam.data.isGroup && children) {
      children.forEach((child) => {
        this.appendNodesAndEdges(child);
      });

      node = this.getCanvasGroup(vizNodeParam);
    } else {
      node = this.getCanvasNode(vizNodeParam);
    }

    /** Add node */
    this.nodes.push(node);
    this.visitedNodes.push(node.id);

    /** Add edges */
    this.edges.push(...this.getEdgesFromVizNode(vizNodeParam));
  }

  private static getCanvasGroup(vizNodeParam: IVisualizationNode): NodeTypeDef {
    const children = vizNodeParam.getChildren();
    const containerId = vizNodeParam.id;
    let canvasNode = this.getGroup(containerId, {
      label: containerId,
      children: children?.map((child) => child.id),
      parentNode: vizNodeParam.getParentNode()?.id,
      data: { vizNode: vizNodeParam },
    });

    if (vizNodeParam.getNextNode() !== undefined) {
      canvasNode = {
        ...canvasNode,
        outputs: [
          {
            id: `${vizNodeParam.id}-output-1`,
            links: [
              {
                id: `${vizNodeParam.id} >>> ${vizNodeParam.getNextNode()!.id}`,
                node_id_ref: vizNodeParam.getNextNode()!.id,
              },
            ],
          },
        ],
      };
    }

    if (vizNodeParam.getPreviousNode() !== undefined) {
      canvasNode = {
        ...canvasNode,
        inputs: [
          {
            id: `${vizNodeParam.id}-input-1`,
            links: [
              {
                id: `${vizNodeParam.id} >>> ${vizNodeParam.getPreviousNode()!.id}`,
                node_id_ref: vizNodeParam.getPreviousNode()!.id,
              },
            ],
          },
        ],
      };
    }
    return canvasNode;
  }

  private static getCanvasNode(vizNodeParam: IVisualizationNode): NodeTypeDef {
    /** Join the parent if exist to form a group */
    const parentNode =
      vizNodeParam.getParentNode()?.getChildren() !== undefined ? vizNodeParam.getParentNode()?.id : undefined;

    let canvasNode = this.getNode(vizNodeParam.id, {
      parentNode,
      data: { vizNode: vizNodeParam },
    });

    if (vizNodeParam.getNextNode() !== undefined) {
      canvasNode = {
        ...canvasNode,
        outputs: [
          {
            id: `${vizNodeParam.id}-output-1`,
            links: [
              {
                id: `${vizNodeParam.id} >>> ${vizNodeParam.getNextNode()!.id}`,
                node_id_ref: vizNodeParam.getNextNode()!.id,
              },
            ],
          },
        ],
      };
    }

    if (vizNodeParam.getPreviousNode() !== undefined) {
      canvasNode = {
        ...canvasNode,
        inputs: [
          {
            id: `${vizNodeParam.id}-input-1`,
            links: [
              {
                id: `${vizNodeParam.id} >>> ${vizNodeParam.getPreviousNode()!.id}`,
                node_id_ref: vizNodeParam.getPreviousNode()!.id,
              },
            ],
          },
        ],
      };
    }

    return canvasNode;
  }

  private static getEdgesFromVizNode(vizNodeParam: IVisualizationNode): CanvasEdge[] {
    const edges: CanvasEdge[] = [];

    if (vizNodeParam.getNextNode() !== undefined) {
      edges.push(this.getEdge(vizNodeParam.id, vizNodeParam.getNextNode()!.id));
    }

    return edges;
  }

  private static getGroup(
    id: string,
    options: { label?: string; children?: string[]; parentNode?: string; data?: CanvasNode['data'] } = {},
  ): NodeTypeDef {
    return {
      id,
      type: 'super_node',
      subflow_ref: {
        pipeline_id_ref: options.children?.[0] || id,
      },
      app_data: {
        ui_data: {
          label: options.data?.vizNode?.getNodeLabel() ?? id,
          // style: {
          //   padding: CanvasDefaults.DEFAULT_GROUP_PADDING,
          // },
          image: options.data?.vizNode?.data.icon,
          is_expanded: true,
        },
        group: true,
        children: options.children ?? [],
        parentNode: options.parentNode,
        data: options.data,
      },
    };
  }

  private static getNode(id: string, options: { parentNode?: string; data?: CanvasNode['data'] } = {}): NodeTypeDef {
    return {
      id,
      type: 'binding',
      app_data: {
        ui_data: {
          label: options.data?.vizNode?.getNodeLabel(),
          image: options.data?.vizNode?.data.icon,
        },
        parentNode: options.parentNode,
        data: options.data,
      },
      inputs: [],
    };
  }

  private static getEdge(source: string, target: string): CanvasEdge {
    return {
      id: `${source} >>> ${target}`,
      type: 'edge',
      source,
      target,
      edgeStyle: EdgeStyle.solid,
    };
  }
}
