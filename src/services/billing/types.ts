/**
 * Type definitions for Google Cloud Billing service
 */
import { CloudBillingClient, CloudCatalogClient } from "@google-cloud/billing";

/**
 * Interface for Google Cloud Billing Account
 */
export interface BillingAccount {
  name: string;
  displayName: string;
  open: boolean;
  masterBillingAccount?: string | null;
  parent?: string | null;
}

/**
 * Interface for Project Billing Information
 */
export interface ProjectBillingInfo {
  name: string;
  projectId: string;
  billingAccountName?: string;
  billingEnabled: boolean;
}

/**
 * Interface for Google Cloud Service
 */
export interface CloudService {
  name: string;
  serviceId: string;
  displayName: string;
  businessEntityName: string;
}

/**
 * Interface for Stock Keeping Unit (SKU)
 */
export interface SKU {
  name: string;
  skuId: string;
  description: string;
  category: {
    serviceDisplayName: string;
    resourceFamily: string;
    resourceGroup: string;
    usageType: string;
  };
  serviceRegions: string[];
  pricingInfo: PricingInfo[];
  serviceProviderName: string;
  geoTaxonomy?: {
    type: string;
    regions: string[];
  };
}

/**
 * Interface for SKU Pricing Information
 */
export interface PricingInfo {
  summary: string;
  pricingExpression: {
    usageUnit: string;
    usageUnitDescription: string;
    baseUnit: string;
    baseUnitDescription: string;
    baseUnitConversionFactor: number;
    displayQuantity: number;
    tieredRates: TieredRate[];
    aggregationInfo?: {
      aggregationLevel: string;
      aggregationInterval: string;
      aggregationCount: number;
    };
  };
  aggregationInfo?: {
    aggregationLevel: string;
    aggregationInterval: string;
    aggregationCount: number;
  };
  currencyConversionRate: number;
  effectiveTime: string;
}

/**
 * Interface for Tiered Pricing Rates
 */
export interface TieredRate {
  startUsageAmount: number;
  unitPrice: {
    currencyCode: string;
    units: string;
    nanos: number;
  };
}

/**
 * Interface for Cost Data Analysis
 */
export interface CostData {
  billingAccountName: string;
  projectId?: string;
  serviceId?: string;
  skuId?: string;
  cost: {
    amount: number;
    currency: string;
  };
  usage: {
    amount: number;
    unit: string;
  };
  period: {
    startTime: string;
    endTime: string;
  };
  labels?: Record<string, string>;
}

/**
 * Interface for Cost Anomaly Detection
 */
export interface CostAnomaly {
  projectId: string;
  serviceId: string;
  anomalyType: "spike" | "drop" | "unusual_pattern";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  currentCost: number;
  expectedCost: number;
  percentageChange: number;
  detectedAt: string;
  period: {
    startTime: string;
    endTime: string;
  };
  recommendations?: string[];
}

/**
 * Interface for Cost Optimisation Recommendations
 */
export interface CostRecommendation {
  type:
    | "rightsizing"
    | "idle_resources"
    | "committed_use"
    | "regional_optimisation";
  projectId: string;
  serviceId?: string;
  resourceName?: string;
  description: string;
  potentialSavings: {
    amount: number;
    currency: string;
    percentage: number;
  };
  effort: "low" | "medium" | "high";
  priority: "low" | "medium" | "high";
  actionRequired: string;
  implementationSteps: string[];
}

/**
 * Interface for Budget Information
 */
export interface Budget {
  name: string;
  displayName: string;
  budgetFilter: {
    projects?: string[];
    services?: string[];
    creditTypesTreatment: string;
    calendarPeriod?: string;
    customPeriod?: {
      startDate: {
        year: number;
        month: number;
        day: number;
      };
      endDate: {
        year: number;
        month: number;
        day: number;
      };
    };
  };
  amount: {
    specifiedAmount?: {
      currencyCode: string;
      units: string;
      nanos: number;
    };
    lastPeriodAmount?: any;
  };
  thresholdRules: ThresholdRule[];
  allUpdatesRule?: {
    pubsubTopic?: string;
    schemaVersion?: string;
    monitoringNotificationChannels?: string[];
    disableDefaultIamRecipients?: boolean;
  };
}

/**
 * Interface for Budget Threshold Rules
 */
export interface ThresholdRule {
  thresholdPercent: number;
  spendBasis: "CURRENT_SPEND" | "FORECASTED_SPEND";
}

/**
 * Required IAM permissions for billing operations
 */
export const BILLING_IAM_PERMISSIONS = {
  // Billing Account permissions
  BILLING_ACCOUNTS_GET: "billing.accounts.get",
  BILLING_ACCOUNTS_LIST: "billing.accounts.list",
  BILLING_ACCOUNTS_UPDATE: "billing.accounts.update",

  // Project billing permissions
  BILLING_RESOURCE_ASSOCIATIONS_LIST: "billing.resourceAssociations.list",
  BILLING_RESOURCE_ASSOCIATIONS_CREATE: "billing.resourceAssociations.create",

  // Budget permissions
  BILLING_BUDGETS_GET: "billing.budgets.get",
  BILLING_BUDGETS_LIST: "billing.budgets.list",
  BILLING_BUDGETS_CREATE: "billing.budgets.create",
  BILLING_BUDGETS_UPDATE: "billing.budgets.update",
  BILLING_BUDGETS_DELETE: "billing.budgets.delete",

  // Cost viewing permissions
  BILLING_ACCOUNTS_COSTS_LIST: "billing.accounts.costs.list",
  BILLING_ACCOUNTS_USAGE_LIST: "billing.accounts.usage.list",
} as const;

