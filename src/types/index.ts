export interface Resource {
  type: 'video' | 'document' | 'audio' | 'courseware' | 'material';
  icon: string;
  name: string;
  url: string;
  size?: string;
  completed?: boolean;
  activityId?: string;
  uploadId?: string;
}

export interface PageElement {
  element: HTMLElement;
  title: string;
  index: number;
}

export interface HangInfo {
  button: HTMLElement;
  activityId: string;
  time: string;
  title: string;
}

export interface ViewState {
  isActive: boolean;
  processedCount: number;
  returnUrl: string;
}

export interface ActivityReadRequest {
  start: number;
  end: number;
}

export interface ActivityReadResponse {
  completeness: string;
}

export interface MaterialAttachment {
  name: string;
  extension: string;
  size: string;
  uploadId: string;
  activityId: string;
  viewUrl?: string;
  downloadUrl?: string;
}

export interface CourseConfig {
  coursePrefix: string;
}
