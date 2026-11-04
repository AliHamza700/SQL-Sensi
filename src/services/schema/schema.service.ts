import { databaseService } from '../database/database.service';
import { DatabaseSchema, ServiceResult } from '@/src/types';

/**
 * Schema access for the active database.
 * Engine-specific metadata queries live in each database adapter.
 */
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
    return databaseService.getSchema();
  }
}

export const schemaService = SchemaService.getInstance();
