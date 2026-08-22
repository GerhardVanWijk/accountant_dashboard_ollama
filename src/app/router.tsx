import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { RouteGuard } from './RouteGuard';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { ChartOfAccountsPage } from '@/features/accounting/pages/ChartOfAccountsPage';
import { JournalsPage } from '@/features/accounting/pages/JournalsPage';
import { LedgerPage } from '@/features/accounting/pages/LedgerPage';
import { TrialBalancePage } from '@/features/accounting/pages/TrialBalancePage';
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
import { ProductsPage } from '@/features/inventory/pages/ProductsPage';
import { WarehousesPage } from '@/features/inventory/pages/WarehousesPage';
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
import { ReportsPage } from '@/features/reports/pages/ReportsPage';
import { UsersPage } from '@/features/admin/pages/UsersPage';
import { AuditPage } from '@/features/admin/pages/AuditPage';
import { NotFoundPage } from '@/features/admin/pages/NotFoundPage';

/**
 * Route tree. Paths mirror docs/ROUTES.md exactly — that file is
 * authoritative, not the illustrative /app/* example in
 * docs/ARCHITECTURE.md. Every route here has a matching entry in
 * src/config/navigation.ts.
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
    path: '/',
    element: <RouteGuard />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'accounting/coa', element: <ChartOfAccountsPage /> },
          { path: 'accounting/journals', element: <JournalsPage /> },
          { path: 'accounting/ledger', element: <LedgerPage /> },
          { path: 'accounting/trial-balance', element: <TrialBalancePage /> },
          { path: 'sales/customers', element: <CustomersPage /> },
          { path: 'sales/quotes', element: <QuotesPage /> },
          { path: 'sales/orders', element: <SalesOrdersPage /> },
          { path: 'sales/invoices', element: <InvoicesPage /> },
          { path: 'sales/credit-notes', element: <CreditNotesPage /> },
          { path: 'sales/receipts', element: <CustomerReceiptsPage /> },
          { path: 'purchases/vendors', element: <VendorsPage /> },
          { path: 'purchases/orders', element: <PurchaseOrdersPage /> },
          { path: 'purchases/bills', element: <BillsPage /> },
          { path: 'purchases/payments', element: <PaymentsPage /> },
          { path: 'purchases/aging', element: <VendorAgingPage /> },
          { path: 'banking/accounts', element: <BankAccountsPage /> },
          { path: 'banking/transactions', element: <BankTransactionsPage /> },
          { path: 'banking/reconciliation', element: <BankReconciliationPage /> },
          { path: 'inventory/products', element: <ProductsPage /> },
          { path: 'inventory/warehouses', element: <WarehousesPage /> },
          { path: 'assets/register', element: <AssetRegisterPage /> },
          { path: 'assets/depreciation', element: <DepreciationPage /> },
          { path: 'assets/disposals', element: <DisposalsPage /> },
          { path: 'assets/tax-register', element: <TaxRegisterPage /> },
          { path: 'payroll/employees', element: <EmployeesPage /> },
          { path: 'payroll/runs', element: <PayrollRunsPage /> },
          { path: 'payroll/emp201', element: <Emp201Page /> },
          { path: 'payroll/emp501', element: <Emp501Page /> },
          { path: 'tax/rates', element: <TaxRatesPage /> },
          { path: 'tax/vat-return', element: <VatReturnPage /> },
          { path: 'tax/income-tax', element: <IncomeTaxPage /> },
          { path: 'tax/capital-gains', element: <CapitalGainsPage /> },
          { path: 'tax/dividends', element: <DividendsTaxPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'admin/users', element: <UsersPage /> },
          { path: 'admin/audit', element: <AuditPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
