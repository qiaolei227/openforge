import { Controller, Post, Get, Patch, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces/request-context';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password, dto.platform);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: RequestUser, @Body('platform') platform: 'web' | 'mobile') {
    await this.authService.logout(user.userId, platform || 'web');
    return { message: 'Logged out' };
  }

  @Get('profile')
  async getProfile(@CurrentUser('userId') userId: string) {
    return this.authService.getProfile(userId);
  }

  @Patch('profile')
  async updateProfile(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(userId, dto);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser('userId') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(userId, dto.oldPassword, dto.newPassword);
    return { message: 'Password changed successfully' };
  }

  @Post('handoff')
  @HttpCode(HttpStatus.OK)
  async createHandoff(@Body() body: { accessToken: string; refreshToken: string }) {
    const code = await this.authService.createHandoffCode(body.accessToken, body.refreshToken);
    return { code };
  }

  @Public()
  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  async exchangeHandoff(@Body() body: { code: string }) {
    return this.authService.exchangeHandoffCode(body.code);
  }
}