/**
 * Initialises the Google Cloud Billing client
 *
 * @returns A configured CloudBillingClient instance
 */
export function getBillingClient(): CloudBillingClient {
  return new CloudBillingClient({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
  });
}

/**
 * Initialises the Google Cloud Catalog client for services and SKUs
 *
 * @returns A configured CloudCatalogClient instance
 */
export function getCatalogClient(): CloudCatalogClient {
  return new CloudCatalogClient({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
  });
}

/**
 * Formats currency amounts for display
 *
 * @param amount The monetary amount
 * @param currency The currency code (default: USD)
 * @returns A formatted currency string
 */
export function formatCurrency(
  amount: number,
  currency: string = "USD",
): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

/**
 * Formats a billing account for display
 *
 * @param account The billing account to format
 * @returns A formatted string representation of the billing account
 */
export function formatBillingAccount(account: BillingAccount): string {
  let result = `## ${account.displayName}\n\n`;
  result += `**Account Name:** ${account.name}\n`;
  result += `**Status:** ${account.open ? "✅ Active" : "❌ Closed"}\n`;

  if (account.masterBillingAccount) {
    result += `**Master Account:** ${account.masterBillingAccount}\n`;
  }

  if (account.parent) {
    result += `**Parent:** ${account.parent}\n`;
  }

  return result;
}

/**
 * Formats cost data for display
 *
 * @param costs Array of cost data to format
 * @returns A formatted markdown table of costs
 */
export function formatCostData(costs: CostData[]): string {
  if (costs.length === 0) {
    return "No cost data available for the specified period.";
  }

  let result = "## Cost Analysis\n\n";
  result += "| Project | Service | Cost | Usage | Period |\n";
  result += "|---------|---------|------|-------|--------|\n";

  for (const cost of costs) {
    const projectId = cost.projectId || "All Projects";
    const serviceId = cost.serviceId || "All Services";
    const formattedCost = formatCurrency(cost.cost.amount, cost.cost.currency);
    const usage = `${cost.usage.amount} ${cost.usage.unit}`;
    const period = `${new Date(cost.period.startTime).toLocaleDateString("en-AU")} - ${new Date(cost.period.endTime).toLocaleDateString("en-AU")}`;

    result += `| ${projectId} | ${serviceId} | ${formattedCost} | ${usage} | ${period} |\n`;
  }

  return result;
}

/**
 * Formats cost anomalies for display
 *
 * @param anomalies Array of cost anomalies to format
 * @returns A formatted string representation of the anomalies
 */
export function formatCostAnomalies(anomalies: CostAnomaly[]): string {
  if (anomalies.length === 0) {
    return "✅ No cost anomalies detected for the specified period.";
  }

  let result = "## 🚨 Cost Anomalies Detected\n\n";

  for (const anomaly of anomalies) {
    const severityIcon = {
      low: "🟡",
      medium: "🟠",
      high: "🔴",
      critical: "💥",
    }[anomaly.severity];

    const changeDirection = anomaly.percentageChange > 0 ? "📈" : "📉";

    result += `### ${severityIcon} ${anomaly.anomalyType.replace("_", " ").toUpperCase()}\n\n`;
    result += `**Project:** ${anomaly.projectId}\n`;
    result += `**Service:** ${anomaly.serviceId}\n`;
    result += `**Description:** ${anomaly.description}\n`;
    result += `**Change:** ${changeDirection} ${Math.abs(anomaly.percentageChange).toFixed(1)}%\n`;
    result += `**Current Cost:** ${formatCurrency(anomaly.currentCost)}\n`;
    result += `**Expected Cost:** ${formatCurrency(anomaly.expectedCost)}\n`;
    result += `**Detected:** ${new Date(anomaly.detectedAt).toLocaleString("en-AU")}\n`;

    if (anomaly.recommendations && anomaly.recommendations.length > 0) {
      result += "\n**Recommendations:**\n";
      for (const rec of anomaly.recommendations) {
        result += `- ${rec}\n`;
      }
    }

    result += "\n---\n\n";
  }

  return result;
}

/**
 * Formats cost recommendations for display
 *
 * @param recommendations Array of cost recommendations to format
 * @returns A formatted string representation of the recommendations
 */
