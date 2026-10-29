// In-memory storage mock used by Jest via moduleNameMapper (mirrors the real
// util's primitive-value contract).
type StorageItemValue = string | number | boolean | null;

const store = new Map<string, string>();

export class Storage {
  async getItem<Fallback extends StorageItemValue>(key: string, fallback: Fallback): Promise<Fallback | null> {
    const raw = store.get(key);
    if (raw === undefined) return fallback;
    try {
      return JSON.parse(raw) as Fallback;
    } catch {
      return fallback;
    }
  }

  async setItem<Value extends StorageItemValue>(key: string, value: Value): Promise<boolean> {
    store.set(key, JSON.stringify(value));
    return true;
  }

  async removeItem(key: string): Promise<boolean> {
    store.delete(key);
    return true;
  }

  async secureGet<Fallback extends StorageItemValue>(key: string, fallback: Fallback): Promise<Fallback | null> {
    return this.getItem(key, fallback);
  }

  async secureSet<Value extends StorageItemValue>(key: string, value: Value): Promise<boolean> {
    return this.setItem(key, value);
  }

  async secureRemove(key: string): Promise<boolean> {
    return this.removeItem(key);
  }
}

export const storage = new Storage();

export function __resetStorage(): void {
  store.clear();
}
