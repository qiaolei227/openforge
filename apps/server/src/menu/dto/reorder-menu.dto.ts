import { IsArray, IsInt, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ReorderItemDto {
  @IsUUID() id!: string;
  @IsOptional() @IsUUID() parentId?: string | null;
  @IsInt() sortOrder!: number;
}

export class ReorderMenuDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items!: ReorderItemDto[];
}
