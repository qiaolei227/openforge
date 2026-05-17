import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class TransferTaskDto {
  @IsUUID()
  newUserId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
