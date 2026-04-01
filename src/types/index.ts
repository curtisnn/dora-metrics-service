import { Request } from 'express';

export interface RequestWithId extends Request {
  id: string;
}

export interface GitHubMetadata {
  eventType: string;
  deliveryId: string;
  hookId: string;
}

export interface RequestWithGitHub extends RequestWithId {
  githubMetadata: GitHubMetadata;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  version: string;
  timestamp: string;
  uptime: number;
  environment: string;
}

export interface GitHubWebhookPayload {
  action?: string;
  deployment?: {
    id: number;
    sha: string;
    ref: string;
    environment: string;
    created_at: string;
    updated_at: string;
  };
  deployment_status?: {
    state: string;
    description?: string;
    created_at: string;
  };
  repository?: {
    name: string;
    full_name: string;
  };
}

export interface DeploymentEvent {
  timestamp: string;
  environment: string;
  commitSha: string;
  status: 'success' | 'failure' | 'rollback';
  duration?: number;
  repository: string;
}

export interface IncidentEvent {
  timestamp: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'resolved';
  relatedDeployment?: string;
  description: string;
  resolvedAt?: string;
}

export interface WebhookEvent {
  id: string;
  eventType: string;
  deliveryId: string;
  payload: any;
  receivedAt: string;
  processed: boolean;
}
