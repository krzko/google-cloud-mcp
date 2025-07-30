/**
 * Tests for Monitoring service tools
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import mocks first
import '../../../mocks/google-cloud-mocks.js';
import { mockMonitoringClient } from '../../../mocks/google-cloud-mocks.js';
import { createMockMcpServer } from '../../../utils/test-helpers.js';

describe('Monitoring Tools', () => {
  let mockServer: ReturnType<typeof createMockMcpServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = createMockMcpServer();
    
    // Reset mock implementations
    mockMonitoringClient.listTimeSeries.mockResolvedValue([[], {}, {}]);
    mockMonitoringClient.listMetricDescriptors.mockResolvedValue([[], {}, {}]);
  });

  describe('registerMonitoringTools', () => {
    it('should register monitoring tools with MCP server', async () => {
      const { registerMonitoringTools } = await import('../../../../src/services/monitoring/tools.js');
      
      await registerMonitoringTools(mockServer as any);
      
      expect(mockServer.tool).toHaveBeenCalledWith(
        'gcp-monitoring-query-metrics',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.tool).toHaveBeenCalledWith(
        'gcp-monitoring-list-metric-types',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should handle list-metric-types tool execution', async () => {
      const { registerMonitoringTools } = await import('../../../../src/services/monitoring/tools.js');
      
      mockMonitoringClient.listMetricDescriptors.mockResolvedValue([[{
        type: 'compute.googleapis.com/instance/cpu/utilization',
        metricKind: 'GAUGE',
        valueType: 'DOUBLE',
        displayName: 'CPU utilization'
      }], {}, {}]);
      
      await registerMonitoringTools(mockServer as any);
      
      const toolCall = mockServer.tool.mock.calls.find(
        call => call[0] === 'gcp-monitoring-list-metric-types'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({});
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Available Metric Types');
    });

    it('should handle query-metrics tool execution', async () => {
      const { registerMonitoringTools } = await import('../../../../src/services/monitoring/tools.js');
      
      mockMonitoringClient.listTimeSeries.mockResolvedValue([[{
        metric: {
          type: 'compute.googleapis.com/instance/cpu/utilization',
          labels: { instance_name: 'test-instance' }
        },
        points: [{
          interval: { endTime: { seconds: Date.now() / 1000 } },
          value: { doubleValue: 0.75 }
        }]
      }], {}, {}]);
      
      await registerMonitoringTools(mockServer as any);
      
      const toolCall = mockServer.tool.mock.calls.find(
        call => call[0] === 'gcp-monitoring-query-metrics'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({
        filter: 'resource.type="gce_instance"',
        startTime: '1h'
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Metric Query Results');
    });

    it('should handle errors gracefully', async () => {
      const { registerMonitoringTools } = await import('../../../../src/services/monitoring/tools.js');
      
      // Mock error
      mockMonitoringClient.listMetricDescriptors.mockRejectedValue(new Error('API Error'));
      
      await registerMonitoringTools(mockServer as any);
      
      const toolCall = mockServer.tool.mock.calls.find(
        call => call[0] === 'gcp-monitoring-list-metric-types'
      );
      
      const toolHandler = toolCall![2];
      
      try {
        await toolHandler({});
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Failed to list metric types');
      }
    });
  });
});