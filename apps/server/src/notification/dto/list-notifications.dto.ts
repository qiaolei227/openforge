import { IsBooleanString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListNotificationsDto {
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsBooleanString() isRead?: 'true' | 'false';
  @IsOptional() @IsString() since?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}
