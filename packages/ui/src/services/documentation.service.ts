import { toBlob } from 'html-to-image';
import JSZip from 'jszip';
import { MarkdownEntry, TableRow, tsMarkdown } from 'ts-markdown';
import {
  BaseVisualCamelEntity,
  CamelRouteVisualEntity,
  KameletBindingVisualEntity,
  KameletVisualEntity,
  PipeVisualEntity,
} from '../models';
import { CamelResource } from '../models/camel';
import { BaseCamelEntity } from '../models/camel/entities';
import { DocumentationEntity, ParsedTable } from '../models/documentation';
import { CamelErrorHandlerVisualEntity } from '../models/visualization/flows/camel-error-handler-visual-entity';
import { CamelInterceptFromVisualEntity } from '../models/visualization/flows/camel-intercept-from-visual-entity';
import { CamelInterceptSendToEndpointVisualEntity } from '../models/visualization/flows/camel-intercept-send-to-endpoint-visual-entity';
import { CamelInterceptVisualEntity } from '../models/visualization/flows/camel-intercept-visual-entity';
import { CamelOnCompletionVisualEntity } from '../models/visualization/flows/camel-on-completion-visual-entity';
import { CamelOnExceptionVisualEntity } from '../models/visualization/flows/camel-on-exception-visual-entity';
import { CamelRestConfigurationVisualEntity } from '../models/visualization/flows/camel-rest-configuration-visual-entity';
import { CamelRestVisualEntity } from '../models/visualization/flows/camel-rest-visual-entity';
import { CamelRouteConfigurationVisualEntity } from '../models/visualization/flows/camel-route-configuration-visual-entity';
import { BeansEntity, MetadataEntity } from '../models/visualization/metadata';
import { PipeErrorHandlerEntity } from '../models/visualization/metadata/pipeErrorHandlerEntity';
import { RouteTemplateBeansEntity } from '../models/visualization/metadata/routeTemplateBeansEntity';
import { IVisibleFlows } from '../utils';
import { BeansParser } from './parsers/beans-parser';
import { KameletParser } from './parsers/kamelet-parser';
import { MiscParser } from './parsers/misc-parser';
import { PipeParser } from './parsers/pipe-parser';
import { RestParser } from './parsers/rest-parser';
import { RouteParser } from './parsers/route-parser';

export class DocumentationService {
  static generateDocumentationZip(flowImage: Blob, markdownText: string, fileNameBase: string): Promise<Blob> {
    const imageFileName = fileNameBase + '.png';
    const markdownFileName = fileNameBase + '.md';
    const jszip = new JSZip();
    jszip.file(imageFileName, flowImage);
    jszip.file(markdownFileName, markdownText);
    return jszip.generateAsync({ type: 'blob' });
  }

  static generateFlowImage(isDark?: boolean): Promise<Blob | null> {
    const element = document.querySelector<HTMLElement>('.pf-topology-container') ?? undefined;
    if (!element) {
      return Promise.reject(new Error('generateFlowImage called but the flow diagram is not found'));
    }

    return toBlob(element, {
      cacheBust: true,
      backgroundColor: isDark ? '#0f1214' : '#f0f0f0',
      filter: (element) => {
        /**  Filter @patternfly/react-topology controls */
        return !element?.classList?.contains('pf-v6-c-toolbar__group');
      },
    });
  }

  static generateMarkdown(documentationEntities: DocumentationEntity[], flowImageFileName: string) {
    const markdown: MarkdownEntry[] = [{ h1: 'Diagram' }, { img: { alt: 'Diagram', source: flowImageFileName } }];

    documentationEntities.forEach((entity) => {
      const parsedTables = DocumentationService.parseEntity(entity);
      parsedTables &&
        (Array.isArray(parsedTables) ? parsedTables : [parsedTables]).forEach((table) =>
          DocumentationService.populateParsedTable(markdown, table),
        );
    });
    return tsMarkdown(markdown);
  }

  private static populateParsedTable(markdown: MarkdownEntry[], parsedTable: ParsedTable) {
    const title: Record<string, string> = {};
    title[parsedTable.headingLevel] = parsedTable.title;
    markdown.push(title);
    parsedTable.description && markdown.push({ text: parsedTable.description });

    const rows: TableRow[] = parsedTable.data.reduce((acc, rowData) => {
      const row: TableRow = {};
      for (let colIndex = 0; colIndex < parsedTable.headers.length; colIndex++) {
        row[parsedTable.headers[colIndex]] = DocumentationService.escapeValue(rowData[colIndex]);
      }
      acc.push(row);
      return acc;
    }, [] as TableRow[]);

    rows.length > 0 &&
      markdown.push(
        {
          table: {
            columns: parsedTable.headers,
            rows: rows,
          },
        },
        {},
      );
  }

