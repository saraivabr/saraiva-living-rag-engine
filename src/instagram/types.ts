/** Tipos da Instagram Graph API que nos interessam. */

export interface IgMedia {
  id: string;
  caption?: string;
  media_type?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}

export interface IgComment {
  id: string;
  text: string;
  username?: string;
  timestamp?: string;
  /** Respostas já existentes nesse comentário (usado para detectar se já respondemos). */
  replies?: { data: Array<{ id: string; username?: string; text?: string }> };
}

export interface GraphErrorBody {
  error?: {
    message: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    is_transient?: boolean;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
}
