/** Browser storage is optional: denied access or a full quota must not break the UI. */
export const readStoredValue = (key: string): string | null => {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

export const writeStoredValue = (key: string, value: string): boolean => {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const removeStoredValue = (key: string): boolean => {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};