  private static escapeValue(value: string | number): string {
    if (!value || typeof value !== 'string') return value as string;
    return value.replace(/{(\r\n)|\r|\n/g, '&#10;');
  }

  private static parseEntity(documentationEntity: DocumentationEntity): ParsedTable[] | ParsedTable | undefined {
    if (!documentationEntity.isVisible || !documentationEntity.entity) return;

    const entity = documentationEntity.entity;
    if (entity instanceof CamelRestConfigurationVisualEntity) {
      return RestParser.parseRestConfigurationEntity(entity);
    } else if (entity instanceof CamelRestVisualEntity) {
      return RestParser.parseRestEntity(entity);
    } else if (entity instanceof CamelRouteConfigurationVisualEntity) {
      return RouteParser.parseRouteConfigurationEntity(entity);
    } else if (entity instanceof CamelRouteVisualEntity) {
      return RouteParser.parseRouteEntity(entity);
    } else if (entity instanceof CamelErrorHandlerVisualEntity) {
      return RouteParser.parseErrorHandlerEntity(entity);
    } else if (entity instanceof CamelInterceptVisualEntity) {
      return RouteParser.parseInterceptEntity(entity);
    } else if (entity instanceof CamelInterceptFromVisualEntity) {
      return RouteParser.parseInterceptFromEntity(entity);
    } else if (entity instanceof CamelInterceptSendToEndpointVisualEntity) {
      return RouteParser.parseInterceptSendToEndpointEntity(entity);
    } else if (entity instanceof CamelOnCompletionVisualEntity) {
      return RouteParser.parseOnCompletionEntity(entity);
    } else if (entity instanceof CamelOnExceptionVisualEntity) {
      return RouteParser.parseOnExceptionEntity(entity);
    } else if (entity instanceof KameletVisualEntity) {
      return KameletParser.parseKameletEntity(entity);
    } else if (entity instanceof PipeVisualEntity) {
      return PipeParser.parsePipeEntity(entity);
    } else if (entity instanceof KameletBindingVisualEntity) {
      return PipeParser.parseKameletBindingEntity(entity);
    } else if (entity instanceof BeansEntity || entity instanceof RouteTemplateBeansEntity) {
      return BeansParser.parseBeansEntity(entity, documentationEntity.label);
    } else if (entity instanceof MetadataEntity) {
      return MiscParser.parseMetadataEntity(entity, documentationEntity.label);
    } else if (entity instanceof PipeErrorHandlerEntity) {
      return PipeParser.parsePipeErrorHandlerEntity(entity, documentationEntity.label);
    }
    return ParsedTable.unsupported(entity);
  }

  static getDocumentationEntities(camelResource: CamelResource, visibleFlows: IVisibleFlows): DocumentationEntity[] {
    const visualEntities = camelResource.getVisualEntities();
    const visualDocEntities = visualEntities.map((entity) => {
      const entityLabel = DocumentationService.getEntityLabel(entity);
      return new DocumentationEntity({
        entity: entity,
        label: entityLabel,
        isVisualEntity: true,
        isVisible: visibleFlows[entity.id],
      });
    });
    const nonVisualDocEntities = camelResource
      .getEntities()
      .filter((e) => !visualEntities.includes(e as BaseVisualCamelEntity))
      .map((entity) => {
        const entityLabel = DocumentationService.getEntityLabel(entity);
        return new DocumentationEntity({
          entity: entity,
          label: entityLabel,
          isVisualEntity: false,
          isVisible: true,
        });
      });
    return [...visualDocEntities, ...nonVisualDocEntities];
  }

  private static getEntityLabel(entity: BaseCamelEntity) {
    if (entity instanceof BeansEntity || entity instanceof RouteTemplateBeansEntity) return 'Beans';
    if (
      entity instanceof KameletVisualEntity ||
      entity instanceof PipeVisualEntity ||
      entity instanceof KameletBindingVisualEntity
    )
      return 'Steps';
    if (entity instanceof MetadataEntity) return 'Metadata';
    if (entity instanceof PipeErrorHandlerEntity) return 'Error Handler';
    return entity.id;
  }
}
