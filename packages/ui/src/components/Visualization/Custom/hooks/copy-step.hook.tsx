import { useCallback, useMemo } from 'react';
import { IVisualizationNode } from '../../../../models/visualization/base-visual-entity';
import { ClipboardManager } from '../../../../utils/ClipboardManager';
import { ProcessorDefinition } from '@kaoto/camel-catalog/types';

export interface IClipboardCopyObject {
  DSL: ProcessorDefinition;
  processorName: string;
}

export const useCopyStep = (vizNode: IVisualizationNode) => {
  const onCopyStep = useCallback(async () => {
    if (!vizNode) return;

    const model = vizNode.getComponentSchema()?.definition || {};
    const copiedNode = Object.assign(
      {},
      { DSL: model },
      {
        processorName: vizNode.data.processorName,
      },
    ) as IClipboardCopyObject;
    /** Copy the node model */
    try {
      ClipboardManager.copy(copiedNode);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  }, [vizNode]);

  const value = useMemo(
    () => ({
      onCopyStep: onCopyStep,
    }),
    [onCopyStep],
  );

  return value;
};
