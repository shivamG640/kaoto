import { SuggestionRegistryProvider } from '@kaoto/forms';
import { ChannelType, StateControlCommand } from '@kie-tools-core/editor/dist/api';
import { Notification } from '@kie-tools-core/notifications/dist/api';
import { VisualizationProvider } from '@patternfly/react-topology';
import { FunctionComponent, PropsWithChildren, useEffect, useMemo } from 'react';
import { NodeInteractionAddonProvider } from '../../components/registers/interactions/node-interaction-addon.provider';
import { RegisterComponents } from '../../components/registers/RegisterComponents';
import { RegisterNodeInteractionAddons } from '../../components/registers/RegisterNodeInteractionAddons';
import { RenderingProvider } from '../../components/RenderingAnchor/rendering.provider';
import { ControllerService } from '../../components/Visualization/Canvas/controller.service';
import { CatalogTilesProvider, IMetadataApi, MetadataProvider, VisibleFlowsProvider } from '../../providers';

interface KaotoBridgeProps {
  /**
   * Delegation for KogitoEditorChannelApi.kogitoEditor_ready() to signal to the Channel
   * that the editor is ready.
   */
  onReady: () => void;

  /**
   * Delegation for KogitoEditorChannelApi.kogitoEditor_stateControlCommandUpdate(command) to signal to the Channel
   * that the editor is performing an undo/redo operation.
   */
  onStateControlCommandUpdate: (command: StateControlCommand) => void;

  /**
   * Delegation for NotificationsChannelApi.kogigotNotifications_setNotifications(path, notifications) to report all validation
   * notifications to the Channel that will replace existing notification for the path.
   * @param path The path that references the Notification
   * @param notifications List of Notifications
   */
  setNotifications: (path: string, notifications: Notification[]) => void;

  /**
   * Get metadata querying a Kaoto metadata file using the channel API.
   * @param key The key to retrieve the metadata from the Kaoto metadata file
   */
  getMetadata<T>(key: string): Promise<T | undefined>;

  /**
   * Save metadata to a Kaoto metadata file using the channel API.
   * @param key The key to set the metadata
   * @param metadata The metadata to be saved
   */
  setMetadata<T>(key: string, metadata: T): Promise<void>;

  /**
   * Retrieve resource content using the channel API.
   * @param path The path of the resource
   */
  getResourceContent(path: string): Promise<string | undefined>;

  /**
   * Save resource content using the channel API.
   * @param path The path of the resource
   * @param content The content to be saved
   */
  saveResourceContent(path: string, content: string): Promise<void>;

  /**
   * Delete resource using the channel API.
   * @param path The path of the resource
   */
  deleteResource(path: string): Promise<boolean>;

  /**
   * Show a Quick Pick widget and ask the user to select one or more files available in the workspace.
   * @param include The filter expression for the files to include
   * @param exclude The filter expression for the files to exclude
   * @param options The options to pass over to VSCode QuickPick
   */
  askUserForFileSelection(
    include: string,
    exclude?: string,
    options?: Record<string, unknown>,
  ): Promise<string[] | string | undefined>;

  /**
   * ChannelType where the component is running.
   */
  channelType: ChannelType;
}

export const KaotoBridge: FunctionComponent<PropsWithChildren<KaotoBridgeProps>> = ({
  onReady,
  children,
  getMetadata,
  setMetadata,
  getResourceContent,
  saveResourceContent,
  deleteResource,
  askUserForFileSelection,
}) => {
  const controller = useMemo(() => ControllerService.createController(), []);
  const metadataApi: IMetadataApi = useMemo(
    () => ({
      getMetadata,
      setMetadata,
      getResourceContent,
      saveResourceContent,
      deleteResource,
      askUserForFileSelection,
      shouldSaveSchema: false,
    }),
    [getMetadata, setMetadata, getResourceContent, saveResourceContent, deleteResource, askUserForFileSelection],
  );

  /** Set editor as Ready */
  useEffect(() => {
    onReady();
  }, [onReady]);

  return (
    <CatalogTilesProvider>
      <VisualizationProvider controller={controller}>
        <VisibleFlowsProvider>
          <RenderingProvider>
            <MetadataProvider api={metadataApi}>
              <RegisterComponents>
                <NodeInteractionAddonProvider>
                  <RegisterNodeInteractionAddons>
                    <SuggestionRegistryProvider>{children}</SuggestionRegistryProvider>
                  </RegisterNodeInteractionAddons>
                </NodeInteractionAddonProvider>
              </RegisterComponents>
            </MetadataProvider>
          </RenderingProvider>
        </VisibleFlowsProvider>
      </VisualizationProvider>
    </CatalogTilesProvider>
  );
};
