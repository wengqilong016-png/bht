import React from 'react';
import { Location } from '../types';
import DriverCollectionFlow from '../driver/pages/DriverCollectionFlow';

interface CollectionFormProps {
  onRegisterMachine?: (location: Location) => Promise<void>;
}

/**
 * CollectionForm — compatibility wrapper.
 *
 * The original 1600+ line component has been refactored into
 * DriverCollectionFlow and its sub-components. This file now
 * serves as a thin bridge so that existing imports (admin collect view)
 * continue to work without changing their call sites.
 *
 * @see driver/pages/DriverCollectionFlow.tsx
 */
const CollectionForm: React.FC<CollectionFormProps> = ({ onRegisterMachine }) => {
  return <DriverCollectionFlow onRegisterMachine={onRegisterMachine} />;
};

export default CollectionForm;
