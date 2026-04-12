import { IsString, Matches, MaxLength } from 'class-validator';

export class RevokePermissionDto {
  @IsString()
  @MaxLength(100)
  @Matches(/^(platform|designer):[a-z][a-z0-9_-]*$/)
  resource!: string;
}
