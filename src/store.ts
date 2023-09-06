import {JSONArray, JSONObject, JSONPrimitive, JSONValue} from "./json-types";

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

const restrictions = new Map<any, Record<string, Permission>>

export function Restrict(permission?: Permission): any {
  return function RestrictDecoratorFactory(target: any, propertyKey: string) {
    // support manual passing of an instance instead of a prototype (default TS behavior)
    if (target.hasOwnProperty(propertyKey)) {
      target = Object.getPrototypeOf(target);
    }

    let newPermission = {...restrictions.get(target)};

    if (permission) {
      newPermission[propertyKey] = permission;
    }
    else {
      // no permission passed, force remove to eventually use defaultPolicy
      delete newPermission[propertyKey]
    }

    restrictions.set(target, newPermission);
  }
}

export class Store implements IStore {

  defaultPolicy: Permission = "rw";

  private readPermission(key: string) {
    if (key == 'defaultPolicy') {
      return 'none';
    }

    type Value<M> = M extends Map<any, infer V> ? V : never;
    let map: Value<typeof restrictions>
    let proto: any = this;

    do {
      proto = Object.getPrototypeOf(proto);
      map = restrictions.get(proto)!;
    } while (!map && proto != Object.prototype)

    return map?.[key] || this.defaultPolicy;
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

      if (typeof nested == 'function') {
        nested = nested();
      }
      if (nested instanceof Store) {
        return nested.readPathAt(path, index);
      }
    }

    return (index == maxIndex) ? nested : undefined;
  }

  write(path: string, value: StoreValue): StoreValue {
    const pathArr = path.split(':');
    return this.writePathAt(pathArr, value);
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

    return this;
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
