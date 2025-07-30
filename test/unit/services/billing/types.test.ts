/**
 * Tests for Billing service types and utility functions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import mocks first
import '../../../mocks/google-cloud-mocks.js';
import { 
  createMockBillingAccount, 
  createMockCostData, 
  createMockCostAnomaly, 
  createMockCostRecommendation 
} from '../../../utils/test-helpers.js';

describe('Billing Types and Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Client Creation', () => {
    it('should create billing client', async () => {
      const { getBillingClient } = await import('../../../../src/services/billing/types.js');
      
      const client = getBillingClient();
      expect(client).toBeDefined();
    });

    it('should create catalog client', async () => {
      const { getCatalogClient } = await import('../../../../src/services/billing/types.js');
      
      const client = getCatalogClient();
      expect(client).toBeDefined();
    });
  });

  describe('Formatting Functions', () => {
    it('should format billing account correctly', async () => {
      const { formatBillingAccount } = await import('../../../../src/services/billing/types.js');
      
      const account = createMockBillingAccount();
      const formatted = formatBillingAccount(account);
      
      expect(formatted).toContain('## Test Billing Account');
      expect(formatted).toContain('Test Billing Account');
      expect(formatted).toContain('billingAccounts/123456-789ABC-DEF012');
      expect(formatted).toContain('✅ Active');
    });

    it('should format closed billing account correctly', async () => {
      const { formatBillingAccount } = await import('../../../../src/services/billing/types.js');
      
      const account = { ...createMockBillingAccount(), open: false };
      const formatted = formatBillingAccount(account);
      
      expect(formatted).toContain('❌ Closed');
    });

    it('should format cost data correctly', async () => {
      const { formatCostData } = await import('../../../../src/services/billing/types.js');
      
      const costData = createMockCostData(2);
      const formatted = formatCostData(costData);
      
      expect(formatted).toContain('## Cost Analysis');
      expect(formatted).toContain('test-project-1');
      expect(formatted).toContain('compute.googleapis.com');
      expect(formatted).toContain('USD\u00A0100.00');
      // Cost data table doesn't include labels, only: Project | Service | Cost | Usage | Period
    });

    it('should format cost anomalies correctly', async () => {
      const { formatCostAnomalies } = await import('../../../../src/services/billing/types.js');
      
      const anomalies = [createMockCostAnomaly()];
      const formatted = formatCostAnomalies(anomalies);
      
      expect(formatted).toContain('🚨 Cost Anomalies Detected');
      expect(formatted).toContain('🔴 SPIKE');
      expect(formatted).toContain('Compute Engine costs increased');
      expect(formatted).toContain('USD\u00A02,500.00');
      expect(formatted).toContain('150%');
    });

    it('should format empty cost anomalies correctly', async () => {
      const { formatCostAnomalies } = await import('../../../../src/services/billing/types.js');
      
      const formatted = formatCostAnomalies([]);
      
      expect(formatted).toContain('✅ No cost anomalies detected');
    });

    it('should format cost recommendations correctly', async () => {
      const { formatCostRecommendations } = await import('../../../../src/services/billing/types.js');
      
      const recommendations = [createMockCostRecommendation()];
      const formatted = formatCostRecommendations(recommendations);
      
      expect(formatted).toContain('💡 Cost Optimisation Recommendations');
      expect(formatted).toContain('RIGHTSIZING');
      expect(formatted).toContain('HIGH');
      expect(formatted).toContain('USD\u00A0450.00');
      expect(formatted).toContain('30.0%');
      expect(formatted).toContain('web-server-instances');
      expect(formatted).toContain('n1-standard-4 to n1-standard-2');
    });

    it('should format currency correctly', async () => {
      const { formatCurrency } = await import('../../../../src/services/billing/types.js');
      
      // Test with default USD currency (Australian locale format)
      expect(formatCurrency(100)).toBe('USD\u00A0100.00');
      expect(formatCurrency(1234.56)).toBe('USD\u00A01,234.56');
      expect(formatCurrency(0)).toBe('USD\u00A00.00');
      expect(formatCurrency(0.5)).toBe('USD\u00A00.50');
      
      // Test with different currencies (Australian locale shows 3-letter codes for foreign currencies)
      expect(formatCurrency(100, 'AUD')).toBe('$100.00');
      expect(formatCurrency(100, 'EUR')).toBe('EUR\u00A0100.00');
      expect(formatCurrency(100, 'GBP')).toBe('GBP\u00A0100.00');
    });
  });

  describe('Analysis Functions', () => {
    it('should calculate percentage change correctly', async () => {
      const { calculatePercentageChange } = await import('../../../../src/services/billing/types.js');
      
      expect(calculatePercentageChange(150, 100)).toBe(50);
      expect(calculatePercentageChange(75, 100)).toBe(-25);
      expect(calculatePercentageChange(100, 100)).toBe(0);
      expect(calculatePercentageChange(200, 100)).toBe(100);
    });

    it('should handle zero current value in percentage change', async () => {
      const { calculatePercentageChange } = await import('../../../../src/services/billing/types.js');
      
      expect(calculatePercentageChange(0, 100)).toBe(-100);
    });

    it('should handle zero previous value in percentage change', async () => {
      const { calculatePercentageChange } = await import('../../../../src/services/billing/types.js');
      
      expect(calculatePercentageChange(100, 0)).toBe(100);
      expect(calculatePercentageChange(0, 0)).toBe(0);
    });

    it('should detect cost anomalies correctly', async () => {
      const { detectCostAnomalies } = await import('../../../../src/services/billing/types.js');
      
      const currentCosts = [{
        billingAccountName: 'billingAccounts/test',
        projectId: 'test-project',
        serviceId: 'compute.googleapis.com',
        cost: { amount: 2000, currency: 'USD' },
        usage: { amount: 100, unit: 'hours' },
        period: { startTime: '2024-01-01T00:00:00Z', endTime: '2024-01-02T00:00:00Z' }
      }];
      
      const historicalCosts = [{
        billingAccountName: 'billingAccounts/test',
        projectId: 'test-project',
        serviceId: 'compute.googleapis.com',
        cost: { amount: 1000, currency: 'USD' },
        usage: { amount: 100, unit: 'hours' },
        period: { startTime: '2023-12-01T00:00:00Z', endTime: '2023-12-02T00:00:00Z' }
      }];
      
      const anomalies = detectCostAnomalies(currentCosts, historicalCosts, 50);
      
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].anomalyType).toBe('spike');
      expect(anomalies[0].percentageChange).toBe(100);
      expect(anomalies[0].severity).toBe('critical'); // 100% change is critical severity
    });

    it('should not detect anomalies below threshold', async () => {
      const { detectCostAnomalies } = await import('../../../../src/services/billing/types.js');
      
      const currentCosts = [{
        billingAccountName: 'billingAccounts/test',
        projectId: 'test-project',
        serviceId: 'compute.googleapis.com',
        cost: { amount: 1100, currency: 'USD' },
        usage: { amount: 100, unit: 'hours' },
        period: { startTime: '2024-01-01T00:00:00Z', endTime: '2024-01-02T00:00:00Z' }
      }];
      
      const historicalCosts = [{
        billingAccountName: 'billingAccounts/test',
        projectId: 'test-project',
        serviceId: 'compute.googleapis.com',
        cost: { amount: 1000, currency: 'USD' },
        usage: { amount: 100, unit: 'hours' },
        period: { startTime: '2023-12-01T00:00:00Z', endTime: '2023-12-02T00:00:00Z' }
      }];
      
      const anomalies = detectCostAnomalies(currentCosts, historicalCosts, 50);
      
      expect(anomalies).toHaveLength(0);
    });

    it('should detect cost drops as anomalies', async () => {
      const { detectCostAnomalies } = await import('../../../../src/services/billing/types.js');
      
      const currentCosts = [{
        billingAccountName: 'billingAccounts/test',
        projectId: 'test-project',
        serviceId: 'compute.googleapis.com',
        cost: { amount: 400, currency: 'USD' },
        usage: { amount: 100, unit: 'hours' },
        period: { startTime: '2024-01-01T00:00:00Z', endTime: '2024-01-02T00:00:00Z' }
      }];
      
      const historicalCosts = [{
        billingAccountName: 'billingAccounts/test',
        projectId: 'test-project',
        serviceId: 'compute.googleapis.com',
        cost: { amount: 1000, currency: 'USD' },
        usage: { amount: 100, unit: 'hours' },
        period: { startTime: '2023-12-01T00:00:00Z', endTime: '2023-12-02T00:00:00Z' }
      }];
      
      const anomalies = detectCostAnomalies(currentCosts, historicalCosts, 50);
      
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].anomalyType).toBe('drop');
      expect(anomalies[0].percentageChange).toBe(-60);
      expect(anomalies[0].severity).toBe('medium');
    });

    it('should assign correct severity levels', async () => {
      const { detectCostAnomalies } = await import('../../../../src/services/billing/types.js');
      
      // Critical severity spike (> 100% change)
      const criticalSpikeCosts = [{
        billingAccountName: 'billingAccounts/test',
        projectId: 'test-project',
        serviceId: 'compute.googleapis.com',
        cost: { amount: 2500, currency: 'USD' },
        usage: { amount: 100, unit: 'hours' },
        period: { startTime: '2024-01-01T00:00:00Z', endTime: '2024-01-02T00:00:00Z' }
      }];
      
      const historicalCosts = [{
        billingAccountName: 'billingAccounts/test',
        projectId: 'test-project',
        serviceId: 'compute.googleapis.com',
        cost: { amount: 1000, currency: 'USD' },
        usage: { amount: 100, unit: 'hours' },
        period: { startTime: '2023-12-01T00:00:00Z', endTime: '2023-12-02T00:00:00Z' }
      }];
      
      const anomalies = detectCostAnomalies(criticalSpikeCosts, historicalCosts, 50);
      
      expect(anomalies[0].severity).toBe('critical'); // 150% change is critical severity
    });
  });

  describe('Constants', () => {
    it('should have correct billing IAM permissions', async () => {
      const { BILLING_IAM_PERMISSIONS } = await import('../../../../src/services/billing/types.js');
      
      expect(BILLING_IAM_PERMISSIONS.BILLING_ACCOUNTS_LIST).toBe('billing.accounts.list');
      expect(BILLING_IAM_PERMISSIONS.BILLING_ACCOUNTS_GET).toBe('billing.accounts.get');
      expect(BILLING_IAM_PERMISSIONS.BILLING_RESOURCE_ASSOCIATIONS_LIST).toBe('billing.resourceAssociations.list');
      expect(BILLING_IAM_PERMISSIONS.BILLING_RESOURCE_ASSOCIATIONS_CREATE).toBe('billing.resourceAssociations.create');
    });
  });

  describe('Interface Types', () => {
    it('should have correct BillingAccount interface structure', async () => {
      const account = createMockBillingAccount();
      
      expect(account).toHaveProperty('name');
      expect(account).toHaveProperty('displayName');
      expect(account).toHaveProperty('open');
      expect(account).toHaveProperty('masterBillingAccount');
      expect(account).toHaveProperty('parent');
    });

    it('should have correct CostData interface structure', async () => {
      const costData = createMockCostData(1)[0];
      
      expect(costData).toHaveProperty('billingAccountName');
      expect(costData).toHaveProperty('projectId');
      expect(costData).toHaveProperty('serviceId');
      expect(costData).toHaveProperty('cost');
      expect(costData).toHaveProperty('usage');
      expect(costData).toHaveProperty('period');
      expect(costData).toHaveProperty('labels');
      
      expect(costData.cost).toHaveProperty('amount');
      expect(costData.cost).toHaveProperty('currency');
      expect(costData.usage).toHaveProperty('amount');
      expect(costData.usage).toHaveProperty('unit');
      expect(costData.period).toHaveProperty('startTime');
      expect(costData.period).toHaveProperty('endTime');
    });

    it('should have correct CostAnomaly interface structure', async () => {
      const anomaly = createMockCostAnomaly();
      
      expect(anomaly).toHaveProperty('anomalyType');
      expect(anomaly).toHaveProperty('severity');
      expect(anomaly).toHaveProperty('projectId');
      expect(anomaly).toHaveProperty('serviceId');
      expect(anomaly).toHaveProperty('description');
      expect(anomaly).toHaveProperty('currentCost');
      expect(anomaly).toHaveProperty('expectedCost');
      expect(anomaly).toHaveProperty('percentageChange');
      expect(anomaly).toHaveProperty('detectedAt');
      expect(anomaly).toHaveProperty('recommendations');
    });

    it('should have correct CostRecommendation interface structure', async () => {
      const recommendation = createMockCostRecommendation();
      
      expect(recommendation).toHaveProperty('type');
      expect(recommendation).toHaveProperty('projectId');
      expect(recommendation).toHaveProperty('serviceId');
      expect(recommendation).toHaveProperty('resourceName');
      expect(recommendation).toHaveProperty('description');
      expect(recommendation).toHaveProperty('potentialSavings');
      expect(recommendation).toHaveProperty('effort');
      expect(recommendation).toHaveProperty('priority');
      expect(recommendation).toHaveProperty('actionRequired');
      expect(recommendation).toHaveProperty('implementationSteps');
      
      expect(recommendation.potentialSavings).toHaveProperty('amount');
      expect(recommendation.potentialSavings).toHaveProperty('currency');
      expect(recommendation.potentialSavings).toHaveProperty('percentage');
    });
  });
});