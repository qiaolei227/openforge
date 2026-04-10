export interface ConfigParam {
  id: string;
  code: string;
  name: string;
  value: string | null;
  defaultVal: string | null;
  description: string | null;
}

export interface UpdateConfigRequest {
  value: string;
}
