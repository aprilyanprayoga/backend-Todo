export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface Todo {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  priority: Priority;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicUser {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  user_metadata: Record<string, unknown>;
}

export interface AuthContext {
  userId: string;
  accessToken: string;
  user: PublicUser;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}
