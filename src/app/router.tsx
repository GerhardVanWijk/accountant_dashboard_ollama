import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { RouteGuard } from './RouteGuard';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { DemoPage } from '@/features/marketing/pages/DemoPage';
import { PrivacyPolicyPage } from '@/features/marketing/pages/legal/PrivacyPolicyPage';
import { PopiaStatementPage } from '@/features/marketing/pages/legal/PopiaStatementPage';
import { TermsOfServicePage } from '@/features/marketing/pages/legal/TermsOfServicePage';
import { SecurityPage } from '@/features/marketing/pages/legal/SecurityPage';
import { InvoicingPage } from '@/features/marketing/pages/product/InvoicingPage';
import { BankingPage } from '@/features/marketing/pages/product/BankingPage';
import { TaxPage } from '@/features/marketing/pages/product/TaxPage';
import { ExpensesPage } from '@/features/marketing/pages/product/ExpensesPage';
import { PayrollPage } from '@/features/marketing/pages/product/PayrollPage';
import { ReportingPage } from '@/features/marketing/pages/product/ReportingPage';
import { AboutPage } from '@/features/marketing/pages/company/AboutPage';
import { ContactPage } from '@/features/marketing/pages/company/ContactPage';
import { HelpCentrePage } from '@/features/marketing/pages/resources/HelpCentrePage';
import { VatGuidePage } from '@/features/marketing/pages/resources/VatGuidePage';
import { SignUpPage } from '@/features/auth/pages/SignUpPage';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage';
import { OnboardingPage } from '@/features/auth/pages/OnboardingPage';
import { SuperUserDashboardPage } from '@/features/admin/pages/SuperUserDashboardPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { ChartOfAccountsPage } from '@/features/accounting/pages/ChartOfAccountsPage';
import { JournalsPage } from '@/features/accounting/pages/JournalsPage';
import { LedgerPage } from '@/features/accounting/pages/LedgerPage';
import { TrialBalancePage } from '@/features/accounting/pages/TrialBalancePage';
import { FinancialPeriodsPage } from '@/features/accounting/pages/FinancialPeriodsPage';
import { CompanyPage } from '@/features/admin/pages/CompanyPage';
import { CustomersPage } from '@/features/sales/pages/CustomersPage';
import { QuotesPage } from '@/features/sales/pages/QuotesPage';
import { SalesOrdersPage } from '@/features/sales/pages/SalesOrdersPage';
import { InvoicesPage } from '@/features/sales/pages/InvoicesPage';
import { CreditNotesPage } from '@/features/sales/pages/CreditNotesPage';
import { CustomerReceiptsPage } from '@/features/sales/pages/CustomerReceiptsPage';
import { VendorsPage } from '@/features/purchases/pages/VendorsPage';
import { PurchaseOrdersPage } from '@/features/purchases/pages/PurchaseOrdersPage';
import { BillsPage } from '@/features/purchases/pages/BillsPage';
import { PaymentsPage } from '@/features/purchases/pages/PaymentsPage';
import { VendorAgingPage } from '@/features/purchases/pages/VendorAgingPage';
import { BankAccountsPage } from '@/features/banking/pages/BankAccountsPage';
import { BankTransactionsPage } from '@/features/banking/pages/BankTransactionsPage';
import { BankReconciliationPage } from '@/features/banking/pages/BankReconciliationPage';
import { InventoryOverviewPage } from '@/features/inventory/pages/InventoryOverviewPage';
import { ProductsPage } from '@/features/inventory/pages/ProductsPage';
import { WarehousesPage } from '@/features/inventory/pages/WarehousesPage';
import { CategoriesPage } from '@/features/inventory/pages/CategoriesPage';
import { StockMovementsPage } from '@/features/inventory/pages/StockMovementsPage';
import { AssetRegisterPage } from '@/features/assets/pages/AssetRegisterPage';
import { DepreciationPage } from '@/features/assets/pages/DepreciationPage';
import { DisposalsPage } from '@/features/assets/pages/DisposalsPage';
import { TaxRegisterPage } from '@/features/assets/pages/TaxRegisterPage';
import { EmployeesPage } from '@/features/employees/pages/EmployeesPage';
import { PayrollRunsPage } from '@/features/employees/pages/PayrollRunsPage';
import { Emp201Page } from '@/features/employees/pages/Emp201Page';
import { Emp501Page } from '@/features/employees/pages/Emp501Page';
import { VatReturnPage } from '@/features/tax/pages/VatReturnPage';
import { TaxRatesPage } from '@/features/tax/pages/TaxRatesPage';
import { IncomeTaxPage } from '@/features/tax/incomeTax/pages/IncomeTaxPage';
import { CapitalGainsPage } from '@/features/tax/capitalGains/pages/CapitalGainsPage';
import { DividendsTaxPage } from '@/features/tax/dividendsTax/pages/DividendsTaxPage';
import { ProvisionalTaxPage } from '@/features/tax/provisionalTax/pages/ProvisionalTaxPage';
import { DeferredTaxPage } from '@/features/tax/deferredTax/pages/DeferredTaxPage';
import { EclProvisionPage } from '@/features/financialInstruments/pages/EclProvisionPage';
import { ReportsPage } from '@/features/reports/pages/ReportsPage';
import { IncomeStatementPage } from '@/features/reports/financialStatements/pages/IncomeStatementPage';
import { BalanceSheetPage } from '@/features/reports/financialStatements/pages/BalanceSheetPage';
import { CashFlowStatementPage } from '@/features/reports/cashFlow/pages/CashFlowStatementPage';
import { CustomerAgingPage } from '@/features/reports/aging/pages/CustomerAgingPage';
import { SupplierAgingPage } from '@/features/reports/aging/pages/SupplierAgingPage';
import { ComplianceDashboardPage } from '@/features/compliance/pages/ComplianceDashboardPage';
import { PublicInterestScorePage } from '@/features/compliance/pages/PublicInterestScorePage';
import { ReportingStandardsPage } from '@/features/compliance/pages/ReportingStandardsPage';
import { RelatedPartyRegisterPage } from '@/features/relatedParties/pages/RelatedPartyRegisterPage';
import { RelatedPartyTransactionsPage } from '@/features/relatedParties/pages/RelatedPartyTransactionsPage';
import { ExchangeRatesPage } from '@/features/foreignExchange/pages/ExchangeRatesPage';
import { FxCalculatorPage } from '@/features/foreignExchange/pages/FxCalculatorPage';
import { LeaseRegisterPage } from '@/features/leases/pages/LeaseRegisterPage';
import { LeaseAmortizationPage } from '@/features/leases/pages/LeaseAmortizationPage';
import { UsersPage } from '@/features/admin/pages/UsersPage';
import { AuditPage } from '@/features/admin/pages/AuditPage';
import { AuditTrailPage } from '@/features/admin/pages/AuditTrailPage';
import { PermissionRoute } from '@/features/auth/components/PermissionRoute';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';
import { AccountingSettingsPage } from '@/features/settings/pages/AccountingSettingsPage';
import { HelpPage } from '@/features/help/pages/HelpPage';
import { NotFoundPage } from '@/features/admin/pages/NotFoundPage';