export function formatCostRecommendations(
  recommendations: CostRecommendation[],
): string {
  if (recommendations.length === 0) {
    return "✅ No cost optimisation recommendations available.";
  }

  let result = "## 💡 Cost Optimisation Recommendations\n\n";

  // Sort by potential savings (highest first)
  const sortedRecs = recommendations.sort(
    (a, b) => b.potentialSavings.amount - a.potentialSavings.amount,
  );

  for (const rec of sortedRecs) {
    const priorityIcon = {
      low: "🟢",
      medium: "🟡",
      high: "🔴",
    }[rec.priority];

    const effortIcon = {
      low: "⚡",
      medium: "⚙️",
      high: "🔧",
    }[rec.effort];

    result += `### ${priorityIcon} ${rec.type.replace("_", " ").toUpperCase()}\n\n`;
    result += `**Project:** ${rec.projectId}\n`;
    if (rec.serviceId) result += `**Service:** ${rec.serviceId}\n`;
    if (rec.resourceName) result += `**Resource:** ${rec.resourceName}\n`;
    result += `**Description:** ${rec.description}\n`;
    result += `**Potential Savings:** ${formatCurrency(rec.potentialSavings.amount)} (${rec.potentialSavings.percentage.toFixed(1)}%)\n`;
    result += `**Effort Required:** ${effortIcon} ${rec.effort.toUpperCase()}\n`;
    result += `**Priority:** ${priorityIcon} ${rec.priority.toUpperCase()}\n`;
    result += `**Action Required:** ${rec.actionRequired}\n`;

    if (rec.implementationSteps.length > 0) {
      result += "\n**Implementation Steps:**\n";
      for (let i = 0; i < rec.implementationSteps.length; i++) {
        result += `${i + 1}. ${rec.implementationSteps[i]}\n`;
      }
    }

    result += "\n---\n\n";
  }

  return result;
}

/**
 * Calculates percentage change between two values
 *
 * @param current Current value
 * @param previous Previous value
 * @returns Percentage change
 */
export function calculatePercentageChange(
  current: number,
  previous: number,
): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Detects cost anomalies based on historical data
 *
 * @param currentCosts Current period costs
 * @param historicalCosts Historical period costs for comparison
 * @param thresholdPercentage Threshold percentage for anomaly detection (default: 50%)
 * @returns Array of detected anomalies
 */
export function detectCostAnomalies(
  currentCosts: CostData[],
  historicalCosts: CostData[],
  thresholdPercentage: number = 50,
): CostAnomaly[] {
  const anomalies: CostAnomaly[] = [];

  for (const current of currentCosts) {
    if (!current.projectId || !current.serviceId) continue;

    // Find corresponding historical cost
    const historical = historicalCosts.find(
      (h) =>
        h.projectId === current.projectId && h.serviceId === current.serviceId,
    );

    if (!historical) continue;

    const percentageChange = calculatePercentageChange(
      current.cost.amount,
      historical.cost.amount,
    );

    if (Math.abs(percentageChange) >= thresholdPercentage) {
      const anomalyType = percentageChange > 0 ? "spike" : "drop";
      const severity =
        Math.abs(percentageChange) >= 100
          ? "critical"
          : Math.abs(percentageChange) >= 75
            ? "high"
            : Math.abs(percentageChange) >= 50
              ? "medium"
              : "low";

      anomalies.push({
        projectId: current.projectId,
        serviceId: current.serviceId,
        anomalyType,
        severity,
        description: `${percentageChange > 0 ? "Significant increase" : "Significant decrease"} in costs for ${current.serviceId}`,
        currentCost: current.cost.amount,
        expectedCost: historical.cost.amount,
        percentageChange,
        detectedAt: new Date().toISOString(),
        period: current.period,
        recommendations: generateAnomalyRecommendations(
          anomalyType,
          current.serviceId,
          Math.abs(percentageChange),
        ),
      });
    }
  }

  return anomalies;
}

/**
 * Generates recommendations based on detected anomalies
 *
 * @param anomalyType Type of anomaly detected
 * @param serviceId Service ID where anomaly was detected
 * @param percentageChange Magnitude of the change
 * @returns Array of recommendation strings
 */
function generateAnomalyRecommendations(
  anomalyType: "spike" | "drop",
  serviceId: string,
  percentageChange: number,
): string[] {
  const recommendations: string[] = [];

  if (anomalyType === "spike") {
    recommendations.push(
      "Review recent resource provisioning and scaling activities",
    );
    recommendations.push(
      "Check for unexpected traffic spikes or data processing jobs",
    );
    recommendations.push(
      "Validate that auto-scaling policies are configured correctly",
    );

    if (serviceId.includes("compute")) {
      recommendations.push(
        "Consider using committed use discounts for sustained workloads",
      );
      recommendations.push(
        "Review instance types and consider right-sizing opportunities",
      );
    }

    if (serviceId.includes("storage")) {
      recommendations.push(
        "Review data retention policies and lifecycle management",
      );
      recommendations.push(
        "Consider using different storage classes for infrequently accessed data",
      );
    }
  } else {
    recommendations.push(
      "Verify that services are functioning correctly despite reduced costs",
    );
    recommendations.push(
      "Check if resources were intentionally scaled down or removed",
    );
    recommendations.push(
      "Ensure monitoring and alerting are still functioning properly",
    );
  }

  return recommendations;
}
