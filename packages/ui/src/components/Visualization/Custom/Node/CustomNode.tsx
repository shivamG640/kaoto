import './CustomNode.scss';

import { Icon } from '@patternfly/react-core';
import { ArrowDownIcon, ArrowRightIcon, BanIcon, ExclamationCircleIcon } from '@patternfly/react-icons';
import {
  AnchorEnd,
  DEFAULT_LAYER,
  DefaultNode,
  DragObjectWithType,
  DragSourceSpec,
  DragSpecOperationType,
  DropTargetSpec,
  EditableDragOperationType,
  ElementModel,
  GraphElement,
  GraphElementProps,
  isNode,
  Layer,
  Node,
  observer,
  TOP_LAYER,
  useAnchor,
  useCombineRefs,
  useDndDrop,
  useDragNode,
  useHover,
  withContextMenu,
  withSelection,
} from '@patternfly/react-topology';
import clsx from 'clsx';
import { FunctionComponent, useContext, useMemo } from 'react';

import { CatalogModalContext } from '../../../../dynamic-catalog/catalog-modal.provider';
import { useProcessorIcon } from '../../../../hooks/processor-icon.hook';
import { useEntityContext } from '../../../../hooks/useEntityContext/useEntityContext';
import { AddStepMode, IVisualizationNode, NodeToolbarTrigger } from '../../../../models';
import { CamelRouteVisualEntityData } from '../../../../models/visualization/flows/support/camel-component-types';
import { SettingsContext } from '../../../../providers';
import { IconResolver } from '../../../IconResolver';
import { IInteractionType, IOnCopyAddon } from '../../../registers/interactions/node-interaction-addon.model';
import { NodeInteractionAddonContext } from '../../../registers/interactions/node-interaction-addon.provider';
import { CanvasDefaults } from '../../Canvas/canvas.defaults';
import { CanvasNode, LayoutType } from '../../Canvas/canvas.models';
import { StepToolbar } from '../../Canvas/StepToolbar/StepToolbar';
import { NodeContextMenuFn } from '../ContextMenu/NodeContextMenu';
import { NODE_DRAG_TYPE } from '../customComponentUtils';
import { AddStepIcon } from '../Edge/AddStepIcon';
import { FloatingCircle } from '../FloatingCircle/FloatingCircle';
import { NoBendpointsEdge } from '../NoBendingEdge';
import { TargetAnchor } from '../target-anchor';
import { checkNodeDropCompatibility, handleValidNodeDrop } from './CustomNodeUtils';

type DefaultNodeProps = Parameters<typeof DefaultNode>[0];

interface CustomNodeProps extends DefaultNodeProps {
  element: GraphElement<ElementModel, CanvasNode['data']>;
  /** Toggle node collapse / expand */
  onCollapseToggle?: () => void;
}

