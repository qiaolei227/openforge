import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

/**
 * Batch resolve user UUIDs to display info. Used by UI surfaces that need to
 * show "who" without granting full `sys:users` access — e.g. record system
 * info on a record page, workflow operation log.
 *
 * Cap at 200 ids per call to keep the payload bounded; callers should dedupe
 * before sending.
 */
export class ResolveUsersDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  ids!: string[];
}
