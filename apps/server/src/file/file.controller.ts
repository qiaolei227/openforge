import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Res,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileService } from './file.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces/request-context';
import type { Response } from 'express';

@Controller('files')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  /**
   * POST /api/files/upload
   *
   * Accepts multipart/form-data with field name "file".
   * Multer defaults to memoryStorage when no storage/dest is provided.
   * Max file size: 50 MB.
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.fileService.upload(file, user.userId, user.orgId);
  }

  /**
   * GET /api/files/:id
   *
   * Returns file metadata (id, originalName, mimeType, size, url, createdAt).
   */
  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.fileService.findById(id);
  }

  /**
   * GET /api/files/:id/download
   *
   * Streams the file binary back to the client with appropriate headers.
   */
  @Get(':id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType, originalName } = await this.fileService.getBuffer(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`,
    );
    res.send(buffer);
  }

  /**
   * DELETE /api/files/:id
   *
   * Deletes the file from storage and removes the DB record.
   */
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.fileService.delete(id);
  }
}
