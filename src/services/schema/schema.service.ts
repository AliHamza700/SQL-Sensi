import { databaseService } from '../database/database.service';
import { 
  DatabaseSchema, 
  TableSchema, 
  ColumnSchema, 
  ForeignKeySchema, 
  RelationshipSchema, 
  IndexSchema, 
  ViewSchema,
  ServiceResult 
} from '@/src/types';
import { createError } from '@/src/utils/errors';

export class SchemaService {
  private static instance: SchemaService;

  private constructor() {}

  public static getInstance(): SchemaService {
    if (!SchemaService.instance) {
      SchemaService.instance = new SchemaService();
    }
    return SchemaService.instance;
  }

  /**
   * Extracts the full schema of the currently connected database.
   */
  public async extractSchema(): Promise<ServiceResult<DatabaseSchema>> {
    try {
      if (!databaseService.isConnected()) {
        return {
          success: false,
          error: createError('DATABASE_ERROR', 'No database is currently connected.'),
        };
      }

      const activePath = databaseService.getActivePath();
      const databaseName = activePath ? activePath.split(/[/\\]/).pop() || 'Unknown' : 'Unknown';

      // 1. Extract Views
      const views = this.extractViews();

      // 2. Extract Tables
      const tableNames = this.getTableNames();
      
      const tables: TableSchema[] = [];
      const globalRelationships: RelationshipSchema[] = [];
      const globalIndexes: IndexSchema[] = [];

      for (const tableName of tableNames) {
        // Build basic table schema
        const columns = this.getColumns(tableName);
        const primaryKeys = columns.filter(c => c.isPrimaryKey).map(c => c.name);
        const foreignKeys = this.getForeignKeys(tableName);
        
        // Convert local foreign keys into global relationships
        for (const fk of foreignKeys) {
          globalRelationships.push({
            fromTable: tableName,
            fromColumn: fk.columnName,
            toTable: fk.referencedTable,
            toColumn: fk.referencedColumn,
          });
        }

        // Row count (skip if table is excessively large, but we'll try a fast COUNT for MVP)
        // With SQLite, COUNT(*) is fast enough for moderately sized tables. We catch if it timeouts.
        let rowCount = 0;
        try {
          const countRes = databaseService.executeQuery(`SELECT COUNT(*) as count FROM "${tableName}"`);
          if (countRes.success && countRes.data.rows.length > 0) {
            rowCount = Number(countRes.data.rows[0].count) || 0;
          }
        } catch (e) {
          console.warn(`Failed to count rows for table ${tableName}`, e);
        }

        tables.push({
          name: tableName,
          columns,
          primaryKeys,
          foreignKeys,
          rowCount,
        });

        // Indexes
        const indexes = this.getIndexes(tableName);
        globalIndexes.push(...indexes);
      }

      const schema: DatabaseSchema = {
        databaseName,
        tables,
        relationships: globalRelationships,
        indexes: globalIndexes,
        views,
      };

      return {
        success: true,
        data: schema,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown schema extraction error';
      return {
        success: false,
        error: createError('SCHEMA_ERROR', `Failed to extract schema: ${msg}`),
      };
    }
  }

  private getTableNames(): string[] {
    const res = databaseService.executeQuery(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name ASC
    `);
    if (!res.success) throw new Error(res.error.message);
    return res.data.rows.map(row => String(row.name));
  }

  private extractViews(): ViewSchema[] {
    const res = databaseService.executeQuery(`
      SELECT name, sql FROM sqlite_master 
      WHERE type='view'
      ORDER BY name ASC
    `);
    if (!res.success) throw new Error(res.error.message);
    return res.data.rows.map(row => ({
      name: String(row.name),
      sql: row.sql ? String(row.sql) : undefined,
    }));
  }

  private getColumns(tableName: string): ColumnSchema[] {
    const res = databaseService.executeQuery(`PRAGMA table_info("${tableName}")`);
    if (!res.success) throw new Error(res.error.message);
    
    // PRAGMA table_info returns: cid, name, type, notnull, dflt_value, pk
    return res.data.rows.map(row => ({
      name: String(row.name),
      type: String(row.type).toUpperCase(),
      nullable: row.notnull === 0,
      defaultValue: row.dflt_value !== null ? String(row.dflt_value) : null,
      isPrimaryKey: Number(row.pk) > 0,
      // isForeignKey will be updated later if needed, but we typically rely on the foreignKeys array on TableSchema
      isForeignKey: false, 
    }));
  }

  private getForeignKeys(tableName: string): ForeignKeySchema[] {
    const res = databaseService.executeQuery(`PRAGMA foreign_key_list("${tableName}")`);
    if (!res.success) throw new Error(res.error.message);
    
    // PRAGMA foreign_key_list returns: id, seq, table, from, to, on_update, on_delete, match
    return res.data.rows.map(row => ({
      columnName: String(row.from),
      referencedTable: String(row.table),
      referencedColumn: String(row.to),
    }));
  }

  private getIndexes(tableName: string): IndexSchema[] {
    const indexListRes = databaseService.executeQuery(`PRAGMA index_list("${tableName}")`);
    if (!indexListRes.success) throw new Error(indexListRes.error.message);
    
    const indexes: IndexSchema[] = [];
    
    for (const row of indexListRes.data.rows) {
      const indexName = String(row.name);
      const isUnique = Number(row.unique) === 1;
      
      // Get columns for this index
      const indexInfoRes = databaseService.executeQuery(`PRAGMA index_info("${indexName}")`);
      if (indexInfoRes.success) {
        const columns = indexInfoRes.data.rows.map(colRow => String(colRow.name));
        indexes.push({
          name: indexName,
          tableName,
          columns,
          unique: isUnique,
        });
      }
    }
    
    return indexes;
  }
}

export const schemaService = SchemaService.getInstance();
