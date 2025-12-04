import { NodeTypeDef, PipelineDef, PipelineFlowDef } from '@elyra/canvas';

import { RFElkNode } from './ElyraCanvas';

export class PipelineService {
  static pipelines: PipelineDef[] = [];

  static getPipelineDefinition(elkNodes: RFElkNode[] = []): PipelineFlowDef {
    this.pipelines = [];
    this.appendPipelines(elkNodes);
    return {
      id: 'pipeline-1',
      primary_pipeline: this.pipelines[0].id,
      pipelines: this.pipelines as unknown as [PipelineDef, ...PipelineDef[]],
      doc_type: 'pipeline',
      version: '3.0',
    };
  }

  private static appendPipelines(elkNodes: RFElkNode[]): void {
    const updatedElkNodes = elkNodes.map((node) => {
      const { children, ...nodeProps } = node;
      return {
        children,
        ...nodeProps,
        app_data: {
          ...nodeProps.app_data,
          ui_data: {
            ...nodeProps.app_data?.ui_data,
            // position: { x: node.x ?? 0, y: node.y ?? 0 },
            x_pos: node.x ?? 0,
            y_pos: node.y ?? 0,
            expanded_width: node.width,
            expanded_height: node.height,
            // width: node.width,
            // height: node.height,
            // style: { width: node.width, height: node.height },
          },
        },
      };
    });
    const pipeline: PipelineDef = {
      id: updatedElkNodes[0].id,
      nodes: [...(updatedElkNodes as unknown as NodeTypeDef[])],
      runtime_ref: '',
    };
    this.pipelines.push(pipeline);

    elkNodes.forEach((node) => {
      const { children } = node;

      if (children && children.length > 0) {
        this.appendPipelines(children as unknown as RFElkNode[]);
      }
    });
  }
}
