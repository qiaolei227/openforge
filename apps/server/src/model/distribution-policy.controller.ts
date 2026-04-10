import { Controller, Get, Put, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { DistributionPolicyService } from './distribution-policy.service';

@Controller()
export class DistributionPolicyController {
  constructor(private service: DistributionPolicyService) {}

  @Get('models/:modelId/distribution-policies')
  findByModelId(@Param('modelId', ParseUUIDPipe) modelId: string) {
    return this.service.findByModelId(modelId);
  }

  @Put('models/:modelId/distribution-policies')
  batchUpdate(
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body() dto: Array<{ fieldId: string; editable: boolean }>,
  ) {
    return this.service.batchUpdate(modelId, dto);
  }
}
