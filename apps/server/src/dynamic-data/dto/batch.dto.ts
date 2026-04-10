import {
  IsString,
  IsArray,
  IsOptional,
  IsIn,
  ArrayMinSize,
} from 'class-validator';

export class BatchDto {
  @IsString()
  @IsIn(['delete', 'update'])
  action!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];

  @IsOptional()
  data?: Record<string, any>;
}
