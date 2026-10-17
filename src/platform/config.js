export const PLATFORM = process.env.REACT_APP_PLATFORM === '1';
export const storageKey = key => PLATFORM ? `arena-forge:${key}` : key;
