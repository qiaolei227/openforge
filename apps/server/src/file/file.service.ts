import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';
import { STORAGE_PROVIDER, type StorageProvider } from './storage/storage.provider';
import { randomUUID } from 'crypto';
import * as path from 'path';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async upload(file: Express.Multer.File, userId: string, orgId: string) {
    const ext = path.extname(file.originalname).toLowerCase();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const storageKey = `${orgId}/${year}/${month}/${randomUUID()}${ext}`;

    let storageWritten = false;
    try {
      await this.storage.upload(file.buffer, storageKey);
      storageWritten = true;

      const record = await this.prisma.sysFile.create({
        data: {
          orgId,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: BigInt(file.size),
          storageKey,
          uploadedBy: userId,
        },
      });

      return {
        id: record.id,
        originalName: record.originalName,
        mimeType: record.mimeType,
        size: Number(record.size),
        url: `/api/files/${record.id}/download`,
      };
    } catch (err) {
      if (storageWritten) {
        await this.storage.delete(storageKey).catch(() => {});
      }
      this.logger.error(`File upload failed: ${err}`);
      throw new BusinessException(500, ErrorCodes.FILE_UPLOAD_FAILED, 'File upload failed');
    }
  }

  async findById(id: string) {
    const file = await this.prisma.sysFile.findUnique({ where: { id } });
    if (!file) {
      throw new BusinessException(404, ErrorCodes.FILE_NOT_FOUND, `File '${id}' not found`);
    }
    return {
      id: file.id,
      orgId: file.orgId,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: Number(file.size),
      storageKey: file.storageKey,
      uploadedBy: file.uploadedBy,
      createdAt: file.createdAt,
      url: `/api/files/${file.id}/download`,
    };
  }

  async getBuffer(
    id: string,
  ): Promise<{ buffer: Buffer; mimeType: string; originalName: string }> {
    const file = await this.prisma.sysFile.findUnique({ where: { id } });
    if (!file) {
      throw new BusinessException(404, ErrorCodes.FILE_NOT_FOUND, `File '${id}' not found`);
    }
    const buffer = await this.storage.getBuffer(file.storageKey);
    return { buffer, mimeType: file.mimeType, originalName: file.originalName };
  }

  async delete(id: string) {
    const file = await this.prisma.sysFile.findUnique({ where: { id } });
    if (!file) {
      throw new BusinessException(404, ErrorCodes.FILE_NOT_FOUND, `File '${id}' not found`);
    }
    await this.storage.delete(file.storageKey);
    await this.prisma.sysFile.delete({ where: { id } });
    return { success: true };
  }
}
