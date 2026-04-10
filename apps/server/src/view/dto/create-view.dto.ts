import { IsString, IsIn, IsObject, IsOptional } from 'class-validator';

export class CreateViewDto {
  @IsString()
  name!: string;

  @IsIn(['form', 'list'])
  type!: string;

  @IsObject()
  layout!: Record<string, any>;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
