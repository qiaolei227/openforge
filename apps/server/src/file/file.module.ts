import { Module } from '@nestjs/common';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { LocalStorageProvider } from './storage/local-storage.provider';
import { STORAGE_PROVIDER } from './storage/storage.provider';

@Module({
  controllers: [FileController],
  providers: [
    FileService,
    { provide: STORAGE_PROVIDER, useClass: LocalStorageProvider },
  ],
  exports: [FileService],
})
export class FileModule {}
