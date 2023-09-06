import { Permission } from "./store";

/** permissions by key by owner **/
const permissions = new Map<any, Record<string, Permission>>

export function readPermission(target: any, key: string) {
    type Value<M> = M extends Map<any, infer V> ? V : never;
    let map: Value<typeof permissions>
    let proto: any = target;

    do {
        proto = Object.getPrototypeOf(proto);
        map = permissions.get(proto)!;
    } while (!map && proto != Object.prototype)

    return map?.[key];
}

export function Restrict(permission?: Permission): any {
    return function RestrictDecoratorFactory(target: any, propertyKey: string) {
        // support manual passing of an instance instead of a prototype (default TS behavior)
        if (target.hasOwnProperty(propertyKey)) {
            target = Object.getPrototypeOf(target);
        }

        let newPermission = {...permissions.get(target)};

        if (permission) {
            newPermission[propertyKey] = permission;
        } else {
            // no permission passed, force remove to eventually use defaultPolicy
            delete newPermission[propertyKey]
        }

        permissions.set(target, newPermission);
    }
}
