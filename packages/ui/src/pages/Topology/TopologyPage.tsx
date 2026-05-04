import './TopologyPage.scss';

import { FunctionComponent, useContext } from 'react';

import { Visualization } from '../../components/Visualization/Visualization';
import { EntitiesContext } from '../../providers/entities.provider';

export const TopologyPage: FunctionComponent = () => {
  const entitiesContext = useContext(EntitiesContext);
  const visualEntities = entitiesContext?.visualEntities ?? [];

  return <Visualization className="canvas-page" entities={visualEntities} isTopologyView />;
};
