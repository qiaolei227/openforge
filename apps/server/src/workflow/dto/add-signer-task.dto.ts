import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AddSignerTaskDto {
  @IsUUID()
  newUserId!: string;

  @IsIn(['before', 'after'])
  position!: 'before' | 'after';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
