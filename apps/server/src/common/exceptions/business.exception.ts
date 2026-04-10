import { HttpException } from '@nestjs/common';

/**
 * 业务异常，附带机器可读的 errorCode。
 *
 * 响应格式：{ statusCode, errorCode, message }
 * 前端根据 errorCode 映射本地化提示，不依赖 message 文本。
 */
export class BusinessException extends HttpException {
  constructor(
    statusCode: number,
    errorCode: string,
    message: string,
    extra?: Record<string, any>,
  ) {
    super({ statusCode, errorCode, message, ...extra }, statusCode);
  }
}