/**
 * Route tree. Paths mirror docs/ROUTES.md exactly — that file is
 * authoritative, not the illustrative /app/* example in
 * docs/ARCHITECTURE.md. Every route here has a matching entry in
 * src/lib/app/navigation.ts (src/config/navigation.ts, the pre-v0
 * navigation model this replaced, was deleted in M12).
 *
 * All routes below the root element are wrapped by <RouteGuard />,
 * which is the protected route tree referred to as "/app/*" in
 * docs/DO_NOT_BREAK.md.
 */
/**
 * Route config, exported separately from the router instance so tests
 * can build a createMemoryRouter(routes) instead of the real
 * createBrowserRouter — see src/app/App.tsx and App.test.tsx.
 */
export const routes: RouteObject[] = [
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/signup',
    element: <SignUpPage />,
  },
  {
    path: '/forgot-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: '/reset-password',
    element: <ResetPasswordPage />,
  },
  {
    path: '/demo',
    element: <DemoPage />,
  },
  { path: '/legal/privacy', element: <PrivacyPolicyPage /> },
  { path: '/legal/popia', element: <PopiaStatementPage /> },
  { path: '/legal/terms', element: <TermsOfServicePage /> },
  { path: '/legal/security', element: <SecurityPage /> },
  { path: '/product/invoicing', element: <InvoicingPage /> },
  { path: '/product/banking', element: <BankingPage /> },
  { path: '/product/tax', element: <TaxPage /> },
  { path: '/product/expenses', element: <ExpensesPage /> },
  { path: '/product/payroll', element: <PayrollPage /> },
  { path: '/product/reporting', element: <ReportingPage /> },
  { path: '/company/about', element: <AboutPage /> },
  { path: '/company/contact', element: <ContactPage /> },
  { path: '/resources/help', element: <HelpCentrePage /> },
  { path: '/resources/vat-guide', element: <VatGuidePage /> },
  {
    path: '/',
    element: <RouteGuard />,
    children: [
      { path: 'onboarding', element: <OnboardingPage /> },
      { path: 'admin/superuser', element: <SuperUserDashboardPage /> },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <PermissionRoute feature="dashboard" action="read"><DashboardPage /></PermissionRoute> },
          { path: 'companies', element: <CompanyPage /> },
          { path: 'accounting/coa', element: <PermissionRoute feature="gl" action="read"><ChartOfAccountsPage /></PermissionRoute> },
          { path: 'accounting/journals', element: <PermissionRoute feature="gl" action="read"><JournalsPage /></PermissionRoute> },
          { path: 'accounting/ledger', element: <PermissionRoute feature="gl" action="read"><LedgerPage /></PermissionRoute> },
          { path: 'accounting/trial-balance', element: <PermissionRoute feature="gl" action="read"><TrialBalancePage /></PermissionRoute> },
          { path: 'financial-periods', element: <FinancialPeriodsPage /> },
          { path: 'sales/customers', element: <PermissionRoute feature="customer_management" action="read"><CustomersPage /></PermissionRoute> },
          { path: 'sales/quotes', element: <QuotesPage /> },
          { path: 'sales/orders', element: <SalesOrdersPage /> },
          { path: 'sales/invoices', element: <PermissionRoute feature="invoicing" action="read"><InvoicesPage /></PermissionRoute> },
          { path: 'sales/credit-notes', element: <CreditNotesPage /> },
          { path: 'sales/receipts', element: <CustomerReceiptsPage /> },
          { path: 'purchases/vendors', element: <PermissionRoute feature="supplier_management" action="read"><VendorsPage /></PermissionRoute> },
          { path: 'purchases/orders', element: <PurchaseOrdersPage /> },
          { path: 'purchases/bills', element: <BillsPage /> },
          { path: 'purchases/payments', element: <PaymentsPage /> },
          { path: 'purchases/aging', element: <VendorAgingPage /> },
          { path: 'banking/accounts', element: <BankAccountsPage /> },
          { path: 'banking/transactions', element: <BankTransactionsPage /> },
          { path: 'banking/reconciliation', element: <BankReconciliationPage /> },
          { path: 'inventory', element: <PermissionRoute feature="inventory" action="read"><InventoryOverviewPage /></PermissionRoute> },
          { path: 'inventory/products', element: <PermissionRoute feature="inventory" action="read"><ProductsPage /></PermissionRoute> },
          { path: 'inventory/categories', element: <PermissionRoute feature="inventory" action="read"><CategoriesPage /></PermissionRoute> },
          { path: 'inventory/warehouses', element: <PermissionRoute feature="inventory" action="read"><WarehousesPage /></PermissionRoute> },
          { path: 'inventory/movements', element: <PermissionRoute feature="inventory" action="read"><StockMovementsPage /></PermissionRoute> },
          { path: 'assets/register', element: <AssetRegisterPage /> },
          { path: 'assets/depreciation', element: <DepreciationPage /> },
          { path: 'assets/disposals', element: <DisposalsPage /> },
          { path: 'assets/tax-register', element: <TaxRegisterPage /> },
          { path: 'payroll/employees', element: <PermissionRoute feature="payroll" action="read"><EmployeesPage /></PermissionRoute> },
          { path: 'payroll/runs', element: <PermissionRoute feature="payroll" action="read"><PayrollRunsPage /></PermissionRoute> },
          { path: 'payroll/emp201', element: <PermissionRoute feature="payroll" action="read"><Emp201Page /></PermissionRoute> },
          { path: 'payroll/emp501', element: <PermissionRoute feature="payroll" action="read"><Emp501Page /></PermissionRoute> },
          { path: 'tax/rates', element: <TaxRatesPage /> },
          { path: 'tax/vat-return', element: <VatReturnPage /> },
          { path: 'tax/income-tax', element: <IncomeTaxPage /> },
          { path: 'tax/capital-gains', element: <CapitalGainsPage /> },
          { path: 'tax/dividends', element: <DividendsTaxPage /> },
          { path: 'tax/provisional-tax', element: <ProvisionalTaxPage /> },
          { path: 'tax/deferred-tax', element: <DeferredTaxPage /> },
          { path: 'tax/expected-credit-losses', element: <EclProvisionPage /> },
          { path: 'reports', element: <PermissionRoute feature="reports" action="read"><ReportsPage /></PermissionRoute> },
          { path: 'reports/income-statement', element: <PermissionRoute feature="reports" action="read"><IncomeStatementPage /></PermissionRoute> },
          { path: 'reports/balance-sheet', element: <PermissionRoute feature="reports" action="read"><BalanceSheetPage /></PermissionRoute> },
          { path: 'reports/cash-flow', element: <PermissionRoute feature="reports" action="read"><CashFlowStatementPage /></PermissionRoute> },
          { path: 'reports/customer-aging', element: <PermissionRoute feature="reports" action="read"><CustomerAgingPage /></PermissionRoute> },
          { path: 'reports/supplier-aging', element: <PermissionRoute feature="reports" action="read"><SupplierAgingPage /></PermissionRoute> },
          { path: 'compliance/dashboard', element: <ComplianceDashboardPage /> },
          { path: 'compliance/public-interest-score', element: <PublicInterestScorePage /> },
          { path: 'compliance/reporting-standards', element: <ReportingStandardsPage /> },
          { path: 'related-parties/register', element: <RelatedPartyRegisterPage /> },
          { path: 'related-parties/transactions', element: <RelatedPartyTransactionsPage /> },
          { path: 'foreign-exchange/rates', element: <ExchangeRatesPage /> },
          { path: 'foreign-exchange/calculator', element: <FxCalculatorPage /> },
          { path: 'leases/register', element: <LeaseRegisterPage /> },
          { path: 'leases/amortization', element: <LeaseAmortizationPage /> },
          { path: 'admin/users', element: <PermissionRoute feature="user_management" action="read"><UsersPage /></PermissionRoute> },
          { path: 'admin/audit', element: <AuditPage /> },
          { path: 'admin/audit-trail', element: <AuditTrailPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'settings/accounting', element: <AccountingSettingsPage /> },
          { path: 'help', element: <HelpPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
