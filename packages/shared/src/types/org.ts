export interface Organization {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrgRequest {
  name: string;
  code: string;
  parentId?: string;
}

export interface UpdateOrgRequest {
  name?: string;
  status?: 'active' | 'disabled';
}
