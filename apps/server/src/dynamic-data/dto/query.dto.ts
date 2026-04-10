import { IsOptional, IsInt, IsString, IsArray, IsBoolean, Min, Max } from 'class-validator';

export class SortItemDto {
  @IsString()
  field!: string;

  @IsString()
  order!: 'asc' | 'desc';
}

export class QueryDto {
  @IsOptional()
  filter?: any; // Deep validation happens in QueryBuilderService

  @IsOptional()
  @IsString()
  keyword?: string;

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
}
