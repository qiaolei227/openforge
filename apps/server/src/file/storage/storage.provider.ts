export interface StorageProvider {
  upload(buffer: Buffer, key: string): Promise<void>;
  delete(key: string): Promise<void>;
  getBuffer(key: string): Promise<Buffer>;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
