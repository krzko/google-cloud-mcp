/**
 * Tests for Profiler service types and utilities
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import mocks first
import '../../../mocks/google-cloud-mocks.js';

// Create specific Profiler auth mock
const mockProfilerAuth = {
  getClient: vi.fn().mockResolvedValue({
    getAccessToken: vi.fn().mockResolvedValue({ token: 'mock-token' })
  }),
  getProjectId: vi.fn().mockResolvedValue('test-project'),
};

// Mock the auth module specifically for Profiler
vi.mock('../../../../src/utils/auth.js', () => ({
  initGoogleAuth: vi.fn().mockResolvedValue(mockProfilerAuth),
  getProjectId: vi.fn().mockResolvedValue('test-project'),
}));

describe('Profiler Types and Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockClient = { getAccessToken: vi.fn().mockResolvedValue({ token: 'mock-token' }) };
    mockProfilerAuth.getClient.mockResolvedValue(mockClient);
    mockProfilerAuth.getProjectId.mockResolvedValue('test-project');
  });

  describe('formatProfileSummary', () => {
    it('should format profile summary correctly', async () => {
      const { formatProfileSummary, ProfileType } = await import('../../../../src/services/profiler/types.js');
      
      const mockProfile = {
        name: 'projects/test-project/profiles/test-profile-123',
        profileType: ProfileType.CPU,
        deployment: {
          projectId: 'test-project',
          target: 'test-service',
          labels: {
            'env': 'production',
            'version': '1.0.0'
          }
        },
        duration: 'PT60S',
        profileBytes: 'gzipped-data',
        labels: {
          'language': 'go',
          'source': 'manual'
        },
        startTime: '2024-01-01T12:00:00Z'
      };
      
      const formatted = formatProfileSummary(mockProfile);
      
      expect(formatted).toMatch(/^## Profile:/); // Starts with ## Profile:
      expect(formatted).toContain('test-profile-123'); // Contains profile ID
      expect(formatted).toContain('CPU Time - Shows where your application spends CPU time'); // Contains type description
      expect(formatted).toContain('test-service'); // Contains target
      expect(formatted).toContain('test-project'); // Contains project
      expect(formatted).toContain('60 seconds'); // Contains formatted duration
      expect(formatted).toContain('language: go'); // Contains labels
      expect(formatted).toContain('env: production'); // Contains deployment labels
    });

    it('should handle profile with minimal data', async () => {
      const { formatProfileSummary, ProfileType } = await import('../../../../src/services/profiler/types.js');
      
      const minimalProfile = {
        name: 'projects/test-project/profiles/minimal',
        profileType: ProfileType.HEAP,
        deployment: {
          projectId: 'test-project',
          target: 'minimal-service',
          labels: {}
        },
        duration: 'PT30S',
        profileBytes: 'data',
        labels: {},
        startTime: '2024-01-01T09:00:00Z'
      };
      
      const formatted = formatProfileSummary(minimalProfile);
      
      expect(formatted).toContain('minimal');
      expect(formatted).toContain('Heap Memory'); // Description for HEAP type
      expect(formatted).toContain('minimal-service');
      expect(formatted).toContain('30 seconds');
    });

    it('should handle profile with missing optional fields', async () => {
      const { formatProfileSummary, ProfileType } = await import('../../../../src/services/profiler/types.js');
      
      const profileWithoutOptionals = {
        name: 'projects/test-project/profiles/basic',
        profileType: ProfileType.WALL,
        deployment: {
          projectId: 'test-project',
          target: 'basic-service',
          labels: {}
        },
        duration: 'PT120S',
        profileBytes: 'data',
        labels: {},
        startTime: '2024-01-01T10:00:00Z'
      };
      
      const formatted = formatProfileSummary(profileWithoutOptionals);
      
      expect(formatted).toContain('basic');
      expect(formatted).toContain('Wall Time'); // Description for WALL type
      expect(formatted).toContain('basic-service');
      expect(formatted).toContain('120 seconds');
    });

    it('should handle undefined/null fields safely', async () => {
      const { formatProfileSummary } = await import('../../../../src/services/profiler/types.js');
      
      const profileWithNulls = {
        name: '',
        profileType: 'UNKNOWN_TYPE' as any,
        deployment: {
          projectId: '',
          target: '',
          labels: {}
        },
        duration: '',
        profileBytes: '',
        labels: {},
        startTime: ''
      };
      
      const formatted = formatProfileSummary(profileWithNulls);
      
      expect(formatted).toContain('Unknown'); // Default values
    });
  });

  describe('getProfileTypeDescription', () => {
    it('should return correct descriptions for profile types', async () => {
      const { getProfileTypeDescription, ProfileType } = await import('../../../../src/services/profiler/types.js');
      
      expect(getProfileTypeDescription(ProfileType.CPU)).toContain('CPU Time');
      expect(getProfileTypeDescription(ProfileType.HEAP)).toContain('Heap Memory');
      expect(getProfileTypeDescription(ProfileType.WALL)).toContain('Wall Time');
      expect(getProfileTypeDescription(ProfileType.CONTENTION)).toContain('Contention');
      expect(getProfileTypeDescription(ProfileType.THREADS)).toContain('Threads');
      expect(getProfileTypeDescription('UNKNOWN')).toContain('UNKNOWN');
    });
  });

  describe('formatDuration', () => {
    it('should format ISO 8601 durations correctly', async () => {
      const { formatDuration } = await import('../../../../src/services/profiler/types.js');
      
      expect(formatDuration('PT30S')).toBe('30 seconds');
      expect(formatDuration('PT5M')).toBe('5 minutes');
      expect(formatDuration('PT2H')).toBe('2 hours');
      expect(formatDuration('PT90S')).toBe('90 seconds');
      expect(formatDuration('invalid')).toBe('invalid');
      expect(formatDuration('')).toBe('Unknown');
    });
  });

  describe('analyseProfilePatterns', () => {
    it('should analyse profile patterns and provide insights', async () => {
      const { analyseProfilePatterns, ProfileType } = await import('../../../../src/services/profiler/types.js');
      
      const mockProfiles = [
        {
          name: 'projects/test/profiles/profile-1',
          profileType: ProfileType.CPU,
          deployment: {
            projectId: 'test-project',
            target: 'api-service',
            labels: {}
          },
          duration: 'PT60S',
          profileBytes: 'data',
          labels: {},
          startTime: new Date().toISOString() // Recent profile
        },
        {
          name: 'projects/test/profiles/profile-2',
          profileType: ProfileType.HEAP,
          deployment: {
            projectId: 'test-project',
            target: 'worker-service',
            labels: {}
          },
          duration: 'PT30S',
          profileBytes: 'data',
          labels: {},
          startTime: '2024-01-01T09:00:00Z' // Older profile
        }
      ];
      
      const analysis = analyseProfilePatterns(mockProfiles);
      
      expect(analysis).toContain('Profile Analysis and Performance Insights');
      expect(analysis).toContain('**Total Profiles:** 2');
      expect(analysis).toContain('**Profile Types:** 2');
      expect(analysis).toContain('**Targets:** 2');
      expect(analysis).toContain('Profile Type Distribution');
      expect(analysis).toContain('CPU Time'); // Should contain CPU description
      expect(analysis).toContain('Heap Memory'); // Should contain Heap description
      expect(analysis).toContain('Recent Profile Activity');
      expect(analysis).toContain('Performance Analysis by Profile Type');
      expect(analysis).toContain('Recommendations');
    });

    it('should handle empty profile array', async () => {
      const { analyseProfilePatterns } = await import('../../../../src/services/profiler/types.js');
      
      const analysis = analyseProfilePatterns([]);
      
      expect(analysis).toBe('No profiles found in the specified criteria.');
    });

    it('should group profiles by type correctly', async () => {
      const { analyseProfilePatterns, ProfileType } = await import('../../../../src/services/profiler/types.js');
      
      const profilesMultipleTypes = [
        {
          name: 'profile-1',
          profileType: ProfileType.CPU,
          deployment: { projectId: 'test', target: 'service-a', labels: {} },
          duration: 'PT60S',
          profileBytes: 'data',
          labels: {},
          startTime: '2024-01-01T09:00:00Z'
        },
        {
          name: 'profile-2',
          profileType: ProfileType.CPU,
          deployment: { projectId: 'test', target: 'service-b', labels: {} },
          duration: 'PT60S',
          profileBytes: 'data',
          labels: {},
          startTime: '2024-01-01T09:00:00Z'
        },
        {
          name: 'profile-3',
          profileType: ProfileType.HEAP,
          deployment: { projectId: 'test', target: 'service-a', labels: {} },
          duration: 'PT60S',
          profileBytes: 'data',
          labels: {},
          startTime: '2024-01-01T09:00:00Z'
        }
      ];
      
      const analysis = analyseProfilePatterns(profilesMultipleTypes);
      
      expect(analysis).toContain('**Profile Types:** 2 (CPU, HEAP)');
      expect(analysis).toContain('**Targets:** 2 (service-a, service-b)');
    });
  });

  describe('getProfilerAuth', () => {
    it('should return authentication client and token', async () => {
      const { getProfilerAuth } = await import('../../../../src/services/profiler/types.js');
      
      const authResult = await getProfilerAuth();
      
      expect(authResult).toBeDefined();
      expect(authResult.auth).toBeDefined();
      expect(authResult.token).toBe('mock-token');
    });

    it('should handle authentication failure', async () => {
      const { getProfilerAuth } = await import('../../../../src/services/profiler/types.js');
      
      // Mock auth failure
      const mockClient = { getAccessToken: vi.fn().mockRejectedValue(new Error('Auth failed')) };
      mockProfilerAuth.getClient.mockResolvedValue(mockClient);
      
      await expect(getProfilerAuth()).rejects.toThrow('Auth failed');
    });

    it('should handle missing auth client', async () => {
      // Re-import the module with mocked auth returning null
      vi.doMock('../../../../src/utils/auth.js', () => ({
        initGoogleAuth: vi.fn().mockResolvedValue(null),
        getProjectId: vi.fn().mockResolvedValue('test-project'),
      }));
      
      // Need to re-import after mocking
      const { getProfilerAuth } = await import('../../../../src/services/profiler/types.js?timestamp=' + Date.now());
      
      await expect(getProfilerAuth()).rejects.toThrow('Google Cloud authentication not available');
    });
  });
});