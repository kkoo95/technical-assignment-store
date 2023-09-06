import { JSONArray, JSONObject, JSONPrimitive, JSONValue } from "./json-types";
import { readPermission } from "./restrict";

export type Permission = "r" | "w" | "rw" | "none";

export type StoreResult = Store | JSONPrimitive | undefined;

export type StoreValue =
  | JSONObject
  | JSONArray
  | StoreResult
  | (() => StoreResult);

export interface IStore {
  defaultPolicy: Permission;
  allowedToRead(key: string): boolean;
  allowedToWrite(key: string): boolean;
  read(path: string): StoreResult;
  write(path: string, value: StoreValue): StoreValue;
  writeEntries(entries: JSONObject): void;
  entries(): JSONObject;
}

export class Store implements IStore {

  defaultPolicy: Permission = "rw";

  private readPermission(key: string) {
    if (key == 'defaultPolicy') {
      return 'none';
    }
    return readPermission(this, key) || this.defaultPolicy;
  }

  allowedToRead(key: string): boolean {
    const permission = this.readPermission(key);
    return permission == 'r' || permission == 'rw';
  }

  allowedToWrite(key: string): boolean {
    const permission = this.readPermission(key);
    return permission == 'w' || permission == 'rw';
  }

  read(path: string): StoreResult {
    return this.readPathAt(path.split(':'));
  }

  private readPathAt(path: string[], start: number = 0): StoreResult {
    let nested: any = this;
    let index = start;
    let maxIndex = path.length;

    while (index < maxIndex && nested) {
      const key = path[index++];

      if (!this.allowedToRead(key)) {
        throw new Error('Not allowed');
      }

      nested = nested[key];

      // support provider access
      if (typeof nested == 'function') {
        nested = nested();
      }
      if (nested instanceof Store) {
        return nested.readPathAt(path, index);
      }
    }

    return (index == maxIndex) ? nested : undefined;
  }

  /** mostly wrap 'store' keys off of JSONObject as Store instances. returns a copy of provided JSONObject **/
  private preProcessStoreValue(value: StoreValue): StoreValue {
    if (value && typeof value == 'object' && !Array.isArray(value) && !(value instanceof Store)) {
      let copy: StoreValue = {}

      for (let key in value) {
        let val = value[key];
        if (key === "store") {
          const store = new Store();
          store.writeEntries(this.preProcessStoreValue(val) as JSONObject)
          copy[key] = store as unknown as JSONValue;
        } else if (typeof val === "object" && val !== null) {
          copy[key] = this.preProcessStoreValue(val) as unknown as JSONValue;
        } else {
          copy[key] = val;
        }
      }

      value = copy;
    }
    return value;
  }

  write(path: string, value: StoreValue): StoreValue {
    const pathArr = path.split(':');
    return this.writePathAt(pathArr, this.preProcessStoreValue(value));
  }

  private writePathAt(path: string[], value: StoreValue, start = 0): StoreValue {
    let nested: any = this;
    let index = start - 1;

    while (nested != null && ++index < path.length) {
      let key = path[index];
      let newValue = value;

      if (index != path.length - 1) {
        let nestedValue = nested[key];

        if (typeof nestedValue == 'function') {
          nestedValue = nestedValue();
        }
        if (nestedValue instanceof Store) {
          return nestedValue.writePathAt(path, value, index + 1);
        }

        newValue = typeof nestedValue == 'object' ? nestedValue : {};
      }
      else if (!this.allowedToWrite(key)) {
        throw new Error('Not allowed to write ' + key);
      }

      nested[key] = newValue;
      nested = nested[key];
    }

    return value;
  }

  writeEntries(entries: JSONObject): void {
    return Object.keys(entries).forEach(key => {
      if (this.allowedToWrite(key)) {
        let value = entries[key] as StoreValue;
        const existing = this[key as keyof this] as StoreValue;

        // store cannot be nested in JSONObject
        if (existing instanceof Store) {
          existing.writeEntries(value as JSONObject);
        }
        else {
          Object.assign(this, { [key]: value });
        }
      }
    })
  }

  entries(): JSONObject {
    return Object.keys(this).reduce((acc, key) => {
      if (this.allowedToRead(key)) {
        let value = this[key as keyof this] as JSONObject | Store;
        if (value instanceof Store) {
          value = value.entries();
        }
        acc[key] = value;
      }
      return acc;
    }, {} as JSONObject);
  }
}
