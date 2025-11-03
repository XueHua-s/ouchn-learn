export interface Resource {
  type: 'video' | 'document' | 'audio' | 'courseware';
  icon: string;
  name: string;
  url: string;
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
