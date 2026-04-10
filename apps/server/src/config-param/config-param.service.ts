import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';

/** Default config params that should always exist */
const DEFAULT_CONFIGS = [
  { code: 'system.string.default_length', name: 'system.string.default_length', defaultVal: '255', description: 'Default max length for STRING fields' },
  { code: 'system.decimal.default_precision', name: 'system.decimal.default_precision', defaultVal: '32', description: 'Default precision for DECIMAL fields' },
  { code: 'system.decimal.default_scale', name: 'system.decimal.default_scale', defaultVal: '8', description: 'Default scale for DECIMAL fields' },
];

@Injectable()
export class ConfigParamService implements OnModuleInit {
  private readonly logger = new Logger(ConfigParamService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    for (const cfg of DEFAULT_CONFIGS) {
      await this.prisma.sysConfig.upsert({
        where: { code: cfg.code },
        update: {},
        create: { code: cfg.code, name: cfg.name, defaultVal: cfg.defaultVal, value: cfg.defaultVal, description: cfg.description },
      });
    }
    this.logger.log(`Ensured ${DEFAULT_CONFIGS.length} default config params exist`);
  }

  async findAll() {
    return this.prisma.sysConfig.findMany({ orderBy: { code: 'asc' } });
  }

  async findByCode(code: string) {
    const config = await this.prisma.sysConfig.findUnique({ where: { code } });
    if (!config)
      throw new BusinessException(
        404,
        ErrorCodes.CONFIG_NOT_FOUND,
        `Config '${code}' not found`,
      );
    return config;
  }

  async getValue(code: string): Promise<string> {
    const config = await this.prisma.sysConfig.findUnique({ where: { code } });
    return config?.value ?? config?.defaultVal ?? '';
  }

  async update(code: string, value: string) {
    const config = await this.prisma.sysConfig.findUnique({ where: { code } });
    if (!config)
      throw new BusinessException(
        404,
        ErrorCodes.CONFIG_NOT_FOUND,
        `Config '${code}' not found`,
      );
    return this.prisma.sysConfig.update({ where: { code }, data: { value } });
  }
}
