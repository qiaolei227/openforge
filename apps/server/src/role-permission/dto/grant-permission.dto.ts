import { ArrayMinSize, IsArray, IsString, Matches, MaxLength } from 'class-validator';

export class GrantPermissionDto {
  @IsString()
  @MaxLength(100)
  @Matches(/^(platform|designer):[a-z][a-z0-9_-]*$/, {
    message: 'resource must start with "platform:" or "designer:" followed by snake_case identifier',
  })
  resource!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  actions!: string[];
}
