import { WARRIOR } from './warrior';
import { MAGE } from './mage';
import { ARCHER } from './archer';

export const CLASSES = {
  WARRIOR,
  MAGE,
  ARCHER,
};

// Helper functions
export const getAvailableClasses = () => Object.keys(CLASSES);
export const getClassDetails = (className) => CLASSES[className];
export const getClassSorts = (className) => CLASSES[className]?.sorts || {};
export const getSortDetails = (className, sortName) => CLASSES[className]?.sorts[sortName];
export const isValidClass = (className) => className in CLASSES;
export const isValidSort = (className, sortName) => sortName in (CLASSES[className]?.sorts || {});
