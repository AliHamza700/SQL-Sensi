import fs from 'fs';
import { DatabaseValidationResult, ServiceResult } from '@/src/types';
import { createError } from '@/src/utils/errors';

const SQLITE_MAGIC_STRING = 'SQLite format 3\x00';
const MAGIC_STRING_BYTES = 16;

/**
 * Validates whether a given file path points to a valid SQLite 3 database file.
 * Performs checks on:
 * 1. File existence and read access.
 * 2. File size (must be at least 100 bytes for a valid DB header).
 * 3. File header magic string (must exactly match 'SQLite format 3\000').
 *
 * Runs in the Electron Main process.
 */
export async function validateDatabaseFile(filePath: string): Promise<ServiceResult<DatabaseValidationResult>> {
  try {
    // 1 & 2. Check existence and file size
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) {
      return {
        success: false,
        error: createError('INVALID_DATABASE', 'Selected path is not a file.'),
      };
    }
    
    if (stats.size < 100) {
      return {
        success: false,
        error: createError('INVALID_DATABASE', 'File is too small to be a valid SQLite database.'),
      };
    }

    // 3. Read first 16 bytes
    const buffer = Buffer.alloc(MAGIC_STRING_BYTES);
    const fileHandle = await fs.promises.open(filePath, 'r');
    
    try {
      await fileHandle.read(buffer, 0, MAGIC_STRING_BYTES, 0);
    } finally {
      await fileHandle.close();
    }

    // 4. Verify magic string
    const headerString = buffer.toString('utf-8');
    if (headerString !== SQLITE_MAGIC_STRING) {
      return {
        success: false,
        error: createError('INVALID_DATABASE', 'File is not a recognized SQLite database format (magic string mismatch).'),
      };
    }

    // Valid
    return {
      success: true,
      data: {
        valid: true,
        fileSizeInBytes: stats.size,
      },
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error during validation';
    return {
      success: false,
      error: createError('DATABASE_ERROR', `Failed to read database file: ${msg}`),
    };
  }
}
