export interface App {
  id: string;
  name: string;
  code: string;
  icon: string | null;
  description: string | null;
  version: string | null;
  orgId: string;
}

export interface CreateAppRequest {
  name: string;
  code: string;
  icon?: string;
  description?: string;
}

export interface UpdateAppRequest {
  name?: string;
  icon?: string;
  description?: string;
}
