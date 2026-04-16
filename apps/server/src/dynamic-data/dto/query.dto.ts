import { IsOptional, IsInt, IsString, IsArray, IsBoolean, IsObject, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SortItemDto {
  @IsString()
  field!: string;

  @IsString()
  order!: 'asc' | 'desc';
}

export class DetailEntityDto {
  @IsString()
  entityCode!: string;

  @IsArray()
  @IsString({ each: true })
  fields!: string[];
}

export class QueryDto {
  @IsOptional()
  filter?: any; // Deep validation happens in QueryBuilderService

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  searchFields?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;

  @IsOptional()
  @IsArray()
  sort?: SortItemDto[];

  @IsOptional()
  @IsBoolean()
  includeArchived?: boolean;

  @IsOptional()
  @IsBoolean()
  treeMode?: boolean;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  /** Single 1:N entity to expand as master-detail rows. */
  @IsOptional()
  @ValidateNested()
  @Type(() => DetailEntityDto)
  detailEntity?: DetailEntityDto;

  /** Map of 1:1 entityCode → selected field columnNames to attach as __oneToOne[entityCode]. */
  @IsOptional()
  @IsObject()
  oneToOneFields?: Record<string, string[]>;
}