const CustomNodeInner: FunctionComponent<CustomNodeProps> = observer(
  ({ element, onContextMenu, onCollapseToggle, selected, onSelect }) => {
    if (!isNode(element)) {
      throw new Error('CustomNodeInner must be used only on Node elements');
    }

    const vizNode: IVisualizationNode | undefined = element.getData()?.vizNode;
    const lastUpdate = vizNode?.lastUpdate;
    const entitiesContext = useEntityContext();
    const catalogModalContext = useContext(CatalogModalContext);
    const settingsAdapter = useContext(SettingsContext);
    const nodeInteractionAddonContext = useContext(NodeInteractionAddonContext);
    const label = vizNode?.getNodeLabel(settingsAdapter.getSettings().nodeLabel);
    const processorName = (vizNode?.data as CamelRouteVisualEntityData)?.processorName;
    const { Icon: ProcessorIcon, description: processorDescription } = useProcessorIcon(processorName);
    const isDisabled = !!vizNode?.getNodeDefinition()?.disabled;
    const tooltipContent = vizNode?.getTooltipContent();
    const validationText = vizNode?.getNodeValidationText();
    const doesHaveWarnings = !isDisabled && !!validationText;
    const [isGHover, gHoverRef] = useHover<SVGGElement>(CanvasDefaults.HOVER_DELAY_IN, CanvasDefaults.HOVER_DELAY_OUT);
    const [isToolbarHover, toolbarHoverRef] = useHover<SVGForeignObjectElement>(
      CanvasDefaults.HOVER_DELAY_IN,
      CanvasDefaults.HOVER_DELAY_OUT,
    );
    const childCount = element.getAllNodeChildren().length;
    const shouldShowToolbar =
      settingsAdapter.getSettings().nodeToolbarTrigger === NodeToolbarTrigger.onHover
        ? isGHover || isToolbarHover || selected
        : selected;
    const shouldShowAddStep =
      shouldShowToolbar && vizNode?.getNodeInteraction().canHaveNextStep && vizNode.getNextNode() === undefined;
    const isHorizontal = element.getGraph().getLayout() === LayoutType.DagreHorizontal;
    const dndSettingsEnabled = settingsAdapter.getSettings().experimentalFeatures.enableDragAndDrop;
    const canDragNode = vizNode?.canDragNode() ?? false;

    useAnchor((element: Node) => {
      return new TargetAnchor(element);
    }, AnchorEnd.both);

    const nodeDragSourceSpec: DragSourceSpec<
      DragObjectWithType,
      DragSpecOperationType<EditableDragOperationType>,
      GraphElement,
      { node: GraphElement | undefined },
      GraphElementProps
    > = useMemo(
      () => ({
        item: { type: NODE_DRAG_TYPE },
        canDrag: () => {
          return dndSettingsEnabled && canDragNode;
        },
        end(dropResult, monitor) {
          if (monitor.didDrop() && dropResult) {
            let droppedVizNode: IVisualizationNode;
            let droppedIntoEdge = false;
            const draggedVizNode = element.getData().vizNode as IVisualizationNode;

            if (dropResult instanceof NoBendpointsEdge) {
              droppedVizNode = dropResult.getTarget().getData().vizNode;
              droppedIntoEdge = true;
            } else {
              droppedVizNode = dropResult.getData().vizNode as IVisualizationNode;
            }

            // handle successful drop
            handleValidNodeDrop(
              draggedVizNode,
              droppedVizNode,
              droppedIntoEdge,
              (flowId?: string) => entitiesContext?.camelResource.removeEntity(flowId ? [flowId] : undefined),
              (vn) =>
                nodeInteractionAddonContext.getRegisteredInteractionAddons(
                  IInteractionType.ON_COPY,
                  vn,
                ) as IOnCopyAddon[],
            );

            // Set an empty model to clear the graph
            element.getController().fromModel({
              nodes: [],
              edges: [],
            });
            requestAnimationFrame(() => {
              entitiesContext.updateEntitiesFromCamelResource();
            });
          } else {
            element.getGraph().layout();
          }
        },
        collect: (monitor) => ({
          node: monitor.getItem(),
        }),
      }),
      [canDragNode, dndSettingsEnabled, element, entitiesContext, nodeInteractionAddonContext],
    );

    const customNodeDropTargetSpec: DropTargetSpec<
      GraphElement,
      unknown,
      { droppable: boolean; hover: boolean; canDrop: boolean },
      GraphElementProps
    > = useMemo(
      () => ({
        accept: [NODE_DRAG_TYPE],
        canDrop: (item, _monitor, _props) => {
          const targetNode = element;
          const draggedNode = item as Node;
          // Ensure that the node is not dropped onto itself
          if (draggedNode === targetNode || !vizNode?.canDropOnNode()) return false;

          return checkNodeDropCompatibility(
            draggedNode.getData()?.vizNode,
            vizNode,
            (mode: AddStepMode, filterNode: IVisualizationNode, compatibilityCheckNodeName: string) => {
              const filter = entitiesContext.camelResource.getCompatibleComponents(
                mode,
                filterNode.data,
                filterNode.getNodeDefinition(),
              );
              return catalogModalContext?.checkCompatibility(compatibilityCheckNodeName, filter) ?? false;
            },
          );
        },
        collect: (monitor) => ({
          droppable: monitor.isDragging(),
          hover: monitor.isOver(),
          canDrop: monitor.canDrop(),
        }),
      }),
      [element, vizNode, entitiesContext, catalogModalContext],
    );

    const [dragNodeProps, dragNodeRef] = useDragNode(nodeDragSourceSpec);
    const [dndDropProps, dndDropRef] = useDndDrop(customNodeDropTargetSpec);
    const gCombinedRef = useCombineRefs<SVGGElement>(gHoverRef, dragNodeRef);
    const isDraggingNode = dragNodeProps.node?.getId() === element.getId();

    const box = element.getBounds();
    const labelX = (box.width - CanvasDefaults.DEFAULT_LABEL_WIDTH) / 2;
    const toolbarWidth = CanvasDefaults.STEP_TOOLBAR_WIDTH;
    const toolbarX = (box.width - toolbarWidth) / 2;
    const toolbarY = CanvasDefaults.STEP_TOOLBAR_HEIGHT * -1;

    if (!vizNode) {
      return null;
    }

    return (
      <Layer id={DEFAULT_LAYER} data-lastupdate={lastUpdate}>
        <g
          ref={gCombinedRef}
          className="custom-node"
          data-testid={`custom-node__${vizNode.id}`}
          data-nodelabel={label}
          data-selected={selected}
          data-disabled={isDisabled}
          data-toolbar-open={shouldShowToolbar}
          data-warning={doesHaveWarnings}
          onClick={onSelect}
          onContextMenu={onContextMenu}
        >
          <foreignObject data-nodelabel={label} width={box.width} height={box.height} ref={dndDropRef}>
            <div
              data-testid={`${vizNode.id}`}
              className={clsx('custom-node__container', {
                'custom-node__container__dropTarget': dndDropProps.canDrop && dndDropProps.hover,
                'custom-node__container__possibleDropTargets':
                  dndDropProps.canDrop && dndDropProps.droppable && !dndDropProps.hover,
                'custom-node__container__draggable': dndSettingsEnabled && canDragNode,
                'custom-node__container__nonDraggable': dndSettingsEnabled && !canDragNode,
                'custom-node__container__draggedNode': isDraggingNode,
              })}
            >
              <div title={tooltipContent} className="custom-node__container__image">
                <IconResolver alt={tooltipContent} catalogKind={vizNode.data.catalogKind} name={vizNode.data.name} />

                {childCount > 0 && (
                  <FloatingCircle className="step-icon step-icon__processor">
                    <span title={`${childCount}`}>{childCount}</span>
                  </FloatingCircle>
                )}
                {ProcessorIcon && (
                  <FloatingCircle className="step-icon step-icon__processor">
                    <Icon status="info" size="lg">
                      <ProcessorIcon title={processorDescription} />
                    </Icon>
                  </FloatingCircle>
                )}
                {isDisabled && (
                  <FloatingCircle className="step-icon step-icon__disabled">
                    <Icon status="danger" size="lg">
                      <BanIcon />
                    </Icon>
                  </FloatingCircle>
                )}
              </div>
            </div>
          </foreignObject>

          {!isDraggingNode && (
            <foreignObject
              x={labelX}
              y={box.height - 1}
              width={CanvasDefaults.DEFAULT_LABEL_WIDTH}
              height={CanvasDefaults.DEFAULT_LABEL_HEIGHT}
              className="custom-node__label"
            >
              <div
                className={clsx('custom-node__label__text', {
                  'custom-node__label__text__error': doesHaveWarnings,
                })}
              >
                {doesHaveWarnings && (
                  <Icon status="danger" title={validationText} data-warning={doesHaveWarnings}>
                    <ExclamationCircleIcon />
                  </Icon>
                )}
                <span title={label}>{label}</span>
              </div>
            </foreignObject>
          )}

          {!dndDropProps.droppable && shouldShowToolbar && (
            <Layer id={TOP_LAYER}>
              <foreignObject
                ref={toolbarHoverRef}
                className="custom-node__toolbar"
                x={toolbarX}
                y={toolbarY}
                width={toolbarWidth}
                height={CanvasDefaults.STEP_TOOLBAR_HEIGHT}
              >
                <StepToolbar
                  data-testid="step-toolbar"
                  vizNode={vizNode}
                  isCollapsed={element.isCollapsed()}
                  onCollapseToggle={onCollapseToggle}
                />
              </foreignObject>
            </Layer>
          )}

          {!dndDropProps.droppable && shouldShowAddStep && (
            <foreignObject
              x={box.width - 8}
              y={(box.height - CanvasDefaults.ADD_STEP_ICON_SIZE) / 2}
              width={CanvasDefaults.ADD_STEP_ICON_SIZE}
              height={CanvasDefaults.ADD_STEP_ICON_SIZE}
            >
              <AddStepIcon
                vizNode={vizNode}
                mode={AddStepMode.AppendStep}
                title="Add step"
                data-testid="quick-append-step"
              >
                <Icon size="lg">{isHorizontal ? <ArrowRightIcon /> : <ArrowDownIcon />}</Icon>
              </AddStepIcon>
            </foreignObject>
          )}
        </g>
      </Layer>
    );
  },
);

const CustomNode: FunctionComponent<CustomNodeProps> = ({ element, ...rest }: CustomNodeProps) => {
  if (!isNode(element)) {
    throw new Error('CustomNode must be used only on Node elements');
  }
  return <CustomNodeInner element={element} {...rest} />;
};

export const CustomNodeObserver = observer(CustomNode);

export const CustomNodeWithSelection = withSelection()(withContextMenu(NodeContextMenuFn)(CustomNode));
