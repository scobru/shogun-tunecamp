import type { Database as DatabaseType } from "better-sqlite3";

export abstract class BaseRepository {
    constructor(protected db: DatabaseType) {}

    protected mapBoolean(value: any): boolean {
        return !!value;
    }

    protected mapDate(value: any): string | undefined {
        return value || undefined;
    }
}
