import { getRedis } from "@/plugins/redis/redis.plugin";
import { logger } from "./logger";

function toPath(p: string) {
    return p.split('.').filter(Boolean);
}

function getByPath(obj: any, path: string) {
    return toPath(path).reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function setByPath(obj: any, path: string, value: any) {
    const parts = toPath(path);
    let cur = obj;
    for (let i = 0; i < parts.length; i++) {
        const k = parts[i];
        const last = i === parts.length - 1;
        if (last) {
            cur[k] = value;
        } else {
            if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
            cur = cur[k];
        }
    }
}

function ensureArrayAtPath(obj: any, path: string) {
    const parts = toPath(path);
    let cur = obj;
    for (let i = 0; i < parts.length; i++) {
        const k = parts[i];
        const last = i === parts.length - 1;
        if (last) {
            if (!Array.isArray(cur[k])) cur[k] = [];
            return cur[k] as any[];
        } else {
            if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
            cur = cur[k];
        }
    }
    return [];
}


type ArrayFilters = Array<Record<string, any>>;

function parsePathWithFilters(path: string) {
    // Splits path and marks filter parts
    return path.split('.').filter(Boolean).map(part => {
        const m = part.match(/^\$\[(\w+)\]$/);
        if (m) return { filter: m[1] };
        return { key: part };
    });
}

function matchFilter(obj: any, filter: Record<string, any>): boolean {
    // Only supports equality for simplicity
    return Object.entries(filter).every(([k, v]) => obj[k] === v);
}

function setByPathWithFilters(obj: any, path: string, value: any, arrayFilters?: ArrayFilters) {
    const parts = parsePathWithFilters(path);
    function helper(cur: any, idx: number) {
        if (idx >= parts.length) return;
        const part: any = parts[idx];
        const last = idx === parts.length - 1;
        if ('key' in part) {
            if (last) {
                cur[part.key] = value;
            } else {
                if (cur[part.key] == null || typeof cur[part.key] !== 'object') cur[part.key] = {};
                helper(cur[part.key], idx + 1);
            }
        } else if ('filter' in part) {
            // Find filter spec
            const filterSpec = arrayFilters?.find(f => Object.keys(f)[0] === part.filter);
            if (!Array.isArray(cur)) return;
            for (const elem of cur) {
                if (!filterSpec || matchFilter(elem, filterSpec[part.filter])) {
                    helper(elem, idx + 1);
                }
            }
        }
    }
    helper(obj, 0);
}

function incByPathWithFilters(obj: any, path: string, by: number, arrayFilters?: ArrayFilters) {
    const parts = parsePathWithFilters(path);
    function helper(cur: any, idx: number) {
        if (idx >= parts.length) return;
        const part: any = parts[idx];
        const last = idx === parts.length - 1;
        if ('key' in part) {
            if (last) {
                cur[part.key] = Number(cur[part.key] ?? 0) + by;
            } else {
                if (cur[part.key] == null || typeof cur[part.key] !== 'object') cur[part.key] = {};
                helper(cur[part.key], idx + 1);
            }
        } else if ('filter' in part) {
            const filterSpec = arrayFilters?.find(f => Object.keys(f)[0] === part.filter);
            if (!Array.isArray(cur)) return;
            for (const elem of cur) {
                if (!filterSpec || matchFilter(elem, filterSpec[part.filter])) {
                    helper(elem, idx + 1);
                }
            }
        }
    }
    helper(obj, 0);
}

export function applyMongoLikeUpdate<T extends Record<string, any>>(
    doc: T,
    update: Record<string, any>,
    options?: { arrayFilters?: ArrayFilters }
): T {
    const isObj = (v: any) => v && typeof v === 'object' && !Array.isArray(v);

    // Normalize: non-$ keys are treated as $set
    const normalized: Record<string, any> = { $set: {} };
    for (const k of Object.keys(update)) {
        if (k.startsWith('$')) normalized[k] = update[k];
        else normalized.$set[k] = update[k];
    }

    // $set
    if (isObj(normalized.$set)) {
        for (const path of Object.keys(normalized.$set)) {
            if (path.includes('$[')) {
                setByPathWithFilters(doc, path, normalized.$set[path], options?.arrayFilters);
            } else {
                setByPath(doc, path, normalized.$set[path]);
            }
        }
    }

    // $inc
    if (isObj(normalized.$inc)) {
        for (const path of Object.keys(normalized.$inc)) {
            const by = Number(normalized.$inc[path] ?? 0);
            if (path.includes('$[')) {
                incByPathWithFilters(doc, path, by, options?.arrayFilters);
            } else {
                const cur = Number(getByPath(doc, path) ?? 0);
                setByPath(doc, path, cur + by);
            }
        }
    }

    // $push (no array filter support, keep as before)
    if (isObj(normalized.$push)) {
        for (const path of Object.keys(normalized.$push)) {
            const spec = normalized.$push[path];
            const arr = ensureArrayAtPath(doc, path);

            if (isObj(spec) && Array.isArray(spec.$each)) {
                arr.push(...spec.$each);
            } else if (Array.isArray(spec)) {
                arr.push(...spec);
            } else {
                arr.push(spec);
            }
        }
    }

    // $addToSet
    if (isObj(normalized.$addToSet)) {
        for (const path of Object.keys(normalized.$addToSet)) {
            const spec = normalized.$addToSet[path];
            const arr = ensureArrayAtPath(doc, path);

            if (isObj(spec) && Array.isArray(spec.$each)) {
                for (const item of spec.$each) {
                    if (!arr.some(existing => JSON.stringify(existing) === JSON.stringify(item))) {
                        arr.push(item);
                    }
                }
            } else if (Array.isArray(spec)) {
                for (const item of spec) {
                    if (!arr.some(existing => JSON.stringify(existing) === JSON.stringify(item))) {
                        arr.push(item);
                    }
                }
            } else {
                if (!arr.some(existing => JSON.stringify(existing) === JSON.stringify(spec))) {
                    arr.push(spec);
                }
            }
        }
    }

    return doc;
}

export async function applyRedisJsonUpdate(
    redisKey: string,
    update: Record<string, any>
): Promise<boolean> {
    try {
        const redis = await getRedis();
        if (!redis) {
            console.log('Redis connection not available');
            return false;
        }
        if (redisKey.includes("*")) {
            let cursor = "0";
            const keysList: any[] = [];

            do {
                const result = await redis.scan(cursor, { MATCH: redisKey, COUNT: 100 });
                cursor = result.cursor;
                keysList.push(...result.keys);

            } while (cursor !== '0');
            redisKey = keysList?.[0] || redisKey;
        }
        const exists = await redis.exists(redisKey);
        if (exists === 0 && !redisKey.startsWith("booking:")) {
            await redis.json.set(redisKey, '$', {});
        }
        const isObj = (v: any) => v && typeof v === 'object' && !Array.isArray(v);
        // Normalize: non-$ keys are treated as $set
        const normalized: Record<string, any> = { $set: {} };
        for (const k of Object.keys(update)) {
            if (k.startsWith('$')) normalized[k] = update[k];
            else normalized.$set[k] = update[k];
        }
        // $set operations
        if (isObj(normalized.$set)) {
            for (const [path, value] of Object.entries(normalized.$set)) {
                // Handle MongoDB array filter syntax $[elem]
                if (path.includes('$[') && path.includes(']')) {
                    // For Redis JSON, we need to update all array elements
                    // Extract the base path before the array filter
                    const basePath = path.split('.$[')[0];
                    const fieldAfterFilter = path.split('].')[1];

                    try {
                        // Get the array to update
                        const arrayPath = basePath === '' ? '$' : `$.${basePath}`;
                        const currentArray = await redis.json.get(redisKey, { path: arrayPath });

                        if (Array.isArray(currentArray)) {
                            // Update each element in the array
                            for (let i = 0; i < currentArray.length; i++) {
                                const elementPath = `${arrayPath}[${i}].${fieldAfterFilter}`;
                                await redis.json.set(redisKey, elementPath, value as any);
                            }
                        }
                    } catch (error) {
                        console.log(`Could not update array path ${path}:`, error);
                    }
                } else {
                    const jsonPath = path === '' ? '$' : `$.${path}`;
                    await redis.json.set(redisKey, jsonPath, value as any);
                }
            }
        }
        // $inc operations
        if (isObj(normalized.$inc)) {
            for (const [path, incrementValue] of Object.entries(normalized.$inc)) {
                const jsonPath = path === '' ? '$' : `$.${path}`;
                try {
                    // Try to increment if the path exists
                    await redis.json.numIncrBy(redisKey, jsonPath, Number(incrementValue || 0));
                } catch (error) {
                    // If path doesn't exist, set it to the increment value
                    await redis.json.set(redisKey, jsonPath, Number(incrementValue || 0));
                }
            }
        }
        // $push operations
        if (isObj(normalized.$push)) {
            for (const [path, spec] of Object.entries(normalized.$push)) {
                const jsonPath = path === '' ? '$' : `$.${path}`;

                // Ensure the path exists as an array
                try {
                    await redis.json.get(redisKey, { path: jsonPath });
                } catch (error) {
                    // Path doesn't exist, create empty array
                    await redis.json.set(redisKey, jsonPath, []);
                }

                if (isObj(spec) && Array.isArray((spec as any).$each)) {
                    // Push each item individually
                    for (const item of (spec as any).$each) {
                        await redis.json.arrAppend(redisKey, jsonPath, item as any);
                    }
                } else if (Array.isArray(spec)) {
                    // Push each item in the array
                    for (const item of spec) {
                        await redis.json.arrAppend(redisKey, jsonPath, item as any);
                    }
                } else {
                    // Push single item
                    await redis.json.arrAppend(redisKey, jsonPath, spec as any);
                }
            }
        }
        // $addToSet operations
        if (isObj(normalized.$addToSet)) {
            for (const [path, spec] of Object.entries(normalized.$addToSet)) {
                const jsonPath = path === '' ? '$' : `$.${path}`;

                // Ensure the path exists as an array
                try {
                    await redis.json.get(redisKey, { path: jsonPath });
                } catch (error) {
                    // Path doesn't exist, create empty array
                    await redis.json.set(redisKey, jsonPath, []);
                }

                // Get current array to check for duplicates
                const currentArray = await redis.json.get(redisKey, { path: jsonPath }) || [];

                const itemsToAdd = [];
                if (isObj(spec) && Array.isArray((spec as any).$each)) {
                    itemsToAdd.push(...(spec as any).$each);
                } else if (Array.isArray(spec)) {
                    itemsToAdd.push(...spec);
                } else {
                    itemsToAdd.push(spec);
                }

                // Add only unique items
                for (const item of itemsToAdd) {
                    const itemExists = Array.isArray(currentArray) &&
                        currentArray.some((existing: any) =>
                            JSON.stringify(existing) === JSON.stringify(item)
                        );

                    if (!itemExists) {
                        await redis.json.arrAppend(redisKey, jsonPath, item as any);
                    }
                }
            }
        }
        // $pull operations
        if (isObj(normalized.$pull)) {
            for (const [path, condition] of Object.entries(normalized.$pull)) {
                const jsonPath = path === '' ? '$' : `$.${path}`;

                try {
                    const currentArray = await redis.json.get(redisKey, { path: jsonPath });
                    if (Array.isArray(currentArray)) {
                        // Filter out items that match the condition
                        const filteredArray = currentArray.filter((item: any) => {
                            if (isObj(condition)) {
                                // Complex condition matching
                                return !MongooseFilter.matches(item, condition as Record<string, any>);
                            } else {
                                // Simple value matching
                                return JSON.stringify(item) !== JSON.stringify(condition);
                            }
                        });

                        // Replace the entire array
                        await redis.json.set(redisKey, jsonPath, filteredArray);
                    }
                } catch (error) {
                    console.log(`Path ${jsonPath} does not exist or is not an array`);
                }
            }
        }
        // $unset operations
        if (isObj(normalized.$unset)) {
            for (const path of Object.keys(normalized.$unset)) {
                const jsonPath = path === '' ? '$' : `$.${path}`;
                try {
                    await redis.json.del(redisKey, { path: jsonPath });
                } catch (error) {
                    console.log(`Path ${jsonPath} does not exist`);
                }
            }
        }
        return true;
    } catch (e: any) {
        // logger.error({ error: e, msg: e.message });
        return false;
    }
}

export async function updateRedisJson(
    redisKey: string,
    update: Record<string, any>
): Promise<boolean> {
    return await applyRedisJsonUpdate(redisKey, update);
}

export class MongooseFilter {
    private static normalize(value: any): any {
        if (typeof value === "string") {
            if (value === "true") return true;
            if (value === "false") return false;
            const num = Number(value);
            if (!Number.isNaN(num) && String(num) === value) return num;
        }
        return value;
    }

    private static isPlainObject(value: any): boolean {
        return value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof RegExp);
    }

    private static getValueByPath(obj: any, path: string): any {
        return path.split(".").reduce((acc: any, key: string) =>
            (acc && acc[key] !== undefined ? acc[key] : undefined), obj
        );
    }

    private static evaluateOperators(rawValue: any, operators: Record<string, any>): boolean {
        const value = this.normalize(rawValue);

        for (const [operator, rawOpValue] of Object.entries(operators)) {
            const opValue = this.normalize(rawOpValue);

            switch (operator) {
                case "$gt":
                    if (!(value > opValue)) return false;
                    break;
                case "$gte":
                    if (!(value >= opValue)) return false;
                    break;
                case "$lt":
                    if (!(value < opValue)) return false;
                    break;
                case "$lte":
                    if (!(value <= opValue)) return false;
                    break;
                case "$eq":
                    if (value !== opValue) return false;
                    break;
                case "$ne":
                    if (value === opValue) return false;
                    break;
                case "$in":
                    if (!Array.isArray(opValue) || !opValue.map(this.normalize.bind(this)).includes(value)) return false;
                    break;
                case "$nin":
                    if (Array.isArray(opValue) && opValue.map(this.normalize.bind(this)).includes(value)) return false;
                    break;
                case "$exists":
                    if (opValue === true && rawValue === undefined) return false;
                    if (opValue === false && rawValue !== undefined) return false;
                    break;
                case "$regex":
                    try {
                        const regex = rawOpValue instanceof RegExp ? rawOpValue : new RegExp(String(rawOpValue));
                        if (typeof rawValue !== "string" || !regex.test(rawValue)) return false;
                    } catch {
                        return false;
                    }
                    break;
                case "$size":
                    if (!Array.isArray(rawValue) || rawValue.length !== opValue) return false;
                    break;
                case "$elemMatch":
                    if (!Array.isArray(rawValue)) return false;
                    if (!rawValue.some(elem => this.matchesFilter(elem, opValue))) return false;
                    break;
                case "$all":
                    if (!Array.isArray(rawValue) || !Array.isArray(opValue)) return false;
                    if (!opValue.every(item => rawValue.some(elem => this.normalize(elem) === this.normalize(item)))) return false;
                    break;
                case "$mod":
                    if (!Array.isArray(opValue) || opValue.length !== 2) return false;
                    if (typeof value !== "number" || value % opValue[0] !== opValue[1]) return false;
                    break;
                default:
                    // Unknown operator - fail safe
                    return false;
            }
        }
        return true;
    }

    private static matchesFilter(item: any, filter: Record<string, any>): boolean {
        if (!filter || Object.keys(filter).length === 0) return true;

        // Handle logical operators
        if (filter.$or && Array.isArray(filter.$or)) {
            const orResult = filter.$or.some((condition: Record<string, any>) =>
                this.matchesFilter(item, condition)
            );
            if (!orResult) return false;
        }

        if (filter.$and && Array.isArray(filter.$and)) {
            const andResult = filter.$and.every((condition: Record<string, any>) =>
                this.matchesFilter(item, condition)
            );
            if (!andResult) return false;
        }

        if (filter.$nor && Array.isArray(filter.$nor)) {
            const norResult = !filter.$nor.some((condition: Record<string, any>) =>
                this.matchesFilter(item, condition)
            );
            if (!norResult) return false;
        }

        if (filter.$not && this.isPlainObject(filter.$not)) {
            const notResult = !this.matchesFilter(item, filter.$not);
            if (!notResult) return false;
        }

        // Handle field-level filters (excluding logical operators)
        const fieldFilters = { ...filter };
        delete fieldFilters.$or;
        delete fieldFilters.$and;
        delete fieldFilters.$nor;
        delete fieldFilters.$not;

        for (const [fieldPath, filterValue] of Object.entries(fieldFilters)) {
            const itemValue = fieldPath.includes(".") ?
                this.getValueByPath(item, fieldPath) : item?.[fieldPath];

            if (this.isPlainObject(filterValue) && Object.keys(filterValue).some(k => k.startsWith("$"))) {
                // Operator-style filter
                if (!this.evaluateOperators(itemValue, filterValue)) return false;
            } else if (this.isPlainObject(filterValue)) {
                // Nested object filter
                if (!this.matchesFilter(itemValue || {}, filterValue)) return false;
            } else if (Array.isArray(filterValue)) {
                // Array means "in" semantics
                const normalizedItem = this.normalize(itemValue);
                const normalizedFilterArray = filterValue.map(this.normalize.bind(this));
                if (!normalizedFilterArray.includes(normalizedItem)) return false;
            } else {
                // Direct equality comparison
                const normalizedItem = this.normalize(itemValue);
                const normalizedFilter = this.normalize(filterValue);
                if (normalizedItem !== normalizedFilter) return false;
            }
        }

        return true;
    }

    /**
     * Public method to filter an array of items using mongoose-style filters
     */
    public static filter<T = any>(items: T[], filters: Record<string, any>): T[] {
        if (!filters || Object.keys(filters).length === 0) return items;
        return items.filter(item => this.matchesFilter(item, filters));
    }

    /**
     * Public method to check if a single item matches the filters
     */
    public static matches<T = any>(item: T, filters: Record<string, any>): boolean {
        return this.matchesFilter(item, filters);
    }
}


// function getByPath(obj: any, path: string) {
//     return path.split(".").reduce((acc, key) => (acc ? acc[key] : undefined), obj);
// }

// function setByPath(obj: any, path: string, value: any) {
//     const keys = path.split(".");
//     let current = obj;

//     for (let i = 0; i < keys.length - 1; i++) {
//         const key = keys[i];
//         if (typeof current[key] !== "object" || current[key] === null) {
//             current[key] = {}; // create nested object if missing
//         }
//         current = current[key];
//     }

//     current[keys[keys.length - 1]] = value;
// }
