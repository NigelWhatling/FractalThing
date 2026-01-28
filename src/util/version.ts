const safeValue = (value: string) =>
  value && value !== 'unknown' ? value : 'unknown';

export const APP_VERSION = safeValue(__APP_VERSION__);
export const APP_COMMIT = safeValue(__APP_COMMIT__);
export const APP_BUILD_TIME = safeValue(__APP_BUILD_TIME__);

export const formatBuildTimestamp = (timestamp: string) => {
  if (!timestamp || timestamp === 'unknown') {
    return 'unknown';
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }
  return date
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' UTC');
};

export const getVersionLabel = () => {
  if (APP_COMMIT === 'unknown') {
    return APP_VERSION;
  }
  return `${APP_VERSION} (${APP_COMMIT})`;
};
