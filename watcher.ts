import { walk, WalkOptions } from "https://deno.land/std/fs/mod.ts";

export enum Event {
    Changed,
    Created,
    Removed
}

export interface Change {
    path: string;
    event: Event;
}

export interface WatchOptions extends WalkOptions {
    interval: number;
    files: { [file: string]: number };
}

export const defaultWatchOptions: WatchOptions = {
    interval: 500,
    files: {}
};

export class Watcher implements AsyncIterator<Change[]> {
    public files: { [file: string]: number } = {};
    public target: string;
    public options: WatchOptions;

    constructor(
        target: string,
        options: WatchOptions = defaultWatchOptions
    ) {
        this.target = target;
        this.options = options;
        this.files = options.files;
    }

    private difference(
        a: { [key: string]: number },
        b: { [key: string]: number }
    ): {
        created: {};
        removed: {};
        changed: {};
    } {
        const difference = {
            created: {},
            removed: {},
            changed: {}
        };

        for (const key in a) {
            if (a[key] && !b[key]) {
                difference.removed[key] = a[key];
            } else if (a[key] && b[key] && a[key] !== b[key]) {
                difference.changed[key] = b[key];
            }
        }

        for (const key in b) {
            if (!a[key] && b[key]) {
                difference.created[key] = b[key];
            }
        }

        return difference;
    }

    public async next(): Promise<IteratorResult<Change[]>> {
        const newFiles: { [file: string]: number } = {};
        const changes: Change[] = [];
        const start = Date.now();

        for await (const { filename, info } of walk(this.target, this.options)) {
            if (info.isFile()) {
                newFiles[filename] = info.modified;
            }
        }

        const { created, removed, changed } = this.difference(this.files, newFiles);

        for (const key in created) {
            changes.push({
                path: key,
                event: Event.Created
            });
        }

        for (const key in removed) {
            changes.push({
                path: key,
                event: Event.Removed
            });
        }

        for (const key in changed) {
            changes.push({
                path: key,
                event: Event.Changed
            });
        }

        this.files = newFiles;

        const end = Date.now();
        const wait = this.options.interval - (end - start);

        if (wait > 0) await new Promise(r => setTimeout(r, wait));

        return changes.length === 0 ? this.next() : { done: false, value: changes };
    }
}

export async function files(
    path: string,
    options?: WalkOptions
): Promise<{ [file: string]: number }> {
    const files: { [file: string]: number } = {};

    for await (const { filename, info } of walk(path, options)) {
        if (info.isFile()) {
            files[filename] = info.modified;
        }
    }

    return files;
}

export function watch(target: string, options?: WatchOptions): AsyncIterable<Change[]> {
    const watcher = new Watcher(target, options);

    return {
        [Symbol.asyncIterator]() {
            return watcher;
        }
    };
}
