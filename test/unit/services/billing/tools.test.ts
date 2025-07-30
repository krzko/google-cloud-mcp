/**
 * Tests for Billing service tools
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import mocks first
import '../../../mocks/google-cloud-mocks.js';
import { mockBillingClient, mockCatalogClient } from '../../../mocks/google-cloud-mocks.js';
import { createMockMcpServer, createMockBillingAccount, createMockCloudService, createMockSKU } from '../../../utils/test-helpers.js';

describe('Billing Tools', () => {
  let mockServer: ReturnType<typeof createMockMcpServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = createMockMcpServer();
    
    // Reset mock implementations
    mockBillingClient.listBillingAccounts.mockResolvedValue([[createMockBillingAccount()], null]);
    mockBillingClient.getBillingAccount.mockResolvedValue([createMockBillingAccount()]);
    mockBillingClient.listProjectBillingInfo.mockResolvedValue([[], null]);
    mockBillingClient.getProjectBillingInfo.mockResolvedValue([{
      name: 'projects/test-project',
      billingEnabled: true,
      billingAccountName: 'billingAccounts/123456-789ABC-DEF012'
    }]);
    mockCatalogClient.listServices.mockResolvedValue([[createMockCloudService()], null]);
    mockCatalogClient.listSkus.mockResolvedValue([[createMockSKU()], null]);
  });

  describe('registerBillingTools', () => {
    it('should register billing tools with MCP server', async () => {
      const { registerBillingTools } = await import('../../../../src/services/billing/tools.js');
      
      registerBillingTools(mockServer as any);
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'gcp-billing-list-accounts',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'gcp-billing-get-account-details',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'gcp-billing-list-projects',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'gcp-billing-get-project-info',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'gcp-billing-list-services',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'gcp-billing-list-skus',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'gcp-billing-analyse-costs',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'gcp-billing-detect-anomalies',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'gcp-billing-cost-recommendations',
        expect.any(Object),
        expect.any(Function)
      );
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'gcp-billing-service-breakdown',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should handle list-billing-accounts tool execution', async () => {
      const { registerBillingTools } = await import('../../../../src/services/billing/tools.js');
      
      registerBillingTools(mockServer as any);
      
      // Get the registered tool handler
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-billing-list-accounts'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ pageSize: 10 });
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Billing Accounts');
      expect(mockBillingClient.listBillingAccounts).toHaveBeenCalledWith({
        pageSize: 10,
      });
    });

    it('should handle get-billing-account-details tool execution', async () => {
      const { registerBillingTools } = await import('../../../../src/services/billing/tools.js');
      
      registerBillingTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-billing-get-account-details'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ 
        billingAccountName: 'billingAccounts/123456-789ABC-DEF012' 
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Test Billing Account');
      expect(mockBillingClient.getBillingAccount).toHaveBeenCalledWith({
        name: 'billingAccounts/123456-789ABC-DEF012',
      });
    });

    it('should handle list-projects tool execution', async () => {
      const { registerBillingTools } = await import('../../../../src/services/billing/tools.js');
      
      registerBillingTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-billing-list-projects'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ 
        billingAccountName: 'billingAccounts/123456-789ABC-DEF012',
        pageSize: 50
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('No projects found'); // Empty mock response
      expect(mockBillingClient.listProjectBillingInfo).toHaveBeenCalledWith({
        name: 'billingAccounts/123456-789ABC-DEF012',
        pageSize: 50,
      });
    });

    it('should handle get-project-billing-info tool execution', async () => {
      const { registerBillingTools } = await import('../../../../src/services/billing/tools.js');
      
      registerBillingTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-billing-get-project-info'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ projectId: 'test-project' });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Project Billing Information');
      expect(result.content[0].text).toContain('test-project');
      expect(mockBillingClient.getProjectBillingInfo).toHaveBeenCalledWith({
        name: 'projects/test-project',
      });
    });

    it('should handle list-services tool execution', async () => {
      const { registerBillingTools } = await import('../../../../src/services/billing/tools.js');
      
      registerBillingTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-billing-list-services'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ pageSize: 50 });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Google Cloud Services');
      expect(result.content[0].text).toContain('Compute Engine API');
      expect(mockCatalogClient.listServices).toHaveBeenCalledWith({
        pageSize: 50,
      });
    });

    it('should handle list-skus tool execution', async () => {
      const { registerBillingTools } = await import('../../../../src/services/billing/tools.js');
      
      registerBillingTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-billing-list-skus'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ 
        serviceId: 'services/compute',
        pageSize: 20,
        currencyCode: 'USD'
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('SKUs for Service');
      expect(result.content[0].text).toContain('Test Compute Engine SKU');
      expect(mockCatalogClient.listSkus).toHaveBeenCalledWith({
        parent: 'services/compute',
        pageSize: 20,
        currencyCode: 'USD',
      });
    });

    it('should handle analyse-costs tool execution', async () => {
      const { registerBillingTools } = await import('../../../../src/services/billing/tools.js');
      
      registerBillingTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-billing-analyse-costs'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ 
        billingAccountName: 'billingAccounts/123456-789ABC-DEF012',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        groupBy: 'service'
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Cost Analysis');
      expect(result.content[0].text).toContain('demonstration with mock data');
    });

    it('should handle detect-anomalies tool execution', async () => {
      const { registerBillingTools } = await import('../../../../src/services/billing/tools.js');
      
      registerBillingTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-billing-detect-anomalies'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ 
        billingAccountName: 'billingAccounts/123456-789ABC-DEF012',
        lookbackDays: 30,
        thresholdPercentage: 50
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Cost Anomaly Detection');
      expect(result.content[0].text).toContain('demonstration with mock data');
    });

    it('should handle cost-recommendations tool execution', async () => {
      const { registerBillingTools } = await import('../../../../src/services/billing/tools.js');
      
      registerBillingTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-billing-cost-recommendations'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ 
        billingAccountName: 'billingAccounts/123456-789ABC-DEF012',
        minSavingsAmount: 10,
        priority: 'all'
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Cost Optimisation Recommendations');
      expect(result.content[0].text).toContain('demonstration with mock recommendations');
    });

    it('should handle service-breakdown tool execution', async () => {
      const { registerBillingTools } = await import('../../../../src/services/billing/tools.js');
      
      registerBillingTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-billing-service-breakdown'
      );
      
      expect(toolCall).toBeDefined();
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ 
        billingAccountName: 'billingAccounts/123456-789ABC-DEF012',
        timeRange: '30d'
      });
      
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('Service Cost Breakdown');
      expect(result.content[0].text).toContain('demonstration data');
    });

    it('should handle empty billing accounts list', async () => {
      const { registerBillingTools } = await import('../../../../src/services/billing/tools.js');
      
      // Mock empty response
      mockBillingClient.listBillingAccounts.mockResolvedValue([[], null]);
      
      registerBillingTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-billing-list-accounts'
      );
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ pageSize: 10 });
      
      expect(result.content[0].text).toContain('No billing accounts found');
    });

    it('should handle billing account not found', async () => {
      const { registerBillingTools } = await import('../../../../src/services/billing/tools.js');
      
      // Mock not found response
      mockBillingClient.getBillingAccount.mockResolvedValue([null]);
      
      registerBillingTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-billing-get-account-details'
      );
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ 
        billingAccountName: 'billingAccounts/non-existent' 
      });
      
      expect(result.content[0].text).toContain('Billing account not found');
    });

    it('should handle errors gracefully', async () => {
      const { registerBillingTools } = await import('../../../../src/services/billing/tools.js');
      
      // Mock error
      mockBillingClient.listBillingAccounts.mockRejectedValue(new Error('API Error'));
      
      registerBillingTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-billing-list-accounts'
      );
      
      const toolHandler = toolCall![2];
      
      await expect(toolHandler({ pageSize: 10 })).rejects.toThrow('Failed to list billing accounts: API Error');
    });

    it('should handle pagination tokens correctly', async () => {
      const { registerBillingTools } = await import('../../../../src/services/billing/tools.js');
      
      // Mock response with next page token
      mockBillingClient.listBillingAccounts.mockResolvedValue([
        [createMockBillingAccount()], 
        'next-page-token'
      ]);
      
      registerBillingTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-billing-list-accounts'
      );
      
      const toolHandler = toolCall![2];
      const result = await toolHandler({ 
        pageSize: 10, 
        pageToken: 'previous-token' 
      });
      
      expect(result.content[0].text).toContain('**Next Page Token:** next-page-token');
      expect(mockBillingClient.listBillingAccounts).toHaveBeenCalledWith({
        pageSize: 10,
        pageToken: 'previous-token',
      });
    });

    it('should handle filters in list-accounts', async () => {
      const { registerBillingTools } = await import('../../../../src/services/billing/tools.js');
      
      registerBillingTools(mockServer as any);
      
      const toolCall = mockServer.registerTool.mock.calls.find(
        call => call[0] === 'gcp-billing-list-accounts'
      );
      
      const toolHandler = toolCall![2];
      await toolHandler({ 
        pageSize: 10, 
        filter: 'open=true' 
      });
      
      expect(mockBillingClient.listBillingAccounts).toHaveBeenCalledWith({
        pageSize: 10,
        filter: 'open=true',
      });
    });
  });
});