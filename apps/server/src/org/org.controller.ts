import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { OrgService } from './org.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { UpdateOrgDto } from './dto/update-org.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('orgs')
export class OrgController {
  constructor(private orgService: OrgService) {}

  @Get()
  findAll(
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.orgService.findAll({
      keyword,
      status,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get('tree')
  findTree() {
    return this.orgService.findTree();
  }

  @Get('tree/children')
  findTreeChildren(
    @Query('parentId') parentId?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.orgService.findChildren(parentId || null, keyword);
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateOrgDto, @CurrentUser('userId') userId: string) {
    return this.orgService.create(dto, userId);
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrgDto) {
    return this.orgService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgService.delete(id);
  }
}
