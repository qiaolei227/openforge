import { IsString, IsNotEmpty, IsOptional, MinLength, Matches, MaxLength } from 'class-validator';

export class InitSystemDto {
  @IsString() @IsNotEmpty() @MaxLength(100)
  orgName!: string;

  @IsString() @IsNotEmpty() @MaxLength(50)
  orgCode!: string;

  @IsString() @IsNotEmpty() @MaxLength(50)
  adminUsername!: string;

  @IsString() @MinLength(6)
  adminPassword!: string;

  @IsString() @IsNotEmpty() @MaxLength(100)
  adminDisplayName!: string;

  @IsOptional() @IsString()
  locale?: string;

  @IsOptional() @IsString()
  systemName?: string;

  @IsOptional() @IsString()
  logo?: string;
}
