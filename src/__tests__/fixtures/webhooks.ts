/**
 * GitHub webhook payload fixtures for testing
 */

export const validDeploymentPayload = {
  action: 'created',
  deployment: {
    id: 12345,
    sha: 'abc123def456',
    ref: 'refs/heads/main',
    environment: 'production',
    created_at: '2026-03-31T10:00:00Z',
    updated_at: '2026-03-31T10:00:00Z',
    creator: {
      login: 'testuser',
    },
  },
  repository: {
    id: 1,
    name: 'test-repo',
    full_name: 'testorg/test-repo',
  },
};

export const validDeploymentStatusPayload = {
  action: 'created',
  deployment_status: {
    id: 67890,
    state: 'success',
    description: 'Deployment succeeded',
    created_at: '2026-03-31T10:05:00Z',
    updated_at: '2026-03-31T10:05:00Z',
  },
  deployment: {
    id: 12345,
    sha: 'abc123def456',
    ref: 'refs/heads/main',
    environment: 'production',
  },
  repository: {
    id: 1,
    name: 'test-repo',
    full_name: 'testorg/test-repo',
  },
};

export const validPushPayload = {
  ref: 'refs/heads/main',
  before: 'old123',
  after: 'new456',
  commits: [
    {
      id: 'commit1',
      message: 'Fix bug',
      timestamp: '2026-03-31T09:00:00Z',
      author: {
        name: 'Test User',
        email: 'test@example.com',
      },
    },
  ],
  repository: {
    id: 1,
    name: 'test-repo',
    full_name: 'testorg/test-repo',
  },
  pusher: {
    name: 'testuser',
    email: 'test@example.com',
  },
};

export const stagingDeploymentPayload = {
  action: 'created',
  deployment: {
    id: 54321,
    sha: 'xyz789abc012',
    ref: 'refs/heads/develop',
    environment: 'staging',
    created_at: '2026-03-31T11:00:00Z',
    updated_at: '2026-03-31T11:00:00Z',
    creator: {
      login: 'devuser',
    },
  },
  repository: {
    id: 2,
    name: 'staging-repo',
    full_name: 'testorg/staging-repo',
  },
};

export const failedDeploymentStatusPayload = {
  action: 'created',
  deployment_status: {
    id: 11111,
    state: 'failure',
    description: 'Deployment failed',
    created_at: '2026-03-31T10:10:00Z',
    updated_at: '2026-03-31T10:10:00Z',
  },
  deployment: {
    id: 12345,
    sha: 'abc123def456',
    ref: 'refs/heads/main',
    environment: 'production',
  },
  repository: {
    id: 1,
    name: 'test-repo',
    full_name: 'testorg/test-repo',
  },
};

export const multipleCcommitsPushPayload = {
  ref: 'refs/heads/feature-branch',
  before: 'old123',
  after: 'new789',
  commits: [
    {
      id: 'commit1',
      message: 'Add feature A',
      timestamp: '2026-03-31T08:00:00Z',
      author: {
        name: 'Developer One',
        email: 'dev1@example.com',
      },
    },
    {
      id: 'commit2',
      message: 'Add feature B',
      timestamp: '2026-03-31T08:30:00Z',
      author: {
        name: 'Developer Two',
        email: 'dev2@example.com',
      },
    },
    {
      id: 'commit3',
      message: 'Fix tests',
      timestamp: '2026-03-31T09:00:00Z',
      author: {
        name: 'Developer One',
        email: 'dev1@example.com',
      },
    },
  ],
  repository: {
    id: 1,
    name: 'test-repo',
    full_name: 'testorg/test-repo',
  },
  pusher: {
    name: 'dev1',
    email: 'dev1@example.com',
  },
};

// Malformed payloads for error testing
export const malformedDeploymentPayload = {
  deployment: {
    id: 12345,
    // Missing required fields: sha, ref, environment, etc.
  },
};

export const malformedPushPayload = {
  ref: 'refs/heads/main',
  // Missing required fields: commits, repository
};

export const unsupportedEventPayload = {
  action: 'opened',
  issue: {
    id: 1,
    title: 'Test issue',
    state: 'open',
  },
};
