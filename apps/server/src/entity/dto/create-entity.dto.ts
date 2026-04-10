import { IsString, IsNotEmpty, IsIn, Matches, MaxLength } from 'class-validator';
import { ENTITY_TYPES } from '@openforge/shared';

export class CreateEntityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z][a-z0-9_]{1,99}$/, {
    message: 'code must be lowercase, start with letter, only letters/numbers/underscores',
  })
  code!: string;

  @IsString()
  @IsIn([...ENTITY_TYPES])
  entityType!: 'one_to_one' | 'one_to_many';
}
